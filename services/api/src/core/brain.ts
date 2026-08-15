import { queryOne } from '../db.js';
import { complete, type ChatMessage } from '../llm/index.js';
import { config } from '../config.js';
import { buildContextBlock, compileTemplate, mergeVariables } from './prompt.js';
import { findRelevantKnowledge } from './rag.js';
import {
  loadHistory,
  recordMessage,
  resolveConversation,
  type ChannelKind,
} from './conversations.js';

export interface BotConfig {
  id: string;
  client_id: string;
  system_prompt_template: string;
  dynamic_variables: Record<string, unknown>;
  allowed_override_vars: string[];
  channel_overrides: Record<string, Partial<BotConfig>>;
  provider: string;
  model: string;
  temperature: number;
  max_tokens: number;
  history_turns: number;
}

export interface ThinkRequest {
  clientId: string;
  channel: ChannelKind;
  channelUserId: string;
  threadRef: string;
  message: string;
  displayName?: string;
  overrideVariables?: Record<string, unknown>;
  channelAccountId?: string | null;
  /** Id del mensaje en el proveedor. Sirve de clave de idempotencia. */
  providerMsgId?: string | null;
}

export interface ThinkResult {
  reply: string;
  conversationId: string;
  model: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  costMicros: number;
  latencyMs: number;
  handedOff: boolean;
}

/** Lo que se dice cuando el modelo devuelve vacío. Con la voz del bot, no un error crudo. */
const FALLBACK_REPLY =
  '¡Cococo! Se me cruzaron los cables del gallinero. ¿Puedes repetírmelo de otra manera?';

export async function loadBotConfig(clientId: string): Promise<BotConfig | null> {
  return queryOne<BotConfig>(
    `SELECT id, client_id, system_prompt_template, dynamic_variables,
            allowed_override_vars, channel_overrides, provider, model,
            temperature, max_tokens, history_turns
       FROM bot_configs
      WHERE client_id = $1 AND name = 'default'`,
    [clientId],
  );
}

/** Los ajustes por canal se aplican encima de los generales. */
function applyChannelOverrides(cfg: BotConfig, channel: ChannelKind): BotConfig {
  const override = cfg.channel_overrides?.[channel];
  return override ? { ...cfg, ...override } : cfg;
}

/**
 * El camino completo: identidad → conversación → configuración → RAG →
 * historial → modelo → registro. Lo comparten todos los canales; lo único que
 * cambia por canal son los adaptadores de entrada y de salida.
 */
export async function think(req: ThinkRequest): Promise<ThinkResult> {
  const started = Date.now();

  const baseConfig = await loadBotConfig(req.clientId);
  if (!baseConfig) {
    throw new Error(`El cliente ${req.clientId} no tiene bot_config`);
  }
  const cfg = applyChannelOverrides(baseConfig, req.channel);

  const conversation = await resolveConversation({
    clientId: req.clientId,
    channel: req.channel,
    channelUserId: req.channelUserId,
    threadRef: req.threadRef,
    displayName: req.displayName,
    channelAccountId: req.channelAccountId,
  });

  await recordMessage({
    conversationId: conversation.id,
    role: 'user',
    text: req.message,
    providerMsgId: req.providerMsgId,
  });

  // Conversación derivada a una persona: el bot se calla hasta que la reactiven.
  if (conversation.status === 'handoff') {
    return {
      reply: '',
      conversationId: conversation.id,
      model: cfg.model,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      costMicros: 0,
      latencyMs: Date.now() - started,
      handedOff: true,
    };
  }

  const { variables } = mergeVariables(
    cfg.dynamic_variables ?? {},
    req.overrideVariables ?? {},
    cfg.allowed_override_vars ?? [],
  );

  const { prompt: compiledPrompt } = compileTemplate(cfg.system_prompt_template, variables);

  const [knowledge, history] = await Promise.all([
    findRelevantKnowledge(req.clientId, req.message),
    loadHistory(conversation.id, cfg.history_turns),
  ]);

  const systemPrompt = compiledPrompt + buildContextBlock(knowledge);

  // loadHistory ya incluye el mensaje que acabamos de guardar, así que no se
  // vuelve a añadir: duplicarlo hace que el modelo crea que lo dijeron dos veces.
  const messages: ChatMessage[] = history;

  const result = await complete(cfg.provider, {
    model: cfg.model,
    system: systemPrompt,
    messages,
    temperature: cfg.temperature,
    maxTokens: cfg.max_tokens,
    signal: AbortSignal.timeout(config.LLM_TIMEOUT_MS),
  });

  const latencyMs = Date.now() - started;
  const reply = result.text.trim() || FALLBACK_REPLY;

  await recordMessage({
    conversationId: conversation.id,
    role: 'assistant',
    text: reply,
    model: result.model,
    tokensPrompt: result.promptTokens,
    tokensCompletion: result.completionTokens,
    costMicros: result.costMicros,
    latencyMs,
  });

  return {
    reply,
    conversationId: conversation.id,
    model: result.model,
    usage: {
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      totalTokens: result.promptTokens + result.completionTokens,
    },
    costMicros: result.costMicros,
    latencyMs,
    handedOff: false,
  };
}

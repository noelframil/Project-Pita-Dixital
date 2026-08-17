import { queryOne } from '../db.js';
import type { ChatMessage } from '../llm/index.js';
import { config } from '../config.js';
import { REACT_PROMPT_BLOCK, runAgent, type AgentStep } from './agent.js';
import { buildContextBlock, compileTemplate, mergeVariables } from './prompt.js';
import { findRelevantKnowledge } from './rag.js';
import { buildSummaryBlock, summarize, trimToBudget } from './memory.js';
import { loadTools } from './tools.js';
import {
  HANDOFF_PROMPT_BLOCK,
  HANDOFF_TOOL,
  HANDOFF_USER_REPLY,
  detectLoop,
  escalateToHuman,
  type HandoffReasonKind,
} from './handoff.js';
import {
  loadHistory,
  recordMessage,
  resolveConversation,
  saveSummary,
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
  context_token_budget: number;
  max_tool_iterations: number;
  rag_min_similarity: number;
  rag_top_k: number;
  handoff_enabled: boolean;
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
  /** De dónde salió el texto: tecleado, transcrito de audio o descrito de una imagen. */
  sourceKind?: 'text' | 'audio' | 'image';
  /** Coste de transcribir o describir, que no es del turno de chat. */
  mediaCostMicros?: number;
}

export interface ThinkResult {
  reply: string;
  conversationId: string;
  model: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  costMicros: number;
  latencyMs: number;
  handedOff: boolean;
  toolsUsed: string[];
  /** Traza del bucle ReAct. Vacía si el modelo contestó a la primera. */
  steps: AgentStep[];
  stopReason: string;
}

/** Lo que se dice cuando el modelo devuelve vacío. Con la voz del bot, no un error crudo. */
const FALLBACK_REPLY =
  '¡Cococo! Se me cruzaron los cables del gallinero. ¿Puedes repetírmelo de otra manera?';

export async function loadBotConfig(clientId: string): Promise<BotConfig | null> {
  return queryOne<BotConfig>(
    `SELECT id, client_id, system_prompt_template, dynamic_variables,
            allowed_override_vars, channel_overrides, provider, model,
            temperature, max_tokens, history_turns,
            context_token_budget, max_tool_iterations,
            rag_min_similarity, rag_top_k, handoff_enabled
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
 * El camino completo: identidad → conversación → configuración → RAG → memoria
 * → agente → registro. Lo comparten todos los canales; lo único que cambia por
 * canal son los adaptadores de entrada y de salida.
 *
 * Lo multimodal queda por debajo de esta capa: cuando un mensaje llega aquí ya
 * es texto, venga de un teclado, de Whisper o de un modelo de visión.
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
    sourceKind: req.sourceKind ?? 'text',
    mediaCostMicros: req.mediaCostMicros ?? null,
  });

  // Conversación ya derivada: el mensaje queda guardado —lo acabamos de hacer—
  // y el bot no responde. Es lo que hace útil el handoff: si el bot siguiera
  // contestando por encima de la persona, no habría derivado nada.
  if (conversation.status === 'handoff') {
    return {
      reply: '',
      conversationId: conversation.id,
      model: cfg.model,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      costMicros: 0,
      latencyMs: Date.now() - started,
      handedOff: true,
      toolsUsed: [],
      steps: [],
      stopReason: 'already_handed_off',
    };
  }

  const { variables } = mergeVariables(
    cfg.dynamic_variables ?? {},
    req.overrideVariables ?? {},
    cfg.allowed_override_vars ?? [],
  );

  const { prompt: compiledPrompt } = compileTemplate(cfg.system_prompt_template, variables);

  const [knowledge, entries, tools] = await Promise.all([
    findRelevantKnowledge(req.clientId, req.message, {
      topK: cfg.rag_top_k,
      minSimilarity: cfg.rag_min_similarity,
    }),
    // loadHistory ya incluye el mensaje que acabamos de guardar.
    loadHistory(conversation.id, cfg.history_turns, conversation.summarized_until),
    loadTools(req.clientId),
  ]);

  // ── Recorte por presupuesto y resumen de lo que cae ────────────

  const { kept, dropped } = trimToBudget(
    entries.map((e) => e.message),
    cfg.context_token_budget,
  );
  let summary = conversation.summary;

  if (dropped.length > 0) {
    const updated = await summarize(summary, dropped, {
      provider: cfg.provider,
      model: cfg.model,
    });
    // `summarize` devuelve null si el proveedor falló. Entonces se responde con
    // el resumen viejo y la marca de agua NO avanza: los mensajes siguen en su
    // sitio y el próximo turno lo reintenta. Resumir tarde es mejor que dar por
    // resumido lo que no se resumió, que sería perder ese tramo para siempre.
    if (updated) {
      // `trimToBudget` descarta desde el principio de la ventana cargada, así
      // que el corte es la fecha del último descartado.
      const cutoff = entries[dropped.length - 1]?.createdAt;
      if (cutoff) {
        await saveSummary(conversation.id, updated, cutoff);
        summary = updated;
      }
    }
  }

  // ── Red de seguridad: bucle detectado sin que el modelo lo pida ─
  //
  // Se comprueba antes de llamar al modelo. Si el usuario lleva tres turnos
  // repitiendo lo mismo, la cuarta respuesta generada tampoco lo va a resolver,
  // y gastarla es gastar por gastar.
  if (cfg.handoff_enabled && detectLoop(kept)) {
    return handOff({
      conversation,
      cfg,
      req,
      started,
      motivo: 'bucle',
      resumen:
        'El usuario ha repetido la misma petición varias veces sin quedar satisfecho. ' +
        `Última consulta: "${req.message.slice(0, 300)}"`,
      urgencia: 'media',
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      costMicros: 0,
      toolsUsed: [],
      steps: [],
    });
  }

  // ── Ensamblado del prompt del sistema ──────────────────────────
  //
  // Orden deliberado: primero la personalidad del cliente, luego lo que el
  // sistema añade. Los bloques de infraestructura van al final porque lo último
  // que lee el modelo pesa más, y ahí es donde están las reglas que no debe
  // saltarse.
  const hasTools = tools.length > 0;
  const systemPrompt =
    compiledPrompt +
    buildSummaryBlock(summary) +
    buildContextBlock(knowledge) +
    (hasTools ? REACT_PROMPT_BLOCK : '') +
    (cfg.handoff_enabled ? HANDOFF_PROMPT_BLOCK : '');

  // ── Bucle del agente ───────────────────────────────────────────

  const run = await runAgent({
    provider: cfg.provider,
    model: cfg.model,
    system: systemPrompt,
    messages: kept,
    temperature: cfg.temperature,
    maxTokens: cfg.max_tokens,
    maxIterations: cfg.max_tool_iterations,
    tools,
    builtinTools: cfg.handoff_enabled ? [HANDOFF_TOOL] : [],
    conversationId: conversation.id,
  });

  if (run.handoff) {
    return handOff({
      conversation,
      cfg,
      req,
      started,
      motivo: run.handoff.motivo as HandoffReasonKind,
      resumen: run.handoff.resumen,
      urgencia: run.handoff.urgencia as 'baja' | 'media' | 'alta',
      usage: run.usage,
      costMicros: run.costMicros,
      toolsUsed: run.toolsUsed,
      steps: run.steps,
    });
  }

  const latencyMs = Date.now() - started;
  const reply = run.text.trim() || FALLBACK_REPLY;

  await recordMessage({
    conversationId: conversation.id,
    role: 'assistant',
    text: reply,
    model: run.model,
    tokensPrompt: run.usage.promptTokens,
    tokensCompletion: run.usage.completionTokens,
    costMicros: run.costMicros,
    latencyMs,
  });

  return {
    reply,
    conversationId: conversation.id,
    model: run.model,
    usage: run.usage,
    costMicros: run.costMicros,
    latencyMs,
    handedOff: false,
    toolsUsed: run.toolsUsed,
    steps: run.steps,
    stopReason: run.stopReason,
  };
}

/**
 * Cierra el turno derivando a una persona.
 *
 * La respuesta al usuario sí se guarda y sí se envía: dejarlo sin contestar en
 * el mismo momento en que se decide que necesita ayuda humana es exactamente el
 * silencio que el handoff pretende evitar.
 */
async function handOff(params: {
  conversation: { id: string };
  cfg: BotConfig;
  req: ThinkRequest;
  started: number;
  motivo: HandoffReasonKind;
  resumen: string;
  urgencia: 'baja' | 'media' | 'alta';
  usage: ThinkResult['usage'];
  costMicros: number;
  toolsUsed: string[];
  steps: AgentStep[];
}): Promise<ThinkResult> {
  const { conversation, cfg, req, started } = params;

  await escalateToHuman({
    conversationId: conversation.id,
    clientId: req.clientId,
    motivo: params.motivo,
    resumen: params.resumen,
    urgencia: params.urgencia,
    channel: req.channel,
    contactName: req.displayName ?? null,
  });

  const latencyMs = Date.now() - started;

  await recordMessage({
    conversationId: conversation.id,
    role: 'assistant',
    text: HANDOFF_USER_REPLY,
    model: cfg.model,
    tokensPrompt: params.usage.promptTokens,
    tokensCompletion: params.usage.completionTokens,
    costMicros: params.costMicros,
    latencyMs,
  });

  return {
    reply: HANDOFF_USER_REPLY,
    conversationId: conversation.id,
    model: cfg.model,
    usage: params.usage,
    costMicros: params.costMicros,
    latencyMs,
    // false porque este turno SÍ tiene respuesta que enviar. Los siguientes
    // mensajes de esta conversación ya saldrán con handedOff: true.
    handedOff: false,
    toolsUsed: params.toolsUsed,
    steps: params.steps,
    stopReason: 'handoff',
  };
}

export { config };

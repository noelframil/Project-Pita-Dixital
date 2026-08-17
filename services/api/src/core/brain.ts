import { queryOne } from '../db.js';
import { complete, type ChatMessage, type ToolCall } from '../llm/index.js';
import { config } from '../config.js';
import { buildContextBlock, compileTemplate, mergeVariables } from './prompt.js';
import { findRelevantKnowledge } from './rag.js';
import { buildSummaryBlock, summarize, trimToBudget } from './memory.js';
import { executeTool, loadTools, recordInvocation, toToolSpec } from './tools.js';
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
  /** Herramientas ejecutadas en este turno, en orden. Para la traza y los logs. */
  toolsUsed: string[];
}

/** Lo que se dice cuando el modelo devuelve vacío. Con la voz del bot, no un error crudo. */
const FALLBACK_REPLY =
  '¡Cococo! Se me cruzaron los cables del gallinero. ¿Puedes repetírmelo de otra manera?';

export async function loadBotConfig(clientId: string): Promise<BotConfig | null> {
  return queryOne<BotConfig>(
    `SELECT id, client_id, system_prompt_template, dynamic_variables,
            allowed_override_vars, channel_overrides, provider, model,
            temperature, max_tokens, history_turns,
            context_token_budget, max_tool_iterations
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
 * memoria → modelo → herramientas → registro. Lo comparten todos los canales;
 * lo único que cambia por canal son los adaptadores de entrada y de salida.
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
      toolsUsed: [],
    };
  }

  const { variables } = mergeVariables(
    cfg.dynamic_variables ?? {},
    req.overrideVariables ?? {},
    cfg.allowed_override_vars ?? [],
  );

  const { prompt: compiledPrompt } = compileTemplate(cfg.system_prompt_template, variables);

  const [knowledge, entries, tools] = await Promise.all([
    findRelevantKnowledge(req.clientId, req.message),
    // loadHistory ya incluye el mensaje que acabamos de guardar.
    loadHistory(conversation.id, cfg.history_turns, conversation.summarized_until),
    loadTools(req.clientId),
  ]);

  // ── Fase 4: recorte por presupuesto y resumen de lo que cae ────

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
      // que el corte es la fecha del último descartado. Contarlo desde la base
      // de datos daría otro mensaje cuando hay más historial sin resumir del
      // que cabe en `history_turns`, y el tramo intermedio se perdería.
      const cutoff = entries[dropped.length - 1]?.createdAt;
      if (cutoff) {
        await saveSummary(conversation.id, updated, cutoff);
        summary = updated;
      }
    }
  }

  const systemPrompt = compiledPrompt + buildSummaryBlock(summary) + buildContextBlock(knowledge);

  // ── Fase 3: bucle de herramientas ──────────────────────────────

  const messages: ChatMessage[] = [...kept];
  const toolsUsed: string[] = [];
  const toolSpecs = tools.map(toToolSpec);
  const byName = new Map(tools.map((t) => [t.name, t]));

  let promptTokens = 0;
  let completionTokens = 0;
  let costMicros = 0;
  let text = '';
  let model = cfg.model;

  // El +1 es la vuelta final, la que ya contesta sin pedir nada.
  const maxRounds = Math.max(1, cfg.max_tool_iterations) + 1;

  for (let round = 0; round < maxRounds; round++) {
    // En la última vuelta se retiran las herramientas: si se dejaran, el modelo
    // podría pedir otra llamada que ya no se va a ejecutar y contestar contando
    // con un dato que nunca llegó.
    const offerTools = toolSpecs.length > 0 && round < maxRounds - 1;

    const result = await complete(cfg.provider, {
      model: cfg.model,
      system: systemPrompt,
      messages,
      temperature: cfg.temperature,
      maxTokens: cfg.max_tokens,
      signal: AbortSignal.timeout(config.LLM_TIMEOUT_MS),
      ...(offerTools && { tools: toolSpecs }),
    });

    promptTokens += result.promptTokens;
    completionTokens += result.completionTokens;
    costMicros += result.costMicros;
    text = result.text;
    model = result.model;

    if (result.toolCalls.length === 0) break;

    messages.push({ role: 'assistant', content: result.text, toolCalls: result.toolCalls });

    // En paralelo: el modelo puede pedir varias a la vez y encadenarlas sería
    // sumar latencias sin motivo. Todos los resultados vuelven juntos.
    const results = await Promise.all(
      result.toolCalls.map((call) => runToolCall(call, byName, conversation.id)),
    );

    for (const { call, content } of results) {
      toolsUsed.push(call.name);
      messages.push({ role: 'tool', content, toolCallId: call.id });
    }
  }

  const latencyMs = Date.now() - started;
  const reply = text.trim() || FALLBACK_REPLY;

  await recordMessage({
    conversationId: conversation.id,
    role: 'assistant',
    text: reply,
    model,
    tokensPrompt: promptTokens,
    tokensCompletion: completionTokens,
    costMicros,
    latencyMs,
  });

  return {
    reply,
    conversationId: conversation.id,
    model,
    usage: {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
    },
    costMicros,
    latencyMs,
    handedOff: false,
    toolsUsed,
  };
}

/**
 * Ejecuta una llamada y devuelve texto pase lo que pase.
 *
 * Una herramienta que no existe también se contesta con texto en vez de
 * reventar: los modelos se inventan nombres de vez en cuando, y decírselo les
 * permite corregir en la vuelta siguiente.
 */
async function runToolCall(
  call: ToolCall,
  byName: Map<string, Awaited<ReturnType<typeof loadTools>>[number]>,
  conversationId: string,
): Promise<{ call: ToolCall; content: string }> {
  const tool = byName.get(call.name);

  if (!tool) {
    const disponibles = [...byName.keys()].join(', ') || 'ninguna';
    return {
      call,
      content: `No existe ninguna herramienta llamada "${call.name}". Disponibles: ${disponibles}.`,
    };
  }

  const result = await executeTool(tool, call.input);

  await recordInvocation({
    conversationId,
    toolId: tool.id,
    toolName: tool.name,
    input: call.input,
    output: result.content,
    isError: result.isError,
    latencyMs: result.latencyMs,
  });

  return { call, content: result.content };
}

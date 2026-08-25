import { queryOne } from '../db.js';
import type { ChatMessage } from '../llm/index.js';
import { config } from '../config.js';
import {
  REACT_PROMPT_BLOCK,
  runAgent,
  type AgentStep,
  type BuiltinTool,
} from './agent.js';
import {
  MEMORIZE_TOOL,
  MEMORY_PROMPT_BLOCK,
  buildMemoryBlock,
  loadFacts,
  rememberFact,
  type FactCategory,
} from './userFacts.js';
import {
  DELEGATE_TOOL_NAME,
  buildDelegateTool,
  buildOrchestratorPromptBlock,
  loadSubAgents,
  toolsForSubAgent,
  type SubAgent,
} from './subagents.js';
import { newRunId } from './telemetry.js';
import { buildContextBlock, compileTemplate, mergeVariables } from './prompt.js';
import { findRelevantKnowledge } from './rag.js';
import { buildSummaryBlock, summarize, trimToBudget } from './memory.js';
import { loadTools } from './tools.js';
import { redactPII } from './dlp.js';
import { linkRunToMessage } from './telemetry.js';
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
  memory_enabled: boolean;
  memory_max_facts: number;
  reflection_enabled: boolean;
  reflection_provider: string | null;
  reflection_model: string | null;
  max_reflections: number;
  max_delegations: number;
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
  images?: Array<{ base64: string; mime: string }>;
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
            rag_min_similarity, rag_top_k, handoff_enabled,
            memory_enabled, memory_max_facts,
            reflection_enabled, reflection_provider, reflection_model,
            max_reflections, max_delegations
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

  // DLP: Redactar PII antes de procesar el mensaje
  const safeMessage = redactPII(req.message);
  req.message = safeMessage;

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

  const [knowledge, entries, tools, subAgents, facts] = await Promise.all([
    findRelevantKnowledge(req.clientId, req.message, {
      topK: cfg.rag_top_k,
      minSimilarity: cfg.rag_min_similarity,
    }),
    // loadHistory ya incluye el mensaje que acabamos de guardar.
    loadHistory(conversation.id, cfg.history_turns, conversation.summarized_until),
    loadTools(req.clientId),
    loadSubAgents(req.clientId),
    // Los hechos van por contacto, no por conversación: es lo que hace que el
    // bot recuerde a alguien que escribió hace un mes por otro canal.
    cfg.memory_enabled && conversation.contact_id
      ? loadFacts(conversation.contact_id, cfg.memory_max_facts)
      : Promise.resolve([]),
  ]);

  // ── Recorte por presupuesto y resumen de lo que cae ────────────

  const { kept, dropped } = trimToBudget(
    entries.map((e) => e.message),
    cfg.context_token_budget,
  );

  // Adjuntar imágenes al último mensaje si existen
  if (req.images && req.images.length > 0 && kept.length > 0) {
    const lastMsg = kept[kept.length - 1]!;
    if (lastMsg.role === 'user') {
      const parts: any[] = [{ type: 'text', text: typeof lastMsg.content === 'string' ? lastMsg.content : lastMsg.content.map((c: any) => c.text).join('') }];
      for (const img of req.images) {
        parts.push({ type: 'image_url', image_url: { url: `data:${img.mime};base64,${img.base64}` } });
      }
      lastMsg.content = parts;
    }
  }
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
  // Orden deliberado: primero la personalidad del cliente, después los datos
  // (memoria, contexto), y al final las reglas de operación. Lo último que lee
  // el modelo pesa más, y ahí es donde están las instrucciones que no debe
  // saltarse. Cada bloque solo se inyecta si aplica: explicarle a un modelo cómo
  // delegar en especialistas que no tiene solo gasta tokens y lo confunde.
  const hasTools = tools.length > 0 || subAgents.length > 0;
  const systemPrompt =
    compiledPrompt +
    buildMemoryBlock(facts) +
    buildSummaryBlock(summary) +
    buildContextBlock(knowledge) +
    (hasTools ? REACT_PROMPT_BLOCK : '') +
    (cfg.memory_enabled && conversation.contact_id ? MEMORY_PROMPT_BLOCK : '') +
    buildOrchestratorPromptBlock(subAgents) +
    (cfg.handoff_enabled ? HANDOFF_PROMPT_BLOCK : '');

  // ── Herramientas del sistema ───────────────────────────────────

  const runId = newRunId();
  const builtins = buildBuiltins({
    cfg,
    subAgents,
    tools,
    conversationId: conversation.id,
    contactId: conversation.contact_id,
    clientId: req.clientId,
    parentRunId: runId,
  });

  const run = await runAgent({
    provider: cfg.provider,
    model: cfg.model,
    system: systemPrompt,
    conversationId: conversation.id,
    clientId: req.clientId,
    sessionId: req.threadRef,
    channel: req.channel,
    messages: kept,
    temperature: cfg.temperature,
    maxTokens: cfg.max_tokens,
    maxIterations: cfg.max_tool_iterations,
    tools,
    builtins,
    agentRole: 'orchestrator',
    ...(cfg.reflection_enabled && {
      reflection: {
        // El crítico puede correr en un modelo más barato: juzgar un borrador
        // contra unas reglas es más fácil que redactarlo.
        provider: cfg.reflection_provider ?? cfg.provider,
        model: cfg.reflection_model ?? cfg.model,
        maxReflections: cfg.max_reflections,
        userMessage: req.message,
      },
    }),
  });

  // El handoff es la única herramienta sin ejecutor: corta el bucle y la
  // decisión de qué hacer vuelve aquí.
  if (run.interruptedBy?.toolName === HANDOFF_TOOL.name) {
    const input = run.interruptedBy.input;
    return handOff({
      conversation,
      cfg,
      req,
      started,
      motivo: String(input.motivo ?? 'fuera_de_alcance') as HandoffReasonKind,
      resumen: String(input.resumen ?? ''),
      urgencia: String(input.urgencia ?? 'media') as 'baja' | 'media' | 'alta',
      usage: run.usage,
      costMicros: run.costMicros,
      toolsUsed: run.toolsUsed,
      steps: run.steps,
    });
  }

  const latencyMs = Date.now() - started;
  const reply = run.text.trim() || FALLBACK_REPLY;

  const messageId = await recordMessage({
    conversationId: conversation.id,
    role: 'assistant',
    text: reply,
    model: run.model,
    tokensPrompt: run.usage.promptTokens,
    tokensCompletion: run.usage.completionTokens,
    costMicros: run.costMicros,
    latencyMs,
  });

  // Las trazas del turno se enlazan con el mensaje que lo cerró. Va al final
  // porque el `message_id` no existe hasta ahora, y sin esperar: es auditoría.
  if (messageId) linkRunToMessage(run.runId, messageId);

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
 * Monta las herramientas del sistema para este turno.
 *
 * Las tres se comportan distinto y por eso conviven en la misma lista con
 * formas distintas:
 *
 * · `memorize_user_fact` ejecuta y el bucle sigue.
 * · `delegate_to_agent` ejecuta un bucle ReAct entero por dentro y devuelve su
 *   respuesta como resultado de herramienta.
 * · `escalar_a_humano` NO tiene ejecutor: corta el bucle porque la decisión de
 *   qué hacer con la conversación no es del agente.
 */
function buildBuiltins(params: {
  cfg: BotConfig;
  subAgents: SubAgent[];
  tools: Awaited<ReturnType<typeof loadTools>>;
  conversationId: string;
  contactId: string | null;
  clientId: string;
  parentRunId: string;
}): BuiltinTool[] {
  const builtins: BuiltinTool[] = [];
  const { cfg, subAgents, tools, conversationId, contactId, clientId } = params;

  // ── Memoria semántica ────────────────────────────────────────
  // Sin contacto no hay a quién atribuir el hecho, así que ni se ofrece la
  // herramienta: darle al modelo algo que va a fallar siempre es peor que no
  // dárselo.
  if (cfg.memory_enabled && contactId) {
    builtins.push({
      spec: MEMORIZE_TOOL,
      handler: async (input) => {
        const { created, replaced } = await rememberFact({
          clientId,
          contactId,
          factKey: String(input.fact_key ?? ''),
          category: String(input.fact_category ?? 'personal_detail') as FactCategory,
          value: String(input.fact_value ?? ''),
          confidence: Number(input.confidence ?? 0.8),
          conversationId,
        });

        // La confirmación es escueta a propósito: si fuera efusiva, el modelo
        // tendería a comentárselo al usuario ("¡lo he apuntado!"), que es justo
        // lo que no debe hacer.
        if (replaced) return `Anotado. Antes tenías apuntado: "${replaced}".`;
        return created ? 'Anotado.' : 'Ya lo tenías apuntado igual.';
      },
    });
  }

  // ── Delegación en especialistas ──────────────────────────────
  if (subAgents.length > 0) {
    const byName = new Map(subAgents.map((a) => [a.name, a]));
    // El tope es por turno, no por bucle: un orquestador indeciso encadenaría
    // especialistas y un solo mensaje acabaría costando quince llamadas.
    let delegationsLeft = cfg.max_delegations;

    builtins.push({
      spec: buildDelegateTool(subAgents),
      handler: async (input, ctx) => {
        const agent = byName.get(String(input.target_agent ?? ''));
        if (!agent) {
          return `No existe el especialista "${input.target_agent}". Disponibles: ${[
            ...byName.keys(),
          ].join(', ')}.`;
        }

        if (delegationsLeft <= 0) {
          return (
            'Has agotado las delegaciones de este turno. Responde con lo que ya ' +
            'tengas, o dile a la persona que necesitas más tiempo para esto.'
          );
        }
        delegationsLeft--;

        return runSpecialist({
          agent,
          task: String(input.task_description ?? ''),
          allTools: tools,
          conversationId: ctx.conversationId,
          clientId: ctx.clientId,
          parentRunId: params.parentRunId,
          fallbackProvider: cfg.provider,
          fallbackModel: cfg.model,
          fallbackTemperature: cfg.temperature,
          fallbackMaxTokens: cfg.max_tokens,
        });
      },
    });
  }

  // ── Handoff: sin ejecutor, corta el bucle ────────────────────
  if (cfg.handoff_enabled) {
    builtins.push({ spec: HANDOFF_TOOL });
  }

  return builtins;
}

/**
 * Ejecuta un especialista como un bucle ReAct aislado.
 *
 * "Aislado" es literal y es lo que hace que esto funcione: el especialista
 * arranca con su propio prompt del sistema, sus propias herramientas y **un
 * historial vacío**. Lo único que recibe es la tarea que le escribió el
 * orquestador.
 *
 * Pasarle la conversación entera parecería más útil y sería peor: volvería a
 * ser un agente generalista con un prompt distinto, se distraería con lo que no
 * es suyo, y el coste en tokens se multiplicaría por cada delegación. Obligar al
 * orquestador a redactar un encargo autónomo es lo que mantiene al especialista
 * enfocado — y es exactamente lo que se le pide a un compañero al que le pasas
 * un caso.
 *
 * No recibe `delegate_to_agent` ni `escalar_a_humano`: un solo nivel de
 * jerarquía, y las decisiones sobre la conversación entera las toma quien la ve
 * entera.
 */
async function runSpecialist(params: {
  agent: SubAgent;
  task: string;
  allTools: Awaited<ReturnType<typeof loadTools>>;
  conversationId: string;
  clientId: string;
  parentRunId: string;
  fallbackProvider: string;
  fallbackModel: string;
  fallbackTemperature: number;
  fallbackMaxTokens: number;
}): Promise<string> {
  const { agent } = params;
  const tools = toolsForSubAgent(agent, params.allTools);

  const run = await runAgent({
    provider: agent.provider ?? params.fallbackProvider,
    model: agent.model ?? params.fallbackModel,
    system:
      agent.systemPrompt +
      (tools.length > 0 ? REACT_PROMPT_BLOCK : '') +
      SPECIALIST_PROMPT_BLOCK,
    // Historial vacío: la tarea es todo el contexto que tiene.
    messages: [{ role: 'user', content: params.task }],
    temperature: agent.temperature ?? params.fallbackTemperature,
    maxTokens: agent.maxTokens ?? params.fallbackMaxTokens,
    maxIterations: agent.maxIterations,
    tools,
    // Ni delegación ni handoff: un solo nivel.
    builtins: [],
    conversationId: params.conversationId,
    clientId: params.clientId,
    agentRole: 'specialist',
    agentName: agent.name,
    parentRunId: params.parentRunId,
  });

  const respuesta = run.text.trim();
  if (!respuesta) {
    return `El especialista "${agent.name}" no devolvió nada. Resuelve con lo que tengas.`;
  }

  // Se etiqueta de quién viene: el orquestador tiene que saber que esto es un
  // informe de un compañero y no un dato verificado por él.
  return `Respuesta de ${agent.name}:\n${respuesta}`;
}

/** Se anexa al prompt de todo especialista. */
const SPECIALIST_PROMPT_BLOCK = `

# CÓMO ENTREGAR TU TRABAJO
Te ha encargado esto un compañero, no la persona final: nadie va a leer tu respuesta tal cual. Escribe para quien tiene que usarla.

Ve directo al resultado. Nada de saludos, presentaciones ni despedidas.

Di lo que has averiguado y, si algo no has podido resolverlo, dilo claramente en lugar de rellenar. Un "no he podido consultar el stock porque el sistema no responde" es una respuesta útil; inventarse el stock no.

No te dirijas a la persona final ni le hables de tú: tu texto lo va a reescribir tu compañero antes de que nadie lo vea.`;

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

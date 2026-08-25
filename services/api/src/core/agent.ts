/**
 * Bucle de razonamiento autónomo (patrón ReAct: Reason + Act).
 *
 * El modelo piensa, llama a una herramienta, lee el resultado y decide el
 * siguiente paso, hasta que contesta con texto o se agota el presupuesto de
 * vueltas. Se ejecuta entero dentro de un turno: el usuario manda un mensaje y
 * recibe una respuesta, sin ver los pasos intermedios.
 *
 * ── Sobre la parada ────────────────────────────────────────────
 *
 * Tres condiciones, y las tres importan:
 *
 *   1. El modelo contesta sin pedir herramientas. El caso normal.
 *   2. Se agotan las vueltas. En la última se le **retiran** las herramientas:
 *      si se dejaran, podría pedir una llamada que ya no se va a ejecutar y
 *      contestar contando con un dato que nunca llegó.
 *   3. Una herramienta sin ejecutor corta el bucle y devuelve el control a
 *      quien llamó — es como funciona el handoff a un humano.
 *
 * ── Sobre los errores en cascada ───────────────────────────────
 *
 * Un fallo de herramienta **nunca** rompe el turno. Vuelve al modelo como texto
 * para que decida: reintentar con otros parámetros, buscar otra vía, o
 * disculparse. Es lo que separa un agente de un script.
 *
 * ── Sobre los tres tipos de herramienta ────────────────────────
 *
 * · **Del cliente** (`tools`): HTTP, configuradas en la base de datos.
 * · **Del sistema con ejecutor** (`builtins` con `handler`): memorizar un hecho,
 *   delegar en un especialista. Se ejecutan aquí y el bucle continúa.
 * · **Del sistema sin ejecutor** (`builtins` sin `handler`): el handoff. Cortan
 *   el bucle y quien llamó decide qué hacer.
 *
 * Esa tercera forma existía antes como un caso especial del handoff dentro del
 * bucle. Generalizarla fue lo que permitió meter delegación y memoria sin tocar
 * el bucle otra vez.
 */
import { config } from '../config.js';
import { complete, type ChatMessage, type ToolCall, type ToolSpec } from '../llm/index.js';
import { executeTool, recordInvocation, type RegisteredTool } from './tools.js';
import { newRunId, trace, type AgentRole } from './telemetry.js';
import { buildRejectionMessage, critique, type ReflectionAttempt } from './reflection.js';

/**
 * Directrices ReAct que se anexan al prompt del sistema cuando el cliente tiene
 * herramientas. Sin herramientas no se inyectan: explicarle a un modelo cómo
 * encadenar herramientas que no tiene solo gasta tokens y lo confunde.
 */
export const REACT_PROMPT_BLOCK = `

# CÓMO TRABAJAR CON TUS HERRAMIENTAS
Tienes herramientas y puedes usarlas varias veces seguidas antes de contestar. Quien te escribe no ve estos pasos: solo verá tu respuesta final.

Antes de llamar a nada, piensa qué necesitas averiguar y en qué orden. Si un dato depende de otro, pídelos por separado y en su orden; si son independientes, pídelos a la vez en la misma tanda.

Después de cada resultado, léelo antes de seguir. Comprueba que trae lo que esperabas: puede venir vacío, con un error o con algo distinto de lo que pediste. No des por hecho que una llamada salió bien porque no dio error.

Si una herramienta falla:
- Si el fallo es por los parámetros que mandaste, corrígelos y vuelve a intentarlo una vez.
- Si el servicio está caído o el fallo se repite, no insistas. Busca otra vía si la tienes, y si no, dilo con naturalidad: "ahora mismo no puedo consultar eso" es mejor respuesta que un dato inventado.
- Nunca te inventes lo que habría devuelto una herramienta que falló.

No llames a una herramienta si ya tienes la respuesta en la conversación o en tu memoria local. No repitas una llamada idéntica que ya hiciste en este mismo turno: si no funcionó la primera vez, no va a funcionar la segunda.

Cuando tengas lo que necesitas, contesta a lo que te preguntaron. No expliques por dónde has pasado ni qué herramientas usaste salvo que te lo pregunten.`;

/** Contexto que recibe el ejecutor de una herramienta del sistema. */
export interface BuiltinContext {
  conversationId: string;
  runId: string;
  iteration: number;
  clientId: string;
  sessionId?: string;
  channel?: string;
}

/**
 * Herramienta del sistema.
 *
 * Sin `handler`, la llamada corta el bucle y sale en `interrupted`: así funciona
 * el handoff, donde la decisión de qué hacer no es del bucle.
 */
export interface BuiltinTool {
  spec: ToolSpec;
  handler?: (input: Record<string, unknown>, ctx: BuiltinContext) => Promise<string>;
}

/** Un paso del bucle. La traza completa de lo que hizo el agente en el turno. */
export interface AgentStep {
  /** 0-indexado. La vuelta en la que ocurrió. */
  iteration: number;
  /** Texto del modelo en esa vuelta. Suele estar vacío si solo pidió herramientas. */
  thought: string;
  toolCalls: ToolCall[];
  results: Array<{
    toolCallId: string;
    toolName: string;
    content: string;
    isError: boolean;
    latencyMs: number;
  }>;
  usage: { promptTokens: number; completionTokens: number; costMicros: number };
}

export type AgentStopReason =
  /** El modelo contestó sin pedir más herramientas. */
  | 'final_answer'
  /** Se agotó el presupuesto de vueltas. */
  | 'max_iterations'
  /** Una herramienta sin ejecutor cortó el bucle (handoff). */
  | 'interrupted';

export interface AgentRunResult {
  text: string;
  model: string;
  /** Identificador del turno. Cruza el resultado con las filas de `agent_traces`. */
  runId: string;
  steps: AgentStep[];
  stopReason: AgentStopReason;
  /** Mensajes generados dentro del turno, para reconstruir el hilo si hace falta. */
  transcript: ChatMessage[];
  toolsUsed: string[];
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  costMicros: number;
  /** Datos de la herramienta sin ejecutor que cortó el bucle, si la hubo. */
  interruptedBy: { toolName: string; input: Record<string, unknown> } | null;
  /** Rondas de autocrítica, si estaba activa. */
  reflections: ReflectionAttempt[];
}

/** Configuración de la autocrítica. Ausente = apagada. */
export interface ReflectionConfig {
  provider: string;
  model: string;
  maxReflections: number;
  /** El mensaje original, para que el crítico juzgue si se respondió a lo pedido. */
  userMessage: string;
}

export interface AgentRunOptions {
  provider: string;
  model: string;
  system: string;
  conversationId: string;
  clientId: string;
  sessionId?: string;
  channel?: string;
  messages: ChatMessage[];
  temperature: number;
  maxTokens: number;
  maxIterations: number;
  /** Herramientas del cliente, ya cargadas y descifradas. */
  tools: RegisteredTool[];
  /** Herramientas inyectadas por el framework (ej. delegate). */
  builtins?: BuiltinTool[];
  /** Reutiliza un identificador de turno existente. Si falta, se genera uno. */
  runId?: string;
  /** Quién ejecuta este bucle. Va a las trazas. */
  agentRole?: AgentRole;
  agentName?: string | null;
  /** Turno del orquestador, cuando este bucle es una delegación. */
  parentRunId?: string | null;
  reflection?: ReflectionConfig;
}

/**
 * Corre el bucle hasta una condición de parada.
 *
 * Nunca lanza por culpa de una herramienta. Sí puede lanzar si falla el
 * proveedor del modelo, que es un fallo del que el agente no puede recuperarse
 * solo y quien llama debe traducir a un 502.
 */
export async function runAgent(opts: AgentRunOptions): Promise<AgentRunResult> {
  // El identificador del turno se genera aquí, antes de la primera fila: las
  // trazas se escriben sin esperar, así que no puede venir de la base de datos.
  const runId = opts.runId ?? newRunId();
  const agentRole: AgentRole = opts.agentRole ?? 'orchestrator';
  const agentName = opts.agentName ?? null;
  const parentRunId = opts.parentRunId ?? null;

  /** Atajo para no repetir la atribución en cada traza. */
  const track = (
    entry: Omit<Parameters<typeof trace>[0], 'conversationId' | 'runId' | 'agentRole' | 'agentName' | 'parentRunId'>,
  ) =>
    trace({
      ...entry,
      conversationId: opts.conversationId,
      runId,
      agentRole,
      agentName,
      parentRunId,
    });

  const byName = new Map(opts.tools.map((t) => [t.name, t]));
  const builtins = new Map((opts.builtins ?? []).map((b) => [b.spec.name, b]));

  const toolSpecs: ToolSpec[] = [
    ...opts.tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
    ...(opts.builtins ?? []).map((b) => b.spec),
  ];

  const messages: ChatMessage[] = [...opts.messages];
  const transcript: ChatMessage[] = [];
  const steps: AgentStep[] = [];
  const toolsUsed: string[] = [];
  const reflections: ReflectionAttempt[] = [];

  let promptTokens = 0;
  let completionTokens = 0;
  let costMicros = 0;
  let text = '';
  let model = opts.model;
  let stopReason: AgentStopReason = 'final_answer';
  let interruptedBy: AgentRunResult['interruptedBy'] = null;

  // El +1 es la vuelta final, la que ya contesta sin pedir nada.
  const maxRounds = Math.max(1, opts.maxIterations) + 1;

  // Firmas de llamadas ya hechas en este turno. Un modelo atascado repite la
  // misma llamada con los mismos parámetros esperando otro resultado; se le
  // corta antes de gastar otra vuelta y otra petición a un tercero.
  const seen = new Set<string>();

  for (let iteration = 0; iteration < maxRounds; iteration++) {
    const isLastRound = iteration === maxRounds - 1;
    const offerTools = toolSpecs.length > 0 && !isLastRound;
    const roundStarted = Date.now();

    let result;
    try {
      result = await complete(opts.provider, {
        model: opts.model,
        system: opts.system,
        messages,
        temperature: opts.temperature,
        maxTokens: opts.maxTokens,
        signal: AbortSignal.timeout(config.LLM_TIMEOUT_MS),
        ...(offerTools && { tools: toolSpecs }),
      });
    } catch (err) {
      // El fallo del proveedor sí sube: de esto el agente no puede recuperarse
      // solo. Pero se deja constancia antes de propagarlo, que es justo el caso
      // en que una traza vale más — un turno que no llegó a existir.
      track({
        iteration,
        stepType: 'error',
        payload: {
          scope: 'model_provider',
          message: err instanceof Error ? err.message : String(err),
        },
        latencyMs: Date.now() - roundStarted,
      });
      throw err;
    }

    const roundLatency = Date.now() - roundStarted;

    promptTokens += result.promptTokens;
    completionTokens += result.completionTokens;
    costMicros += result.costMicros;
    text = result.text;
    model = result.model;

    track({
      iteration,
      stepType: 'thought',
      payload: {
        text: result.text,
        model: result.model,
        finish_reason: result.finishReason,
        tools_offered: offerTools ? toolSpecs.map((t) => t.name) : [],
        tool_calls_requested: result.toolCalls.map((c) => c.name),
      },
      latencyMs: roundLatency,
      tokensUsed: result.promptTokens + result.completionTokens,
    });

    // ── Respuesta final: aquí entra la autocrítica ──────────────
    if (result.toolCalls.length === 0) {
      steps.push({
        iteration,
        thought: result.text,
        toolCalls: [],
        results: [],
        usage: {
          promptTokens: result.promptTokens,
          completionTokens: result.completionTokens,
          costMicros: result.costMicros,
        },
      });

      if (opts.reflection && result.text.trim()) {
        const refined = await refine({
          opts,
          reflection: opts.reflection,
          draft: result.text,
          messages,
          runId,
          agentRole,
          agentName,
          parentRunId,
          startIteration: iteration + 1,
        });

        text = refined.text;
        promptTokens += refined.usage.promptTokens;
        completionTokens += refined.usage.completionTokens;
        costMicros += refined.costMicros;
        reflections.push(...refined.attempts);
      }

      stopReason = isLastRound && toolSpecs.length > 0 ? 'max_iterations' : 'final_answer';
      break;
    }

    const assistantTurn: ChatMessage = {
      role: 'assistant',
      content: result.text,
      toolCalls: result.toolCalls,
    };
    messages.push(assistantTurn);
    transcript.push(assistantTurn);

    // ── Herramienta sin ejecutor: corta el bucle ────────────────
    const interrupting = result.toolCalls.find((c) => {
      const builtin = builtins.get(c.name);
      return builtin !== undefined && builtin.handler === undefined;
    });

    if (interrupting) {
      interruptedBy = { toolName: interrupting.name, input: interrupting.input };
      steps.push({
        iteration,
        thought: result.text,
        toolCalls: result.toolCalls,
        results: [],
        usage: {
          promptTokens: result.promptTokens,
          completionTokens: result.completionTokens,
          costMicros: result.costMicros,
        },
      });
      toolsUsed.push(interrupting.name);
      track({
        iteration,
        stepType: 'tool_call',
        toolName: interrupting.name,
        payload: { ...interrupting.input, stop: 'el bucle corta aquí' },
      });
      stopReason = 'interrupted';
      break;
    }

    // Cada llamada solicitada, antes de ejecutarla. Se registra aquí y no
    // después para que quede constancia aunque la ejecución se cuelgue o el
    // proceso muera a mitad.
    for (const call of result.toolCalls) {
      track({
        iteration,
        stepType: 'tool_call',
        toolName: call.name,
        payload: { tool_call_id: call.id, input: call.input },
      });
    }

    // ── Ejecución en paralelo ───────────────────────────────────
    // El modelo puede pedir varias a la vez; encadenarlas sumaría latencias sin
    // motivo. Todos los resultados vuelven juntos en la siguiente vuelta.
    const executed = await Promise.all(
      result.toolCalls.map((call) => {
        const ctx: BuiltinContext = {
          conversationId: opts.conversationId,
          runId,
          iteration,
          clientId: opts.clientId,
          sessionId: opts.sessionId,
          channel: opts.channel,
        };
        return runOne(call, byName, builtins, seen, ctx);
      }),
    );

    const stepResults: AgentStep['results'] = [];

    for (const { call, content, isError, latencyMs, toolName } of executed) {
      toolsUsed.push(toolName);
      stepResults.push({ toolCallId: call.id, toolName, content, isError, latencyMs });

      track({
        iteration,
        // Un fallo de herramienta se marca como 'error' y no como 'tool_result':
        // es lo que se consulta al preguntar "¿qué se está rompiendo?", y el
        // índice parcial sobre step_type = 'error' lo hace barato.
        stepType: isError ? 'error' : 'tool_result',
        toolName,
        payload: { tool_call_id: call.id, output: content, is_error: isError },
        latencyMs,
      });

      const toolTurn: ChatMessage = { role: 'tool', content, toolCallId: call.id };
      messages.push(toolTurn);
      transcript.push(toolTurn);
    }

    steps.push({
      iteration,
      thought: result.text,
      toolCalls: result.toolCalls,
      results: stepResults,
      usage: {
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
        costMicros: result.costMicros,
      },
    });

    if (isLastRound) stopReason = 'max_iterations';
  }

  if (stopReason === 'max_iterations') {
    // Agotar las vueltas no es un fallo del sistema, pero sí una señal: o el
    // presupuesto se quedó corto, o el modelo se atascó.
    track({
      iteration: maxRounds - 1,
      stepType: 'error',
      payload: {
        scope: 'max_iterations',
        max_iterations: opts.maxIterations,
        tools_used: toolsUsed,
      },
    });
  }

  return {
    text,
    model,
    runId,
    steps,
    stopReason,
    transcript,
    toolsUsed,
    usage: { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens },
    costMicros,
    interruptedBy,
    reflections,
  };
}

/**
 * Sub-bucle de autocrítica.
 *
 * El crítico juzga el borrador; si lo rechaza, el motivo vuelve al modelo
 * principal y este reescribe. Hasta `maxReflections` veces.
 *
 * Si se agotan los intentos con el borrador todavía rechazado, **se envía el
 * último borrador igualmente**. No hay alternativa mejor: los otros dos caminos
 * son dejar al usuario sin respuesta, o mandarle un mensaje de error genérico
 * que es peor que un texto imperfecto. Queda registrado en la traza como
 * `error` para que se pueda medir cuántas veces pasa — si pasa a menudo, el
 * problema está en las reglas del cliente, no en el borrador.
 */
async function refine(params: {
  opts: AgentRunOptions;
  reflection: ReflectionConfig;
  draft: string;
  messages: ChatMessage[];
  runId: string;
  agentRole: AgentRole;
  agentName: string | null;
  parentRunId: string | null;
  startIteration: number;
}): Promise<{
  text: string;
  attempts: ReflectionAttempt[];
  costMicros: number;
  usage: { promptTokens: number; completionTokens: number };
}> {
  const { opts, reflection } = params;
  const attempts: ReflectionAttempt[] = [];
  const working = [...params.messages];

  let draft = params.draft;
  let costMicros = 0;
  let promptTokens = 0;
  let completionTokens = 0;

  for (let i = 0; i < Math.max(1, reflection.maxReflections); i++) {
    const started = Date.now();

    const { verdict, costMicros: criticCost, promptTokens: cpt, completionTokens: cct } =
      await critique({
        provider: reflection.provider,
        model: reflection.model,
        userMessage: reflection.userMessage,
        systemPrompt: opts.system,
        draft,
      });

    costMicros += criticCost;
    promptTokens += cpt;
    completionTokens += cct;

    const attempt: ReflectionAttempt = {
      iteration: i,
      draft,
      verdict,
      costMicros: criticCost,
      latencyMs: Date.now() - started,
    };
    attempts.push(attempt);

    trace({
      conversationId: opts.conversationId,
      runId: params.runId,
      iteration: params.startIteration + i,
      stepType: verdict.isCompliant ? 'thought' : 'error',
      // El crítico se atribuye a sí mismo aunque corra dentro del turno del
      // orquestador: así se puede medir su coste y su tasa de rechazo por
      // separado, que es lo primero que se quiere saber al encenderlo.
      agentRole: 'critic',
      agentName: params.agentName,
      parentRunId: params.parentRunId,
      payload: {
        is_compliant: verdict.isCompliant,
        feedback: verdict.feedback,
        attempt: i,
        draft_preview: draft.slice(0, 500),
      },
      latencyMs: attempt.latencyMs,
      tokensUsed: cpt + cct,
    });

    if (verdict.isCompliant) {
      return { text: draft, attempts, costMicros, usage: { promptTokens, completionTokens } };
    }

    // Rechazado: el motivo vuelve al modelo principal para que reescriba.
    working.push({ role: 'assistant', content: draft });
    working.push({ role: 'user', content: buildRejectionMessage(verdict.feedback) });

    let rewritten;
    try {
      rewritten = await complete(opts.provider, {
        model: opts.model,
        system: opts.system,
        messages: working,
        temperature: opts.temperature,
        maxTokens: opts.maxTokens,
        signal: AbortSignal.timeout(config.LLM_TIMEOUT_MS),
        // Sin herramientas: aquí solo se reescribe. Ofrecerlas invitaría al
        // modelo a salir otra vez a buscar datos y el sub-bucle se convertiría
        // en un segundo bucle ReAct dentro del primero.
      });
    } catch (err) {
      // El reescritor falló: se envía el último borrador. Es el mismo criterio
      // que con el crítico caído — mejor un texto imperfecto que ninguno.
      console.error(
        '[reflection] la reescritura falló; se envía el borrador anterior:',
        err instanceof Error ? err.message : err,
      );
      return { text: draft, attempts, costMicros, usage: { promptTokens, completionTokens } };
    }

    costMicros += rewritten.costMicros;
    promptTokens += rewritten.promptTokens;
    completionTokens += rewritten.completionTokens;

    if (rewritten.text.trim()) draft = rewritten.text;
    // Se quitan los dos mensajes del intento para que el siguiente parta del
    // mismo sitio: acumularlos haría que el modelo viera una pila de borradores
    // rechazados y empezara a escribir sobre sus propias correcciones.
    working.splice(-2, 2);
  }

  trace({
    conversationId: opts.conversationId,
    runId: params.runId,
    iteration: params.startIteration + reflection.maxReflections,
    stepType: 'error',
    agentRole: 'critic',
    parentRunId: params.parentRunId,
    payload: {
      scope: 'reflections_exhausted',
      attempts: reflection.maxReflections,
      last_feedback: attempts.at(-1)?.verdict.feedback ?? '',
    },
  });

  return { text: draft, attempts, costMicros, usage: { promptTokens, completionTokens } };
}

/**
 * Ejecuta una llamada y devuelve texto pase lo que pase.
 *
 * Cuatro formas de fallar, las cuatro contestadas con texto que el modelo puede
 * leer y usar para replantear:
 *   · La herramienta no existe (los modelos se inventan nombres).
 *   · Es una repetición exacta de una llamada ya hecha en este turno.
 *   · El ejecutor de una herramienta del sistema lanzó.
 *   · La ejecución HTTP falló (red, 500 del tercero, timeout).
 */
async function runOne(
  call: ToolCall,
  byName: Map<string, RegisteredTool>,
  builtins: Map<string, BuiltinTool>,
  seen: Set<string>,
  ctx: BuiltinContext,
): Promise<{
  call: ToolCall;
  toolName: string;
  content: string;
  isError: boolean;
  latencyMs: number;
}> {
  const builtin = builtins.get(call.name);
  const tool = byName.get(call.name);

  if (!builtin && !tool) {
    const disponibles = [...byName.keys(), ...builtins.keys()].join(', ') || 'ninguna';
    return {
      call,
      toolName: call.name,
      content: `No existe ninguna herramienta llamada "${call.name}". Disponibles: ${disponibles}.`,
      isError: true,
      latencyMs: 0,
    };
  }

  const signature = `${call.name}:${JSON.stringify(call.input)}`;
  if (seen.has(signature)) {
    return {
      call,
      toolName: call.name,
      content:
        `Ya llamaste a "${call.name}" con exactamente estos parámetros en este mismo turno ` +
        'y el resultado está más arriba. Si no te sirvió, prueba con otros parámetros, ' +
        'con otra herramienta, o dile a la persona que ahora mismo no puedes conseguir ese dato.',
      isError: true,
      latencyMs: 0,
    };
  }
  seen.add(signature);

  // ── Herramienta del sistema con ejecutor ──────────────────────
  if (builtin?.handler) {
    const started = Date.now();
    try {
      const content = await builtin.handler(call.input, ctx);
      return { call, toolName: call.name, content, isError: false, latencyMs: Date.now() - started };
    } catch (err) {
      return {
        call,
        toolName: call.name,
        content: `No se pudo completar "${call.name}": ${
          err instanceof Error ? err.message : String(err)
        }`,
        isError: true,
        latencyMs: Date.now() - started,
      };
    }
  }

  // ── Herramienta HTTP del cliente ──────────────────────────────
  const result = await executeTool(tool!, call.input, { clientId: ctx.clientId, runId: ctx.runId, sessionId: ctx.sessionId, channel: ctx.channel });

  await recordInvocation({
    conversationId: ctx.conversationId,
    toolId: tool!.id,
    toolName: tool!.name,
    input: call.input,
    output: result.content,
    isError: result.isError,
    latencyMs: result.latencyMs,
  });

  return {
    call,
    toolName: tool!.name,
    content: result.content,
    isError: result.isError,
    latencyMs: result.latencyMs,
  };
}

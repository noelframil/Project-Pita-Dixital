/**
 * Bucle de razonamiento autónomo (patrón ReAct: Reason + Act).
 *
 * El modelo piensa, llama a una herramienta, lee el resultado y decide el
 * siguiente paso, hasta que contesta con texto o se agota el presupuesto de
 * vueltas. Se ejecuta entero dentro de un turno: el usuario manda un mensaje y
 * recibe una respuesta, sin ver los pasos intermedios.
 *
 * Sale de `brain.ts` a su propio módulo por dos razones: el bucle ya tiene
 * suficiente lógica propia (parada, errores en cascada, pasos tipados) como para
 * merecer un sitio donde probarlo aislado, y `brain.ts` vuelve a ser lo que
 * debía ser — el orquestador que decide *qué* pasa, no *cómo*.
 *
 * ── Sobre la parada ────────────────────────────────────────────
 *
 * Tres condiciones, y las tres importan:
 *
 *   1. El modelo contesta sin pedir herramientas. El caso normal.
 *   2. Se agotan las vueltas. En la última se le **retiran** las herramientas:
 *      si se dejaran, podría pedir una llamada que ya no se va a ejecutar y
 *      contestar contando con un dato que nunca llegó.
 *   3. Una herramienta pide derivar a un humano. Corta en seco: seguir
 *      razonando después de decidir que hace falta una persona es gastar por
 *      gastar.
 *
 * ── Sobre los errores en cascada ───────────────────────────────
 *
 * Un fallo de herramienta **nunca** rompe el turno. Vuelve al modelo como texto
 * para que decida: reintentar con otros parámetros, buscar otra vía, o
 * disculparse. Es lo que separa un agente de un script: el modelo ve el error y
 * replantea, en lugar de propagar una excepción hasta la raíz.
 */
import { config } from '../config.js';
import { complete, type ChatMessage, type ToolCall, type ToolSpec } from '../llm/index.js';
import { executeTool, recordInvocation, type RegisteredTool } from './tools.js';
import { HANDOFF_TOOL_NAME } from './handoff.js';

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
  /** Una herramienta pidió derivar a un humano. */
  | 'handoff';

export interface AgentRunResult {
  text: string;
  model: string;
  steps: AgentStep[];
  stopReason: AgentStopReason;
  /** Mensajes generados dentro del turno, para reconstruir el hilo si hace falta. */
  transcript: ChatMessage[];
  toolsUsed: string[];
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  costMicros: number;
  /** Datos de la llamada a `escalar_a_humano`, si la hubo. */
  handoff: { motivo: string; resumen: string; urgencia: string } | null;
}

export interface AgentRunOptions {
  provider: string;
  model: string;
  system: string;
  messages: ChatMessage[];
  temperature: number;
  maxTokens: number;
  maxIterations: number;
  /** Herramientas del cliente, ya cargadas y descifradas. */
  tools: RegisteredTool[];
  /** Herramientas del sistema sin ejecución propia, como `escalar_a_humano`. */
  builtinTools?: ToolSpec[];
  conversationId: string;
}

/**
 * Corre el bucle hasta una condición de parada.
 *
 * Nunca lanza por culpa de una herramienta. Sí puede lanzar si falla el
 * proveedor del modelo, que es un fallo del que el agente no puede recuperarse
 * solo y quien llama debe traducir a un 502.
 */
export async function runAgent(opts: AgentRunOptions): Promise<AgentRunResult> {
  const byName = new Map(opts.tools.map((t) => [t.name, t]));
  const toolSpecs: ToolSpec[] = [
    ...opts.tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
    ...(opts.builtinTools ?? []),
  ];

  const messages: ChatMessage[] = [...opts.messages];
  const transcript: ChatMessage[] = [];
  const steps: AgentStep[] = [];
  const toolsUsed: string[] = [];

  let promptTokens = 0;
  let completionTokens = 0;
  let costMicros = 0;
  let text = '';
  let model = opts.model;
  let stopReason: AgentStopReason = 'final_answer';
  let handoff: AgentRunResult['handoff'] = null;

  // El +1 es la vuelta final: la que ya contesta sin herramientas encima.
  const maxRounds = Math.max(1, opts.maxIterations) + 1;

  // Firmas de llamadas ya hechas en este turno. Un modelo atascado repite la
  // misma llamada con los mismos parámetros esperando otro resultado; se le
  // corta antes de gastar otra vuelta y otra petición a un tercero.
  const seen = new Set<string>();

  for (let iteration = 0; iteration < maxRounds; iteration++) {
    const isLastRound = iteration === maxRounds - 1;
    const offerTools = toolSpecs.length > 0 && !isLastRound;

    const result = await complete(opts.provider, {
      model: opts.model,
      system: opts.system,
      messages,
      temperature: opts.temperature,
      maxTokens: opts.maxTokens,
      signal: AbortSignal.timeout(config.LLM_TIMEOUT_MS),
      ...(offerTools && { tools: toolSpecs }),
    });

    promptTokens += result.promptTokens;
    completionTokens += result.completionTokens;
    costMicros += result.costMicros;
    text = result.text;
    model = result.model;

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

    // ── Handoff: corta el bucle en seco ─────────────────────────
    const handoffCall = result.toolCalls.find((c) => c.name === HANDOFF_TOOL_NAME);
    if (handoffCall) {
      handoff = {
        motivo: String(handoffCall.input.motivo ?? 'fuera_de_alcance'),
        resumen: String(handoffCall.input.resumen ?? ''),
        urgencia: String(handoffCall.input.urgencia ?? 'media'),
      };
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
      toolsUsed.push(HANDOFF_TOOL_NAME);
      stopReason = 'handoff';
      break;
    }

    // ── Ejecución en paralelo ───────────────────────────────────
    // El modelo puede pedir varias a la vez; encadenarlas sumaría latencias sin
    // motivo. Todos los resultados vuelven juntos en la siguiente vuelta.
    const executed = await Promise.all(
      result.toolCalls.map((call) => runOne(call, byName, opts.conversationId, seen)),
    );

    const stepResults: AgentStep['results'] = [];

    for (const { call, content, isError, latencyMs, toolName } of executed) {
      toolsUsed.push(toolName);
      stepResults.push({
        toolCallId: call.id,
        toolName,
        content,
        isError,
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

  return {
    text,
    model,
    steps,
    stopReason,
    transcript,
    toolsUsed,
    usage: { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens },
    costMicros,
    handoff,
  };
}

/**
 * Ejecuta una llamada y devuelve texto pase lo que pase.
 *
 * Tres formas de fallar, las tres contestadas con texto que el modelo puede
 * leer y usar para replantear:
 *   · La herramienta no existe (los modelos se inventan nombres).
 *   · Es una repetición exacta de una llamada ya hecha en este turno.
 *   · La ejecución falló (red, 500 del tercero, timeout).
 */
async function runOne(
  call: ToolCall,
  byName: Map<string, RegisteredTool>,
  conversationId: string,
  seen: Set<string>,
): Promise<{
  call: ToolCall;
  toolName: string;
  content: string;
  isError: boolean;
  latencyMs: number;
}> {
  const tool = byName.get(call.name);

  if (!tool) {
    const disponibles = [...byName.keys()].join(', ') || 'ninguna';
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

  return {
    call,
    toolName: tool.name,
    content: result.content,
    isError: result.isError,
    latencyMs: result.latencyMs,
  };
}

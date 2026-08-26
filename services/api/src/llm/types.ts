export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

export interface MessageContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string };
}

export interface ChatMessage {
  role: ChatRole;
  content: string | MessageContentPart[];
  /** Herramientas que el modelo pidió en este turno. Solo en `assistant`. */
  toolCalls?: ToolCall[];
  /** A qué llamada responde este resultado. Solo en `tool`. */
  toolCallId?: string;
  /** Indica si este mensaje debe usar prompt caching (Anthropic). */
  cacheable?: boolean;
}

/**
 * Herramienta ofrecida al modelo. Es la forma interna: cada proveedor la
 * traduce a la suya (`tools` en Anthropic, `functions` en OpenAI y Ollama).
 */
export interface ToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** Indica si esta herramienta debe marcar el final del bloque de caché. */
  cacheable?: boolean;
}

/** Petición de ejecución que devuelve el modelo. */
export interface ToolCall {
  /** Ollama no devuelve identificador; ahí se sintetiza uno. */
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/**
 * Esquema al que debe ceñirse la respuesta. Cada proveedor lo aplica con su
 * mecanismo nativo (Anthropic `output_config.format`, OpenAI `response_format`,
 * Ollama `format`), así que el modelo no puede devolver prosa alrededor del JSON.
 *
 * Restricciones del esquema, impuestas por los proveedores:
 *   · Todo objeto necesita `additionalProperties: false` y `required` completo.
 *   · Nada de `minLength`, `maxLength`, `minimum`, `maximum` ni esquemas
 *     recursivos. Los límites de tamaño se validan en el cliente con Zod.
 *
 * Que el proveedor garantice la forma no exime de validar: quien llama vuelve
 * a comprobar lo que llega.
 */
export interface JsonSchemaSpec {
  name: string;
  schema: Record<string, unknown>;
}

export interface CompletionRequest {
  model: string;
  system: string;
  /** Indica si el system prompt debe usar prompt caching. */
  systemCacheable?: boolean;
  messages: ChatMessage[];
  temperature: number;
  maxTokens: number;
  signal?: AbortSignal;
  jsonSchema?: JsonSchemaSpec;
  /** Sobrescribe LLM_TIMEOUT_MS. Las tareas de administración tardan más que un chat. */
  timeoutMs?: number;
  tools?: ToolSpec[];
}

export interface CompletionResult {
  text: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  /** Coste en millonésimas de euro. Enteros: nada de float para dinero. */
  costMicros: number;
  finishReason: string;
  /** Vacío cuando el modelo contestó sin pedir herramientas. */
  toolCalls: ToolCall[];
}

export interface LlmProvider {
  readonly name: string;
  complete(req: CompletionRequest): Promise<CompletionResult>;
}

/** Error de proveedor con la información necesaria para decidir si reintentar. */
export class LlmError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'LlmError';
  }
}

/** Solo se reintenta lo que puede salir bien: 429 y 5xx. Un 400 se reintenta igual de mal. */
export function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 408 || status >= 500;
}

export async function withRetries<T>(
  fn: () => Promise<T>,
  attempts = 3,
  baseDelayMs = 500,
): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const retryable = err instanceof LlmError ? err.retryable : false;
      if (!retryable || i === attempts - 1) throw err;
      // Backoff exponencial con jitter para no sincronizar todos los reintentos.
      const delay = baseDelayMs * 2 ** i + Math.random() * 200;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}

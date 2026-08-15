export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface CompletionRequest {
  model: string;
  system: string;
  messages: ChatMessage[];
  temperature: number;
  maxTokens: number;
  signal?: AbortSignal;
}

export interface CompletionResult {
  text: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  /** Coste en millonésimas de euro. Enteros: nada de float para dinero. */
  costMicros: number;
  finishReason: string;
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

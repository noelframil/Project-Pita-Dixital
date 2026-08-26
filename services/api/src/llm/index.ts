import { anthropicProvider } from './anthropic.js';
import { ollamaProvider } from './ollama.js';
import { openaiProvider } from './openai.js';
import { LlmError, withRetries, type CompletionRequest, type CompletionResult, type LlmProvider } from './types.js';

const PROVIDERS: Record<string, LlmProvider> = {
  ollama: ollamaProvider,
  openai: openaiProvider,
  anthropic: anthropicProvider,
};

// --- Circuit Breaker State ---
const MAX_FAILURES = 5;
const RESET_TIMEOUT_MS = 30000; // 30 seconds

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CircuitBreaker {
  state: CircuitState;
  failures: number;
  nextAttempt: number;
}

const breakers: Record<string, CircuitBreaker> = {};

function getBreaker(providerName: string): CircuitBreaker {
  if (!breakers[providerName]) {
    breakers[providerName] = { state: 'CLOSED', failures: 0, nextAttempt: 0 };
  }
  return breakers[providerName];
}

function checkCircuitBreaker(providerName: string) {
  const breaker = getBreaker(providerName);
  
  if (breaker.state === 'OPEN') {
    if (Date.now() > breaker.nextAttempt) {
      breaker.state = 'HALF_OPEN';
    } else {
      throw new LlmError(
        `Circuit Breaker OPEN for provider ${providerName}. Please wait.`,
        503,
        false
      );
    }
  }
}

function reportSuccess(providerName: string) {
  const breaker = getBreaker(providerName);
  if (breaker.state === 'HALF_OPEN' || breaker.failures > 0) {
    breaker.state = 'CLOSED';
    breaker.failures = 0;
  }
}

function reportFailure(providerName: string, err: any) {
  const breaker = getBreaker(providerName);
  // Only count retryable errors towards breaking the circuit
  const isRetryable = err instanceof LlmError ? err.retryable : true;
  if (!isRetryable) return;

  breaker.failures++;
  if (breaker.failures >= MAX_FAILURES) {
    breaker.state = 'OPEN';
    breaker.nextAttempt = Date.now() + RESET_TIMEOUT_MS;
    console.error(`[Circuit Breaker] Provider ${providerName} is now OPEN. Waiting ${RESET_TIMEOUT_MS}ms`);
  }
}
// -----------------------------

export function getProvider(name: string): LlmProvider {
  const provider = PROVIDERS[name];
  if (!provider) {
    throw new LlmError(
      `Proveedor desconocido: "${name}". Disponibles: ${Object.keys(PROVIDERS).join(', ')}`,
      null,
      false,
    );
  }
  return provider;
}

export async function complete(
  providerName: string,
  req: CompletionRequest,
): Promise<CompletionResult> {
  checkCircuitBreaker(providerName);
  const provider = getProvider(providerName);

  try {
    const result = await withRetries(() => provider.complete(req));
    reportSuccess(providerName);
    return result;
  } catch (error) {
    reportFailure(providerName, error);
    throw error;
  }
}

export { LlmError };
export type { ChatMessage, CompletionResult, ToolCall, ToolSpec } from './types.js';
import type { ChatMessage } from './types.js';
export function extractText(content: ChatMessage['content']): string {
  if (typeof content === 'string') return content;
  return content.filter((c) => c.type === 'text').map((c) => c.text).join('\n');
}

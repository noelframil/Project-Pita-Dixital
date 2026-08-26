import { anthropicProvider } from './anthropic.js';
import { ollamaProvider } from './ollama.js';
import { openaiProvider } from './openai.js';
import { LlmError, withRetries, type CompletionRequest, type CompletionResult, type LlmProvider } from './types.js';

const PROVIDERS: Record<string, LlmProvider> = {
  ollama: ollamaProvider,
  openai: openaiProvider,
  anthropic: anthropicProvider,
};

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
  const provider = getProvider(providerName);
  return withRetries(() => provider.complete(req));
}

export { LlmError };
export type { ChatMessage, CompletionResult, ToolCall, ToolSpec } from './types.js';
import type { ChatMessage } from './types.js';
export function extractText(content: ChatMessage['content']): string {
  if (typeof content === 'string') return content;
  return content.filter((c) => c.type === 'text').map((c) => c.text).join('\n');
}

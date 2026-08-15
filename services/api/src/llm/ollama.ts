import { config } from '../config.js';
import { estimateCostMicros } from './pricing.js';
import { LlmError, isRetryableStatus, type CompletionRequest, type CompletionResult, type LlmProvider } from './types.js';

interface OllamaChatResponse {
  message?: { content?: string };
  prompt_eval_count?: number;
  eval_count?: number;
  done_reason?: string;
}

/**
 * Ollama en local. Es el proveedor por defecto en desarrollo: cuesta cero
 * y no filtra las conversaciones de los huéspedes a ningún tercero, que era
 * el punto original del proyecto.
 */
export const ollamaProvider: LlmProvider = {
  name: 'ollama',

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const res = await fetch(`${config.OLLAMA_HOST}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: req.signal ?? AbortSignal.timeout(config.LLM_TIMEOUT_MS),
      body: JSON.stringify({
        model: req.model,
        stream: false,
        messages: [{ role: 'system', content: req.system }, ...req.messages],
        options: {
          temperature: req.temperature,
          num_predict: req.maxTokens,
        },
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new LlmError(
        `Ollama ${res.status}: ${body.slice(0, 200)}`,
        res.status,
        isRetryableStatus(res.status),
      );
    }

    const data = (await res.json()) as OllamaChatResponse;
    const promptTokens = data.prompt_eval_count ?? 0;
    const completionTokens = data.eval_count ?? 0;

    return {
      text: data.message?.content ?? '',
      model: req.model,
      promptTokens,
      completionTokens,
      costMicros: estimateCostMicros(req.model, promptTokens, completionTokens, 'ollama'),
      finishReason: data.done_reason ?? 'stop',
    };
  },
};

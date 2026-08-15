import { config } from '../config.js';
import { estimateCostMicros } from './pricing.js';
import { LlmError, isRetryableStatus, type CompletionRequest, type CompletionResult, type LlmProvider } from './types.js';

interface OpenAiChatResponse {
  choices?: Array<{ message?: { content?: string | null }; finish_reason?: string }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export const openaiProvider: LlmProvider = {
  name: 'openai',

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    if (!config.OPENAI_API_KEY) {
      throw new LlmError('OPENAI_API_KEY no configurada', null, false);
    }

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.OPENAI_API_KEY}`,
      },
      signal: req.signal ?? AbortSignal.timeout(config.LLM_TIMEOUT_MS),
      body: JSON.stringify({
        model: req.model,
        temperature: req.temperature,
        max_tokens: req.maxTokens,
        messages: [{ role: 'system', content: req.system }, ...req.messages],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new LlmError(
        `OpenAI ${res.status}: ${body.slice(0, 200)}`,
        res.status,
        isRetryableStatus(res.status),
      );
    }

    const data = (await res.json()) as OpenAiChatResponse;
    const choice = data.choices?.[0];
    const promptTokens = data.usage?.prompt_tokens ?? 0;
    const completionTokens = data.usage?.completion_tokens ?? 0;

    return {
      // content puede venir null si salta el filtro de contenido: quien llama lo maneja.
      text: choice?.message?.content ?? '',
      model: req.model,
      promptTokens,
      completionTokens,
      costMicros: estimateCostMicros(req.model, promptTokens, completionTokens, 'openai'),
      finishReason: choice?.finish_reason ?? 'stop',
    };
  },
};

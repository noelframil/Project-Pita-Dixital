import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import { estimateCostMicros } from './pricing.js';
import { LlmError, type CompletionRequest, type CompletionResult, type LlmProvider } from './types.js';

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!config.ANTHROPIC_API_KEY) {
    throw new LlmError('ANTHROPIC_API_KEY no configurada', null, false);
  }
  client ??= new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });
  return client;
}

/**
 * Los modelos Claude 5 rechazan `temperature` con un 400: el parámetro se
 * eliminó. La personalidad se controla desde el prompt, no desde el sampler.
 */
const REJECTS_TEMPERATURE = /^claude-(opus-5|sonnet-5|fable-5|mythos-5|opus-4-[78])/;

export const anthropicProvider: LlmProvider = {
  name: 'anthropic',

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const anthropic = getClient();

    const params: Anthropic.MessageCreateParamsNonStreaming = {
      model: req.model,
      max_tokens: req.maxTokens,
      system: req.system,
      messages: req.messages.map((m) => ({
        role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
        content: m.content,
      })),
    };
    if (!REJECTS_TEMPERATURE.test(req.model)) {
      params.temperature = req.temperature;
    }

    try {
      const res = await anthropic.messages.create(params, {
        timeout: config.LLM_TIMEOUT_MS,
        signal: req.signal,
      });

      // content es una unión discriminada: hay que estrechar por type.
      const text = res.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('');

      return {
        text,
        model: res.model,
        promptTokens: res.usage.input_tokens,
        completionTokens: res.usage.output_tokens,
        costMicros: estimateCostMicros(
          res.model,
          res.usage.input_tokens,
          res.usage.output_tokens,
          'anthropic',
        ),
        finishReason: res.stop_reason ?? 'end_turn',
      };
    } catch (err) {
      if (err instanceof Anthropic.APIError) {
        const status = err.status ?? null;
        const retryable =
          err instanceof Anthropic.RateLimitError ||
          err instanceof Anthropic.InternalServerError ||
          err instanceof Anthropic.APIConnectionError;
        throw new LlmError(`Anthropic ${status ?? '?'}: ${err.message}`, status, retryable);
      }
      throw err;
    }
  },
};

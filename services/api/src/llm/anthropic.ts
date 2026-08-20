import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import { estimateCostMicros } from './pricing.js';
import {
  LlmError,
  type ChatMessage,
  type CompletionRequest,
  type CompletionResult,
  type LlmProvider,
  type ToolCall,
} from './types.js';

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

/**
 * Traduce el historial interno al formato de Anthropic.
 *
 * Dos particularidades que no se pueden saltar:
 *
 * · Un resultado de herramienta viaja como bloque `tool_result` dentro de un
 *   turno de **usuario**, no en un rol propio.
 * · Todos los resultados de una misma tanda tienen que ir en el mismo turno.
 *   Si se parten en turnos consecutivos la API los rechaza, porque cada
 *   `tool_use` necesita su `tool_result` en la respuesta inmediata.
 */
export function toAnthropicMessages(messages: ChatMessage[]): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];

  for (const msg of messages) {
    if (msg.role === 'tool') {
      const block: Anthropic.ToolResultBlockParam = {
        type: 'tool_result',
        tool_use_id: msg.toolCallId ?? '',
        content: msg.content,
      };
      const last = out[out.length - 1];
      if (last?.role === 'user' && Array.isArray(last.content)) {
        last.content.push(block);
      } else {
        out.push({ role: 'user', content: [block] });
      }
      continue;
    }

    if (msg.role === 'assistant' && msg.toolCalls?.length) {
      const content: Anthropic.ContentBlockParam[] = [];
      // El texto que acompaña a la llamada es opcional; un bloque vacío es un 400.
      if (msg.content.trim()) content.push({ type: 'text', text: msg.content });
      for (const call of msg.toolCalls) {
        content.push({ type: 'tool_use', id: call.id, name: call.name, input: call.input });
      }
      out.push({ role: 'assistant', content });
      continue;
    }

    out.push({
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content: msg.content,
    });
  }

  return out;
}

export const anthropicProvider: LlmProvider = {
  name: 'anthropic',

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const anthropic = getClient();

    const params: Anthropic.MessageCreateParamsNonStreaming = {
      model: req.model,
      max_tokens: req.maxTokens,
      system: req.system,
      messages: toAnthropicMessages(req.messages),
    };
    if (!REJECTS_TEMPERATURE.test(req.model)) {
      params.temperature = req.temperature;
    }

    if (req.tools?.length) {
      params.tools = req.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
      }));
    }

    // `output_config` es GA, pero los tipos del SDK van por detrás de la API.
    // El cast es deliberado y está acotado a este campo.
    if (req.jsonSchema) {
      (params as unknown as Record<string, unknown>).output_config = {
        format: { type: 'json_schema', schema: req.jsonSchema.schema },
      };
    }

    try {
      const res = await anthropic.messages.create(params, {
        timeout: req.timeoutMs ?? config.LLM_TIMEOUT_MS,
        signal: req.signal,
      });

      // content es una unión discriminada: hay que estrechar por type.
      const text = res.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('');

      const toolCalls: ToolCall[] = res.content
        .filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
        .map((b) => ({
          id: b.id,
          name: b.name,
          input: (b.input ?? {}) as Record<string, unknown>,
        }));

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
        toolCalls,
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

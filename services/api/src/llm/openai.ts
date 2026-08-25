import { config } from '../config.js';
import { estimateCostMicros } from './pricing.js';
import {
  LlmError,
  isRetryableStatus,
  type ChatMessage,
  type CompletionRequest,
  type CompletionResult,
  type LlmProvider,
  type ToolCall,
} from './types.js';

interface OpenAiToolCall {
  id?: string;
  function?: { name?: string; arguments?: string };
}

interface OpenAiChatResponse {
  choices?: Array<{
    message?: { content?: string | null; tool_calls?: OpenAiToolCall[] };
    finish_reason?: string;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/** El formato de OpenAI lo comparte Ollama, así que la conversión se reutiliza. */
export function toOpenAiMessages(messages: ChatMessage[]): Record<string, unknown>[] {
  return messages.map((msg) => {
    if (msg.role === 'tool') {
      return { role: 'tool', tool_call_id: msg.toolCallId, content: msg.content };
    }
    if (msg.role === 'assistant' && msg.toolCalls?.length) {
      let contentStr = '';
      if (typeof msg.content === 'string') contentStr = msg.content;
      else if (Array.isArray(msg.content)) contentStr = msg.content.map(c => c.text || '').join('');
      return {
        role: 'assistant',
        // null y no cadena vacía: es lo que la API espera cuando solo hay llamadas.
        content: contentStr.trim() || null,
        tool_calls: msg.toolCalls.map((c) => ({
          id: c.id,
          type: 'function',
          function: { name: c.name, arguments: JSON.stringify(c.input) },
        })),
      };
    }
    return { 
      role: msg.role, 
      content: Array.isArray(msg.content) 
        ? msg.content.map(p => p.type === 'image_url' ? { type: 'image_url', image_url: { url: p.image_url?.url } } : { type: 'text', text: p.text }) 
        : msg.content 
    };
  });
}

export function toOpenAiTools(
  tools: CompletionRequest['tools'],
): Record<string, unknown>[] | undefined {
  if (!tools?.length) return undefined;
  return tools.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.inputSchema },
  }));
}

/**
 * Los argumentos llegan como cadena JSON. Un modelo puede devolver algo que no
 * parsea; eso es un fallo de esa llamada concreta, no de la respuesta entera,
 * así que se entrega un objeto vacío y el ejecutor de la herramienta rechazará
 * la entrada con un mensaje que el modelo puede leer y corregir.
 */
export function parseToolArguments(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
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
      signal: req.signal ?? AbortSignal.timeout(req.timeoutMs ?? config.LLM_TIMEOUT_MS),
      body: JSON.stringify({
        model: req.model,
        temperature: req.temperature,
        max_tokens: req.maxTokens,
        messages: [{ role: 'system', content: req.system }, ...toOpenAiMessages(req.messages)],
        ...(toOpenAiTools(req.tools) && { tools: toOpenAiTools(req.tools) }),
        ...(req.jsonSchema && {
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: req.jsonSchema.name,
              schema: req.jsonSchema.schema,
              strict: true,
            },
          },
        }),
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

    const toolCalls: ToolCall[] = (choice?.message?.tool_calls ?? []).map((c, i) => ({
      id: c.id ?? `call_${i}`,
      name: c.function?.name ?? '',
      input: parseToolArguments(c.function?.arguments),
    }));

    return {
      // content puede venir null si salta el filtro de contenido: quien llama lo maneja.
      text: choice?.message?.content ?? '',
      model: req.model,
      promptTokens,
      completionTokens,
      costMicros: estimateCostMicros(req.model, promptTokens, completionTokens, 'openai'),
      finishReason: choice?.finish_reason ?? 'stop',
      toolCalls,
    };
  },
};

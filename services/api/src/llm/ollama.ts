import { config } from '../config.js';
import { toOpenAiMessages, toOpenAiTools } from './openai.js';
import { estimateCostMicros } from './pricing.js';
import {
  LlmError,
  isRetryableStatus,
  type CompletionRequest,
  type CompletionResult,
  type LlmProvider,
  type ToolCall,
  type ChatMessage,
} from './types.js';

interface OllamaToolCall {
  function?: {
    name?: string;
    /** Ollama ya lo entrega parseado, al revés que OpenAI. */
    arguments?: Record<string, unknown>;
  };
}

interface OllamaChatResponse {
  message?: { content?: string; tool_calls?: OllamaToolCall[] };
  prompt_eval_count?: number;
  eval_count?: number;
  done_reason?: string;
}

/**
 * Ollama en local. Es el proveedor por defecto en desarrollo: cuesta cero
 * y no filtra las conversaciones de los huéspedes a ningún tercero, que era
 * el punto original del proyecto.
 *
 * Habla el dialecto de OpenAI para mensajes y herramientas, con dos diferencias
 * que se notan al integrar: los argumentos vienen ya parseados y las llamadas no
 * traen identificador.
 */

/**
 * Mensajes para Ollama.
 *
 * Ollama habla el dialecto de OpenAI *casi* entero, con una diferencia que
 * rompe en cuanto el agente usa herramientas: en `tool_calls`, OpenAI espera
 * `arguments` como cadena JSON y Ollama lo espera como objeto. Reutilizar
 * `toOpenAiMessages` tal cual devuelve un 400:
 *
 *   cannot unmarshal string into Go struct field
 *   ChatRequest.messages.tool_calls.function.arguments
 *
 * El error solo aparece al *reenviar* una llamada previa, así que un turno
 * suelto funciona y la conversación se rompe en el segundo.
 */
function toOllamaMessages(mensajes: ChatMessage[]): unknown[] {
  return toOpenAiMessages(mensajes).map((m) => {
    const msg = m as { tool_calls?: Array<{ function?: { name: string; arguments: unknown } }> };
    if (!msg.tool_calls?.length) return m;
    return {
      ...msg,
      tool_calls: msg.tool_calls.map((c) => ({
        ...c,
        function: {
          name: c.function?.name,
          arguments:
            typeof c.function?.arguments === 'string'
              ? (JSON.parse(c.function.arguments || '{}') as Record<string, unknown>)
              : (c.function?.arguments ?? {}),
        },
      })),
    };
  });
}

export const ollamaProvider: LlmProvider = {
  name: 'ollama',

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const res = await fetch(`${config.OLLAMA_HOST}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: req.signal ?? AbortSignal.timeout(req.timeoutMs ?? config.LLM_TIMEOUT_MS),
      body: JSON.stringify({
        model: req.model,
        stream: false,
        messages: [{ role: 'system', content: req.system }, ...toOllamaMessages(req.messages)],
        ...(toOpenAiTools(req.tools) && { tools: toOpenAiTools(req.tools) }),
        // Ollama recibe el esquema tal cual en `format`. Los modelos pequeños
        // lo respetan peor que los grandes: por eso quien llama valida igual.
        ...(req.jsonSchema && { format: req.jsonSchema.schema }),
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

    // Sin identificador propio: se sintetiza uno estable dentro del turno, que
    // es todo lo que necesita el emparejamiento llamada ↔ resultado.
    const toolCalls: ToolCall[] = (data.message?.tool_calls ?? []).map((c, i) => ({
      id: `ollama_call_${i}`,
      name: c.function?.name ?? '',
      input: c.function?.arguments ?? {},
    }));

    return {
      text: data.message?.content ?? '',
      model: req.model,
      promptTokens,
      completionTokens,
      costMicros: estimateCostMicros(req.model, promptTokens, completionTokens, 'ollama'),
      finishReason: data.done_reason ?? 'stop',
      toolCalls,
    };
  },
};

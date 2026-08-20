/**
 * Generación de embeddings para el RAG vectorial.
 *
 * Vive en `llm/` y no en `core/` porque es una llamada a un proveedor, con las
 * mismas necesidades que las demás: reintentos acotados, errores tipados y
 * coste en micro-euros.
 *
 * Solo OpenAI de momento. Anthropic no tiene endpoint de embeddings, y Ollama
 * sí pero con modelos de otra dimensión: mezclar dimensiones en la misma columna
 * `vector(1536)` es un error de escritura, no una degradación elegante. Cuando
 * haga falta un proveedor local, será una columna y un índice aparte.
 */
import { config } from '../config.js';
import { LlmError, isRetryableStatus, withRetries } from './types.js';

/** Dimensión de text-embedding-3-small. Atada al tipo de la columna en Postgres. */
export const EMBEDDING_DIMENSIONS = 1536;

interface OpenAiEmbeddingResponse {
  data?: Array<{ embedding?: number[]; index?: number }>;
  usage?: { prompt_tokens?: number };
}

export interface EmbeddingResult {
  /** Un vector por texto de entrada, en el mismo orden. */
  vectors: number[][];
  promptTokens: number;
  costMicros: number;
  model: string;
}

/** 0,02 $/M tokens → micro-euros por token, a ~0,92 €/$. */
const MICROS_PER_TOKEN = 0.0184;

/**
 * Máximo de textos por petición. El límite real de la API es mucho más alto,
 * pero lotes grandes con textos largos se pasan del tamaño de petición y el
 * error que devuelve no dice cuál de los cien fragmentos sobraba.
 */
export const EMBEDDING_BATCH_SIZE = 64;

/**
 * Convierte el vector al literal que espera pgvector: `[0.1,0.2,...]`.
 *
 * Se manda como texto y se castea en SQL con `::vector`. El driver de Postgres
 * no conoce el tipo, y pasarlo como array de JS lo convertiría en `float8[]`,
 * que no es lo mismo y falla al comparar.
 */
export function toPgVector(vector: number[]): string {
  return `[${vector.join(',')}]`;
}

async function embedBatch(texts: string[]): Promise<EmbeddingResult> {
  if (!config.OPENAI_API_KEY) {
    throw new LlmError(
      'OPENAI_API_KEY no configurada. El RAG vectorial la necesita aunque el ' +
        'bot conteste con otro proveedor: los embeddings son de OpenAI.',
      null,
      false,
    );
  }

  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${config.OPENAI_API_KEY}`,
    },
    signal: AbortSignal.timeout(config.EMBEDDING_TIMEOUT_MS),
    body: JSON.stringify({
      model: config.EMBEDDING_MODEL,
      input: texts,
      dimensions: EMBEDDING_DIMENSIONS,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new LlmError(
      `OpenAI embeddings ${res.status}: ${body.slice(0, 200)}`,
      res.status,
      isRetryableStatus(res.status),
    );
  }

  const data = (await res.json()) as OpenAiEmbeddingResponse;
  const items = data.data ?? [];

  if (items.length !== texts.length) {
    throw new LlmError(
      `Se pidieron ${texts.length} embeddings y llegaron ${items.length}.`,
      null,
      false,
    );
  }

  // La API no garantiza el orden; el campo `index` sí. Fiarse de la posición
  // desalinearía los vectores de sus textos en silencio, que es la peor forma
  // de que falle un RAG: responde, y responde mal.
  const vectors: number[][] = new Array(texts.length);
  for (const item of items) {
    const idx = item.index ?? 0;
    if (!item.embedding) {
      throw new LlmError(`El embedding ${idx} vino vacío.`, null, false);
    }
    vectors[idx] = item.embedding;
  }

  const promptTokens = data.usage?.prompt_tokens ?? 0;
  return {
    vectors,
    promptTokens,
    costMicros: Math.round(promptTokens * MICROS_PER_TOKEN),
    model: config.EMBEDDING_MODEL,
  };
}

/**
 * Vectoriza una lista de textos, en lotes y con reintentos.
 *
 * Los textos vacíos revientan la API con un 400 poco claro, así que se filtran
 * antes y se rellena su hueco con un vector de ceros — quien llama no tiene por
 * qué saber que hubo un hueco, y un vector de ceros nunca gana una búsqueda por
 * coseno.
 */
export async function embedTexts(texts: string[]): Promise<EmbeddingResult> {
  const vectors: number[][] = new Array(texts.length);
  let promptTokens = 0;
  let costMicros = 0;

  const pendientes = texts
    .map((text, index) => ({ text, index }))
    .filter(({ text }) => text.trim().length > 0);

  for (let i = 0; i < texts.length; i++) {
    vectors[i] = new Array(EMBEDDING_DIMENSIONS).fill(0);
  }

  for (let i = 0; i < pendientes.length; i += EMBEDDING_BATCH_SIZE) {
    const lote = pendientes.slice(i, i + EMBEDDING_BATCH_SIZE);
    const result = await withRetries(() => embedBatch(lote.map((p) => p.text)));

    lote.forEach((p, j) => {
      vectors[p.index] = result.vectors[j]!;
    });
    promptTokens += result.promptTokens;
    costMicros += result.costMicros;
  }

  return { vectors, promptTokens, costMicros, model: config.EMBEDDING_MODEL };
}

/** Atajo para el caso de uno solo: la pregunta del usuario en cada turno. */
export async function embedQuery(text: string): Promise<number[]> {
  const { vectors } = await embedTexts([text]);
  return vectors[0]!;
}

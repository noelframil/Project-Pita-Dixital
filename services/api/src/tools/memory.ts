import { query } from '../db.js';
import { embedQuery, toPgVector } from '../llm/embeddings.js';
import { config } from '../config.js';

export async function saveToMemory(
  clientId: string,
  input: Record<string, unknown>,
): Promise<string> {
  const fact = input.fact as string;
  const source = input.source as string;

  if (!fact) {
    throw new Error('Falta el campo "fact".');
  }

  const title = `Auto-aprendizaje: ${source || 'Bot'}`;
  const body = fact;

  let embedding: number[] | null = null;
  try {
    embedding = await embedQuery(body);
  } catch (err) {
    // Si falla el embedding, lo guardamos sin él. FTS lo encontrará de todos modos.
    console.warn('[memory] Fallo al generar embedding para auto-aprendizaje:', err);
  }

  await query(
    `INSERT INTO knowledge_entries
       (client_id, title, body, keywords, metadata, source_ref, chunk_index,
        embedding, embedding_model, embedded_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())`,
    [
      clientId,
      title,
      body,
      [], // keywords
      JSON.stringify({ autoLearned: true, source }), // metadata
      `memory_${Date.now()}`, // source_ref
      0, // chunk_index
      embedding ? toPgVector(embedding) : null,
      config.EMBEDDING_MODEL,
    ],
  );

  return 'Información memorizada correctamente en la base de conocimientos.';
}

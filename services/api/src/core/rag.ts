import { query } from '../db.js';

export interface KnowledgeHit {
  title: string;
  body: string;
  score: number;
}

/**
 * Recuperación en dos pasos, de más preciso a más tolerante:
 *
 *   1. Búsqueda de texto completo en español (índice GIN). Maneja plurales y
 *      derivaciones — "restaurantes" encuentra "restaurante" — que la búsqueda
 *      por palabras del prototipo original se perdía.
 *   2. Si no hay nada, coincidencia por keywords declaradas.
 *
 * Cuando el volumen crezca, esto pasa a embeddings con pgvector; la extensión
 * ya está instalada y la interfaz de esta función no cambia.
 */
export async function findRelevantKnowledge(
  clientId: string,
  userQuery: string,
  limit = 4,
): Promise<KnowledgeHit[]> {
  const trimmed = userQuery.trim();
  if (!trimmed) return [];

  const fts = await query<{ title: string; body: string; score: number }>(
    `SELECT title, body, ts_rank(to_tsvector('spanish', title || ' ' || body),
                                plainto_tsquery('spanish', $2)) AS score
       FROM knowledge_entries
      WHERE client_id = $1
        AND to_tsvector('spanish', title || ' ' || body) @@ plainto_tsquery('spanish', $2)
      ORDER BY score DESC
      LIMIT $3`,
    [clientId, trimmed, limit],
  );
  if (fts.length > 0) return fts;

  // Segunda pasada: palabras de más de 3 letras contra las keywords declaradas.
  const words = trimmed
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 3);
  if (words.length === 0) return [];

  const byKeyword = await query<{ title: string; body: string }>(
    `SELECT title, body
       FROM knowledge_entries
      WHERE client_id = $1 AND keywords && $2::text[]
      LIMIT $3`,
    [clientId, words, limit],
  );

  return byKeyword.map((r) => ({ ...r, score: 0 }));
}

-- ═══════════════════════════════════════════════════════════════
-- RAG vectorial, handoff a humano y entrada multimodal
-- ═══════════════════════════════════════════════════════════════

-- ── RAG vectorial ──────────────────────────────────────────────
--
-- La extensión ya viene en la imagen de docker-compose (pgvector/pgvector:pg17);
-- esto solo la habilita en la base de datos.
--
-- El embedding se añade a `knowledge_entries`, que ya existe y ya alimenta la
-- búsqueda de texto completo. Crear una tabla nueva en paralelo dejaría dos
-- almacenes de conocimiento que hay que mantener sincronizados, y la pregunta
-- "¿en cuál está la respuesta buena?" no tiene respuesta.

CREATE EXTENSION IF NOT EXISTS vector;

-- 1536 es la dimensión de text-embedding-3-small. NO es dinámica: pgvector fija
-- la dimensión en el tipo de la columna y el índice depende de ella. Cambiar de
-- modelo de embeddings es una migración nueva más un reindexado completo, no un
-- ajuste de configuración. Se deja constancia del modelo en cada fila para saber
-- qué hay que regenerar cuando llegue ese día.
ALTER TABLE knowledge_entries ADD COLUMN embedding vector(1536);
ALTER TABLE knowledge_entries ADD COLUMN embedding_model TEXT;
ALTER TABLE knowledge_entries ADD COLUMN embedded_at TIMESTAMPTZ;

-- Al trocear un documento largo, cada fragmento es una fila. Estos campos
-- permiten reconstruir el original y citar la fuente al usuario.
ALTER TABLE knowledge_entries ADD COLUMN source_ref TEXT;
ALTER TABLE knowledge_entries ADD COLUMN chunk_index INT NOT NULL DEFAULT 0;

-- HNSW sobre distancia coseno. Frente a ivfflat: no necesita datos previos para
-- construirse (ivfflat exige entrenar los centroides, así que un índice creado
-- con la tabla vacía sale inservible) y da mejor recall. A cambio ocupa más y
-- construye más lento, que con volúmenes de una PYME da igual.
CREATE INDEX knowledge_embedding_idx ON knowledge_entries
  USING hnsw (embedding vector_cosine_ops);

-- Umbral de similitud por cliente: cuánto tiene que parecerse un fragmento para
-- que merezca ocupar sitio en el prompt. Por debajo, mejor no devolver nada que
-- devolver ruido — un contexto irrelevante empuja al modelo a usarlo igual.
ALTER TABLE bot_configs ADD COLUMN rag_min_similarity REAL NOT NULL DEFAULT 0.35;
ALTER TABLE bot_configs ADD COLUMN rag_top_k INT NOT NULL DEFAULT 3;

-- ── Handoff a humano ───────────────────────────────────────────
--
-- `conversations.status` ya distingue 'open' de 'handoff' desde el esquema
-- inicial, y brain.ts ya se calla cuando está en handoff. Lo que faltaba era la
-- vía para activarlo y a quién avisar.

ALTER TABLE clients ADD COLUMN webhook_handoff_url TEXT;
-- Secreto para firmar el webhook con HMAC. Cifrado, como cualquier credencial.
ALTER TABLE clients ADD COLUMN webhook_secret BYTEA;

ALTER TABLE conversations ADD COLUMN handoff_reason TEXT;
ALTER TABLE conversations ADD COLUMN handoff_at TIMESTAMPTZ;

ALTER TABLE bot_configs ADD COLUMN handoff_enabled BOOLEAN NOT NULL DEFAULT TRUE;

-- Cola de avisos. El webhook no se manda dentro de la petición del usuario: si
-- el servidor del cliente tarda 30 s, el huésped se queda mirando la pantalla.
-- Se encola y un trabajador lo entrega con reintentos.
CREATE TABLE handoff_notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  payload         JSONB NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','delivered','failed')),
  attempts        INT NOT NULL DEFAULT 0,
  last_error      TEXT,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX handoff_pending_idx ON handoff_notifications (next_attempt_at)
  WHERE status = 'pending';

-- ── Entrada multimodal ─────────────────────────────────────────
--
-- `messages.media` ya existe como JSONB desde el esquema inicial. Aquí solo se
-- añade de dónde salió el texto, para poder distinguir en la traza lo que
-- escribió el usuario de lo que transcribió Whisper o describió el modelo de
-- visión — sin eso, una transcripción mala parece un usuario incoherente.
ALTER TABLE messages ADD COLUMN source_kind TEXT NOT NULL DEFAULT 'text'
  CHECK (source_kind IN ('text','audio','image'));
-- Coste y latencia de la transcripción o descripción, aparte del turno del chat.
ALTER TABLE messages ADD COLUMN media_cost_micros BIGINT;

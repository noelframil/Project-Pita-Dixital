INSERT INTO tools (id, client_id, name, description, input_schema, kind, config)
SELECT 
  gen_random_uuid(),
  id as client_id,
  'web_search',
  'Busca información en internet usando DuckDuckGo. Devuelve los títulos, URLs y resúmenes de los primeros resultados.',
  '{
    "type": "object",
    "properties": {
      "query": { "type": "string", "description": "Consulta de búsqueda (ej. ''Pita Dixital empresa'')" }
    },
    "required": ["query"],
    "additionalProperties": false
  }'::jsonb,
  'native',
  '{}'::bytea
FROM clients
ON CONFLICT DO NOTHING;

INSERT INTO tools (id, client_id, name, description, input_schema, kind, config)
SELECT 
  gen_random_uuid(),
  id as client_id,
  'web_fetch',
  'Descarga y extrae el texto plano de una URL específica.',
  '{
    "type": "object",
    "properties": {
      "url": { "type": "string", "description": "URL completa de la página a leer" }
    },
    "required": ["url"],
    "additionalProperties": false
  }'::jsonb,
  'native',
  '{}'::bytea
FROM clients
ON CONFLICT DO NOTHING;

INSERT INTO tools (id, client_id, name, description, input_schema, kind, is_active)
VALUES 
  (
    'tool_web_search',
    'mock-client-id',
    'web_search',
    'Busca información en internet usando DuckDuckGo. Devuelve los títulos, URLs y resúmenes de los primeros resultados.',
    '{
      "type": "object",
      "properties": {
        "query": { "type": "string", "description": "Consulta de búsqueda (ej. ''Pita Dixital empresa'')" }
      },
      "required": ["query"]
    }'::jsonb,
    'native',
    true
  ),
  (
    'tool_web_fetch',
    'mock-client-id',
    'web_fetch',
    'Descarga y extrae el texto plano de una URL específica.',
    '{
      "type": "object",
      "properties": {
        "url": { "type": "string", "description": "URL completa de la página a leer" }
      },
      "required": ["url"]
    }'::jsonb,
    'native',
    true
  )
ON CONFLICT DO NOTHING;

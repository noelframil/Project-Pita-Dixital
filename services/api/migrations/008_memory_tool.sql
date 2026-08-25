-- Fase 9: Memoria Infinita (Self-Learning RAG)

-- Herramienta nativa para que el bot pueda inyectar nuevo conocimiento en la BBDD.

INSERT INTO tools (id, client_id, name, description, input_schema, kind, config)
SELECT
  gen_random_uuid(),
  id as client_id,
  'save_to_memory',
  'Guarda información valiosa, hechos o políticas de forma permanente en la base de conocimientos (RAG). Úsala SIEMPRE que aprendas algo sobre el negocio o el usuario que debas recordar a largo plazo. NO la uses para datos temporales.',
  '{
    "type": "object",
    "properties": {
      "fact": {
        "type": "string",
        "description": "La información exacta que debe memorizarse (ej. ''La política de devoluciones es de 30 días''). Debe ser descriptiva y autocontenida."
      },
      "source": {
        "type": "string",
        "description": "De dónde proviene esta información (ej. ''Regla indicada por el administrador'', ''Preferencia del cliente X'')."
      }
    },
    "required": ["fact", "source"],
    "additionalProperties": false
  }'::jsonb,
  'native',
  '{}'::jsonb
FROM clients
ON CONFLICT DO NOTHING;

-- Fase 7: Habilidades Ilimitadas (Code Interpreter)

-- Añadimos la herramienta nativa para ejecutar código JS aislado.

INSERT INTO tools (id, client_id, name, description, input_schema, kind, config)
SELECT
  gen_random_uuid(),
  id as client_id,
  'code_interpreter',
  'Ejecuta código Node.js en un sandbox de backend. Úsalo SIEMPRE que necesites calcular matemáticas complejas, extraer datos avanzados o resolver un problema para el cual no tengas otra herramienta. El código es asíncrono por defecto. Debes hacer console.log de los resultados para verlos en STDOUT.',
  '{
    "type": "object",
    "properties": {
      "code": {
        "type": "string",
        "description": "Código JavaScript (Node.js) a ejecutar. Debe ser seguro y contener console.log para emitir resultados."
      }
    },
    "required": ["code"],
    "additionalProperties": false
  }'::jsonb,
  'native',
  '{}'::bytea
FROM clients
ON CONFLICT DO NOTHING;

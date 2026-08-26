-- Fase 7.3: Habilidades Ilimitadas (Voice Automation)

-- Añadimos la herramienta nativa para realizar llamadas telefónicas (Twilio).

INSERT INTO tools (id, client_id, name, description, input_schema, kind, config)
SELECT
  gen_random_uuid(),
  id as client_id,
  'make_phone_call',
  'Realiza una llamada telefónica automatizada a un cliente. Úsalo para confirmaciones urgentes, upselling proactivo o cuando el usuario solicita que se le llame. El sistema sintetizará la voz a partir de tu mensaje (text-to-speech) y puede interactuar con el cliente si usas Voice RAG.',
  '{
    "type": "object",
    "properties": {
      "phone_number": {
        "type": "string",
        "description": "Número de teléfono del cliente con código de país (ej: +34600123456)."
      },
      "message": {
        "type": "string",
        "description": "El texto que el asistente de voz leerá al cliente cuando conteste."
      },
      "interactive": {
        "type": "boolean",
        "description": "Si es true, el bot mantendrá una conversación bidireccional (Voice AGI). Si es false, solo dejará un mensaje unidireccional."
      }
    },
    "required": ["phone_number", "message"],
    "additionalProperties": false
  }'::jsonb,
  'native',
  '{}'::bytea
FROM clients
ON CONFLICT DO NOTHING;

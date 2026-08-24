INSERT INTO tools (id, client_id, name, description, input_schema, kind, is_active, requires_approval)
VALUES 
  (
    'tool_schedule_followup',
    'mock-client-id',
    'schedule_followup',
    'Programa un mensaje proactivo futuro. Úsalo si prometes a alguien escribirle más tarde o recordarle algo mañana.',
    '{
      "type": "object",
      "properties": {
        "hours": { "type": "number", "description": "Horas a esperar (ej. 24)" },
        "prompt": { "type": "string", "description": "Instrucción en lenguaje natural de lo que tienes que decirle a la persona en ese momento. Ej: Recuerdale que tenemos cita mañana." }
      },
      "required": ["hours", "prompt"]
    }'::jsonb,
    'native',
    true,
    false
  )
ON CONFLICT DO NOTHING;

INSERT INTO tools (id, client_id, name, description, input_schema, kind, is_active)
VALUES 
  (
    'tool_google_calendar_check',
    'mock-client-id',
    'google_calendar_check',
    'Consulta tu calendario de Google para ver si estás libre en un rango de fechas (ISO8601). Devuelve los eventos que ocupan hueco.',
    '{
      "type": "object",
      "properties": {
        "timeMin": { "type": "string", "description": "Inicio del rango en ISO8601 (ej. 2026-10-15T09:00:00Z)" },
        "timeMax": { "type": "string", "description": "Fin del rango en ISO8601 (ej. 2026-10-15T18:00:00Z)" }
      },
      "required": ["timeMin", "timeMax"]
    }'::jsonb,
    'native',
    true
  ),
  (
    'tool_google_calendar_schedule',
    'mock-client-id',
    'google_calendar_schedule',
    'Agenda una cita en el calendario de Google y genera un enlace de Meet, enviando la invitación al email dado.',
    '{
      "type": "object",
      "properties": {
        "summary": { "type": "string", "description": "Título de la reunión" },
        "startTime": { "type": "string", "description": "Inicio de la reunión en ISO8601" },
        "endTime": { "type": "string", "description": "Fin de la reunión en ISO8601" },
        "attendeeEmail": { "type": "string", "description": "Email del cliente al que invitar" }
      },
      "required": ["summary", "startTime", "endTime", "attendeeEmail"]
    }'::jsonb,
    'native',
    true
  ),
  (
    'tool_google_gmail_send',
    'mock-client-id',
    'google_gmail_send',
    'Redacta y envía un correo electrónico directamente desde tu cuenta de Gmail.',
    '{
      "type": "object",
      "properties": {
        "to": { "type": "string", "description": "Destinatario del correo" },
        "subject": { "type": "string", "description": "Asunto del correo" },
        "body": { "type": "string", "description": "Cuerpo del correo en formato HTML" }
      },
      "required": ["to", "subject", "body"]
    }'::jsonb,
    'native',
    true
  )
ON CONFLICT DO NOTHING;

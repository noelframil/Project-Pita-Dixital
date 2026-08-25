-- Fase 7.2: Habilidades Ilimitadas (Browser Automation)

-- Añadimos la herramienta nativa para extraer datos y automatizar navegación con Puppeteer.

INSERT INTO tools (id, client_id, name, description, input_schema, kind, config)
SELECT
  gen_random_uuid(),
  id as client_id,
  'browser_agent',
  'Abre un navegador oculto (Puppeteer) para navegar e interactuar con una URL. Úsalo cuando web_fetch no funcione (por ejemplo, si la web requiere JavaScript o hacer clic en elementos). Puedes pasar opcionalmente un script JS (extract_script) para ejecutar en el contexto del navegador y extraer datos.',
  '{
    "type": "object",
    "properties": {
      "url": {
        "type": "string",
        "description": "URL completa a navegar (ej: https://example.com)."
      },
      "extract_script": {
        "type": "string",
        "description": "(Opcional) Código JS para ejecutar en el contexto de la página web (page.evaluate). Debe retornar los datos que deseas extraer."
      }
    },
    "required": ["url"],
    "additionalProperties": false
  }'::jsonb,
  'native',
  '{}'::bytea
FROM clients
ON CONFLICT DO NOTHING;

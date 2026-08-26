UPDATE tools SET 
  description = 'Abre un navegador oculto para navegar e interactuar con una URL. Permite usar Computer Use: clics, escribir texto y sacar capturas de pantalla (screenshots) o volcar el DOM interactivo.',
  input_schema = '{
    "type": "object",
    "properties": {
      "action": {
        "type": "string",
        "description": "Acción a realizar: navigate, click, type, screenshot."
      },
      "url": {
        "type": "string",
        "description": "URL completa a navegar (ej: https://example.com). Obligatorio si la acción es navigate."
      },
      "selector": {
        "type": "string",
        "description": "Selector CSS del elemento para interactuar. Obligatorio si la acción es click o type."
      },
      "text": {
        "type": "string",
        "description": "Texto a escribir. Obligatorio si la acción es type."
      },
      "extract_script": {
        "type": "string",
        "description": "(Opcional) Código JS para ejecutar en el contexto de la página web (page.evaluate). Debe retornar los datos que deseas extraer."
      }
    },
    "required": [],
    "additionalProperties": false
  }'::jsonb
WHERE name = 'browser_agent';

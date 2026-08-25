# Semillas

Herramientas de ejemplo. **No son migraciones**, y estaban en `migrations/`
por error.

Dos motivos por los que se sacaron de ahí:

1. Insertan filas atadas a un `mock-client-id`. Una migración se ejecuta en
   producción; sembrar un cliente inventado ahí contamina datos reales.
2. Usan identificadores como `tool_google_calendar_check` en columnas `uuid`,
   así que fallaban al aplicarse y bloqueaban toda la cola de migraciones
   detrás de ellas.

Las herramientas se dan de alta por cliente con el CLI:

```bash
npm run admin -- add-tool <slug> <fichero.json>
```

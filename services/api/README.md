# Núcleo omnicanal — Pita Dixital

Un solo cerebro (identidad → conversación → RAG → modelo) y adaptadores finos por
canal. Añadir un canal cuesta un fichero, no un refactor.

## Requisitos

- **Node 20+** — hay un `.nvmrc` con la 24. Con Node 18 Fastify 5 no arranca:
  ```bash
  nvm use
  ```
- Docker (para el Postgres local)
- Ollama con un modelo descargado, o una clave de Anthropic/OpenAI

## Arranque

```bash
# 1. Base de datos
docker compose up -d            # desde la raíz del repo

# 2. Configuración
cd services/api
cp .env.example .env
# Rellena ENCRYPTION_KEY y API_KEY_PEPPER:
#   openssl rand -base64 32

# 3. Esquema
npm install
npm run migrate

# 4. Primer cliente
npm run admin -- create-client casa-nigran "Casa de Nigrán"
npm run admin -- import-knowledge casa-nigran ../../knowledge_base/knowledge_base.json
npm run admin -- issue-key casa-nigran dev      # apunta la clave: solo se muestra una vez

# 5. Arrancar
npm run dev
```

Probar:

```bash
curl -X POST http://localhost:3000/api/v1/chat \
  -H "authorization: Bearer pita_..." \
  -H 'content-type: application/json' \
  -d '{"session_id":"huesped_001","message":"¿Cuál es la clave del wifi?"}'
```

## Conectar Telegram

```bash
# @BotFather → /newbot → copia el token
npm run admin -- link-telegram casa-nigran 8123456789:AAF...
npm run dev    # arranca el polling automáticamente
```

En desarrollo se usa long polling: no hace falta túnel ni dominio público. En
producción se cambia a webhook con `secret_token`.

## Estructura

```
src/
  config.ts            Validación del entorno al arrancar, no al usarlo
  db.ts                Pool de Postgres, helpers de consulta y transacción
  core/
    brain.ts           Orquestación: idéntica para todos los canales
    prompt.ts          Compilación de plantilla en una pasada + lista blanca
    rag.ts             Búsqueda de texto completo en español, con respaldo por keywords
    conversations.ts   Identidad, historial, idempotencia
  llm/
    index.ts           Selección de proveedor + reintentos (solo 429 y 5xx)
    ollama.ts          Local, sin coste, sin salir de la máquina
    anthropic.ts       Claude — ojo: los modelos 5 rechazan `temperature`
    openai.ts
    pricing.ts         Coste en micro-euros, enteros
  channels/
    types.ts           Interfaz ChannelAdapter + sobre unificado
    telegram.ts        Primer canal
  routes/chat.ts       Endpoint del widget web
  lib/
    crypto.ts          Hash de claves de API, cifrado de credenciales de canal
    auth.ts            401 idéntico para clave inválida y cliente inactivo
    rateLimit.ts       Ventana deslizante en memoria (a Redis al escalar)
  cli/
    migrate.ts         Migraciones, una vez cada una, en transacción
    admin.ts           Alta de clientes, claves, canales, conocimiento
```

## Decisiones que conviene no deshacer

- **Las claves de API se guardan hasheadas.** El prefijo localiza la fila; el
  hash verifica. Una copia de la base de datos no compromete a los clientes.
- **Las variables de la petición pasan por lista blanca** (`allowed_override_vars`).
  Sin ella, el cliente inyecta lo que quiera en el prompt del sistema.
- **La plantilla se compila en una sola pasada.** Un bucle de `replaceAll` deja
  que el valor de una variable se expanda como si fuera plantilla.
- **El rate limit va antes de llamar al modelo.** Después no ahorra dinero.
- **El contexto del RAG va delimitado y marcado como datos, no órdenes.**
- **Los costes se guardan en micro-euros enteros.** El dinero en float acumula
  céntimos fantasma.
- **`provider_msg_id` tiene índice único.** Es lo que impide que el bot conteste
  dos veces cuando el proveedor reintenta el webhook.

## Pendiente

- Rate limit a Redis cuando haya más de una instancia (ahora cada proceso lleva
  su propio contador).
- Ventana de 24 h de Meta (`conversations.window_expires_at` ya está en el
  esquema, falta usarla al conectar WhatsApp e Instagram).
- Escalado a humano: el estado `handoff` ya se respeta en `brain.ts`, falta la
  vía para activarlo.

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

## Pruebas

```bash
npm test          # 58 pruebas con node --test, sin BD ni claves
npm run typecheck # cubre src/ y test/
```

No hay dependencias de testing: `node --test` viene de serie con Node 20+. Las
pruebas no abren Postgres ni llaman a ningún proveedor — lo que se comprueba son
funciones puras, la traducción de mensajes de cada proveedor y las
comprobaciones de red que *tienen* que fallar (destinos internos, reescritura de
origen).

## Dar de alta un cliente sin escribir el prompt a mano

`autoconfig` toma una descripción del negocio, se la pasa al modelo con un
esquema JSON estricto y devuelve la plantilla del prompt y sus variables ya
validadas. Sin `--apply` no toca la base de datos: enseña el prompt compilado
para que lo leas antes de guardarlo.

```bash
npm run admin -- autoconfig casa-nigran \
  "Casa rural de 6 habitaciones en Nigrán. Trato cercano, con retranca gallega.
   Los huéspedes preguntan por el wifi, los horarios y qué ver por la zona.
   Se responde en gallego, castellano o inglés, según cómo escriban."

# Cuando el prompt convenza:
npm run admin -- autoconfig casa-nigran "..." --apply

# Para probar sin gastar tokens (peor calidad, misma validación):
npm run admin -- autoconfig casa-nigran "..." --provider ollama --model qwen2.5:32b
```

Tres cosas que el motor **no** hace, a propósito:

- **No escribe los guardrails.** El modelo redacta identidad, tono y alcance; el
  bloque de reglas inquebrantables lo anexa `core/autoconfig.ts` desde una
  constante. Un guardrail generado es un guardrail que el generador puede
  omitir o contradecir sin que nadie lo note, y así se mejoran para todos los
  clientes a la vez.
- **No rellena `allowed_override_vars`.** Es el campo con consecuencias: lo que
  esté ahí lo puede reescribir cualquiera con la clave de API desde el body de
  la petición. El modelo propone, tú apruebas con
  `--allow-override guest_name,user_tier`.
- **No inventa la base de conocimiento.** Pedirle horarios o precios a un LLM es
  pedirle que se los invente, y acabarían en el RAG con la misma pinta de verdad
  que los datos reales. Eso entra por `import-knowledge`.

Antes de guardar nada se comprueba que no queden marcadores sin declarar, que
ningún valor lleve `<` o `>` (el compilador los borra, y la vista previa
mentiría), que no haya plantillas dentro de los valores y que la plantilla no
forje el delimitador `<contexto>` del RAG.

Probar:

```bash
curl -X POST http://localhost:3000/api/v1/chat \
  -H "authorization: Bearer pita_..." \
  -H 'content-type: application/json' \
  -d '{"session_id":"huesped_001","message":"¿Cuál es la clave del wifi?"}'
```

## Darle herramientas al bot

Una herramienta es lo que el bot puede hacer además de hablar: consultar
disponibilidad, mirar un pedido, buscar en un sistema del cliente. Se define en
un JSON (ver [`tools.example.json`](tools.example.json)) y se registra:

```bash
npm run admin -- add-tool casa-nigran ./disponibilidad.json
npm run admin -- list-tools casa-nigran
npm run admin -- remove-tool casa-nigran consultar_disponibilidad   # baja lógica
```

El modelo solo ve `name`, `description` e `input_schema`. La URL y las cabeceras
van cifradas con `ENCRYPTION_KEY` y no entran nunca en el prompt, así que la
clave de API del cliente no puede filtrarse por mucho que se lo pidan al bot.

**La descripción es el único mecanismo de decisión que tiene el modelo.** Escribe
*cuándo* llamarla y cuándo no, no solo qué hace: es lo que separa una herramienta
que se usa cuando toca de una que se dispara en cada mensaje.

Una herramienta HTTP es, literalmente, «haz una petición con los parámetros que
diga el modelo», y el modelo obedece a quien escriba por Telegram. Los controles:

- **El origen es fijo.** Los marcadores solo valen en la ruta y la query, nunca
  en el host, y tras sustituir se comprueba que el origen no ha cambiado. Un
  parámetro con `@` o `//` no redirige la petición a otro sitio.
- **Nada de direcciones internas.** Se resuelve el nombre antes de llamar y se
  rechazan los rangos privados, el loopback y `169.254.169.254` — sin eso, una
  herramienta es una puerta al endpoint de metadatos del proveedor de nube.
- **Solo https**, redirecciones cortadas, timeout por llamada, respuesta
  recortada y tope de vueltas del bucle (`bot_configs.max_tool_iterations`).

Un fallo de herramienta no rompe el turno: vuelve al modelo como texto («no se
pudo ejecutar X porque…») para que rectifique o se lo diga al usuario.

## Memoria de las conversaciones

El historial se recorta por **presupuesto de tokens**
(`bot_configs.context_token_budget`, 3000 por defecto), no por número de turnos:
ocho turnos de dos frases y ocho de dos páginas cuentan igual y cuestan muy
distinto. Lo que se sale del presupuesto no se tira, se resume, y el resumen se
acumula en `conversations.summary` con una marca de agua (`summarized_until`)
para que cada resumen parta del anterior en vez de rehacerse.

`history_turns` sigue existiendo, pero ahora es solo el tope de lo que se lee de
la base de datos, no el recorte fino.

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
    autoconfig.ts      Meta-prompting: descripción del negocio → bot_config validada
    tools.ts           Registro y ejecución de herramientas, con los controles de red
    memory.ts          Recorte por presupuesto de tokens y resumen acumulado
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
- **La autoconfiguración no genera guardrails ni lista blanca.** Ver arriba: lo
  que el modelo puede omitir no puede ser la defensa.
- **El origen de una herramienta es fijo y se revalida tras sustituir.** Es lo
  que impide que un parámetro elegido por el modelo redirija la petición —con la
  clave del cliente dentro— a otro servidor.
- **La marca de agua del resumen es la fecha del último mensaje resumido**, nunca
  `NOW()`. Con `NOW()`, los mensajes que entren mientras se genera el resumen se
  darían por resumidos sin estarlo y desaparecerían del contexto sin dejar rastro.
- **El resumen va delimitado y marcado como recuerdo, no como órdenes**, igual
  que el contexto del RAG: dentro hay texto que escribió un usuario.

## Pendiente

- **El bucle de herramientas no se replica entre turnos.** Las llamadas y sus
  resultados se ejecutan y se registran, pero el historial que se recarga en el
  turno siguiente solo lleva texto de usuario y asistente. Emparejar
  `tool_use`/`tool_result` a través de turnos, canales y proveedores distintos
  cuesta mucho más de lo que aporta: la respuesta del asistente ya lleva la
  conclusión. Si algún día un bot necesita recordar *qué* consultó, esto es lo
  que hay que cambiar.
- Rate limit a Redis cuando haya más de una instancia (ahora cada proceso lleva
  su propio contador).
- Ventana de 24 h de Meta (`conversations.window_expires_at` ya está en el
  esquema, falta usarla al conectar WhatsApp e Instagram).
- Escalado a humano: el estado `handoff` ya se respeta en `brain.ts`, falta la
  vía para activarlo.

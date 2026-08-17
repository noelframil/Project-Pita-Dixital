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
cd services/api
npm install

# 1. Configuración
cp .env.staging.example .env    # o .env.example para lo mínimo
# Rellena ENCRYPTION_KEY y API_KEY_PEPPER:
#   openssl rand -base64 32

# 2. Infraestructura: contenedores + espera + migraciones + parte del estado
npm run infra:up

# 3. Primer cliente
npm run admin -- create-client casa-nigran "Casa de Nigrán"
npm run admin -- import-knowledge casa-nigran ../../knowledge_base/knowledge_base.json
npm run admin -- issue-key casa-nigran dev --scopes chat,handoff,proactive

# 4. Arrancar
npm run dev
```

`infra:up` existe porque `docker compose up -d && npm run migrate` no basta:
`docker compose` vuelve cuando el contenedor **arrancó**, no cuando Postgres
acepta conexiones. En un arranque en frío hay diez o veinte segundos de
diferencia —el primer arranque inicializa el clúster— y las migraciones
lanzadas ahí fallan con «connection refused». Ese fallo parece un problema de
configuración y solo era prisa.

El script sondea con una conexión real (no mirando si el puerto está abierto:
durante la inicialización el puerto ya acepta TCP pero la base de datos rechaza
sesiones), aplica lo pendiente y comprueba que existan las catorce tablas, la
extensión pgvector y el índice HNSW.

## Consola de depuración

```bash
npm run chat -- casa-nigran              # sesión estable, la memoria persiste
npm run chat -- casa-nigran otro_hilo
```

No es un cliente de chat, es una ventana de rayos X. Llama a `think()` igual que
la ruta de Fastify —misma base de datos, mismo Redis, mismos proveedores— y va
imprimiendo cada paso según ocurre:

```
[PENSAMIENTO] gris     qué razonaba el orquestador
[HERRAMIENTA] cian     qué llamó y con qué argumentos
[DELEGACIÓN]  magenta  a qué especialista y con qué encargo
[AUTOCRÍTICA] v/r      veredicto del crítico y su motivo
[HANDOFF]     amarillo cuándo pidió una persona y por qué
```

Se engancha con `observeTraces`, no sondeando `agent_traces`: sondear la tabla
enseñaría el turno cuando ya terminó, que es cuando deja de servir para depurar.
Funciona con `TRACE_ENABLED=false`, así que se puede depurar sin llenar la tabla
de trazas de pruebas.

Comandos: `/facts` (lo que el bot recuerda), `/canal whatsapp` (cambia solo el
formato de salida, para ver cómo llega el Markdown), `/verbose`, `/nueva`,
`/coste`.

## Túnel para pruebas desde fuera

```bash
npm run tunnel                 # arranca la API y abre el túnel
npm run tunnel -- --solo-tunel # la API ya corre aparte
```

Prueba `ngrok` por CLI si está instalado y si no `localtunnel`. Imprime las URL
concretas de cada cosa que se puede probar.

**Lo que este túnel no sirve:** apuntar el webhook de Meta a `/api/v1/chat`. Esa
ruta es nuestra API — espera `Authorization: Bearer pita_...` y un cuerpo
`{session_id, message}`; un webhook de Meta llega sin esa cabecera, con su
propio formato y su propia firma. Devolvería 401 en todas las entregas.
Traducir el formato de un proveedor al nuestro es trabajo de un
`ChannelAdapter`, y hoy solo existe el de Telegram.

Lo que sí sirve, y es lo que hay que validar antes de escribir ese adaptador:
subir un audio o una foto reales desde un móvil contra `/api/v1/chat` con la
clave de API, y recibir el webhook de handoff en un receptor propio para
verificar la firma HMAC desde el otro lado.

## Pruebas

```bash
npm test          # 184 pruebas con node --test, sin BD ni claves
npm run typecheck # cubre src/ y test/
```

Van en serie (`--test-concurrency=1`) porque dos ficheros levantan el servidor
falso de Ollama en el mismo puerto fijo, y `config.ts` congela `OLLAMA_HOST` al
importarse. La suite tarda menos de tres segundos, así que no cuesta nada.

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

## Base de conocimiento y RAG

```bash
# Ficha estructurada (sin vectorizar, búsqueda por texto y keywords)
npm run admin -- import-knowledge casa-nigran ../../knowledge_base/knowledge_base.json

# Documento largo: se trocea, se vectoriza y se guarda
npm run admin -- embed-knowledge casa-nigran ./manual-de-la-casa.md
```

La recuperación es **híbrida** y va de más semántica a más literal: búsqueda
vectorial (coseno sobre pgvector), texto completo en español, y keywords como
red de seguridad. Las dos primeras corren a la vez y se fusionan por rango
recíproco.

Sustituir sin más la búsqueda de texto por la vectorial es un error frecuente:
los embeddings son peores que un índice invertido en coincidencia literal, y en
atención al cliente media conversación son referencias de reserva y nombres
propios. Por eso conviven.

Si no hay embeddings todavía —base sin vectorizar, o sin `OPENAI_API_KEY`— la
parte vectorial se salta sola y el sistema sigue funcionando como antes. Es
degradación, no caída.

El umbral de similitud (`bot_configs.rag_min_similarity`, 0.35 por defecto)
existe para no devolver nada antes que devolver ruido: un fragmento irrelevante
en el prompt empuja al modelo a usarlo igual.

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

## Voz e imagen

El endpoint acepta `multipart/form-data` además de JSON. Una nota de voz se
transcribe con Whisper y una foto se describe con un modelo de visión; lo que
sale entra en el chat como si el usuario lo hubiera escrito.

```bash
curl -X POST http://localhost:3000/api/v1/chat \
  -H "authorization: Bearer pita_..." \
  -F session_id=huesped_001 \
  -F message="mira esto" \
  -F file=@nota-de-voz.ogg
```

**El audio y la imagen se convierten a texto en el borde**, antes de entrar al
núcleo. El RAG, la memoria, las herramientas y los tres proveedores siguen
trabajando con texto y no se enteran. La alternativa —pasar la imagen al modelo
principal en cada turno— se descartó porque el historial se reenvía entero: esa
foto se pagaría en todas las peticiones posteriores de la conversación, y Ollama
ni siquiera acepta el mismo formato. Se pierde poder repreguntar sobre la imagen
original; cuando haga falta, la vía es releerla bajo demanda desde una
herramienta, no reenviarla siempre.

El tipo de fichero lo deciden **los primeros bytes**, no el `content-type`: ese
campo lo rellena quien sube el archivo. Los límites de Fastify van en
[index.ts](src/index.ts) y tapan cuatro vías distintas de agotar memoria
(tamaño por fichero, número de ficheros, campos de texto y partes totales);
quitar cualquiera deja la puerta abierta.

Un adjunto que falle no rompe el turno: se responde con lo que haya y se le
cuenta al usuario qué no se pudo procesar.

## Handoff a una persona

Cuando el usuario se enfada, pide hablar con alguien o el bot da vueltas sin
resolver, la conversación se deriva: el bot deja de responder, los mensajes se
siguen guardando y se avisa al cliente por webhook.

```bash
npm run admin -- set-handoff casa-nigran https://tu-crm.com/hooks/pita
```

El disparador es una **herramienta** (`escalar_a_humano`) y no un clasificador
de sentimiento aparte. Un clasificador ve el texto sin ver la conversación: no
sabe que es la tercera vez que preguntan lo mismo, ni que el bot acaba de decir
que no puede ayudar — y duplica coste y latencia en cada turno. El modelo que ya
está leyendo el hilo entero es quien mejor lo juzga, y una herramienta convierte
ese juicio en una decisión explícita y auditable.

El precio es que depende de que el modelo la llame, así que hay además una red
determinista (`detectLoop`) que detecta al usuario repitiendo la misma petición
y deriva sin consultar al modelo. Compara solo palabras con contenido: sin
quitar las vacías, «¿a qué hora abre la piscina?» y «¿a qué hora cierra la
piscina?» comparten cinco de siete palabras y parecerían la misma pregunta.

El webhook **no** se manda dentro de la petición del usuario — si el servidor
del cliente tarda treinta segundos, el usuario se queda mirando la pantalla. Va
por una cola con reintentos y backoff exponencial, y se firma con HMAC-SHA256
sobre `timestamp.cuerpo`; la marca va *dentro* de la firma para que una entrega
capturada no se pueda reenviar indefinidamente.

## Memoria semántica: lo que el bot recuerda de cada persona

Distinta del resumen de conversación, y conviene no confundirlas:
`conversations.summary` condensa **una** conversación y muere con ella;
`user_facts` guarda hechos que siguen siendo ciertos dentro de seis meses, en
otro canal y en otra conversación.

```bash
npm run admin -- set-feature casa-nigran memoria on   # activada por defecto
```

**El identificador de usuario ya existía**: es `contacts.id`. La tabla `contacts`
más `contact_identities` resuelve desde el esquema inicial que la misma persona
escribiendo por WhatsApp el martes y por Instagram el jueves converja en un
único contacto. Guardar además el teléfono en texto sería peor — un contacto
tiene *varias* identidades, así que «el identificador» en singular no existe.

Los hechos se capturan con la herramienta `memorize_user_fact`, que el modelo
llama cuando le parece, no con un extractor que corre en cada turno. Un extractor
dispara una llamada extra por mensaje —la mayoría no revelan nada memorable— y
decide sin ver la conversación.

Cada hecho lleva una **clave normalizada** (`nombre`, `plan_contratado`). No
estaba en la especificación y hace falta: sin ella, cada vez que alguien dice su
nombre se guarda una fila nueva y a los tres meses la memoria son cuarenta
variantes de lo mismo. Con clave, un dato que cambia **sustituye** al anterior —
y el valor viejo queda en `user_fact_revisions`, porque a veces el modelo
entiende torcido una frase y machaca un dato bueno.

## Autocrítica antes de enviar

Un segundo modelo revisa el borrador contra las reglas del cliente.

```bash
npm run admin -- set-feature casa-nigran autocritica on
```

**Viene apagada por defecto**, y conviene decir por qué antes que para qué:
añade **una llamada completa al modelo por turno**, y dos o tres si el borrador
se rechaza. No es «rápida y paralela» — no puede ser paralela, porque el crítico
necesita el borrador que aún no existe. Es secuencial y el usuario espera. Si
pesa más la seguridad de marca que la latencia, se enciende; esa decisión es del
cliente. Configura `reflection_model` con uno más barato: juzgar un borrador
contra unas reglas es bastante más fácil que redactarlo.

El crítico está calibrado **para no rechazar de más**. Un crítico severo es peor
que no tenerlo: cada rechazo cuesta dos llamadas más y devuelve un texto
reescrito tres veces que suena a formulario. Rechaza solo por cuatro motivos
—datos inventados, guardrail saltado, no responder a lo preguntado, tono roto—
y ante la duda aprueba. Y **juzga, no reescribe**: si propusiera el texto
corregido, el modelo principal lo copiaría literal y la voz del cliente se
perdería.

Agotados los reintentos, se envía el último borrador igualmente. Las
alternativas —dejar al usuario sin respuesta, o un error genérico— son peores
que un texto imperfecto. Queda en la traza como `error` para poder medirlo: si
pasa a menudo, el problema está en las reglas del cliente.

## Sistema multi-agente

Un orquestador habla con el usuario y delega en especialistas.

```bash
npm run admin -- add-subagent casa-nigran ./soporte.json   # ver subagent.example.json
npm run admin -- list-subagents casa-nigran
```

La razón de existir no es el organigrama: un solo prompt con las herramientas de
soporte, ventas y facturación a la vez se vuelve mediocre en las tres, y el
modelo empieza a coger la herramienta equivocada.

Tres reglas sostienen el diseño:

- **Un solo nivel.** El especialista no recibe `delegate_to_agent`. Sin ese
  tope, dos especialistas que se llamen mutuamente agotan un turno entero.
- **El especialista no habla con el usuario.** Su respuesta vuelve como
  resultado de herramienta y el orquestador la sintetiza con su voz. Si
  escribiera directamente, el usuario notaría el cambio de tono a mitad de
  conversación.
- **Arranca con historial vacío.** Lo único que recibe es la tarea que le
  escribió el orquestador. Pasarle la conversación entera parecería más útil y
  sería peor: volvería a ser un generalista con otro prompt, se distraería con
  lo que no es suyo, y el coste se multiplicaría por delegación. Obligar al
  orquestador a redactar un encargo autónomo es lo que mantiene enfocado al
  especialista — igual que cuando le pasas un caso a un compañero.

Las trazas atribuyen cada paso: `agent_role` distingue `orchestrator`,
`specialist` y `critic`, y `parent_run_id` reconstruye el árbol.

```sql
-- ¿Cuánto trabajo hizo cada uno en este turno?
SELECT agent_role, agent_name, COUNT(*) pasos, SUM(tokens_used) tokens
  FROM agent_traces
 WHERE run_id = '...' OR parent_run_id = '...'
 GROUP BY agent_role, agent_name;
```

## Trazabilidad del agente (LLMOps)

`messages` guarda la conversación. Entre el mensaje del usuario y la respuesta
puede haber cinco vueltas de razonamiento y varias llamadas a herramientas que
esa tabla no deja ver, así que cada paso se registra en `agent_traces`.

```sql
-- Reconstruir un turno completo, en orden
SELECT iteration, step_type, tool_name, latency_ms, tokens_used, payload
  FROM agent_traces WHERE run_id = '...' ORDER BY iteration, created_at;

-- ¿Qué herramienta falla más esta semana?
SELECT tool_name, COUNT(*) FILTER (WHERE step_type = 'error') AS fallos, COUNT(*) AS total
  FROM agent_traces
 WHERE tool_name IS NOT NULL AND created_at > NOW() - INTERVAL '7 days'
 GROUP BY tool_name ORDER BY fallos DESC;
```

Dos reglas que no se negocian:

- **Nunca bloquea el bucle.** Las escrituras se disparan sin esperar. Un agente
  de cinco vueltas haría cinco esperas a Postgres antes de contestar, y esa
  latencia la paga el usuario para que nosotros tengamos datos. Por eso
  `trace()` devuelve `void` y no una promesa: el tipo es la documentación.
- **Nunca rompe el turno.** Si el `INSERT` falla, se grita por stdout y ya. Un
  observador que tira el sistema que observa está mal construido.

El precio es que las trazas pueden perderse o llegar desordenadas, así que el
orden se reconstruye al leer con `(iteration, created_at)`, no se confía en el
de inserción. `flushTraces()` espera a las que estén en vuelo al apagar.

`agent_traces` es la tabla que más crece del esquema — varias filas por turno
frente a dos de `messages`. `purgeOldTraces(dias)` existe para eso; conviene
programarlo antes de que sea la tabla más grande y la más inútil.

## Mensajes proactivos

El bot puede escribir primero: recordar una cita, retomar tras una intervención
humana.

```bash
# Programar
curl -X POST http://localhost:3000/api/v1/proactive \
  -H "authorization: Bearer pita_..." -H 'content-type: application/json' \
  -d '{"session_id":"huesped_001","channel":"telegram",
       "context_prompt":"Avisa de que su cita es mañana a las 10:00",
       "send_at":"2026-08-18T08:00:00Z","dedupe_key":"cita-4471"}'

# Devolver la conversación al bot tras atenderla una persona
curl -X POST http://localhost:3000/api/v1/handoff/resolve \
  -H "authorization: Bearer pita_..." -H 'content-type: application/json' \
  -d '{"session_id":"huesped_001","channel":"telegram","note":"Reembolso hecho"}'
```

**`context_prompt` es una instrucción para el modelo, no el texto que se envía.**
El mensaje lo redacta el bot con su voz y en el idioma en que venía hablando esa
persona; un texto literal se saltaría la personalidad del cliente.

Nadie ha pedido un mensaje proactivo, así que las razones para **no** enviarlo
pesan más. Se salta —y queda registrado por qué— si la conversación está
derivada a un humano, si la ventana de 24 h de Meta está cerrada, si no hay
conversación previa, o si ya se mandó otro proactivo hace menos de seis horas.
Saltar es un resultado normal, no un error: por eso no reintenta.

Los endpoints exigen permisos propios (`handoff`, `proactive`), distintos del
`chat`. Quien integra un widget reparte la clave del chat por el navegador; ese
mismo token no puede poder programar mensajes a terceros.

```bash
npm run admin -- issue-key casa-nigran crm --scopes chat,handoff,proactive
```

### Por qué dos colas

El aviso de handoff se encola en una **tabla de Postgres**; los proactivos en
**Redis**. No es duplicación por descuido:

- La cola de handoff se inserta *en la misma transacción* que el cambio de
  estado de la conversación. Eso da una garantía que Redis no puede dar: es
  imposible derivar a un humano y no encolar el aviso.
- Los proactivos necesitan lo que Postgres hace mal: trabajos **retrasados**
  («dentro de 23 horas»). En SQL eso es un sondeo constante sobre una tabla que
  crece.

Redis es **opcional**: sin `REDIS_URL` la capa proactiva se apaga y el resto
arranca igual, para que `docker compose up -d` siga bastando para tocar un
prompt.

## Adaptación del formato al canal

Los modelos escriben Markdown enriquecido. En un chat web se renderiza; en
WhatsApp aparecen los asteriscos literales, y en SMS el ruido de puntuación
cuenta para los 160 caracteres.

| Canal | Qué hace |
|---|---|
| `web` | Nada: el cliente ya renderiza Markdown |
| `whatsapp` | `**x**` → `*x*`, `*x*` → `_x_`, quita encabezados, aplana tablas y enlaces |
| `telegram` | Conserva negritas, aplana tablas y listas anidadas |
| `sms` | Quita todo el marcado; saltos estrictamente `\n`, sin líneas en blanco |
| `voice` | Lo de SMS, más sustituir URL por una referencia hablada |

Se podría pedir en el prompt «no uses Markdown» — se hace, y funciona a medias.
El «casi siempre» es lo que llega al cliente, y esa instrucción compite por
atención con las que sí importan. Una transformación determinista al final
acierta el 100 % y no gasta un token.

El caso que más cuesta: WhatsApp y Markdown usan el mismo carácter para cosas
distintas (`*x*` es negrita allí y cursiva aquí), así que al convertir
`**x**` → `*x*` la regla de cursiva vuelve a atrapar el asterisco recién creado.
Como un `*` nuevo y uno original son indistinguibles, las negritas se apartan
tras un marcador temporal hasta que la cursiva ha pasado.

Se aplica en la ruta HTTP (`channel_type` en el body) y en los adaptadores de
canal, **no** en un hook `onSend`: un hook recibe el cuerpo ya serializado y
tendría que parsear el JSON, reescribir un campo y volver a serializarlo en cada
respuesta, sin saber siquiera de qué canal se trata.

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
    agent.ts           Bucle ReAct: piensa, actúa, evalúa, repite
    telemetry.ts       Trazas del agente, sin esperar y sin poder romper el turno
    proactive.ts       Redacción de mensajes que inicia el bot, con sus frenos
    userFacts.ts       Memoria semántica: hechos que sobreviven a la conversación
    reflection.ts      El crítico que revisa el borrador antes de enviarlo
    subagents.ts       Especialistas y delegación de un solo nivel
    prompt.ts          Compilación de plantilla en una pasada + lista blanca
    autoconfig.ts      Meta-prompting: descripción del negocio → bot_config validada
    tools.ts           Registro y ejecución de herramientas, con los controles de red
    handoff.ts         Derivación a humano, detección de bucle y webhook firmado
    memory.ts          Recorte por presupuesto de tokens y resumen acumulado
    rag.ts             Recuperación híbrida: vectorial + texto completo + keywords
    chunking.ts        Troceado por fronteras semánticas, con solape
    conversations.ts   Identidad, historial, idempotencia
  media/
    types.ts           Detección de tipo por firma de fichero, no por content-type
    audio.ts           Transcripción con Whisper
    vision.ts          Descripción de imágenes (OpenAI o Anthropic)
    ingest.ts          Dispatcher: todo a texto antes de entrar al núcleo
  llm/
    index.ts           Selección de proveedor + reintentos (solo 429 y 5xx)
    embeddings.ts      text-embedding-3-small para el RAG vectorial
    ollama.ts          Local, sin coste, sin salir de la máquina
    anthropic.ts       Claude — ojo: los modelos 5 rechazan `temperature`
    openai.ts
    pricing.ts         Coste en micro-euros, enteros
  channels/
    types.ts           Interfaz ChannelAdapter + sobre unificado
    outputFormatter.ts Adaptación del Markdown al canal, y troceado
    outbound.ts        Envío saliente sin que haya entrado nada (proactivos)
    telegram.ts        Primer canal
  queue/
    connection.ts      Redis para BullMQ. Opcional: sin él, se apaga la capa
    proactive.ts       Cola y programación de trabajos retrasados
    worker.ts          Consume la cola: redacta, comprueba y envía
  routes/
    chat.ts            Endpoint del widget web
    handoff.ts         Reactivación tras handoff y disparadores proactivos
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
- **El tipo de un adjunto lo deciden sus primeros bytes**, no el `content-type`,
  que lo rellena quien sube el fichero.
- **La marca de tiempo va dentro de la firma HMAC del webhook**, no solo al
  lado: si no, una entrega capturada se puede reenviar indefinidamente.
- **La búsqueda vectorial no sustituye a la de texto completo, la complementa.**
  Los embeddings pierden contra un índice invertido en coincidencia literal, y
  media conversación de atención al cliente son referencias y nombres propios.
- **En la última vuelta del agente se retiran las herramientas.** Si se dejaran,
  el modelo podría pedir una llamada que ya no se va a ejecutar y contestar
  contando con un dato que nunca llegó.

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

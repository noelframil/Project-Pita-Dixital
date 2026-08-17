# README-JAVI — Registro de trabajo

Bitácora de los cambios que Javi (Meridian Systems ES) introduce en
**Project-Pita-Dixital**. El `README.md` de la raíz documenta el prototipo de voz
original; el de `services/api/` documenta el núcleo omnicanal. Este documento
registra **qué se cambia, cuándo y por qué**, para que Noel y el resto del equipo
puedan seguir el hilo sin leer el diff entero.

Formato de cada entrada: fecha, qué se tocó, por qué, y qué queda abierto.

---

## Contexto del proyecto

Middleware/API centralizada: en vez de que cada app, web o chatbot externo llame
directamente a OpenAI/Anthropic, todos llaman a nuestro sistema. Nuestro sistema
autentica al cliente, carga su configuración, compila el prompt maestro, recupera
contexto e historial, llama al modelo y registra uso y coste.

```
[App / WhatsApp / Script]  →  [API Central]  →  [OpenAI / Claude / Ollama]
                                   │
                                   ├─ autentica api_key
                                   ├─ carga config + variables dinámicas
                                   ├─ RAG + historial de sesión
                                   ├─ ensambla payload
                                   └─ registra tokens y coste
```

---

## Estado real al arrancar (2026-08-16)

Auditoría del código existente en `services/api/` contra la documentación
técnica de referencia. **El repo ya implementa un superconjunto del documento**,
y en varios puntos corrige errores del borrador. Conviene saberlo antes de
"implementar" cosas que ya están.

| Elemento del documento | Estado en el repo | Nota |
|---|---|---|
| `POST /api/v1/chat` | ✅ Hecho | [routes/chat.ts](services/api/src/routes/chat.ts) — Fastify, validación Zod, 401/403/429/502/504 diferenciados |
| Prompt maestro dinámico | ✅ Hecho | [core/prompt.ts](services/api/src/core/prompt.ts) |
| Tabla `clients` | ✅ Hecho | [001_init.sql](services/api/migrations/001_init.sql) — con `slug` |
| Tabla `bot_configs` | ✅ Hecho + ampliada | `allowed_override_vars`, `channel_overrides`, `history_turns` |
| Tabla `chat_logs` | ⚠️ Sustituida | Por `conversations` + `messages`, que es mejor (ver abajo) |
| Autenticación por API key | ✅ Hecho y endurecida | Claves hasheadas con pepper, no en claro |
| Rate limiting | ⚠️ Parcial | Ventana deslizante **en memoria**; falta Redis para multi-instancia |
| Multi-proveedor LLM | ✅ Hecho | OpenAI, Anthropic y Ollama con reintentos acotados |
| **Fase 1** — Meta-prompting / autoconfiguración | ✅ Hecha 2026-08-16 | [core/autoconfig.ts](services/api/src/core/autoconfig.ts) |
| **Fase 2** — Arquitectura modular | ✅ Ya venía hecha | `routes/` · `lib/` · `core/` · `llm/` · `channels/` |
| **Fase 3** — Function calling / tools | ✅ Hecha 2026-08-16 | [core/tools.ts](services/api/src/core/tools.ts) |
| **Fase 4** — Memoria de contexto | ✅ Hecha 2026-08-16 | [core/memory.ts](services/api/src/core/memory.ts) |

### Tres decisiones del repo que NO hay que deshacer

El código de `services/api` corrige defectos concretos del borrador de referencia.
Aplicar el borrador al pie de la letra sería una regresión de seguridad:

1. **Compilación del prompt en una sola pasada.** El borrador usa un bucle de
   `replaceAll` por variable. Eso es secuencial: si el valor de una variable
   contiene `{{otra_var}}`, se expande en la vuelta siguiente — un cliente puede
   inyectar plantilla dentro de la plantilla. El repo usa un único `replace` con
   callback: lo que sale de una sustitución ya no se vuelve a mirar.

2. **Lista blanca en `override_variables`.** El borrador funde
   `{...config.dynamic_variables, ...override_variables}` sin filtrar, así que
   quien tenga la API key reescribe cualquier parte del system prompt desde el
   body de la petición. El repo exige que la variable esté declarada en
   `bot_configs.allowed_override_vars`.

3. **`api_key` hasheada, no en claro.** El borrador guarda `api_key VARCHAR(64)`
   en texto plano y busca por igualdad. El repo guarda `prefix` (localiza la
   fila) + `key_hash` (verifica), con pepper de entorno. Una copia de la base de
   datos no compromete a los clientes.

Añadidos a lo mismo: el rate limit se evalúa **antes** de llamar al modelo
(después no ahorra dinero), el contexto del RAG va delimitado y marcado como
datos y no como órdenes, y los costes se guardan en micro-euros enteros para que
el dinero en coma flotante no acumule céntimos fantasma.

### Discrepancia de stack pendiente de decidir

La documentación especifica **Next.js API Routes**; el repo corre **Fastify sobre
Node 20+ con TypeScript**. Ambas son válidas, pero no son la misma decisión:

- **Seguir en Fastify** — cero trabajo de migración, el servicio ya funciona,
  mejor para carga sostenida y para el salto a Rust de la Fase 2.
- **Migrar a Next.js** — solo compensa si queremos el panel de administración
  interno y la API desplegados juntos en Vercel.

Recomendación: mantener Fastify para la API y, si hace falta panel, añadir una
app Next.js aparte que consuma esta misma API. Pendiente de confirmar con Noel.

---

## Bitácora

### 2026-08-16 — Puesta en marcha del entorno

- Clonado `Project-Pita-Dixital` en el entorno de trabajo local. Historial de git
  intacto, `origin` apuntando a GitHub, rama `main` en `19b6755`.
- Auditado el código existente contra la documentación técnica (tabla de arriba).
- Creado este `README-JAVI.md` como registro de cambios.

**Abierto:**
- Decidir stack de la API (Fastify vs Next.js) — ver arriba.
- Quedan 30 ficheros de `node_modules/` rastreados (el paquete `find-exec`),
  colados antes de que existiera el `.gitignore`. Poca cosa, pero sobra.
- `piper.tar.gz` (18,3 MB) y `output.mp3` (0,4 MB) están rastreados **pese a
  figurar en `.gitignore`** — ignorar un fichero no lo desrastrea. Candidatos a
  release asset o a Git LFS. **Decisión de Noel:** sacarlos reescribe el
  historial o deja el peso en él de todos modos, así que no lo toco por mi cuenta.

---

### 2026-08-16 — Fase 1: motor de autoconfiguración (meta-prompting)

Alta de un cliente sin escribir el prompt a mano. Una descripción del negocio en
prosa entra por la CLI y sale una `bot_configs` validada.

```bash
npm run admin -- autoconfig casa-nigran "Casa rural de 6 habitaciones en Nigrán..."
npm run admin -- autoconfig casa-nigran "..." --apply
npm run admin -- autoconfig casa-nigran "..." --provider ollama   # prueba sin gastar
```

**Ficheros:**

| Fichero | Qué cambia |
|---|---|
| [core/autoconfig.ts](services/api/src/core/autoconfig.ts) | Nuevo. El motor: meta-prompt, esquema, validación e invariantes |
| [llm/types.ts](services/api/src/llm/types.ts) | `jsonSchema` y `timeoutMs` en `CompletionRequest` |
| [llm/anthropic.ts](services/api/src/llm/anthropic.ts) | `output_config.format` |
| [llm/openai.ts](services/api/src/llm/openai.ts) | `response_format: json_schema` (strict) |
| [llm/ollama.ts](services/api/src/llm/ollama.ts) | Campo `format` |
| [cli/admin.ts](services/api/src/cli/admin.ts) | Comando `autoconfig`, parser de flags, manejo de `AutoconfigError` |
| [config.ts](services/api/src/config.ts) | 4 variables `AUTOCONFIG_*` |

**Decisiones que conviene entender antes de tocar esto:**

1. **La salida estructurada vive en la capa LLM, no en el motor.** Cada proveedor
   la aplica con su mecanismo nativo, así que la misma llamada funciona con
   Anthropic, OpenAI y Ollama. Queda lista para la Fase 3, que necesita lo mismo
   para el function calling.

2. **Los guardrails no los escribe el modelo.** El LLM redacta identidad, tono y
   alcance; el bloque `GUARDRAILS_BLOCK` lo anexa el código desde una constante.
   Un guardrail generado es uno que el generador puede omitir, suavizar o
   contradecir sin que nadie se entere — y así se mejoran para toda la cartera
   de clientes tocando una constante.

3. **`allowed_override_vars` no la decide el modelo.** Es el único campo con
   consecuencias de seguridad reales: lo que esté ahí lo reescribe cualquiera con
   la clave de API desde el body. El modelo propone; se guarda vacía salvo
   `--allow-override guest_name,user_tier`, y solo se aceptan variables que
   existan.

4. **No se genera base de conocimiento.** Pedirle horarios o precios a un LLM es
   pedirle que se los invente, y entrarían al RAG indistinguibles de los datos
   reales. Eso sigue llegando por `import-knowledge`, desde una fuente revisada.

5. **Dry-run por defecto.** Un prompt del sistema es lo que ese cliente dirá a
   sus huéspedes durante meses. Sin `--apply` solo se imprime el prompt ya
   compilado, con las variables sustituidas.

**Invariantes que se comprueban antes de guardar** (todas fallan ruidosamente):

- Ningún marcador `{{x}}` sin variable declarada — se compilaría a cadena vacía
  y dejaría un hueco mudo en mitad del prompt.
- Ningún valor con `<` o `>`: `sanitizeValue` los borra al compilar, así que la
  vista previa mentiría sobre lo que ve el modelo.
- Ningún valor con `{{`: la compilación es de una sola pasada, se imprimiría literal.
- La plantilla no puede contener `<contexto>`, el delimitador del RAG — si no,
  podría colar texto propio disfrazado de conocimiento recuperado.
- Claves en `snake_case`, sin duplicados, valores ≤ 500 caracteres (el corte que
  aplica el compilador en ejecución).

**Verificado:** `npm run typecheck` limpio. 18 pruebas de las invariantes contra
un servidor que imita la API de Ollama, todas en verde (camino feliz, JSON
envuelto en markdown, y los 9 rechazos de arriba).
**Sin verificar:** la generación contra un modelo real. En este entorno no hay
clave de Anthropic ni Postgres levantado, así que la calidad del prompt que
produce Opus 5 y el `--apply` contra la base de datos están sin probar en vivo.
Primera prueba pendiente con `docker compose up -d` y una clave.

**Abierto:**
- `AUTOCONFIG_MODEL` por defecto es `claude-opus-5`. Es una tarea de una sola
  pasada por cliente donde la calidad manda, pero conviene medir qué tal lo hace
  Sonnet 5 antes de fijarlo.

---

### 2026-08-16 — Fase 2: revisión (sin cambios)

Auditada contra lo que pide el documento: separación de enrutamiento,
autenticación y lógica, «preparando el terreno por si hay que migrar carga
pesada a Rust». **Ya estaba hecha antes de que llegáramos**, y bien:

```
routes/   HTTP y validación de entrada. No sabe nada de modelos.
lib/      auth, crypto, rateLimit. Transversal, sin lógica de negocio.
core/     brain, prompt, rag, memory, tools, conversations. El dominio.
llm/      Un adaptador por proveedor tras una interfaz común.
channels/ Un adaptador por canal tras una interfaz común.
```

No he tocado nada. Para una extracción futura a Rust, la frontera natural es
`core/` completo: `brain.think()` ya es la única puerta de entrada y todos los
canales pasan por ella, así que se puede reimplementar detrás sin tocar
`routes/` ni `channels/`.

---

### 2026-08-16 — Fase 3: herramientas (function calling)

El modelo puede llamar a APIs del cliente. Se dan de alta desde un JSON
(plantilla en [tools.example.json](services/api/tools.example.json)):

```bash
npm run admin -- add-tool casa-nigran ./disponibilidad.json
npm run admin -- list-tools casa-nigran
npm run admin -- remove-tool casa-nigran consultar_disponibilidad
```

**Ficheros:** [migrations/002](services/api/migrations/002_tools_and_memory.sql) ·
[core/tools.ts](services/api/src/core/tools.ts) ·
[core/brain.ts](services/api/src/core/brain.ts) ·
los tres proveedores en [llm/](services/api/src/llm/) ·
[cli/admin.ts](services/api/src/cli/admin.ts)

**Lo que hay que entender antes de tocarlo:**

Una herramienta HTTP es, literalmente, «haz una petición con los parámetros que
diga el modelo», y el modelo obedece a quien escriba por Telegram. Eso es una
superficie de ataque real, no teórica. Tres controles la cierran:

1. **El origen es fijo.** Los marcadores solo valen en ruta y query, nunca en el
   host, y tras sustituir se revalida que el origen no cambió. Un parámetro con
   `@` o `//` no puede redirigir la petición —con la clave del cliente dentro— a
   otro servidor. Probado con los dos vectores.
2. **Nada de direcciones internas.** Se resuelve el nombre antes de llamar y se
   rechazan rangos privados, loopback, CGNAT y `169.254.169.254`. Sin esto una
   herramienta es una puerta al endpoint de metadatos de la nube.
3. **Todo acotado:** solo https, redirecciones cortadas (`redirect: 'error'`,
   porque un 302 se salta las dos comprobaciones anteriores), timeout por
   llamada, respuesta recortada y tope de vueltas del bucle.

Además: **el modelo solo ve nombre, descripción y esquema.** URL y cabeceras van
cifradas con `ENCRYPTION_KEY`, así que la clave de API del cliente no se puede
filtrar por prompt injection — no está en el prompt.

Y **un fallo de herramienta no rompe el turno**: vuelve al modelo como texto
para que rectifique o se lo diga al usuario. Reventar la conversación porque una
API de terceros dio un 500 sería peor servicio.

Detalle de integración que costó: **Anthropic exige que todos los `tool_result`
de una misma tanda vayan en un único turno de usuario.** Partirlos en turnos
consecutivos es un 400. Los otros dos proveedores usan un mensaje por resultado.
Hay prueba específica de eso.

**Limitación aceptada:** el bucle es intra-turno. Las llamadas se ejecutan y se
registran en `tool_invocations`, pero el historial que se recarga al turno
siguiente solo lleva texto de usuario y asistente. Emparejar `tool_use`/
`tool_result` a través de turnos, canales y proveedores distintos cuesta mucho
más de lo que aporta cuando la respuesta del asistente ya lleva la conclusión.
Anotado en el «Pendiente» del README del servicio.

---

### 2026-08-16 — Fase 4: memoria de contexto

`history_turns` contaba turnos, que no dice nada del tamaño real: ocho turnos de
dos frases y ocho de dos páginas cuestan lo mismo en la cuenta y muy distinto en
la factura. Ahora se recorta por **presupuesto de tokens**
(`bot_configs.context_token_budget`, 3000 por defecto) y lo que cae fuera se
resume en `conversations.summary`, con marca de agua para que cada resumen parta
del anterior.

**Ficheros:** [core/memory.ts](services/api/src/core/memory.ts) ·
[core/conversations.ts](services/api/src/core/conversations.ts) ·
[core/brain.ts](services/api/src/core/brain.ts) ·
[migrations/002](services/api/migrations/002_tools_and_memory.sql)

**Decisiones:**

- **La estimación de tokens es heurística, no exacta.** La cuenta buena la tiene
  cada proveedor con su tokenizador y pedírsela costaría una llamada de red por
  mensaje. Para decidir un recorte no hace falta precisión, hace falta no
  quedarse corto: el divisor (3,5 caracteres por token) tira a la baja para
  sobreestimar y que el presupuesto no se desborde.
- **La marca de agua es la fecha del último mensaje resumido, nunca `NOW()`.**
  Con `NOW()`, los mensajes que entren mientras se genera el resumen se darían
  por resumidos sin estarlo, y ese tramo desaparecería del contexto para siempre.
- **Si el resumen falla, la marca de agua no avanza.** Se responde con el resumen
  viejo y el próximo turno reintenta. Resumir tarde es mejor que dar por
  resumido lo que no se resumió.
- **El resumen se entrega delimitado y marcado como recuerdo, no como órdenes**,
  igual que el bloque del RAG: ahí dentro hay texto que escribió un usuario.

**Un fallo que encontré en mi propio código y corregí:** la primera versión
localizaba la marca de agua consultando el mensaje número N de la conversación.
Eso solo funciona si todo el historial sin resumir cabe en `history_turns`.
Cuando no cabe, la marca se colocaba demasiado atrás y el tramo intermedio se
perdía: ni en el contexto ni en ningún resumen. Ahora la fecha viaja junto a
cada mensaje cargado y el corte es exacto. Hay una prueba de la propiedad que lo
sostiene (lo descartado es siempre un prefijo del historial).

---

### 2026-08-16 — Pruebas dentro del repo

Estaban en un directorio temporal, así que se habrían perdido al subir. Ahora
viven en [services/api/test/](services/api/test/) con `node --test`, que viene
de serie en Node 20+ y no añade ninguna dependencia.

```bash
npm test          # 58 pruebas, ~1,4 s
npm run typecheck # ahora cubre src/ y test/
```

Detalles de montaje: `test/helpers/env.ts` rellena el entorno con valores de
mentira porque `config.ts` mata el proceso si falta algo, y
`test/helpers/fake-ollama.ts` levanta un servidor que imita la API de chat de
Ollama para poder inyectar lo que devuelve el modelo. `tsconfig.test.json`
extiende el de build para que el typecheck cubra también las pruebas.

---

### 2026-08-17 — Multimodal, RAG vectorial, handoff y agente ReAct

Cuatro bloques nuevos. Antes del detalle, **tres desviaciones respecto a las
especificaciones**, porque chocaban con lo que ya existía:

| Pedía | Qué se hizo | Por qué |
|---|---|---|
| Guardar en `chat_logs` | `conversations` + `messages` | `chat_logs` no existe en este esquema. `messages` ya tenía columna `media`. |
| Tabla nueva `knowledge_base` | `embedding` sobre `knowledge_entries` | Una tabla nueva dejaría dos almacenes de conocimiento que sincronizar, y «¿en cuál está la respuesta buena?» sin respuesta. |
| «El conocimiento se inyecta entero en el prompt» | Ya había RAG (texto completo) | La premisa no era cierta: `rag.ts` ya recuperaba. Esto lo amplía a híbrido, no lo crea. |

También conviene saber que **el handoff y el bucle de herramientas ya estaban a
medias**: `conversations.status` ya distinguía `open`/`handoff` y `brain.ts` ya
se callaba; el bucle de la Fase 3 ya reinyectaba errores. Lo nuevo es el
disparador, el webhook, los pasos tipados y el prompt ReAct.

#### Multimodal (voz e imagen)

`multipart/form-data` en `/api/v1/chat`. Whisper para audio, modelo de visión
para imágenes. Ficheros nuevos en [services/api/src/media/](services/api/src/media/).

- **Se convierte a texto en el borde.** El núcleo entero sigue trabajando con
  texto. La alternativa —pasar la imagen al modelo principal— la descartamos
  porque el historial se reenvía completo: esa foto se pagaría en *cada*
  petición posterior de la conversación, y Ollama ni acepta el formato.
- **El tipo lo deciden los primeros bytes**, no el `content-type`, que lo
  rellena quien sube el fichero.
- **Cuatro límites en Fastify**, no uno: tamaño por fichero, número de ficheros,
  campos de texto y partes totales. Cada uno tapa una vía distinta de agotar la
  memoria; con solo `fileSize`, mil ficheros de 9 MB lo tumban igual.
- Un adjunto que falla no rompe el turno.

#### RAG vectorial (pgvector)

[migración 003](services/api/migrations/003_rag_handoff_multimodal.sql) ·
[llm/embeddings.ts](services/api/src/llm/embeddings.ts) ·
[core/chunking.ts](services/api/src/core/chunking.ts) ·
[core/rag.ts](services/api/src/core/rag.ts)

- **Recuperación híbrida**, fusionada por rango recíproco (RRF). No se pueden
  comparar las puntuaciones directamente: el coseno vive en 0..1 y `ts_rank` en
  una escala propia sin techo. RRF usa solo la posición, que sí es comparable.
- **La vectorial no sustituye a la de texto completo.** Los embeddings pierden
  contra un índice invertido en coincidencia literal, y media conversación de
  atención al cliente son referencias de reserva y nombres propios.
- **HNSW y no ivfflat**: ivfflat exige entrenar centroides, así que un índice
  creado con la tabla vacía —que es como se crea en una migración— sale
  inservible.
- **La dimensión no es dinámica**, aunque la especificación lo pedía: pgvector
  la fija en el tipo de la columna y el índice depende de ella. Cambiar de
  modelo es una migración más un reindexado. Queda `embedding_model` en cada
  fila para saber qué regenerar.
- Sin `OPENAI_API_KEY` la parte vectorial se salta sola. Degradación, no caída.

#### Handoff inteligente

[core/handoff.ts](services/api/src/core/handoff.ts)

- **El disparador es una herramienta, no un clasificador aparte.** Un
  clasificador ve el texto sin ver la conversación: no sabe que es la tercera
  vez que preguntan lo mismo. Y duplica coste y latencia en cada turno.
- **Más una red determinista** (`detectLoop`) que no depende del criterio del
  modelo, porque el bucle es justo lo que peor detecta desde dentro: cada turno
  le parece razonable por separado.
- **El webhook no se manda dentro de la petición del usuario.** Si el servidor
  del cliente tarda treinta segundos, el usuario se queda mirando la pantalla.
  Cola con reintentos, backoff exponencial y `FOR UPDATE SKIP LOCKED` para que
  varias instancias no dupliquen avisos.
- **La marca de tiempo va dentro de la firma HMAC**, no solo al lado: si no, una
  entrega capturada se reenvía indefinidamente.

#### Agente ReAct

[core/agent.ts](services/api/src/core/agent.ts) — el bucle sale de `brain.ts` a
su propio módulo con pasos tipados (`AgentStep`), y `brain.ts` vuelve a decidir
*qué* pasa en vez de *cómo*.

- Tres condiciones de parada: respuesta final, vueltas agotadas, o handoff.
- **En la última vuelta se retiran las herramientas.** Si se dejaran, el modelo
  podría pedir una llamada que ya no se ejecuta y contestar con un dato que
  nunca llegó.
- **Corta la llamada idéntica repetida** dentro del mismo turno: un modelo
  atascado repite la misma consulta esperando otro resultado.
- Un fallo de herramienta vuelve al modelo como texto para que replantee. Es lo
  que separa un agente de un script.

#### Tres bugs propios encontrados al probar

1. **`recordInvocation` rompía la conversación** si fallaba el `INSERT` de la
   traza. Es una escritura de auditoría, no el camino crítico: ahora se captura
   y se grita por stderr.
2. **`audio.ts` comprobaba la clave de API antes que el tamaño**, así que un
   audio de 11 MB se rechazaba por el motivo equivocado. La entrada se valida
   antes que la configuración.
3. **`chunkText` con solape mayor que el fragmento** avanzaba de carácter en
   carácter: miles de trozos casi idénticos, cada uno pagado como embedding.
   Ahora el solape se acota a la mitad del fragmento.

Y una corrección en `detectLoop`: comparaba incluyendo palabras vacías, con lo
que «¿a qué hora abre la piscina?» y «¿a qué hora cierra la piscina?» salían
como la misma pregunta. Ahora solo compara palabras con contenido.

---

### 2026-08-17 — Observabilidad, proactividad y adaptación al canal

Tres capas nuevas. Como en la tanda anterior, una desviación de la
especificación: se pedía relacionar `agent_traces` con `chat_logs` o `sessions`,
y aquí la equivalencia es `conversations` (la sesión) y `messages` (los turnos).

#### Observabilidad / LLMOps

[migración 004](services/api/migrations/004_traces_and_proactive.sql) ·
[core/telemetry.ts](services/api/src/core/telemetry.ts)

Cada paso del razonamiento va a `agent_traces`: pensamiento, llamada, resultado
y error, agrupados por `run_id`.

- **Nunca bloquea el bucle.** `trace()` devuelve `void`, no una promesa, y es a
  propósito: si devolviera una promesa, antes o después alguien le pondría un
  `await` delante y el bucle empezaría a bloquearse por la auditoría. Un agente
  de cinco vueltas haría cinco esperas a Postgres antes de contestar.
- **Nunca rompe el turno.** El fallo va a stdout y ya. Hay prueba: la suite corre
  *sin* Postgres, así que ahí todas las escrituras de traza fallan, y se
  verifica que un turno completo del agente termina bien igualmente.
- El precio: las trazas pueden perderse o desordenarse. Por eso el orden se
  reconstruye al leer con `(iteration, created_at)`, y `flushTraces()` espera a
  las que estén en vuelo al apagar el proceso.
- Un fallo de herramienta se marca como `error` y no como `tool_result`: es lo
  que se consulta al preguntar «¿qué se está rompiendo?», y el índice parcial lo
  hace barato.

#### Proactividad (BullMQ + Redis)

[queue/](services/api/src/queue/) · [core/proactive.ts](services/api/src/core/proactive.ts) ·
[routes/handoff.ts](services/api/src/routes/handoff.ts)

- **`context_prompt` es una instrucción para el modelo, no el texto que se
  envía.** El mensaje lo redacta el bot con su voz y en el idioma en que venía
  hablando esa persona.
- **Nadie ha pedido un mensaje proactivo**, así que casi todo el módulo son
  comprobaciones previas: conversación en handoff, ventana de 24 h de Meta
  cerrada, sin conversación previa, o demasiado pronto tras el anterior. Saltar
  es un resultado normal y **no reintenta** — si reintentara, BullMQ repetiría
  seis veces algo que va a dar el mismo resultado siempre.
- **Se escribe en Postgres antes de encolar.** Si el proceso muere entre medias,
  queda una fila `queued` visible y reparable en vez de un trabajo en Redis del
  que no hay rastro. Un aviso que no sale y se ve es mejor que uno que sale y no
  consta.
- **Redis es opcional.** Sin `REDIS_URL` la capa se apaga y el resto arranca
  igual: `docker compose up -d` tiene que seguir bastando para tocar un prompt.
- **Permisos nuevos** (`handoff`, `proactive`) separados de `chat`: quien
  integra un widget reparte la clave del chat por el navegador, y ese token no
  puede poder programar mensajes a terceros.

**Por qué ahora hay dos colas.** El aviso de handoff sigue en una tabla de
Postgres y los proactivos van a Redis. No es descuido: la de handoff se inserta
*en la misma transacción* que el cambio de estado, lo que hace imposible derivar
sin avisar — garantía que Redis no puede dar. Los proactivos necesitan lo
contrario: trabajos retrasados a 23 horas, que en SQL son un sondeo constante.

#### Adaptación al canal

[channels/outputFormatter.ts](services/api/src/channels/outputFormatter.ts)

Markdown → formato del canal, con un formateador por destino. Se aplica en la
ruta HTTP (`channel_type`) y en los adaptadores, **no** en un hook `onSend`: un
hook recibe el cuerpo ya serializado y tendría que parsear el JSON, reescribir
un campo y volver a serializarlo en cada respuesta, sin saber de qué canal se
trata.

Se podría pedir en el prompt «no uses Markdown» — se hace, y funciona a medias.
El «casi siempre» es lo que llega al cliente.

#### Un bug propio, y del tipo que avisas y cometes igual

El formateador de WhatsApp convertía `**negrita** y *cursiva*` en
`_negrita_ y _cursiva_`. Markdown y WhatsApp usan el mismo carácter para cosas
distintas, así que al convertir `**x**` → `*x*` la regla de cursiva volvía a
atrapar el asterisco recién creado. Había escrito el comentario advirtiendo del
orden y aun así caí: no basta con ordenar, porque un `*` nuevo y uno original
son indistinguibles. Ahora las negritas se apartan tras un marcador temporal
hasta que la cursiva ha pasado.

### Estado de las pruebas

`npm run typecheck` limpio. **146 pruebas en verde**, sin BD ni claves:

| Bloque | Nº | Cubre |
|---|---|---|
| Autoconfig | 15 | Camino feliz, JSON en vallas markdown, 9 invariantes |
| Herramientas | 20 | SSRF (12 vectores), reescritura de origen, ejecución |
| Traducción LLM | 12 | Agrupado de Anthropic, formato OpenAI/Ollama, argumentos rotos |
| Memoria | 11 | Recorte, prefijo, coste de llamadas, bloque de memoria |
| Agente ReAct | 11 | Parada, errores en cascada, deduplicación, handoff, paralelismo |
| Multimodal | 17 | Firmas de fichero, validación previa, dispatcher |
| Handoff y RAG | 22 | Bucles, firma HMAC, troceado, esquema de la herramienta |
| Formateo de canal | 29 | WhatsApp, SMS, voz, tablas, troceado, casos límite |
| Telemetría | 9 | Fire-and-forget, el agente sobrevive a la auditoría rota |

Las del agente corren el bucle completo contra un servidor que imita la API de
Ollama, con guiones de varias vueltas: es la única forma de probar la parada,
la reinyección de errores y la deduplicación sin gastar tokens.

**Sin verificar, y conviene decirlo claro:**

- **Las migraciones 002, 003 y 004 no se han aplicado nunca.** No hay Docker ni
  Postgres en este entorno. El SQL está revisado a ojo, no ejecutado. La 003 es
  la de más riesgo: `CREATE EXTENSION vector` y el índice HNSW dependen de que
  la imagen de pgvector esté como se espera.
- **Ninguna llamada real a un modelo, a Whisper, a visión ni a embeddings.** No
  hay claves en este entorno. El bucle del agente sí se ha probado entero, pero
  contra un servidor que imita a Ollama, no contra las APIs de verdad.
- **BullMQ no ha procesado nunca un trabajo.** No hay Redis aquí. La cola, el
  worker y los dos endpoints están escritos y tipados, pero el camino
  encolar → esperar → redactar → enviar no se ha recorrido entero ni una vez.
  Es lo menos probado de todo lo que va en la rama.
- **El webhook de handoff no se ha entregado nunca a un receptor real.** La
  firma está probada contra su propia definición; falta verificarla desde el
  otro lado.
- **La autoconfiguración no se ha probado contra Opus 5**, así que la calidad del
  prompt que produce está por ver.

Primera sesión con `docker compose up -d`, `npm run migrate` y claves reales
debería centrarse exactamente en esos cinco puntos, y empezar por BullMQ.

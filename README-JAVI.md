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

### Estado de las pruebas

`npm run typecheck` limpio. **58 pruebas en verde**, sin BD ni claves:

| Bloque | Nº | Cubre |
|---|---|---|
| Fase 1 — autoconfig | 15 | Camino feliz, JSON en vallas markdown, 9 invariantes |
| Fase 3 — herramientas | 20 | SSRF (12 vectores), reescritura de origen, ejecución |
| Fase 3 — traducción LLM | 12 | Agrupado de Anthropic, formato OpenAI/Ollama, argumentos rotos |
| Fase 4 — memoria | 11 | Recorte, prefijo, coste de llamadas, bloque de memoria |

**Sin verificar, y conviene decirlo claro:**

- **La migración 002 no se ha aplicado nunca.** No hay Docker ni Postgres en este
  entorno. El SQL está revisado a ojo, no ejecutado.
- **Ninguna llamada real a un modelo.** No hay clave de Anthropic ni de OpenAI ni
  Ollama corriendo. La traducción de mensajes está probada contra el formato
  esperado, no contra las APIs.
- **El bucle de herramientas nunca ha dado una vuelta completa de verdad.**
- **La autoconfiguración no se ha probado contra Opus 5**, así que la calidad del
  prompt que produce está por ver.

Primera sesión con `docker compose up -d`, `npm run migrate` y una clave real
debería centrarse exactamente en esos cuatro puntos.

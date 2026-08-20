/**
 * CLI de administración.
 *
 *   npm run admin -- create-client <slug> "<Nombre>"
 *   npm run admin -- autoconfig <slug> "<descripción del negocio>" [opciones]
 *   npm run admin -- issue-key <slug> [etiqueta] [--scopes chat,handoff,proactive]
 *   npm run admin -- link-telegram <slug> <bot-token>
 *   npm run admin -- import-knowledge <slug> <ruta.json>
 *   npm run admin -- list
 */
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pool, query, queryOne } from '../db.js';
import { encryptJson, generateApiKey } from '../lib/crypto.js';
import { AutoconfigError, generateBotBlueprint } from '../core/autoconfig.js';
import { chunkMarkdown, chunkText } from '../core/chunking.js';
import { replaceKnowledgeChunks } from '../core/rag.js';
import { embedTexts } from '../llm/embeddings.js';
import {
  TOOL_NAME_PATTERN,
  ToolConfigError,
  validateHttpToolConfig,
  type HttpToolConfig,
} from '../core/tools.js';

const PITA_TOLA_PROMPT = `Eres "{{assistant_name}}" (también conocida como "Pita Tola"), la asistente digital de {{business_name}}, en {{location}}.

Tu lema: "{{motto}}"

Hablas con retranca gallega: simpática, directa, cercana. Usas expresiones en gallego cuando pegan, sin forzarlas. No suenas como una IA fría, sino como una gallina muy lista con tablas en recepción.

Reglas:
- Respuestas cortas. Dos o tres frases salvo que te pidan detalle.
- Responde en el idioma en que te escriban (castellano, gallego o inglés).
- Si no sabes algo, dilo con gracia y ofrece a quién preguntar. Nunca te lo inventes.
- Nunca compartas datos personales de otros huéspedes.
- Si alguien pide hablar con una persona, dile que avisas a {{contact_name}}.`;

function usage(): never {
  console.log(`
Uso:
  npm run admin -- create-client <slug> "<Nombre>"
  npm run admin -- autoconfig <slug> "<descripción del negocio>" [opciones]
  npm run admin -- issue-key <slug> [etiqueta] [--scopes chat,handoff,proactive]
  npm run admin -- link-telegram <slug> <bot-token>
  npm run admin -- import-knowledge <slug> <ruta.json>
  npm run admin -- embed-knowledge <slug> <ruta.md|.txt> [--source <ref>]
  npm run admin -- add-tool <slug> <ruta.json>
  npm run admin -- list-tools <slug>
  npm run admin -- remove-tool <slug> <nombre>
  npm run admin -- set-handoff <slug> <https://url-del-webhook>
  npm run admin -- add-subagent <slug> <ruta.json>
  npm run admin -- list-subagents <slug>
  npm run admin -- set-feature <slug> <memoria|autocritica|handoff> <on|off>
  npm run admin -- list

Opciones de autoconfig:
  --apply                  Guarda el resultado. Sin esto solo enseña la vista previa.
  --provider <nombre>      anthropic | openai | ollama
  --model <id>
  --allow-override a,b     Variables que el cliente podrá sobrescribir por petición.
                           Vacío por defecto, a propósito.
`);
  process.exit(1);
}

/** Extrae --clave valor de argv y devuelve el resto como posicionales. */
function parseFlags(argv: string[]): { positional: string[]; flags: Map<string, string> } {
  const positional: string[] = [];
  const flags = new Map<string, string>();

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    const name = arg.slice(2);
    // --apply no lleva valor; el resto sí.
    if (name === 'apply') {
      flags.set(name, 'true');
      continue;
    }
    const value = argv[++i];
    if (value === undefined) {
      console.error(`❌ A la opción --${name} le falta el valor.`);
      process.exit(1);
    }
    flags.set(name, value);
  }

  return { positional, flags };
}

async function clientIdBySlug(slug: string): Promise<string> {
  const row = await queryOne<{ id: string }>(`SELECT id FROM clients WHERE slug = $1`, [slug]);
  if (!row) {
    console.error(`❌ No existe el cliente "${slug}". Créalo con: create-client ${slug} "Nombre"`);
    process.exit(1);
  }
  return row.id;
}

async function createClient(slug: string, name: string) {
  const existing = await queryOne(`SELECT 1 AS ok FROM clients WHERE slug = $1`, [slug]);
  if (existing) {
    console.error(`❌ Ya existe un cliente con el slug "${slug}".`);
    process.exit(1);
  }

  const client = await queryOne<{ id: string }>(
    `INSERT INTO clients (name, slug) VALUES ($1, $2) RETURNING id`,
    [name, slug],
  );
  const clientId = client!.id;

  await query(
    `INSERT INTO bot_configs
       (client_id, system_prompt_template, dynamic_variables, allowed_override_vars,
        provider, model, temperature, max_tokens, history_turns)
     VALUES ($1, $2, $3, $4, 'ollama', 'qwen2.5:32b', 0.8, 500, 8)`,
    [
      clientId,
      PITA_TOLA_PROMPT,
      JSON.stringify({
        assistant_name: 'Miss Pecky',
        business_name: name,
        location: 'Nigrán, Galicia',
        motto: '¡Miss Pecky sabe más por vieja que por gallina!',
        contact_name: 'el anfitrión',
      }),
      // Solo estas puede sobrescribirlas el cliente en la petición.
      ['guest_name', 'user_tier'],
    ],
  );

  console.log(`✅ Cliente creado: ${name} (${slug})`);
  console.log(`   id: ${clientId}`);
  console.log(`\nSiguiente paso:  npm run admin -- issue-key ${slug}`);
}

/**
 * Fase 1 — genera la configuración del bot a partir de una descripción y, si se
 * pide, la guarda.
 *
 * Por defecto no escribe nada. Un prompt del sistema es lo que ese cliente va a
 * decirle a sus huéspedes durante meses: se lee antes de guardarlo.
 */
async function autoconfig(slug: string, brief: string, flags: Map<string, string>) {
  const clientId = await clientIdBySlug(slug);
  const apply = flags.get('apply') === 'true';

  const requestedOverrides = (flags.get('allow-override') ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);

  console.log(`\n⏳ Generando la configuración de "${slug}"…`);
  console.log(`   proveedor: ${flags.get('provider') ?? '(por defecto)'}`);

  const blueprint = await generateBotBlueprint(brief, {
    provider: flags.get('provider'),
    model: flags.get('model'),
  });

  // El operador solo puede aprobar variables que existan; una que no exista
  // dejaría la lista blanca apuntando al vacío y el override se descartaría
  // en silencio en cada petición.
  const unknown = requestedOverrides.filter((v) => !(v in blueprint.variables));
  if (unknown.length > 0) {
    console.error(
      `\n❌ Estas variables de --allow-override no existen en la configuración: ${unknown.join(', ')}`,
    );
    console.error(`   Disponibles: ${Object.keys(blueprint.variables).join(', ')}`);
    process.exit(1);
  }

  console.log(`\n${'═'.repeat(72)}`);
  console.log(`ASISTENTE: ${blueprint.assistantName}`);
  console.log('═'.repeat(72));

  console.log('\n── Prompt compilado, tal como lo verá el modelo ──\n');
  console.log(blueprint.preview);

  console.log(`\n── Variables (${Object.keys(blueprint.variables).length}) ──\n`);
  for (const [key, value] of Object.entries(blueprint.variables)) {
    const shown = value.length > 70 ? `${value.slice(0, 67)}…` : value;
    console.log(`  ${key.padEnd(24)} ${shown}`);
  }

  if (blueprint.unusedVariables.length > 0) {
    console.log(`\n⚠️  Declaradas pero no usadas: ${blueprint.unusedVariables.join(', ')}`);
  }

  console.log('\n── Revisión pendiente ──\n');
  console.log(`  ${blueprint.notes}`);

  console.log('\n── Sobrescribibles desde la petición ──\n');
  if (blueprint.suggestedOverrideVars.length > 0) {
    console.log(`  Propuesta del modelo: ${blueprint.suggestedOverrideVars.join(', ')}`);
  } else {
    console.log('  El modelo no propuso ninguna.');
  }
  console.log(
    `  Se van a guardar:     ${requestedOverrides.length > 0 ? requestedOverrides.join(', ') : '(ninguna)'}`,
  );
  if (requestedOverrides.length === 0 && blueprint.suggestedOverrideVars.length > 0) {
    console.log(
      '\n  La propuesta no se aplica sola. Quien tenga la clave de API puede reescribir\n' +
        '  cualquier variable de esta lista en cada mensaje, así que la apruebas tú:\n' +
        `    --allow-override ${blueprint.suggestedOverrideVars.join(',')}`,
    );
  }

  const cost = (blueprint.usage.costMicros / 1_000_000).toFixed(4);
  console.log(
    `\n── Coste: ${blueprint.usage.promptTokens} + ${blueprint.usage.completionTokens} tokens ≈ ${cost} €\n`,
  );

  if (!apply) {
    console.log('ℹ️  Vista previa. Añade --apply para guardarlo en la base de datos.\n');
    return;
  }

  await query(
    `INSERT INTO bot_configs
       (client_id, name, system_prompt_template, dynamic_variables, allowed_override_vars)
     VALUES ($1, 'default', $2, $3, $4)
     ON CONFLICT (client_id, name)
       DO UPDATE SET system_prompt_template = EXCLUDED.system_prompt_template,
                     dynamic_variables      = EXCLUDED.dynamic_variables,
                     allowed_override_vars  = EXCLUDED.allowed_override_vars`,
    [clientId, blueprint.systemPromptTemplate, JSON.stringify(blueprint.variables), requestedOverrides],
  );

  console.log(`✅ Configuración guardada para "${slug}".`);
  console.log(`\nSiguiente paso:  npm run admin -- import-knowledge ${slug} <ruta.json>\n`);
}

/** Permisos que se pueden emitir. Cada uno abre un endpoint distinto. */
const SCOPES = ['chat', 'handoff', 'proactive'] as const;

async function issueKey(slug: string, label: string, flags: Map<string, string>) {
  const clientId = await clientIdBySlug(slug);
  const key = generateApiKey();

  // Por defecto solo 'chat'. Los otros dos permiten reabrir conversaciones y
  // programar mensajes a terceros, y la clave del chat suele acabar repartida
  // por el navegador de quien integra un widget en su web.
  const scopes = (flags.get('scopes') ?? 'chat')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const invalidos = scopes.filter((s) => !SCOPES.includes(s as (typeof SCOPES)[number]));
  if (invalidos.length > 0) {
    console.error(`❌ Permisos desconocidos: ${invalidos.join(', ')}`);
    console.error(`   Disponibles: ${SCOPES.join(', ')}`);
    process.exit(1);
  }

  await query(
    `INSERT INTO api_keys (client_id, prefix, key_hash, label, scopes)
     VALUES ($1, $2, $3, $4, $5)`,
    [clientId, key.prefix, key.hash, label, scopes],
  );

  console.log(`\n✅ Clave creada para "${slug}" con permisos: ${scopes.join(', ')}.`);
  console.log('\n   ' + key.full);
  console.log('\n⚠️  Cópiala ahora. En la base de datos solo queda el hash: no hay forma de');
  console.log('   recuperarla. Si se pierde, se revoca y se emite otra.\n');
}

async function linkTelegram(slug: string, botToken: string) {
  const clientId = await clientIdBySlug(slug);

  const res = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
  const data = (await res.json()) as {
    ok: boolean;
    description?: string;
    result?: { id: number; username: string; first_name: string };
  };
  if (!data.ok || !data.result) {
    console.error(`❌ Token de Telegram inválido: ${data.description ?? res.status}`);
    process.exit(1);
  }

  await query(
    `INSERT INTO channel_accounts (client_id, channel, external_id, display_name, credentials)
     VALUES ($1, 'telegram', $2, $3, $4)
     ON CONFLICT (channel, external_id)
       DO UPDATE SET credentials = EXCLUDED.credentials,
                     client_id   = EXCLUDED.client_id,
                     is_active   = TRUE`,
    [clientId, String(data.result.id), data.result.first_name, encryptJson({ botToken })],
  );

  console.log(`✅ Telegram enlazado: @${data.result.username} → ${slug}`);
  console.log(`   Arranca el servicio con "npm run dev" y escríbele por Telegram.`);
}

async function importKnowledge(slug: string, path: string) {
  const clientId = await clientIdBySlug(slug);
  const raw = JSON.parse(await readFile(path, 'utf8')) as Array<{
    type?: string;
    name: string;
    description: string;
    location?: string;
    keywords?: string[];
  }>;

  const entries = Array.isArray(raw) ? raw : [raw];
  await query(`DELETE FROM knowledge_entries WHERE client_id = $1`, [clientId]);

  for (const entry of entries) {
    await query(
      `INSERT INTO knowledge_entries (client_id, kind, title, body, keywords, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        clientId,
        entry.type ?? null,
        entry.name,
        entry.description,
        entry.keywords ?? [],
        JSON.stringify(entry.location ? { location: entry.location } : {}),
      ],
    );
  }

  console.log(`✅ ${entries.length} entradas importadas para "${slug}".`);
}

// ── Fase 3: herramientas ─────────────────────────────────────────

interface ToolDefinitionFile {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  http: HttpToolConfig;
}

/**
 * Alta desde un fichero JSON en vez de por argumentos: una herramienta lleva
 * esquema de entrada y cabeceras, y eso no cabe en una línea de comandos sin
 * volverse ilegible. Además el fichero se puede versionar aparte del secreto.
 */
async function addTool(slug: string, path: string) {
  const clientId = await clientIdBySlug(slug);
  const def = JSON.parse(await readFile(path, 'utf8')) as ToolDefinitionFile;

  if (!TOOL_NAME_PATTERN.test(def.name ?? '')) {
    console.error(
      `❌ El nombre "${def.name}" no vale. Los proveedores exigen ^[a-z][a-z0-9_]{0,63}$.`,
    );
    process.exit(1);
  }
  if (!def.description?.trim()) {
    console.error(
      '❌ Falta la descripción. Es lo único con lo que el modelo decide si llamar a esto ' +
        'o no, así que escribe cuándo usarla, no solo qué hace.',
    );
    process.exit(1);
  }
  if (!def.input_schema || typeof def.input_schema !== 'object') {
    console.error('❌ Falta input_schema (JSON Schema del objeto de entrada).');
    process.exit(1);
  }

  // Revienta aquí, mientras hay un humano delante que puede corregirlo, y no a
  // mitad de una conversación con un huésped.
  validateHttpToolConfig(def.http);

  await query(
    `INSERT INTO tools (client_id, name, description, input_schema, kind, config)
     VALUES ($1, $2, $3, $4, 'http', $5)
     ON CONFLICT (client_id, name)
       DO UPDATE SET description  = EXCLUDED.description,
                     input_schema = EXCLUDED.input_schema,
                     config       = EXCLUDED.config,
                     is_active    = TRUE`,
    [clientId, def.name, def.description, JSON.stringify(def.input_schema), encryptJson(def.http)],
  );

  console.log(`✅ Herramienta "${def.name}" registrada para "${slug}".`);
  console.log(`   ${def.http.method} ${new URL(def.http.url).origin}`);
  console.log('\n   Las cabeceras y la URL van cifradas: el modelo solo ve nombre,');
  console.log('   descripción y esquema de entrada.\n');
}

async function listTools(slug: string) {
  const clientId = await clientIdBySlug(slug);
  const rows = await query<{ name: string; description: string; is_active: boolean }>(
    `SELECT name, description, is_active FROM tools WHERE client_id = $1 ORDER BY name`,
    [clientId],
  );

  if (rows.length === 0) {
    console.log(`Sin herramientas en "${slug}". Añade una con: add-tool ${slug} <ruta.json>`);
    return;
  }

  for (const r of rows) {
    const estado = r.is_active ? '●' : '○';
    console.log(`${estado} ${r.name}\n    ${r.description}\n`);
  }
}

async function removeTool(slug: string, name: string) {
  const clientId = await clientIdBySlug(slug);
  // Baja lógica: las filas de tool_invocations la referencian y su histórico
  // de costes y errores sigue siendo útil después de retirarla.
  const rows = await query(
    `UPDATE tools SET is_active = FALSE WHERE client_id = $1 AND name = $2 RETURNING id`,
    [clientId, name],
  );

  if (rows.length === 0) {
    console.error(`❌ "${slug}" no tiene ninguna herramienta llamada "${name}".`);
    process.exit(1);
  }
  console.log(`✅ Herramienta "${name}" desactivada. El histórico de llamadas se conserva.`);
}

// ── RAG vectorial ────────────────────────────────────────────────

/**
 * Trocea un documento, lo vectoriza y lo guarda.
 *
 * El `source_ref` (por defecto la ruta del fichero) identifica el documento:
 * reindexarlo borra sus fragmentos anteriores en vez de acumular duplicados.
 */
async function embedKnowledge(slug: string, path: string, flags: Map<string, string>) {
  const clientId = await clientIdBySlug(slug);
  const sourceRef = flags.get('source') ?? path;
  const raw = await readFile(path, 'utf8');

  const chunks = path.endsWith('.md') ? chunkMarkdown(raw) : chunkText(raw);
  if (chunks.length === 0) {
    console.error('❌ El documento está vacío.');
    process.exit(1);
  }

  console.log(`\n⏳ ${chunks.length} fragmentos. Vectorizando…`);

  const { vectors, promptTokens, costMicros, model } = await embedTexts(chunks.map((c) => c.text));

  await replaceKnowledgeChunks(
    clientId,
    sourceRef,
    chunks.map((chunk, i) => ({
      // El título es la primera línea del fragmento, recortada. Se enseña al
      // modelo junto al cuerpo, así que conviene que diga algo.
      title: chunk.text.split('\n')[0]!.replace(/^#+\s*/, '').slice(0, 120) || `Fragmento ${i + 1}`,
      body: chunk.text,
      embedding: vectors[i]!,
      index: chunk.index,
      metadata: { source: sourceRef, chunk: chunk.index, total: chunks.length },
    })),
    model,
  );

  const euros = (costMicros / 1_000_000).toFixed(5);
  console.log(`✅ ${chunks.length} fragmentos vectorizados para "${slug}".`);
  console.log(`   fuente: ${sourceRef}`);
  console.log(`   modelo: ${model} · ${promptTokens} tokens ≈ ${euros} €\n`);
}

// ── Handoff ──────────────────────────────────────────────────────

async function setHandoff(slug: string, url: string) {
  const clientId = await clientIdBySlug(slug);

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    console.error(`❌ "${url}" no es una URL válida.`);
    process.exit(1);
  }
  if (parsed.protocol !== 'https:') {
    console.error(
      '❌ El webhook tiene que ser https: por ahí viaja el resumen de la conversación.',
    );
    process.exit(1);
  }

  // Secreto de firma nuevo en cada configuración. Se enseña una sola vez, como
  // las claves de API: en la base de datos queda cifrado.
  const secret = randomBytes(32).toString('base64url');

  await query(`UPDATE clients SET webhook_handoff_url = $2, webhook_secret = $3 WHERE id = $1`, [
    clientId,
    url,
    encryptJson({ secret }),
  ]);

  console.log(`\n✅ Webhook de handoff configurado para "${slug}".`);
  console.log(`   ${url}`);
  console.log(`\n   Secreto de firma (cópialo ahora, no se vuelve a mostrar):\n`);
  console.log(`   ${secret}\n`);
  console.log('   Verificación en el receptor:');
  console.log('     firma = HMAC-SHA256(secreto, `${x-pita-timestamp}.${cuerpo_crudo}`)');
  console.log('     compara en tiempo constante con la cabecera x-pita-signature');
  console.log('     rechaza lo que llegue con más de 5 minutos de antigüedad\n');
}

// ── Sub-agentes especialistas ────────────────────────────────────

interface SubAgentFile {
  name: string;
  description: string;
  system_prompt: string;
  tool_names?: string[];
  provider?: string;
  model?: string;
  temperature?: number;
  max_tokens?: number;
  max_iterations?: number;
}

/**
 * Alta desde JSON, como las herramientas: un especialista lleva prompt del
 * sistema y lista de herramientas, y eso no cabe en una línea de comandos.
 */
async function addSubAgent(slug: string, path: string) {
  const clientId = await clientIdBySlug(slug);
  const def = JSON.parse(await readFile(path, 'utf8')) as SubAgentFile;

  if (!TOOL_NAME_PATTERN.test(def.name ?? '')) {
    console.error(
      `❌ El nombre "${def.name}" no vale: acaba dentro de un enum de esquema JSON. ` +
        'Usa ^[a-z][a-z0-9_]{0,63}$.',
    );
    process.exit(1);
  }
  if (!def.description?.trim()) {
    console.error(
      '❌ Falta la descripción. Es lo único con lo que el orquestador decide a quién ' +
        'delegar: escribe QUÉ se le puede encargar, no quién es.',
    );
    process.exit(1);
  }
  if (!def.system_prompt?.trim()) {
    console.error('❌ Falta system_prompt.');
    process.exit(1);
  }

  // Aviso, no error: la herramienta puede darse de alta después. Pero un
  // especialista sin sus herramientas falla de una forma que cuesta entender.
  const nombres = def.tool_names ?? [];
  if (nombres.length > 0) {
    const existentes = await query<{ name: string }>(
      `SELECT name FROM tools WHERE client_id = $1 AND is_active AND name = ANY($2::text[])`,
      [clientId, nombres],
    );
    const faltan = nombres.filter((n) => !existentes.some((e) => e.name === n));
    if (faltan.length > 0) {
      console.log(`⚠️  Herramientas que aún no existen: ${faltan.join(', ')}`);
      console.log('   El especialista funcionará sin ellas hasta que las des de alta.\n');
    }
  }

  await query(
    `INSERT INTO sub_agents
       (client_id, name, description, system_prompt, tool_names,
        provider, model, temperature, max_tokens, max_iterations)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (client_id, name)
       DO UPDATE SET description = EXCLUDED.description,
                     system_prompt = EXCLUDED.system_prompt,
                     tool_names = EXCLUDED.tool_names,
                     provider = EXCLUDED.provider,
                     model = EXCLUDED.model,
                     temperature = EXCLUDED.temperature,
                     max_tokens = EXCLUDED.max_tokens,
                     max_iterations = EXCLUDED.max_iterations,
                     is_active = TRUE`,
    [
      clientId,
      def.name,
      def.description,
      def.system_prompt,
      nombres,
      def.provider ?? null,
      def.model ?? null,
      def.temperature ?? null,
      def.max_tokens ?? null,
      def.max_iterations ?? 3,
    ],
  );

  console.log(`✅ Especialista "${def.name}" registrado para "${slug}".`);
  console.log(`   herramientas: ${nombres.join(', ') || '(ninguna)'}\n`);
}

async function listSubAgents(slug: string) {
  const clientId = await clientIdBySlug(slug);
  const rows = await query<{
    name: string;
    description: string;
    tool_names: string[];
    is_active: boolean;
  }>(
    `SELECT name, description, tool_names, is_active FROM sub_agents
      WHERE client_id = $1 ORDER BY name`,
    [clientId],
  );

  if (rows.length === 0) {
    console.log(`Sin especialistas en "${slug}". Añade uno con: add-subagent ${slug} <ruta.json>`);
    return;
  }

  for (const r of rows) {
    console.log(`${r.is_active ? '●' : '○'} ${r.name}`);
    console.log(`    ${r.description}`);
    console.log(`    herramientas: ${r.tool_names.join(', ') || '(ninguna)'}\n`);
  }
}

/** Enciende o apaga capas opcionales por cliente. */
async function setFeature(slug: string, feature: string, value: string) {
  const clientId = await clientIdBySlug(slug);

  const COLUMNS: Record<string, string> = {
    memoria: 'memory_enabled',
    autocritica: 'reflection_enabled',
    handoff: 'handoff_enabled',
  };

  const column = COLUMNS[feature];
  if (!column) {
    console.error(`❌ Capa desconocida: "${feature}". Disponibles: ${Object.keys(COLUMNS).join(', ')}`);
    process.exit(1);
  }

  const enabled = value === 'on' || value === 'true' || value === 'si';

  await query(
    `UPDATE bot_configs SET ${column} = $2 WHERE client_id = $1 AND name = 'default'`,
    [clientId, enabled],
  );

  console.log(`✅ ${feature} = ${enabled ? 'activada' : 'desactivada'} para "${slug}".`);
  if (feature === 'autocritica' && enabled) {
    console.log(
      '\n⚠️  La autocrítica añade una llamada completa al modelo por turno, y dos o\n' +
        '   tres si el borrador se rechaza. Es secuencial: el usuario espera. Conviene\n' +
        '   configurar reflection_model con uno más rápido y barato que el del bot.\n',
    );
  }
}

async function list() {
  const rows = await query<{
    slug: string;
    name: string;
    is_active: boolean;
    keys: number;
    entries: number;
    channels: string | null;
  }>(
    `SELECT c.slug, c.name, c.is_active,
            (SELECT COUNT(*) FROM api_keys k
              WHERE k.client_id = c.id AND k.revoked_at IS NULL)::int AS keys,
            (SELECT COUNT(*) FROM knowledge_entries e WHERE e.client_id = c.id)::int AS entries,
            (SELECT string_agg(DISTINCT a.channel::text, ', ') FROM channel_accounts a
              WHERE a.client_id = c.id AND a.is_active) AS channels
       FROM clients c
      ORDER BY c.created_at`,
  );

  if (rows.length === 0) {
    console.log('Sin clientes todavía. Crea uno con: npm run admin -- create-client <slug> "Nombre"');
    return;
  }

  console.table(
    rows.map((r) => ({
      slug: r.slug,
      nombre: r.name,
      activo: r.is_active ? 'sí' : 'no',
      claves: r.keys,
      conocimiento: r.entries,
      canales: r.channels ?? '—',
    })),
  );
}

const [command, ...rawArgs] = process.argv.slice(2);
const { positional: args, flags } = parseFlags(rawArgs);

try {
  switch (command) {
    case 'create-client':
      if (args.length < 2) usage();
      await createClient(args[0]!, args[1]!);
      break;
    case 'autoconfig':
      if (args.length < 2) usage();
      await autoconfig(args[0]!, args[1]!, flags);
      break;
    case 'issue-key':
      if (args.length < 1) usage();
      await issueKey(args[0]!, args[1] ?? 'default', flags);
      break;
    case 'link-telegram':
      if (args.length < 2) usage();
      await linkTelegram(args[0]!, args[1]!);
      break;
    case 'import-knowledge':
      if (args.length < 2) usage();
      await importKnowledge(args[0]!, args[1]!);
      break;
    case 'embed-knowledge':
      if (args.length < 2) usage();
      await embedKnowledge(args[0]!, args[1]!, flags);
      break;
    case 'set-handoff':
      if (args.length < 2) usage();
      await setHandoff(args[0]!, args[1]!);
      break;
    case 'add-subagent':
      if (args.length < 2) usage();
      await addSubAgent(args[0]!, args[1]!);
      break;
    case 'list-subagents':
      if (args.length < 1) usage();
      await listSubAgents(args[0]!);
      break;
    case 'set-feature':
      if (args.length < 3) usage();
      await setFeature(args[0]!, args[1]!, args[2]!);
      break;
    case 'add-tool':
      if (args.length < 2) usage();
      await addTool(args[0]!, args[1]!);
      break;
    case 'list-tools':
      if (args.length < 1) usage();
      await listTools(args[0]!);
      break;
    case 'remove-tool':
      if (args.length < 2) usage();
      await removeTool(args[0]!, args[1]!);
      break;
    case 'list':
      await list();
      break;
    default:
      usage();
  }
} catch (err) {
  // Un fallo de generación es una condición esperada, no un bug: el mensaje
  // dice qué incumplió la plantilla. La traza no aporta nada aquí.
  if (err instanceof AutoconfigError || err instanceof ToolConfigError) {
    console.error(`\n❌ ${err.message}\n`);
    process.exitCode = 1;
  } else {
    throw err;
  }
} finally {
  await pool.end();
}

/**
 * CLI de administración.
 *
 *   npm run admin -- create-client <slug> "<Nombre>"
 *   npm run admin -- issue-key <slug> [etiqueta]
 *   npm run admin -- link-telegram <slug> <bot-token>
 *   npm run admin -- import-knowledge <slug> <ruta.json>
 *   npm run admin -- list
 */
import { readFile } from 'node:fs/promises';
import { pool, query, queryOne } from '../db.js';
import { encryptJson, generateApiKey } from '../lib/crypto.js';

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
  npm run admin -- issue-key <slug> [etiqueta]
  npm run admin -- link-telegram <slug> <bot-token>
  npm run admin -- import-knowledge <slug> <ruta.json>
  npm run admin -- list
`);
  process.exit(1);
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

async function issueKey(slug: string, label: string) {
  const clientId = await clientIdBySlug(slug);
  const key = generateApiKey();

  await query(
    `INSERT INTO api_keys (client_id, prefix, key_hash, label, scopes)
     VALUES ($1, $2, $3, $4, ARRAY['chat'])`,
    [clientId, key.prefix, key.hash, label],
  );

  console.log(`\n✅ Clave creada para "${slug}".`);
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

const [command, ...args] = process.argv.slice(2);

try {
  switch (command) {
    case 'create-client':
      if (args.length < 2) usage();
      await createClient(args[0]!, args[1]!);
      break;
    case 'issue-key':
      if (args.length < 1) usage();
      await issueKey(args[0]!, args[1] ?? 'default');
      break;
    case 'link-telegram':
      if (args.length < 2) usage();
      await linkTelegram(args[0]!, args[1]!);
      break;
    case 'import-knowledge':
      if (args.length < 2) usage();
      await importKnowledge(args[0]!, args[1]!);
      break;
    case 'list':
      await list();
      break;
    default:
      usage();
  }
} finally {
  await pool.end();
}

/**
 * CLI de captación.
 *
 *   npm run outreach -- apollo-search  <slug> --titles "..." --locations "..."
 *   npm run outreach -- apollo-import  <slug> --segment <v> --titles "..." [--max N]
 *   npm run outreach -- make-campaigns <slug> <pipeline.json>
 *   npm run outreach -- list-campaigns <slug>
 *   npm run outreach -- approve-campaign <slug> <campaña> "<quien aprueba>"
 *   npm run outreach -- run-campaign <slug> <campaña> [--live] [--limit N]
 *   npm run outreach -- suppress <slug> <email> [motivo]
 *   npm run outreach -- stats <slug>
 */
import { readFile } from 'node:fs/promises';
import { config } from '../config.js';
import { pool, query, queryOne } from '../db.js';
import { batchIds, enrichPeople, searchPeople, ApolloError } from '../outreach/apollo.js';
import { runCampaign } from '../outreach/campaign.js';

function usage(): never {
  console.log(`
Uso:
  npm run outreach -- apollo-search  <slug> --titles "CEO,Director" [--locations "Spain"] [--seniorities "c_suite,vp"]
  npm run outreach -- apollo-import  <slug> --segment <vertical> --titles "..." [--locations "..."] [--max 100]
  npm run outreach -- make-campaigns <slug> <pipeline.json>
  npm run outreach -- list-campaigns <slug>
  npm run outreach -- approve-campaign <slug> <campaña> "<quien aprueba>"
  npm run outreach -- run-campaign <slug> <campaña> [--live] [--limit N]
  npm run outreach -- suppress <slug> <email> [motivo]
  npm run outreach -- stats <slug>
`);
  process.exit(1);
}

function parseFlags(argv: string[]) {
  const positional: string[] = [];
  const flags = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith('--')) { positional.push(a); continue; }
    const name = a.slice(2);
    if (name === 'live') { flags.set(name, 'true'); continue; }
    const v = argv[++i];
    if (v === undefined) { console.error(`❌ Falta el valor de --${name}`); process.exit(1); }
    flags.set(name, v);
  }
  return { positional, flags };
}

const list = (s?: string) => (s ? s.split(',').map((x) => x.trim()).filter(Boolean) : undefined);

async function clientIdBySlug(slug: string): Promise<string> {
  const row = await queryOne<{ id: string }>(`SELECT id FROM clients WHERE slug=$1`, [slug]);
  if (!row) { console.error(`❌ No existe el cliente "${slug}".`); process.exit(1); }
  return row.id;
}

/** Búsqueda a coste cero: sirve para dimensionar antes de gastar créditos. */
async function apolloSearch(slug: string, flags: Map<string, string>) {
  await clientIdBySlug(slug);
  const res = await searchPeople({
    personTitles: list(flags.get('titles')),
    personSeniorities: list(flags.get('seniorities')),
    personLocations: list(flags.get('locations')),
    organizationLocations: list(flags.get('org-locations')),
    perPage: 100,
  });

  const conEmail = res.people.filter((p) => p.hasEmail).length;
  console.log(`\n  Resultados totales: ${res.totalEntries}  (${res.totalPages} páginas)`);
  console.log(`  En esta página: ${res.people.length}, con email: ${conEmail}`);
  console.log(`  Créditos consumidos por esta búsqueda: 0\n`);
  console.log(`  Enriquecer los ${conEmail} de esta página costaría ~${conEmail} créditos.`);
  console.log(`  Enriquecer los ${res.totalEntries} costaría como mucho ~${res.totalEntries}.\n`);

  for (const p of res.people.slice(0, 8)) {
    console.log(`   ${p.hasEmail ? '✉ ' : '· '} ${p.firstName ?? '?'} ${p.lastNameObfuscated ?? ''} — ${p.title ?? '?'} @ ${p.organisation ?? '?'}`);
  }
  if (res.people.length > 8) console.log(`   … y ${res.people.length - 8} más`);
}

/** Busca, filtra por has_email y enriquece solo a esos. */
async function apolloImport(slug: string, flags: Map<string, string>) {
  const clientId = await clientIdBySlug(slug);
  const segment = flags.get('segment');
  if (!segment) { console.error('❌ Falta --segment'); process.exit(1); }

  const max = Math.min(
    Number(flags.get('max') ?? 100),
    config.APOLLO_MAX_ENRICH_PER_RUN,
  );

  const found: { id: string }[] = [];
  for (let page = 1; found.length < max && page <= 5; page++) {
    const res = await searchPeople({
      personTitles: list(flags.get('titles')),
      personSeniorities: list(flags.get('seniorities')),
      personLocations: list(flags.get('locations')),
      organizationLocations: list(flags.get('org-locations')),
      page,
      perPage: 100,
    });
    // Solo los que Apollo ya dice que tienen email: el resto gastaría crédito
    // para devolver nada.
    for (const p of res.people) if (p.hasEmail && found.length < max) found.push({ id: p.id });
    if (page >= res.totalPages) break;
  }

  console.log(`\n  Candidatos con email: ${found.length}`);
  console.log(`  Coste estimado: ~${found.length} créditos (1 por email encontrado)\n`);

  let inserted = 0, sinEmail = 0, yaEstaban = 0;
  for (const batch of batchIds(found.map((f) => f.id))) {
    const people = await enrichPeople(batch);
    for (const p of people) {
      if (!p.email || p.email.includes('email_not_unlocked')) { sinEmail++; continue; }
      const row = await queryOne<{ id: string }>(
        `INSERT INTO prospects
           (client_id, email, display_name, organisation, role_title, segments, source, legal_basis, attributes)
         VALUES ($1,$2,$3,$4,$5,$6,'apollo','legitimate_interest',$7)
         ON CONFLICT (client_id, email) DO NOTHING
         RETURNING id`,
        [
          clientId,
          p.email.toLowerCase(),
          p.name ?? ([p.firstName, p.lastName].filter(Boolean).join(" ") || null),
          p.organisation,
          p.title,
          [segment],
          JSON.stringify({ apollo_id: p.id, linkedin: p.linkedinUrl, country: p.country }),
        ],
      );
      if (row) inserted++; else yaEstaban++;
    }
  }

  console.log(`  ✅ Nuevos prospectos: ${inserted}`);
  console.log(`     Ya estaban: ${yaEstaban}   Sin email tras enriquecer: ${sinEmail}\n`);
}

/** Genera un borrador de campaña por vertical del pipeline. */
async function makeCampaigns(slug: string, pipelinePath: string) {
  const clientId = await clientIdBySlug(slug);
  const kb = JSON.parse(await readFile(pipelinePath, 'utf8')) as Array<{
    type: string; name: string; description: string;
  }>;

  const porVertical = new Map<string, typeof kb>();
  for (const e of kb) {
    if (!porVertical.has(e.type)) porVertical.set(e.type, []);
    porVertical.get(e.type)!.push(e);
  }

  const from = config.OUTREACH_FROM_EMAIL ?? 'pendiente@configurar.example';

  for (const [vertical, ops] of porVertical) {
    // El cuerpo se queda a nivel de vertical y estado: identificar activos
    // rompería el documento ciego, que es justo lo que protege al cliente.
    const resumen = ops
      .map((o) => {
        const geo = /Ubicacion: ([^.]+)\./.exec(o.description)?.[1] ?? '';
        const tipo = /Tipo de operacion: ([^.]+)\./.exec(o.description)?.[1] ?? '';
        return `  · ${tipo}${geo ? ` — ${geo}` : ''}`;
      })
      .join('\n');

    const body = `Estimado/a {{first_name}}:

Le escribo desde Zenith Rise Capital. Trabajamos mandatos de compraventa y de levantamiento de capital, y en este momento tenemos ${ops.length} ${ops.length === 1 ? 'expediente' : 'expedientes'} en el vertical de ${vertical.toLowerCase()}:

${resumen}

Es un resumen ciego: no identifica activos, sociedades ni contrapartes, y cualquier cifra sería orientativa y no vinculante. El detalle se comparte únicamente tras firmar confidencialidad.

Si el perfil encaja con su tesis de inversión, respóndame indicando rango de ticket y geografía de interés y le hago llegar el material correspondiente. Si no encaja, dígamelo y no le vuelvo a escribir.

Un saludo,
${config.OUTREACH_FROM_NAME}`;

    await query(
      `INSERT INTO campaigns
         (client_id, name, segment, subject, body_template, from_name, from_email, reply_to, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'draft')
       ON CONFLICT (client_id, name) DO UPDATE
         SET subject=EXCLUDED.subject, body_template=EXCLUDED.body_template, status='draft'`,
      [
        clientId,
        `zrc-${vertical.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
        vertical,
        `${vertical} — ${ops.length} ${ops.length === 1 ? 'operación' : 'operaciones'} en cartera`,
        body,
        config.OUTREACH_FROM_NAME,
        from,
        config.OUTREACH_REPLY_TO ?? null,
      ],
    );
    console.log(`  ✅ ${vertical}: campaña generada (${ops.length} operaciones) — estado draft`);
  }
  console.log(`\n  Revísalas con: npm run outreach -- list-campaigns ${slug}`);
}

async function listCampaigns(slug: string) {
  const clientId = await clientIdBySlug(slug);
  const rows = await query<{ name: string; segment: string; subject: string; status: string; approved_by: string | null }>(
    `SELECT name, segment, subject, status, approved_by FROM campaigns WHERE client_id=$1 ORDER BY name`,
    [clientId],
  );
  if (rows.length === 0) { console.log('  Sin campañas.'); return; }
  console.table(rows.map((r) => ({ campaña: r.name, segmento: r.segment, asunto: r.subject, estado: r.status, aprobó: r.approved_by ?? '—' })));
}

async function approveCampaign(slug: string, name: string, who: string) {
  const clientId = await clientIdBySlug(slug);
  const row = await queryOne<{ id: string; body_template: string; subject: string }>(
    `SELECT id, body_template, subject FROM campaigns WHERE client_id=$1 AND name=$2`,
    [clientId, name],
  );
  if (!row) { console.error(`❌ No existe la campaña "${name}".`); process.exit(1); }

  console.log(`\n── Asunto ──\n${row.subject}\n`);
  console.log(`── Cuerpo ──\n${row.body_template}\n`);
  await query(
    `UPDATE campaigns SET status='approved', approved_by=$2, approved_at=NOW() WHERE id=$1`,
    [row.id, who],
  );
  console.log(`✅ Aprobada por ${who}. Ya se puede ejecutar.`);
}

async function doRunCampaign(slug: string, name: string, flags: Map<string, string>) {
  const clientId = await clientIdBySlug(slug);
  const row = await queryOne<{ id: string }>(
    `SELECT id FROM campaigns WHERE client_id=$1 AND name=$2`, [clientId, name],
  );
  if (!row) { console.error(`❌ No existe la campaña "${name}".`); process.exit(1); }

  const wantsLive = flags.get('live') === 'true';
  if (wantsLive && !config.OUTREACH_LIVE) {
    console.error('❌ --live pero OUTREACH_LIVE=false en el .env. Es el interruptor general: cámbialo a mano.');
    process.exit(1);
  }

  const summary = await runCampaign(row.id, {
    dryRun: !wantsLive,
    limit: flags.get('limit') ? Number(flags.get('limit')) : undefined,
  });

  console.log(`\n  Campaña: ${summary.campaign}`);
  console.log(`  Modo: ${summary.live ? '🔴 ENVÍO REAL' : '🟢 ensayo (no sale nada)'}`);
  console.log(`  Candidatos: ${summary.candidates}`);
  console.log(`  Enviados: ${summary.sent}   Omitidos: ${summary.skipped}   Fallidos: ${summary.failed}`);
  if (Object.keys(summary.skipReasons).length) console.log(`  Motivos de omisión:`, summary.skipReasons);
  console.log();
}

async function suppress(slug: string, email: string, reason: string) {
  const clientId = await clientIdBySlug(slug);
  await query(
    `INSERT INTO suppression (client_id, email, reason) VALUES ($1,$2,$3)
     ON CONFLICT (client_id, email) DO NOTHING`,
    [clientId, email.toLowerCase(), reason],
  );
  await query(`UPDATE prospects SET status='closed' WHERE client_id=$1 AND lower(email)=lower($2)`, [clientId, email]);
  console.log(`✅ ${email} suprimido (${reason}). No recibirá nada más.`);
}

async function stats(slug: string) {
  const clientId = await clientIdBySlug(slug);
  const p = await queryOne<{ total: number; activos: number; segmentos: string }>(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE status='active')::int AS activos,
            coalesce(string_agg(DISTINCT s, ', '), '—') AS segmentos
       FROM prospects, unnest(coalesce(segments, ARRAY['']::text[])) AS s
      WHERE client_id=$1`, [clientId],
  );
  const s = await queryOne<{ n: number }>(`SELECT count(*)::int AS n FROM suppression WHERE client_id=$1`, [clientId]);
  const envios = await query<{ status: string; n: number }>(
    `SELECT cs.status, count(*)::int AS n FROM campaign_sends cs
       JOIN campaigns c ON c.id=cs.campaign_id WHERE c.client_id=$1 GROUP BY 1`, [clientId],
  );

  console.log(`\n  Prospectos: ${p?.total ?? 0} (activos: ${p?.activos ?? 0})`);
  console.log(`  Segmentos: ${p?.segmentos ?? '—'}`);
  console.log(`  Lista de supresión: ${s?.n ?? 0}`);
  console.log(`  Envíos: ${envios.length ? envios.map((e) => `${e.status}=${e.n}`).join('  ') : '—'}\n`);
}

const [command, ...rest] = process.argv.slice(2);
const { positional, flags } = parseFlags(rest);

try {
  switch (command) {
    case 'apollo-search':    if (!positional[0]) usage(); await apolloSearch(positional[0], flags); break;
    case 'apollo-import':    if (!positional[0]) usage(); await apolloImport(positional[0], flags); break;
    case 'make-campaigns':   if (positional.length < 2) usage(); await makeCampaigns(positional[0]!, positional[1]!); break;
    case 'list-campaigns':   if (!positional[0]) usage(); await listCampaigns(positional[0]); break;
    case 'approve-campaign': if (positional.length < 3) usage(); await approveCampaign(positional[0]!, positional[1]!, positional[2]!); break;
    case 'run-campaign':     if (positional.length < 2) usage(); await doRunCampaign(positional[0]!, positional[1]!, flags); break;
    case 'suppress':         if (positional.length < 2) usage(); await suppress(positional[0]!, positional[1]!, positional[2] ?? 'manual'); break;
    case 'stats':            if (!positional[0]) usage(); await stats(positional[0]); break;
    default: usage();
  }
} catch (err) {
  if (err instanceof ApolloError) console.error(`\n❌ Apollo: ${err.message}\n`);
  else console.error(`\n❌ ${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
} finally {
  await pool.end();
}

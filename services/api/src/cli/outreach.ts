/**
 * CLI de captación.
 *
 *   npm run outreach -- import-csv      <slug> <lista.csv> --segmento <v> [--fuente apollo-ui]
  npm run outreach -- import-accounts <slug> <accounts.json> [--prioridad 1] [--paginas 1] [--live]
  npm run outreach -- prune-accounts  <slug>
  npm run outreach -- list-accounts   <slug> [--segmento <v>] [--limite 40]
  npm run outreach -- plan           <slug> <segments.json> [--creditos 95]
  npm run outreach -- apollo-search  <slug> --titles "..." --locations "..."
 *   npm run outreach -- apollo-import  <slug> --segment <v> --titles "..." [--max N]
 *   npm run outreach -- make-deal-campaigns <slug> <deals.json> --firmante "Nombre, cargo"
  npm run outreach -- make-campaigns <slug> <pipeline.json>
 *   npm run outreach -- list-campaigns <slug>
 *   npm run outreach -- approve-campaign <slug> <campaña> "<quien aprueba>"
 *   npm run outreach -- run-campaign <slug> <campaña> [--live] [--limit N]
 *   npm run outreach -- suppress <slug> <email> [motivo]
 *   npm run outreach -- stats <slug>
 */
import { readFile } from 'node:fs/promises';
import { config } from '../config.js';
import { pool, query, queryOne } from '../db.js';
import {
  batchIds, enrichPeople, searchPeople, searchOrganisations, matchesIndustry,
  SECTORES_EXCLUIDOS_POR_DEFECTO, ApolloError,
} from '../outreach/apollo.js';
import { runCampaign } from '../outreach/campaign.js';
import { datoDuroDe } from '../outreach/subject.js';

function usage(): never {
  console.log(`
Uso:
  npm run outreach -- import-csv      <slug> <lista.csv> --segmento <v> [--fuente apollo-ui]
  npm run outreach -- import-accounts <slug> <accounts.json> [--prioridad 1] [--paginas 1] [--live]
  npm run outreach -- prune-accounts  <slug>
  npm run outreach -- list-accounts   <slug> [--segmento <v>] [--limite 40]
  npm run outreach -- plan           <slug> <segments.json> [--creditos 95]
  npm run outreach -- apollo-search  <slug> --titles "CEO,Director" [--locations "Spain"] [--seniorities "c_suite,vp"]
  npm run outreach -- apollo-import  <slug> --segment <vertical> --titles "..." [--locations "..."] [--max 100]
  npm run outreach -- make-deal-campaigns <slug> <deals.json> --firmante "Nombre, cargo"
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


interface SegmentFile {
  [vertical: string]: {
    prioridad: number;
    operaciones_en_mercado: number;
    perfil: string;
    busquedas: Array<{
      nombre: string;
      person_titles?: string[];
      person_seniorities?: string[];
      person_locations?: string[];
      organization_locations?: string[];
    }>;
  };
}

/**
 * Dimensiona todas las búsquedas sin gastar créditos.
 *
 * La búsqueda de Apollo es gratuita y ya devuelve `has_email`, así que se puede
 * saber cuánto costaría una campaña antes de pagarla. Con un saldo pequeño esto
 * no es una comodidad: es la diferencia entre cubrir las operaciones que están
 * en mercado o quedarse sin créditos en la primera búsqueda amplia.
 */
async function plan(slug: string, path: string, flags: Map<string, string>) {
  await clientIdBySlug(slug);
  const raw = JSON.parse(await readFile(path, 'utf8')) as SegmentFile;
  const presupuesto = Number(flags.get('creditos') ?? 0);

  const filas: Array<{
    vertical: string; prioridad: number; enMercado: number;
    busqueda: string; total: number; conEmailPagina: number; ratio: number;
  }> = [];

  for (const [vertical, cfg] of Object.entries(raw)) {
    if (vertical.startsWith('_')) continue;
    for (const b of cfg.busquedas) {
      try {
        const res = await searchPeople({
          personTitles: b.person_titles,
          personSeniorities: b.person_seniorities,
          personLocations: b.person_locations,
          organizationLocations: b.organization_locations,
          perPage: 100,
        });
        const conEmail = res.people.filter((p) => p.hasEmail).length;
        const ratio = res.people.length ? conEmail / res.people.length : 0;
        filas.push({
          vertical, prioridad: cfg.prioridad, enMercado: cfg.operaciones_en_mercado,
          busqueda: b.nombre, total: res.totalEntries, conEmailPagina: conEmail, ratio,
        });
      } catch (err) {
        console.error(`  ⚠ ${b.nombre}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  if (filas.length === 0) { console.log('  Sin resultados.'); return; }

  console.log('\n  Créditos consumidos por este análisis: 0\n');
  console.table(filas.map((f) => ({
    vertical: f.vertical,
    prio: f.prioridad,
    'en mercado': f.enMercado,
    búsqueda: f.busqueda,
    'universo': f.total,
    'con email (muestra 100)': f.conEmailPagina,
    'ratio': `${Math.round(f.ratio * 100)}%`,
  })));

  if (presupuesto > 0) {
    // Reparto proporcional a las operaciones que están en mercado, y solo
    // entre las de prioridad 1: con saldo corto, repartir entre todo garantiza
    // no cubrir bien ninguna.
    const p1 = filas.filter((f) => f.prioridad === 1);
    const pesoTotal = p1.reduce((a, f) => a + f.enMercado, 0) || 1;
    console.log(`\n  Reparto sugerido de ${presupuesto} créditos (solo prioridad 1):\n`);
    let asignado = 0;
    for (const f of p1) {
      const cuota = Math.floor((presupuesto * f.enMercado) / pesoTotal / p1.filter((x) => x.vertical === f.vertical).length);
      asignado += cuota;
      console.log(`    ${f.vertical.padEnd(16)} ${f.busqueda.padEnd(24)} ~${cuota} créditos`);
    }
    console.log(`\n    Sin asignar: ${presupuesto - asignado} (deja margen: enriquecer no siempre encuentra email)\n`);
    const p23 = filas.filter((f) => f.prioridad > 1).map((f) => f.vertical);
    if (p23.length) {
      console.log(`  Fuera del reparto por ahora: ${[...new Set(p23)].join(', ')}`);
      console.log(`  Motivo: menos operaciones en comercialización. Cuando entren, se reordena.\n`);
    }
  } else {
    console.log('\n  Añade --creditos 95 para ver el reparto sugerido.\n');
  }
}


interface AccountFile {
  [vertical: string]: {
    prioridad: number;
    busquedas: Array<{
      nombre: string;
      keywords?: string[];
      locations?: string[];
      employees?: string[];
      sectores?: string[];
      sectores_excluidos?: string[];
    }>;
  };
}

/**
 * Importa cuentas objetivo. Consume 1 crédito por página de 100, así que se
 * pide siempre la página completa: una de 10 cuesta lo mismo que una de 100.
 *
 * El filtro por sector se aplica después de recibir la página, no en la
 * consulta: los filtros por palabra clave de Apollo cuelan bufetes y
 * consultoras de selección, y descartarlos aquí no cuesta nada porque la
 * página ya está pagada.
 */
async function importAccounts(slug: string, path: string, flags: Map<string, string>) {
  const clientId = await clientIdBySlug(slug);
  const file = JSON.parse(await readFile(path, 'utf8')) as AccountFile;
  const soloPrioridad = flags.get('prioridad') ? Number(flags.get('prioridad')) : null;
  const paginas = Number(flags.get('paginas') ?? 1);
  const seco = flags.get('live') !== 'true';

  const verticales = Object.entries(file).filter(
    ([k, v]) => !k.startsWith('_') && (soloPrioridad === null || v.prioridad === soloPrioridad),
  );
  const totalBusquedas = verticales.reduce((a, [, v]) => a + v.busquedas.length, 0);

  console.log(`\n  Verticales: ${verticales.map(([k]) => k).join(', ')}`);
  console.log(`  Búsquedas: ${totalBusquedas} × ${paginas} página(s) = hasta ${totalBusquedas * paginas} créditos`);
  if (seco) {
    console.log(`\n  🟢 ENSAYO: no se llama a Apollo y no se gasta nada.`);
    console.log(`     Añade --live para ejecutarlo de verdad.\n`);
    return;
  }
  console.log(`\n  🔴 Consumiendo créditos…\n`);

  let nuevas = 0, repetidas = 0, descartadas = 0, gastadas = 0;

  for (const [vertical, cfg] of verticales) {
    for (const b of cfg.busquedas) {
      let deEsta = 0;
      for (let page = 1; page <= paginas; page++) {
        const res = await searchOrganisations({
          keywordTags: b.keywords,
          locations: b.locations,
          numEmployeesRanges: b.employees,
          page,
          perPage: 100,
        });
        gastadas++;

        for (const org of res.organisations) {
          const excluidos = [...SECTORES_EXCLUIDOS_POR_DEFECTO, ...(b.sectores_excluidos ?? [])];
          if (!matchesIndustry(org, b.sectores ?? [], excluidos)) { descartadas++; continue; }
          const row = await queryOne<{ id: string }>(
            `INSERT INTO target_accounts
               (client_id, apollo_id, name, domain, website_url, linkedin_url, industry,
                keywords, employees, revenue, founded_year, city, state, country, segments)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
             ON CONFLICT (client_id, apollo_id) DO NOTHING
             RETURNING id`,
            [
              clientId, org.id, org.name, org.domain, org.websiteUrl, org.linkedinUrl,
              org.industry, org.keywords, org.employees, org.revenue, org.foundedYear,
              org.city, org.state, org.country, [vertical],
            ],
          );
          if (row) { nuevas++; deEsta++; } else repetidas++;
        }
        if (page >= res.totalPages) break;
      }
      console.log(`   ${vertical.padEnd(28)} ${b.nombre.padEnd(28)} +${deEsta}`);
    }
  }

  console.log(`\n  ✅ Cuentas nuevas: ${nuevas}   Repetidas: ${repetidas}   Descartadas por sector: ${descartadas}`);
  console.log(`     Créditos consumidos: ~${gastadas}\n`);
}

/** Lista las cuentas guardadas, para revisarlas a mano antes de nada. */
async function listAccounts(slug: string, flags: Map<string, string>) {
  const clientId = await clientIdBySlug(slug);
  const seg = flags.get('segmento') ?? null;
  const rows = await query<{
    name: string; industry: string | null; employees: number | null;
    city: string | null; country: string | null; domain: string | null; segments: string[];
  }>(
    `SELECT name, industry, employees, city, country, domain, segments
       FROM target_accounts
      WHERE client_id=$1 AND ($2::text IS NULL OR $2 = ANY(segments))
      ORDER BY segments[1], employees DESC NULLS LAST
      LIMIT $3`,
    [clientId, seg, Number(flags.get('limite') ?? 40)],
  );
  if (rows.length === 0) { console.log('  Sin cuentas todavía.'); return; }
  console.table(rows.map((r) => ({
    cuenta: r.name.slice(0, 34),
    vertical: r.segments[0] ?? '—',
    sector: (r.industry ?? '—').slice(0, 22),
    empl: r.employees ?? '—',
    ubicación: [r.city, r.country].filter(Boolean).join(', ').slice(0, 24),
    dominio: r.domain ?? '—',
  })));
  const total = await queryOne<{ n: number }>(
    `SELECT count(*)::int AS n FROM target_accounts WHERE client_id=$1`, [clientId]);
  console.log(`\n  Mostrando ${rows.length} de ${total?.n ?? 0} cuentas.\n`);
}


/** Aplica la lista de exclusión a las cuentas ya importadas. No llama a Apollo. */
async function pruneAccounts(slug: string) {
  const clientId = await clientIdBySlug(slug);
  const rows = await query<{ id: string; name: string; industry: string | null; keywords: string[] }>(
    `SELECT id, name, industry, keywords FROM target_accounts WHERE client_id=$1 AND status <> 'discarded'`,
    [clientId],
  );
  let fuera = 0;
  for (const r of rows) {
    const hay = [r.industry ?? '', ...(r.keywords ?? [])].join(' ').toLowerCase();
    const motivo = SECTORES_EXCLUIDOS_POR_DEFECTO.find((d) => hay.includes(d.toLowerCase()));
    if (!motivo) continue;
    await query(
      `UPDATE target_accounts SET status='discarded', notes=$2 WHERE id=$1`,
      [r.id, `descartada automáticamente: sector "${motivo}"`],
    );
    fuera++;
  }
  console.log(`\n  Revisadas ${rows.length} cuentas. Descartadas ${fuera} por sector no comprador.`);
  console.log(`  Créditos consumidos: 0\n`);
}


/**
 * Importa prospectos desde CSV.
 *
 * Es la vía que funciona sin API de pago: Apollo deja revelar emails y
 * exportar desde su interfaz web aunque el endpoint esté bloqueado. También
 * sirve para una lista propia, la de un evento o la de un socio.
 *
 * Se valida de forma estricta a propósito. Una dirección inventada no es un
 * fallo silencioso: rebota, y los rebotes duros queman la reputación del
 * dominio de quien envía. Un dominio quemado cuesta meses; una fila descartada
 * no cuesta nada.
 */
const EMAIL_RE = /^[^\s@,;<>()"']+@[^\s@,;<>()"']+\.[a-z]{2,}$/i;

/** Direcciones de buzón genérico: no son una persona y disparan quejas. */
const BUZONES_GENERICOS = [
  'info', 'contacto', 'contact', 'hello', 'hola', 'admin', 'sales', 'ventas',
  'support', 'soporte', 'noreply', 'no-reply', 'privacy', 'legal', 'rgpd',
  'gdpr', 'webmaster', 'postmaster', 'abuse', 'marketing', 'press', 'prensa',
];

function esBuzonGenerico(email: string): boolean {
  const local = email.split('@')[0]?.toLowerCase() ?? '';
  return BUZONES_GENERICOS.includes(local);
}

/** Lector de CSV con comillas. Sin dependencias: es un formato simple. */
function parseCsv(text: string): string[][] {
  const filas: string[][] = [];
  let campo = '', fila: string[] = [], enComillas = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (enComillas) {
      if (ch === '"') {
        if (text[i + 1] === '"') { campo += '"'; i++; } else enComillas = false;
      } else campo += ch;
    } else if (ch === '"') enComillas = true;
    else if (ch === ',') { fila.push(campo); campo = ''; }
    else if (ch === '\n') { fila.push(campo); filas.push(fila); fila = []; campo = ''; }
    else if (ch !== '\r') campo += ch;
  }
  if (campo || fila.length) { fila.push(campo); filas.push(fila); }
  return filas.filter((f) => f.some((c) => c.trim()));
}

/** Localiza columnas por varios nombres posibles: cada export usa los suyos. */
function columna(cabecera: string[], ...candidatos: string[]): number {
  const norm = cabecera.map((h) => h.trim().toLowerCase().replace(/[\s_-]+/g, ''));
  for (const c of candidatos) {
    const i = norm.indexOf(c.toLowerCase().replace(/[\s_-]+/g, ''));
    if (i >= 0) return i;
  }
  return -1;
}

async function importCsv(slug: string, path: string, flags: Map<string, string>) {
  const clientId = await clientIdBySlug(slug);
  const segmento = flags.get('segmento');
  if (!segmento) { console.error('❌ Falta --segmento (p. ej. --segmento agroindustria)'); process.exit(1); }
  const fuente = flags.get('fuente') ?? 'csv';

  const filas = parseCsv(await readFile(path, 'utf8'));
  if (filas.length < 2) { console.error('❌ El CSV no tiene filas de datos.'); process.exit(1); }

  const cab = filas[0]!;
  const iEmail = columna(cab, 'email', 'emailaddress', 'workemail', 'correo');
  if (iEmail < 0) {
    console.error(`❌ No encuentro columna de email. Cabeceras: ${cab.join(', ')}`);
    process.exit(1);
  }
  const iNombre = columna(cab, 'name', 'fullname', 'nombre');
  const iPila   = columna(cab, 'firstname', 'first name', 'nombrepila');
  const iApe    = columna(cab, 'lastname', 'last name', 'apellidos');
  const iEmpresa= columna(cab, 'company', 'organization', 'organisation', 'companyname', 'empresa');
  const iCargo  = columna(cab, 'title', 'jobtitle', 'position', 'cargo');

  // Supresión en memoria: comprobarlo por fila haría una consulta por línea.
  const suprimidos = new Set(
    (await query<{ email: string }>(
      `SELECT lower(email) AS email FROM suppression WHERE client_id=$1`, [clientId],
    )).map((r) => r.email),
  );

  let nuevos = 0, repetidos = 0;
  const rechazos: Record<string, number> = {};
  const rechazar = (m: string) => { rechazos[m] = (rechazos[m] ?? 0) + 1; };

  for (const fila of filas.slice(1)) {
    const email = (fila[iEmail] ?? '').trim().toLowerCase();
    if (!email) { rechazar('sin email'); continue; }
    if (!EMAIL_RE.test(email)) { rechazar('formato inválido'); continue; }
    // Apollo exporta este marcador cuando el email no está desbloqueado.
    if (email.includes('email_not_unlocked')) { rechazar('email no desbloqueado en Apollo'); continue; }
    if (esBuzonGenerico(email)) { rechazar('buzón genérico (info@, sales@…)'); continue; }
    if (suprimidos.has(email)) { rechazar('en lista de supresión'); continue; }

    const nombre = iNombre >= 0 && fila[iNombre]?.trim()
      ? fila[iNombre]!.trim()
      : [iPila >= 0 ? fila[iPila] : '', iApe >= 0 ? fila[iApe] : ''].filter((x) => x?.trim()).join(' ').trim();

    const row = await queryOne<{ id: string }>(
      `INSERT INTO prospects
         (client_id, email, display_name, organisation, role_title, segments, source, legal_basis)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'legitimate_interest')
       ON CONFLICT (client_id, email) DO NOTHING
       RETURNING id`,
      [
        clientId, email, nombre || null,
        iEmpresa >= 0 ? (fila[iEmpresa]?.trim() || null) : null,
        iCargo >= 0 ? (fila[iCargo]?.trim() || null) : null,
        [segmento], fuente,
      ],
    );
    if (row) nuevos++; else repetidos++;
  }

  console.log(`\n  ✅ Prospectos nuevos: ${nuevos}   Ya estaban: ${repetidos}`);
  if (Object.keys(rechazos).length) {
    console.log(`\n  Descartados:`);
    for (const [m, n] of Object.entries(rechazos)) console.log(`     ${String(n).padStart(4)}  ${m}`);
  }
  console.log(`\n  Revisa antes de enviar:  npm run outreach -- stats ${slug}\n`);
}


interface Deal {
  ref: string; vertical: string; estado: string; estado_txt: string;
  titulo: string; tipo: string; geo: string;
  precio: string | null; descripcion: string; contraparte: string | null;
}

/**
 * Extrae el dato duro que define la operación: hectáreas, llaves, metros.
 * Va en el asunto porque es lo único que un inversor necesita para decidir en
 * dos segundos si sigue leyendo. "Agroindustria — 5 operaciones en cartera"
 * no le dice nada; "700 ha de olivar, Guadalquivir" sí.
 */
function datoDuro(d: Deal): string | null {
  return datoDuroDe(d.descripcion);
}

function asunto(d: Deal): string {
  const dato = datoDuro(d);
  const geo = d.geo.replace(/,?\s*EE\.?\s*UU\.?/i, '').replace(/—\s*/, '').trim();
  // Sin firma ni "oportunidad": el asunto es el activo.
  return dato ? `${dato}, ${geo}` : `${d.titulo}, ${geo}`;
}

/**
 * Genera una campaña POR OPERACIÓN, no por vertical.
 *
 * Mandar el catálogo entero de un vertical se lee como un boletín: siete
 * activos en un correo dicen "esto va a una lista". Un solo activo, el que
 * encaja con quien recibe, se lee como una gestión concreta. En originación esa
 * diferencia es la tasa de respuesta.
 *
 * Solo se generan las que están en comercialización: ofrecer algo que aún está
 * en estructuración quema el contacto para cuando de verdad haya algo.
 */
async function makeDealCampaigns(slug: string, path: string, flags: Map<string, string>) {
  const clientId = await clientIdBySlug(slug);
  const firmante = flags.get('firmante');
  if (!firmante) {
    console.error('❌ Falta --firmante "Nombre Apellido, cargo".');
    console.error('   La gente responde a personas, no a "Zenith Rise Capital".');
    process.exit(1);
  }
  const deals = (JSON.parse(await readFile(path, 'utf8')) as Deal[])
    .filter((d) => d.estado === 'market');

  const from = config.OUTREACH_FROM_EMAIL ?? 'pendiente@configurar.example';
  let n = 0;

  for (const d of deals) {
    const dato = datoDuro(d);
    // Una frase con los hechos, sin identificar nada: lo que ya es público en
    // el documento ciego.
    const hechos = [
      dato ? `${dato}.` : null,
      `${d.tipo}.`,
      d.geo.startsWith('España') ? 'Ámbito nacional.' : `${d.geo}.`,
      d.precio ? `Referencia orientativa y no vinculante: ${d.precio}.` : null,
    ].filter(Boolean).join(' ');

    const cuerpo = `{{first_name}},

{{motivo}}

${hechos}

${d.descripcion.split('.')[0]}.

Es información ciega: no identifica el activo ni a la propiedad. El detalle va tras confidencialidad.

¿Le envío el perfil ciego?

${firmante}
Zenith Rise Capital`;

    await query(
      `INSERT INTO campaigns
         (client_id, name, segment, subject, body_template, from_name, from_email, reply_to, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'draft')
       ON CONFLICT (client_id, name) DO UPDATE
         SET subject=EXCLUDED.subject, body_template=EXCLUDED.body_template,
             segment=EXCLUDED.segment, status='draft'`,
      [
        clientId,
        `deal-${d.ref.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
        d.vertical,
        asunto(d),
        cuerpo,
        firmante.split(',')[0]!.trim(),
        from,
        config.OUTREACH_REPLY_TO ?? null,
      ],
    );
    n++;
    console.log(`  ✅ ${d.vertical.slice(0, 16).padEnd(16)} "${asunto(d)}"`);
  }

  console.log(`\n  ${n} campañas, una por operación en comercialización.`);
  console.log(`  Las ${24 - n} que no están en mercado se dejan fuera a propósito.\n`);
}

const [command, ...rest] = process.argv.slice(2);
const { positional, flags } = parseFlags(rest);

try {
  switch (command) {
    case 'import-csv':       if (positional.length < 2) usage(); await importCsv(positional[0]!, positional[1]!, flags); break;
    case 'import-accounts':  if (positional.length < 2) usage(); await importAccounts(positional[0]!, positional[1]!, flags); break;
    case 'prune-accounts':   if (!positional[0]) usage(); await pruneAccounts(positional[0]); break;
    case 'list-accounts':    if (!positional[0]) usage(); await listAccounts(positional[0], flags); break;
    case 'plan':             if (positional.length < 2) usage(); await plan(positional[0]!, positional[1]!, flags); break;
    case 'apollo-search':    if (!positional[0]) usage(); await apolloSearch(positional[0], flags); break;
    case 'apollo-import':    if (!positional[0]) usage(); await apolloImport(positional[0], flags); break;
    case 'make-deal-campaigns': if (positional.length < 2) usage(); await makeDealCampaigns(positional[0]!, positional[1]!, flags); break;
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

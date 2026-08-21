/**
 * Alta y verificación del dominio de envío en Resend.
 *
 *   npm run domain -- setup [dominio] [--region eu-west-1]
 *   npm run domain -- check [dominio]
 *
 * Requiere una clave de Resend con permiso completo: la de "solo envío"
 * devuelve 401 en todo lo que no sea mandar un correo.
 */
import { config } from '../config.js';

const BASE = 'https://api.resend.com';

interface DnsRecord {
  record: string;
  name: string;
  type: string;
  ttl?: string;
  status?: string;
  value: string;
  priority?: number;
}
interface Domain {
  id: string;
  name: string;
  status: string;
  region?: string;
  records?: DnsRecord[];
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  if (!config.RESEND_API_KEY) throw new Error('RESEND_API_KEY no configurada');
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${config.RESEND_API_KEY}`,
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(30_000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (body as { message?: string }).message ?? res.statusText;
    if (res.status === 401 && msg.includes('restricted')) {
      throw new Error(
        'La clave de Resend es de solo envío y no puede gestionar dominios.\n' +
          '   Crea otra en resend.com/api-keys con permiso "Full access".',
      );
    }
    throw new Error(`Resend ${res.status}: ${msg}`);
  }
  return body as T;
}

/** Imprime los registros en el orden y con los nombres que pide el panel de IONOS. */
function pintarRegistros(d: Domain) {
  if (!d.records?.length) { console.log('  (Resend todavía no ha devuelto registros)'); return; }
  console.log(`\n  Crea estos registros en IONOS · Dominios · DNS de ${d.name.split('.').slice(-2).join('.')}:\n`);
  for (const r of d.records) {
    // IONOS pide el nombre RELATIVO al dominio, sin el dominio al final: si
    // pegas el nombre completo crea el registro duplicando el sufijo y la
    // verificación nunca pasa.
    const raiz = d.name.split('.').slice(-2).join('.');
    const relativo = r.name.endsWith(raiz)
      ? r.name.slice(0, -(raiz.length + 1)) || '@'
      : r.name;
    console.log(`  ── ${r.record} (${r.type}) ─────────────────────────`);
    console.log(`     Nombre/Host : ${relativo}`);
    console.log(`     Tipo        : ${r.type}`);
    if (r.priority !== undefined) console.log(`     Prioridad   : ${r.priority}`);
    console.log(`     Valor       : ${r.value}`);
    console.log(`     TTL         : ${r.ttl ?? '3600'}`);
    console.log();
  }
  console.log('  Aviso: el SPF de la raíz NO se toca. Estos registros son del subdominio.');
}

async function setup(nombre: string, region: string) {
  console.log(`\n▶ Dando de alta ${nombre} (región ${region})…`);
  const existentes = await api<{ data?: Domain[] }>('/domains');
  const ya = existentes.data?.find((d) => d.name === nombre);

  const dominio = ya
    ? (console.log('  Ya estaba dado de alta; recupero sus registros.'),
       await api<Domain>(`/domains/${ya.id}`))
    : await api<Domain>('/domains', {
        method: 'POST',
        body: JSON.stringify({ name: nombre, region }),
      });

  console.log(`  id: ${dominio.id}   estado: ${dominio.status}`);
  pintarRegistros(dominio);
  console.log(`  Cuando los hayas creado:  npm run domain -- check ${nombre}\n`);
}

async function check(nombre: string) {
  const { data } = await api<{ data?: Domain[] }>('/domains');
  const d = data?.find((x) => x.name === nombre);
  if (!d) { console.error(`❌ ${nombre} no está dado de alta. Usa: setup ${nombre}`); process.exit(1); }

  console.log(`\n▶ Pidiendo verificación de ${nombre}…`);
  await api(`/domains/${d.id}/verify`, { method: 'POST' }).catch(() => {});
  const fresco = await api<Domain>(`/domains/${d.id}`);

  console.log(`  estado: ${fresco.status}`);
  for (const r of fresco.records ?? []) {
    const ok = (r.status ?? '').toLowerCase() === 'verified';
    console.log(`   ${ok ? '✅' : '⏳'} ${r.record} (${r.type})  ${r.status ?? 'pendiente'}`);
  }
  if (fresco.status === 'verified') {
    console.log(`\n  ✅ Verificado. Ya puedes poner OUTREACH_FROM_EMAIL con este dominio.\n`);
  } else {
    console.log(`\n  El DNS tarda en propagar. Vuelve a intentarlo en unos minutos.\n`);
  }
}

const [cmd, arg, ...rest] = process.argv.slice(2);
const region = rest.includes('--region') ? rest[rest.indexOf('--region') + 1]! : 'eu-west-1';
const dominio = arg ?? 'deals.zenithrisecapital.com';

try {
  if (cmd === 'setup') await setup(dominio, region);
  else if (cmd === 'check') await check(dominio);
  else {
    console.log('\nUso:\n  npm run domain -- setup [dominio] [--region eu-west-1]\n  npm run domain -- check [dominio]\n');
    process.exit(1);
  }
} catch (err) {
  console.error(`\n❌ ${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
}

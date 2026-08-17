/**
 * Arranque en frío de la infraestructura.
 *
 *   npm run infra:up
 *
 * Levanta los contenedores, espera a que acepten conexiones de verdad, aplica
 * las migraciones pendientes y da un parte del estado. Existe para que el
 * arranque no dependa de que alguien se acuerde del orden.
 *
 * ── Por qué no basta con `docker compose up -d && npm run migrate` ──
 *
 * Porque `docker compose up -d` vuelve cuando el contenedor **arrancó**, no
 * cuando Postgres acepta conexiones. En un arranque en frío hay diez o veinte
 * segundos de diferencia —el primer arranque inicializa el clúster— y las
 * migraciones lanzadas ahí fallan con "connection refused". Ese fallo asusta
 * más de lo que debería: parece un problema de configuración y solo era prisa.
 *
 * Aquí se sondea con una conexión real hasta que responde.
 */
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { config } from '../src/config.js';
import { color } from './ansi.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');

function paso(n: number, total: number, texto: string): void {
  console.log(`\n${color.negrita(color.blanco(`[${n}/${total}]`))} ${color.blanco(texto)}`);
}

function ok(texto: string): void {
  console.log(`  ${color.verde('✓')} ${texto}`);
}

function aviso(texto: string): void {
  console.log(`  ${color.amarillo('!')} ${color.amarillo(texto)}`);
}

function fallo(texto: string): never {
  console.error(`  ${color.rojo('✖')} ${color.rojo(texto)}\n`);
  process.exit(1);
}

const isWindows = process.platform === 'win32';

/**
 * Nombre real del ejecutable en esta plataforma.
 *
 * En Windows, `docker` es `docker.exe` y lo resuelve `spawn` sin ayuda, pero
 * `npm` es `npm.cmd` y no. Nombrar el `.cmd` explícitamente evita tener que
 * pasar por `shell: true`, que Node marca como deprecado cuando se le pasan
 * argumentos —los concatena sin escapar— y que además convierte un ejecutable
 * inexistente en un código de salida genérico en vez de un ENOENT reconocible.
 */
function exeName(cmd: string): string {
  if (!isWindows) return cmd;
  return cmd === 'npm' ? 'npm.cmd' : cmd;
}

/** Ejecuta un comando heredando la salida, para ver el progreso de Docker. */
function run(cmd: string, args: string[], cwd: string): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(exeName(cmd), args, { cwd, stdio: 'inherit' });
    child.on('close', (code) => resolve(code ?? 1));
    // ENOENT: el ejecutable no existe. Se distingue de "existe y falló" para
    // poder dar un mensaje que sirva de algo.
    child.on('error', () => resolve(127));
  });
}

/**
 * Espera a que Postgres acepte conexiones.
 *
 * Se conecta de verdad en vez de mirar si el puerto está abierto: durante la
 * inicialización del clúster el puerto ya acepta TCP pero la base de datos
 * todavía rechaza sesiones, y un sondeo de puerto daría por bueno algo que no
 * lo está.
 */
async function waitForPostgres(timeoutMs = 90_000): Promise<void> {
  const limite = Date.now() + timeoutMs;
  let ultimoError = '';
  let intentos = 0;

  while (Date.now() < limite) {
    const client = new pg.Client({
      connectionString: config.DATABASE_URL,
      connectionTimeoutMillis: 3_000,
    });
    try {
      await client.connect();
      await client.query('SELECT 1');
      await client.end();
      ok(`Postgres responde${intentos > 0 ? ` (tras ${intentos} intentos)` : ''}`);
      return;
    } catch (err) {
      ultimoError = err instanceof Error ? err.message : String(err);
      await client.end().catch(() => undefined);
      intentos++;
      if (intentos % 5 === 0) {
        console.log(color.gris(`    esperando… (${intentos})`));
      }
      await new Promise((r) => setTimeout(r, 1_000));
    }
  }

  fallo(
    `Postgres no respondió en ${timeoutMs / 1000} s. Último error: ${ultimoError}\n` +
      '     Comprueba DATABASE_URL en services/api/.env y que el puerto coincide\n' +
      '     con el de docker-compose.yml (5433 por defecto, no 5432).',
  );
}

/** Redis es opcional: sin él se apaga la capa proactiva y lo demás funciona. */
async function checkRedis(): Promise<boolean> {
  if (!config.REDIS_URL) {
    aviso('REDIS_URL sin configurar: la capa de mensajes proactivos queda apagada.');
    console.log(
      color.gris('    Para activarla, descomenta REDIS_URL en .env y vuelve a ejecutar esto.'),
    );
    return false;
  }

  const { Redis } = await import('ioredis');
  const redis = new Redis(config.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    connectTimeout: 3_000,
    retryStrategy: () => null,
  });

  try {
    await redis.connect();
    await redis.ping();
    ok('Redis responde');
    return true;
  } catch (err) {
    aviso(`Redis no responde: ${err instanceof Error ? err.message : err}`);
    console.log(color.gris('    La capa proactiva no funcionará, el resto sí.'));
    return false;
  } finally {
    redis.disconnect();
  }
}

interface TableCheck {
  tabla: string;
  desde: string;
  nota?: string;
}

/**
 * Tablas y columnas que deben existir tras aplicar 001-006.
 *
 * Comprobarlo aquí convierte un fallo silencioso —una migración que se marcó
 * aplicada pero no creó lo que debía— en un mensaje concreto. Sin esto, el
 * síntoma aparecería semanas después como un error de columna inexistente en
 * mitad de una conversación.
 */
const TABLAS: TableCheck[] = [
  { tabla: 'clients', desde: '001' },
  { tabla: 'api_keys', desde: '001' },
  { tabla: 'bot_configs', desde: '001' },
  { tabla: 'knowledge_entries', desde: '001', nota: 'la base de conocimiento; el RAG vive aquí' },
  { tabla: 'conversations', desde: '001' },
  { tabla: 'messages', desde: '001' },
  { tabla: 'tools', desde: '002' },
  { tabla: 'tool_invocations', desde: '002' },
  { tabla: 'handoff_notifications', desde: '003' },
  { tabla: 'agent_traces', desde: '004', nota: 'trazas del agente (LLMOps)' },
  { tabla: 'proactive_jobs', desde: '004' },
  { tabla: 'user_facts', desde: '005', nota: 'memoria semántica' },
  { tabla: 'user_fact_revisions', desde: '005' },
  { tabla: 'sub_agents', desde: '006' },
];

async function reportState(): Promise<void> {
  const client = new pg.Client({ connectionString: config.DATABASE_URL });
  await client.connect();

  try {
    // ── Migraciones aplicadas ──
    const migraciones = await client.query<{ name: string }>(
      `SELECT name FROM schema_migrations ORDER BY name`,
    );
    console.log(
      `  ${color.verde('✓')} migraciones aplicadas: ${migraciones.rows
        .map((r) => r.name.slice(0, 3))
        .join(', ')}`,
    );

    // ── pgvector ──
    const ext = await client.query<{ extversion: string }>(
      `SELECT extversion FROM pg_extension WHERE extname = 'vector'`,
    );
    if (ext.rows.length === 0) {
      fallo(
        'La extensión pgvector NO está instalada.\n' +
          '     La imagen de docker-compose debe ser pgvector/pgvector:pg17.\n' +
          '     Si cambiaste la imagen, el RAG vectorial no funcionará.',
      );
    }
    ok(`pgvector ${ext.rows[0]!.extversion}`);

    // La columna y su índice: la extensión puede estar y la migración 003
    // haberse quedado a medias.
    const emb = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM information_schema.columns
        WHERE table_name = 'knowledge_entries' AND column_name = 'embedding'`,
    );
    if (emb.rows[0]!.count === '0') {
      fallo('knowledge_entries no tiene la columna `embedding`: la migración 003 no se aplicó.');
    }

    const idx = await client.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes
        WHERE tablename = 'knowledge_entries' AND indexname = 'knowledge_embedding_idx'`,
    );
    if (idx.rows.length === 0) {
      aviso('Falta el índice HNSW sobre embedding: la búsqueda vectorial irá lenta.');
    } else {
      ok('índice HNSW sobre knowledge_entries.embedding');
    }

    // ── Tablas ──
    console.log('');
    const faltan: string[] = [];

    for (const { tabla, desde, nota } of TABLAS) {
      const res = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = $1`,
        [tabla],
      );

      if (res.rows[0]!.count === '0') {
        faltan.push(`${tabla} (migración ${desde})`);
        console.log(`  ${color.rojo('✖')} ${tabla.padEnd(24)} ${color.rojo('NO EXISTE')}`);
        continue;
      }

      const filas = await client.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM ${tabla}`);
      const n = filas.rows[0]!.count;
      console.log(
        `  ${color.verde('✓')} ${tabla.padEnd(24)} ${color.gris(`${n} filas`)}` +
          (nota ? color.gris(`  — ${nota}`) : ''),
      );
    }

    if (faltan.length > 0) {
      fallo(`Faltan tablas: ${faltan.join(', ')}. Revisa la salida de las migraciones.`);
    }

    // ── ¿Hay algún cliente? ──
    const clientes = await client.query<{ slug: string }>(
      `SELECT slug FROM clients WHERE is_active ORDER BY created_at`,
    );

    console.log('');
    if (clientes.rows.length === 0) {
      aviso('No hay ningún cliente todavía. Siguiente paso:');
      console.log(
        color.gris('    npm run admin -- create-client casa-nigran "Casa de Nigrán"\n' +
          '    npm run admin -- issue-key casa-nigran dev --scopes chat,handoff,proactive'),
      );
    } else {
      ok(`clientes activos: ${clientes.rows.map((r) => r.slug).join(', ')}`);
    }
  } finally {
    await client.end();
  }
}

async function main(): Promise<void> {
  console.log(color.negrita(color.blanco('\n  Pita Dixital — arranque de infraestructura\n')));

  const TOTAL = 4;

  // ── 1. Contenedores ──
  paso(1, TOTAL, 'Levantando contenedores');
  const code = await run('docker', ['compose', 'up', '-d'], repoRoot);
  if (code === 127) {
    fallo(
      'No se encontró `docker`. Instálalo o levanta Postgres y Redis a mano\n' +
        '     y vuelve a ejecutar esto: los pasos siguientes funcionan igual.',
    );
  }
  if (code !== 0) fallo(`docker compose devolvió ${code}.`);
  ok('contenedores en marcha');

  // ── 2. Esperar ──
  paso(2, TOTAL, 'Esperando a que acepten conexiones');
  await waitForPostgres();
  await checkRedis();

  // ── 3. Migraciones ──
  paso(3, TOTAL, 'Aplicando migraciones pendientes');
  // Se delega en el runner existente en vez de duplicar su lógica: es quien
  // sabe cuáles están aplicadas, y las mete en una transacción cada una.
  const migCode = await run('npm', ['run', 'migrate'], join(here, '..'));
  if (migCode !== 0) {
    fallo(
      'Las migraciones fallaron. NO vuelvas a ejecutarlas a ciegas:\n' +
        '     cada una va en su transacción, así que la que falló no dejó nada a medias,\n' +
        '     pero el error de arriba dice qué pasó y suele ser de configuración.',
    );
  }

  // ── 4. Parte del estado ──
  paso(4, TOTAL, 'Estado de la base de datos');
  await reportState();

  console.log(color.negrita(color.verde('\n  Infraestructura lista.\n')));
  console.log(color.gris('  Siguiente:  npm run dev        (arrancar la API)'));
  console.log(color.gris('              npm run chat -- <slug>  (consola de depuración)\n'));
}

await main();

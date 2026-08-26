import pg from 'pg';
import { config } from './config.js';

// NUMERIC llega como string desde el driver para no perder precisión.
// En este esquema no usamos NUMERIC (temperature es REAL) pero dejamos
// el parser explícito para que nadie se lo encuentre por sorpresa.
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => Number(v));
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v));

export const pool = new pg.Pool({
  connectionString: config.DATABASE_URL,
  max: 50,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  console.error('[db] error en cliente inactivo:', err.message);
});

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<T[]> {
  const res = await pool.query<T>(text, params as never[]);
  return res.rows;
}

export async function queryOne<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

export async function transaction<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Adquiere un advisory lock a nivel de sesión (no transaccional) sobre un hash.
 * Si no lo consigue, espera (bloquea) hasta tenerlo.
 */
export async function withAdvisoryLock<T>(
  lockKey: string,
  fn: () => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    // hashtext() genera un int32, pg_advisory_lock soporta bigint (un arg) o int32, int32 (dos args).
    // Usamos la variante de 1 argumento casteando el string a un número hash mediante la db.
    // pg_try_advisory_lock sería no bloqueante, pero pg_advisory_lock bloquea y encola peticiones.
    const res = await client.query('SELECT hashtext($1) AS hash', [lockKey]);
    const hash = res.rows[0].hash;
    await client.query('SELECT pg_advisory_lock($1)', [hash]);
    try {
      return await fn();
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [hash]);
    }
  } finally {
    client.release();
  }
}

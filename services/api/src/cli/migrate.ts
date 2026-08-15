/**
 * Aplica las migraciones SQL de migrations/ en orden, una sola vez cada una.
 *
 *   npm run migrate
 */
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../db.js';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, '..', '..', 'migrations');

async function main() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name       TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const applied = new Set(
      (await client.query<{ name: string }>(`SELECT name FROM schema_migrations`)).rows.map(
        (r) => r.name,
      ),
    );

    const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();

    let count = 0;
    for (const file of files) {
      if (applied.has(file)) continue;

      const sql = await readFile(join(migrationsDir, file), 'utf8');
      // Cada migración en su transacción: o entra entera o no entra.
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(`INSERT INTO schema_migrations (name) VALUES ($1)`, [file]);
        await client.query('COMMIT');
        console.log(`✅ ${file}`);
        count++;
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`❌ ${file} falló:`, err instanceof Error ? err.message : err);
        process.exit(1);
      }
    }

    console.log(count === 0 ? 'Sin migraciones pendientes.' : `${count} migración(es) aplicadas.`);
  } finally {
    client.release();
    await pool.end();
  }
}

await main();

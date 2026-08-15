import { queryOne, query } from '../db.js';
import { hashApiKeySecret, parseApiKey, safeEqualHex } from './crypto.js';

export interface AuthedClient {
  clientId: string;
  name: string;
  scopes: string[];
  apiKeyId: string;
}

/**
 * Autenticación por clave de API.
 *
 * Devuelve null en todos los fallos sin distinguir el motivo. Diferenciar
 * "clave inexistente" (401) de "cliente inactivo" (403) le confirma a un
 * atacante cuándo ha acertado una clave.
 */
export async function authenticate(header: string | undefined): Promise<AuthedClient | null> {
  if (!header?.startsWith('Bearer ')) return null;

  const parsed = parseApiKey(header.slice(7).trim());
  if (!parsed) return null;

  const row = await queryOne<{
    api_key_id: string;
    key_hash: string;
    scopes: string[];
    client_id: string;
    name: string;
    is_active: boolean;
  }>(
    `SELECT k.id AS api_key_id, k.key_hash, k.scopes, c.id AS client_id, c.name, c.is_active
       FROM api_keys k
       JOIN clients c ON c.id = k.client_id
      WHERE k.prefix = $1 AND k.revoked_at IS NULL`,
    [parsed.prefix],
  );
  if (!row) return null;

  if (!safeEqualHex(row.key_hash, hashApiKeySecret(parsed.secret))) return null;
  if (!row.is_active) return null;

  // Fuera del camino crítico: si falla, la petición sigue.
  query(`UPDATE api_keys SET last_used_at = NOW() WHERE id = $1`, [row.api_key_id]).catch(
    (err: unknown) => console.error('[auth] no se pudo actualizar last_used_at:', err),
  );

  return {
    clientId: row.client_id,
    name: row.name,
    scopes: row.scopes,
    apiKeyId: row.api_key_id,
  };
}

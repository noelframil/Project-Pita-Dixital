import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { config } from '../config.js';

// ── Claves de API ────────────────────────────────────────────────
//
// Formato: pita_<prefijo 12>_<secreto 32>
// En la base de datos solo vive el prefijo (para localizar la fila) y
// sha256(secreto + pepper). El secreto completo se enseña una sola vez.

const KEY_PREFIX_LEN = 12;
const KEY_SECRET_LEN = 32;

function base62(bytes: number): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const buf = randomBytes(bytes);
  let out = '';
  for (const byte of buf) out += alphabet[byte % alphabet.length];
  return out;
}

export function generateApiKey(): { full: string; prefix: string; hash: string } {
  const prefix = base62(KEY_PREFIX_LEN);
  const secret = base62(KEY_SECRET_LEN);
  return {
    full: `pita_${prefix}_${secret}`,
    prefix,
    hash: hashApiKeySecret(secret),
  };
}

export function hashApiKeySecret(secret: string): string {
  return createHash('sha256').update(secret + config.API_KEY_PEPPER).digest('hex');
}

/** Devuelve null si el formato no cuadra: no hace falta ir a la base de datos. */
export function parseApiKey(full: string): { prefix: string; secret: string } | null {
  const parts = full.split('_');
  if (parts.length !== 3 || parts[0] !== 'pita') return null;
  const [, prefix, secret] = parts;
  if (!prefix || !secret) return null;
  if (prefix.length !== KEY_PREFIX_LEN || secret.length !== KEY_SECRET_LEN) return null;
  return { prefix, secret };
}

/** Comparación en tiempo constante: una comparación normal filtra el hash byte a byte. */
export function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

// ── Credenciales de canal ────────────────────────────────────────
//
// AES-256-GCM. Formato del blob: [iv 12][tag 16][ciphertext]

export function encryptJson(value: unknown): Buffer {
  const key = Buffer.from(config.ENCRYPTION_KEY, 'base64');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([
    cipher.update(JSON.stringify(value), 'utf8'),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]);
}

export function decryptJson<T = unknown>(blob: Buffer): T {
  const key = Buffer.from(config.ENCRYPTION_KEY, 'base64');
  const iv = blob.subarray(0, 12);
  const tag = blob.subarray(12, 28);
  const body = blob.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
  return JSON.parse(plain) as T;
}

import { isQueueEnabled, getRedis } from '../queue/connection.js';

interface Bucket {
  hits: number[];
}

const memoryBuckets = new Map<string, Bucket>();
const WINDOW_MS = 60_000;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Rate limit que usa Redis si está disponible, con fallback a memoria.
 */
export async function checkRateLimit(
  clientId: string,
  channelUserId: string,
  limitPerMinute: number
): Promise<RateLimitResult> {
  const key = `rate_limit:${clientId}:${channelUserId}`;
  const now = Date.now();

  if (isQueueEnabled()) {
    try {
      const redis = getRedis();
      const multi = redis.multi();
      const windowStart = now - WINDOW_MS;
      
      // Limpiar hits antiguos
      multi.zremrangebyscore(key, 0, windowStart);
      // Contar hits en la ventana actual
      multi.zcard(key);
      // Añadir el hit actual (con el timestamp como score y value)
      multi.zadd(key, now, `${now}-${Math.random()}`);
      // Expirar la clave
      multi.pexpire(key, WINDOW_MS);

      const results = await multi.exec();
      if (!results) throw new Error('Redis multi failed');

      const currentHits = (results[1]![1] as number) || 0;
      const allowed = currentHits < limitPerMinute;

      if (!allowed) {
        // Si no está permitido, quitamos el que acabamos de añadir para no penalizar de más
        await redis.zremrangebyscore(key, now, now);
        return {
          allowed: false,
          remaining: 0,
          retryAfterSeconds: Math.ceil(WINDOW_MS / 1000),
        };
      }

      return {
        allowed: true,
        remaining: Math.max(0, limitPerMinute - (currentHits + 1)),
        retryAfterSeconds: 0,
      };
    } catch (err) {
      console.error('[RateLimit] Error en Redis, haciendo fallback a memoria:', err);
      // Continúa al fallback en memoria
    }
  }

  // Fallback en memoria
  const bucket = memoryBuckets.get(key) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((t) => now - t < WINDOW_MS);

  if (bucket.hits.length >= limitPerMinute) {
    const oldest = bucket.hits[0]!;
    memoryBuckets.set(key, bucket);
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((WINDOW_MS - (now - oldest)) / 1000)),
    };
  }

  bucket.hits.push(now);
  memoryBuckets.set(key, bucket);
  return {
    allowed: true,
    remaining: limitPerMinute - bucket.hits.length,
    retryAfterSeconds: 0,
  };
}

// Limpiador de memoria
const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of memoryBuckets) {
    if (bucket.hits.every((t) => now - t >= WINDOW_MS)) memoryBuckets.delete(key);
  }
}, WINDOW_MS);
sweeper.unref();

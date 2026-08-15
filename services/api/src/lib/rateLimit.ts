/**
 * Rate limit por ventana deslizante, en memoria.
 *
 * Sirve mientras haya un solo proceso. Al escalar a varias instancias hay que
 * moverlo a Redis: cada instancia con su propio contador significa que el
 * límite real es N veces el configurado.
 */
interface Bucket {
  hits: number[];
}

const buckets = new Map<string, Bucket>();
const WINDOW_MS = 60_000;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function checkRateLimit(key: string, limitPerMinute: number): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key) ?? { hits: [] };

  bucket.hits = bucket.hits.filter((t) => now - t < WINDOW_MS);

  if (bucket.hits.length >= limitPerMinute) {
    const oldest = bucket.hits[0]!;
    buckets.set(key, bucket);
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((WINDOW_MS - (now - oldest)) / 1000)),
    };
  }

  bucket.hits.push(now);
  buckets.set(key, bucket);
  return {
    allowed: true,
    remaining: limitPerMinute - bucket.hits.length,
    retryAfterSeconds: 0,
  };
}

// Sin esto, un pico de tráfico deja miles de claves muertas en memoria.
const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.hits.every((t) => now - t >= WINDOW_MS)) buckets.delete(key);
  }
}, WINDOW_MS);
sweeper.unref();

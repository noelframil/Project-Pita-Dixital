import 'dotenv/config';
import { z } from 'zod';

/**
 * El entorno se valida al arrancar, no en el momento de usarlo. Un despliegue
 * al que le falta ENCRYPTION_KEY debe morir en el arranque, no al recibir el
 * primer mensaje de un cliente.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().default(3000),
  LOG_LEVEL: z.string().default('info'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL es obligatoria'),

  // 32 bytes en base64. Cifra channel_accounts.credentials.
  ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, 'base64').length === 32, {
      message: 'ENCRYPTION_KEY debe ser 32 bytes en base64 (openssl rand -base64 32)',
    }),

  // Se concatena al secreto antes de hashear: si te roban la base de datos
  // pero no el entorno, las claves siguen sin ser reversibles por diccionario.
  API_KEY_PEPPER: z.string().min(16, 'API_KEY_PEPPER debe tener al menos 16 caracteres'),

  // Proveedores de modelo. Solo Ollama es obligatorio en desarrollo.
  OLLAMA_HOST: z.string().default('http://127.0.0.1:11434'),
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),

  // Canales
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),

  PUBLIC_BASE_URL: z.string().optional(),

  // Límites por defecto
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().default(30),
  LLM_TIMEOUT_MS: z.coerce.number().int().default(45_000),
  MAX_MESSAGE_CHARS: z.coerce.number().int().default(4_000),

  // Autoconfiguración (fase 1). Se ejecuta una vez por cliente, desde la CLI,
  // y de su calidad depende todo lo que ese bot dirá después: aquí interesa el
  // modelo bueno, no el barato. Con `--provider ollama` se prueba sin gastar.
  AUTOCONFIG_PROVIDER: z.string().default('anthropic'),
  AUTOCONFIG_MODEL: z.string().default('claude-opus-5'),
  // El razonamiento y la respuesta comparten presupuesto: si se queda corto,
  // la salida llega vacía o truncada.
  AUTOCONFIG_MAX_TOKENS: z.coerce.number().int().default(8_000),
  AUTOCONFIG_TIMEOUT_MS: z.coerce.number().int().default(180_000),

  // Herramientas (fase 3). Ejecutan peticiones a terceros con parámetros que
  // elige el modelo: todo acotado.
  TOOL_TIMEOUT_MS: z.coerce.number().int().default(10_000),
  TOOL_MAX_RESPONSE_CHARS: z.coerce.number().int().default(4_000),

  // Memoria (fase 4). Techo del resumen acumulado de cada conversación.
  MEMORY_SUMMARY_MAX_TOKENS: z.coerce.number().int().default(400),

  // ── RAG vectorial ───────────────────────────────────────────
  // Solo OpenAI: la dimensión está atada al tipo de la columna en Postgres
  // (vector(1536)), así que cambiar de modelo es una migración, no un ajuste.
  EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),
  EMBEDDING_TIMEOUT_MS: z.coerce.number().int().default(30_000),

  // ── Multimodal ──────────────────────────────────────────────
  WHISPER_MODEL: z.string().default('whisper-1'),
  // Fijar el idioma sube bastante la precisión: una nota corta en gallego se
  // transcribe como portugués si se deja a que lo adivine.
  WHISPER_LANGUAGE: z.string().default('es'),
  VISION_PROVIDER: z.enum(['openai', 'anthropic']).default('openai'),
  VISION_MODEL: z.string().default('gpt-4o'),
  VISION_MAX_TOKENS: z.coerce.number().int().default(700),
  // 10 MB. Por encima, WhatsApp ya no lo manda y una nota de voz de ese tamaño
  // dura más de lo que nadie escucha.
  MEDIA_MAX_BYTES: z.coerce.number().int().default(10 * 1024 * 1024),
  MEDIA_MAX_ATTACHMENTS: z.coerce.number().int().default(4),
  MEDIA_TIMEOUT_MS: z.coerce.number().int().default(60_000),

  // ── Handoff a humano ────────────────────────────────────────
  HANDOFF_WEBHOOK_TIMEOUT_MS: z.coerce.number().int().default(10_000),
  HANDOFF_MAX_ATTEMPTS: z.coerce.number().int().default(6),
  HANDOFF_POLL_MS: z.coerce.number().int().default(15_000),

  // ── Trazabilidad del agente (LLMOps) ────────────────────────
  TRACE_ENABLED: z
    .string()
    .default('true')
    .transform((v) => v !== 'false' && v !== '0'),
  // El resultado de una herramienta puede ser un JSON de megabytes. Para
  // auditar basta el principio; lo completo ya está en tool_invocations.
  TRACE_MAX_PAYLOAD_CHARS: z.coerce.number().int().default(4_000),

  // ── Cola de mensajes proactivos ─────────────────────────────
  // Opcional: sin REDIS_URL la capa proactiva se apaga y el resto arranca igual.
  // El flujo de desarrollo por defecto (docker compose = solo Postgres) sigue
  // funcionando sin montar un Redis para tocar un prompt.
  REDIS_URL: z.string().optional(),
  PROACTIVE_CONCURRENCY: z.coerce.number().int().default(2),
  // Tope por minuto. Una tanda de mil recordatorios no puede agotar el rate
  // limit del proveedor y dejar sin servicio a quien está esperando en vivo.
  PROACTIVE_RATE_MAX: z.coerce.number().int().default(30),
  PROACTIVE_MAX_ATTEMPTS: z.coerce.number().int().default(4),
  PROACTIVE_MAX_TOKENS: z.coerce.number().int().default(300),
  // Descanso mínimo entre proactivos al mismo contacto: 6 h.
  PROACTIVE_MIN_GAP_MS: z.coerce.number().int().default(6 * 3600 * 1000),
  // Tope de programación: 30 días. Más allá, el contexto de la conversación ya
  // no se parece en nada al de ahora y el mensaje llegaría descolocado.
  PROACTIVE_MAX_DELAY_MS: z.coerce.number().int().default(30 * 86_400_000),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  · ${i.path.join('.') || '(raíz)'}: ${i.message}`)
    .join('\n');
  console.error(`\n❌ Configuración inválida:\n${issues}\n`);
  console.error('Copia services/api/.env.example a services/api/.env y rellénalo.\n');
  process.exit(1);
}

export const config = parsed.data;
export const isProd = config.NODE_ENV === 'production';

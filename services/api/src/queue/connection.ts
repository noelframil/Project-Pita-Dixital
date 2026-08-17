/**
 * Conexión a Redis para BullMQ.
 *
 * ── Por qué Redis si ya hay una cola en Postgres ───────────────
 *
 * El aviso de handoff se encola en `handoff_notifications`, una tabla. Esto es
 * otra cola, en Redis. No es duplicación por descuido: resuelven problemas que
 * no son el mismo.
 *
 * La cola de handoff se inserta **en la misma transacción** que el cambio de
 * estado de la conversación. Eso da una garantía que Redis no puede dar: es
 * imposible derivar a un humano y no encolar el aviso, porque o entran las dos
 * cosas o no entra ninguna. Derivar sin avisar dejaría al usuario esperando a
 * alguien que no sabe que le toca.
 *
 * Los mensajes proactivos no tienen esa atadura, y sí necesitan lo que Postgres
 * hace mal: trabajos **retrasados** ("dentro de 23 horas"). Hacer eso en SQL es
 * un `SELECT ... WHERE scheduled_for <= NOW()` en bucle, que a poco volumen ya
 * es un sondeo constante sobre una tabla que crece.
 *
 * ── Redis es opcional ──────────────────────────────────────────
 *
 * Si no hay `REDIS_URL`, la capa proactiva se apaga y el resto del servicio
 * arranca igual. El flujo de desarrollo por defecto —`docker compose up -d`,
 * solo Postgres— tiene que seguir funcionando sin que nadie monte un Redis para
 * probar un cambio en el prompt.
 */
import { Redis } from 'ioredis';
import { config } from '../config.js';

let connection: Redis | null = null;

/** Si la capa proactiva está disponible en este despliegue. */
export function isQueueEnabled(): boolean {
  return Boolean(config.REDIS_URL);
}

/**
 * Conexión compartida.
 *
 * `maxRetriesPerRequest: null` lo exige BullMQ: con un número finito, un
 * bloqueo largo del worker haría que ioredis abortase comandos que BullMQ
 * espera que sigan vivos.
 *
 * `enableOfflineQueue: false` en el productor evita que una petición HTTP se
 * quede colgada esperando a un Redis caído: falla rápido y quien encola lo
 * gestiona.
 */
export function getRedis(): Redis {
  if (!config.REDIS_URL) {
    throw new Error('REDIS_URL no configurada: la capa proactiva está apagada.');
  }

  connection ??= new Redis(config.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    lazyConnect: false,
  });

  return connection;
}

export async function closeRedis(): Promise<void> {
  if (!connection) return;
  await connection.quit();
  connection = null;
}

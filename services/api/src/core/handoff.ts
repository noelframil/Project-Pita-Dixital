/**
 * Handoff inteligente: cuándo se calla el bot y avisa a una persona.
 *
 * El estado ya existía (`conversations.status` distingue 'open' de 'handoff' y
 * `brain.ts` se calla cuando lo ve). Lo que faltaba era la vía para activarlo y
 * a quién avisar.
 *
 * **Por qué una herramienta y no un clasificador de sentimiento aparte.** Un
 * clasificador que corre en paralelo ve el texto sin ver la conversación: no
 * sabe que es la tercera vez que el usuario pregunta lo mismo, ni que el bot
 * acaba de decir que no puede ayudar. Además duplica coste y latencia en cada
 * turno. El modelo que ya está leyendo el hilo entero es quien mejor puede
 * juzgarlo, y una herramienta convierte ese juicio en una decisión explícita y
 * auditable en vez de en una inferencia sobre el texto de salida.
 *
 * El precio es que depende de que el modelo la llame. Por eso hay además una
 * red de seguridad determinista (`detectLoop`) que no depende de su criterio.
 */
import { createHmac } from 'node:crypto';
import { queryOne, transaction } from '../db.js';
import { extractText, type ChatMessage } from '../llm/index.js';
import { loadHistory } from './conversations.js';
import { config } from '../config.js';
import { query } from '../db.js';
import { decryptJson } from '../lib/crypto.js';
import type { ToolSpec } from '../llm/index.js';

/** Nombre reservado. Un cliente no puede registrar una herramienta que se llame así. */
export const HANDOFF_TOOL_NAME = 'escalar_a_humano';

export type HandoffReasonKind = 'frustracion' | 'peticion_explicita' | 'fuera_de_alcance' | 'bucle';

export const HANDOFF_TOOL: ToolSpec = {
  name: HANDOFF_TOOL_NAME,
  description:
    'Deriva la conversación a una persona del equipo y deja de responder tú. ' +
    'Úsala en cuanto se cumpla una de estas condiciones, sin esperar a que empeore: ' +
    'el usuario pide hablar con una persona, aunque sea de pasada; muestra enfado, ' +
    'urgencia o frustración; te ha preguntado lo mismo dos veces sin quedar ' +
    'satisfecho; el asunto tiene consecuencias serias (dinero, salud, seguridad, ' +
    'legal, una queja formal); o necesita algo que no puedes hacer con las ' +
    'herramientas que tienes. Ante la duda, deriva: molesta mucho menos que un ' +
    'humano intervenga de más que dejar tirada a una persona enfadada.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['motivo', 'resumen', 'urgencia'],
    properties: {
      motivo: {
        type: 'string',
        enum: ['frustracion', 'peticion_explicita', 'fuera_de_alcance', 'bucle'],
        description:
          'frustracion: enfadado o harto. peticion_explicita: pidió hablar con alguien. ' +
          'fuera_de_alcance: necesita algo que no puedes hacer. bucle: le has dado ' +
          'vueltas sin resolverlo.',
      },
      resumen: {
        type: 'string',
        description:
          'Qué necesita esta persona y qué se ha intentado ya, en dos o tres frases. ' +
          'Lo lee quien va a coger la conversación y no ha visto nada de lo anterior: ' +
          'escríbelo para que pueda continuar sin releer el hilo entero.',
      },
      urgencia: {
        type: 'string',
        enum: ['baja', 'media', 'alta'],
        description: 'alta si hay dinero, seguridad o un cliente a punto de perderse.',
      },
    },
  },
};

/**
 * Instrucciones que se anexan al prompt del sistema cuando el handoff está
 * activo. Van aparte de la plantilla del cliente por lo mismo que los
 * guardrails: es infraestructura, no personalidad, y debe poder mejorarse para
 * toda la cartera a la vez.
 */
export const HANDOFF_PROMPT_BLOCK = `

# CUÁNDO DEJAR PASO A UNA PERSONA
Tienes la herramienta ${HANDOFF_TOOL_NAME}. Llámala en cuanto se dé una de estas señales, sin darle más vueltas:

- Piden hablar con una persona, con el responsable o con alguien del equipo. Aunque lo digan de pasada, aunque sigan hablando después.
- Notas enfado, hartazgo, urgencia o decepción. Frases como "esto es un desastre", "llevo toda la mañana", "no me estás entendiendo", varios mensajes seguidos muy cortos, o mayúsculas sostenidas.
- Te preguntan por segunda vez algo que ya intentaste responder y no ha quedado resuelto.
- El asunto tiene consecuencias: un cobro, una anulación, un daño, algo de salud o seguridad, una reclamación formal, algo legal.
- Te piden algo que no puedes hacer con tus herramientas, y no hay alternativa que ofrecer.

Cuando la llames, escribe el resumen para quien va a coger la conversación desde cero: qué necesita esa persona, qué se ha intentado y qué queda pendiente.

Ante la duda, deriva. Que un compañero entre de más cuesta un minuto; dejar tirada a una persona enfadada cuesta un cliente.

No anuncies que vas a derivar antes de hacerlo, y no prometas plazos de respuesta: no sabes cuándo estará libre el equipo. Llama a la herramienta y despídete con naturalidad.`;

/** Lo que se le dice al usuario en el turno en que se deriva. */
export const HANDOFF_USER_REPLY =
  'Voy a pasarle esto a una persona del equipo, que te va a atender mucho mejor que yo. ' +
  'Te escriben en cuanto puedan por aquí mismo.';

export interface HandoffRequest {
  conversationId: string;
  clientId: string;
  motivo: HandoffReasonKind;
  resumen: string;
  urgencia: 'baja' | 'media' | 'alta';
  channel: string;
  contactName?: string | null;
}

/**
 * Deriva la conversación y encola el aviso.
 *
 * El webhook **no** se manda aquí. Si el servidor del cliente tarda treinta
 * segundos en contestar, el usuario se queda mirando la pantalla esperando una
 * respuesta que ya está decidida. Se encola y lo entrega un trabajador aparte,
 * con reintentos.
 *
 * El cambio de estado y el encolado van en la misma transacción: derivar sin
 * avisar deja al usuario esperando a alguien que no sabe que le toca.
 */
export async function escalateToHuman(req: HandoffRequest): Promise<void> {
  const { transaction } = await import('../db.js');

  await transaction(async (client) => {
    await client.query(
      `UPDATE conversations
          SET status = 'handoff', handoff_reason = $2, handoff_at = NOW()
        WHERE id = $1 AND status <> 'handoff'`,
      [req.conversationId, req.motivo],
    );

    const payload = {
      event: 'handoff.requested',
      conversation_id: req.conversationId,
      channel: req.channel,
      contact_name: req.contactName ?? null,
      motivo: req.motivo,
      urgencia: req.urgencia,
      resumen: req.resumen,
      requested_at: new Date().toISOString(),
    };

    await client.query(
      `INSERT INTO handoff_notifications (conversation_id, client_id, payload)
       VALUES ($1, $2, $3)`,
      [req.conversationId, req.clientId, JSON.stringify(payload)],
    );
  });

  // Lóbulo Frontal: Aprender del Handoff en background (no bloqueante)
  import('./learner.js').then((m) => {
    m.learnFromConversation(req.conversationId, req.clientId).catch(console.error);
  }).catch(console.error);
}

/**
 * Red de seguridad determinista, que no depende del criterio del modelo.
 *
 * Detecta que el usuario repite prácticamente lo mismo mientras el bot no
 * avanza. Es el caso que peor detecta un modelo desde dentro: cada turno le
 * parece razonable por separado, y no percibe que lleva tres dando vueltas.
 *
 * Deliberadamente conservador: la señal es que el **usuario** se repite, no que
 * el bot lo haga. Un usuario puede insistir con razón, pero si insiste tres
 * veces y sigue aquí, el bot no lo está resolviendo.
 */
export function detectLoop(history: ChatMessage[], threshold = 3): boolean {
  const userMessages = history
    .filter((m) => m.role === 'user')
    .map((m) => normalize(extractText(m.content)))
    .filter((t) => t.length >= 8); // "sí", "vale", "ok" se repiten sin significar nada

  if (userMessages.length < threshold) return false;

  const recent = userMessages.slice(-threshold);
  const first = recent[0]!;

  return recent.every((msg) => similarity(first, msg) >= 0.8);
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // tildes fuera: "está" y "esta" son lo mismo aquí
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Palabras vacías. Se quitan antes de comparar porque son las que hacen que dos
 * frases distintas parezcan iguales: "¿a qué hora abre la piscina?" y "¿a qué
 * hora cierra la piscina?" comparten cinco de siete palabras y no tienen nada
 * que ver. Quitándolas quedan {hora, abre, piscina} y {hora, cierra, piscina},
 * que ya se distinguen.
 */
const STOPWORDS = new Set([
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'de', 'del', 'al', 'a',
  'en', 'por', 'para', 'con', 'sin', 'sobre', 'y', 'o', 'que', 'qué', 'se', 'su',
  'sus', 'mi', 'mis', 'tu', 'tus', 'me', 'te', 'lo', 'le', 'les', 'es', 'son',
  'esta', 'este', 'esto', 'ese', 'esa', 'eso', 'hay', 'ha', 'he', 'muy', 'ya',
  'pero', 'como', 'cuando', 'porque', 'si', 'no', 'mas', 'yo',
]);

function contentWords(normalized: string): Set<string> {
  return new Set(normalized.split(' ').filter((w) => w && !STOPWORDS.has(w)));
}

/**
 * Similitud por solape de palabras con contenido (Jaccard).
 *
 * Basta para lo que se necesita: detectar que alguien reformula la misma
 * pregunta. Una distancia de edición sería más fina y bastante más cara, y aquí
 * no compensa.
 */
function similarity(a: string, b: string): number {
  const setA = contentWords(a);
  const setB = contentWords(b);
  // Si tras quitar las palabras vacías no queda nada, no hay nada que comparar.
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const word of setA) if (setB.has(word)) intersection++;

  return intersection / (setA.size + setB.size - intersection);
}

// ── Entrega del webhook ──────────────────────────────────────────

interface PendingNotification {
  id: string;
  client_id: string;
  payload: Record<string, unknown>;
  attempts: number;
  webhook_handoff_url: string | null;
  webhook_secret: Buffer | null;
}

/**
 * Entrega los avisos pendientes.
 *
 * `FOR UPDATE SKIP LOCKED` permite que haya varias instancias del servicio
 * trabajando la cola sin repartirse el trabajo por otra vía: cada una coge lo
 * que no tenga bloqueado otra. Sin eso, dos procesos mandarían el mismo aviso
 * dos veces.
 */
export async function deliverPendingHandoffs(log: {
  info: (o: object, m: string) => void;
  warn: (o: object, m: string) => void;
}): Promise<void> {
  const { transaction } = await import('../db.js');

  const pending = await transaction(async (client) => {
    const res = await client.query<PendingNotification>(
      `SELECT n.id, n.client_id, n.payload, n.attempts,
              c.webhook_handoff_url, c.webhook_secret
         FROM handoff_notifications n
         JOIN clients c ON c.id = n.client_id
        WHERE n.status = 'pending' AND n.next_attempt_at <= NOW()
        ORDER BY n.next_attempt_at
        LIMIT 20
          FOR UPDATE OF n SKIP LOCKED`,
    );
    return res.rows;
  });

  for (const item of pending) {
    if (!item.webhook_handoff_url) {
      // Cliente sin webhook configurado. No es un fallo: la derivación funcionó
      // igual y el estado ya está en 'handoff'. Se marca entregado para que no
      // se reintente eternamente algo que no tiene destino.
      await query(
        `UPDATE handoff_notifications
            SET status = 'delivered', delivered_at = NOW(),
                last_error = 'cliente sin webhook_handoff_url'
          WHERE id = $1`,
        [item.id],
      );
      continue;
    }

    const result = await postWebhook(item);

    if (result.ok) {
      await query(
        `UPDATE handoff_notifications
            SET status = 'delivered', delivered_at = NOW(), attempts = attempts + 1
          WHERE id = $1`,
        [item.id],
      );
      log.info({ notificationId: item.id }, 'aviso de handoff entregado');
      continue;
    }

    const attempts = item.attempts + 1;
    const agotado = attempts >= config.HANDOFF_MAX_ATTEMPTS;
    // Backoff exponencial: 1, 2, 4, 8… minutos. Un servidor caído no se
    // arregla porque se le insista cada segundo.
    const delayMinutes = Math.min(2 ** item.attempts, 60);

    await query(
      `UPDATE handoff_notifications
          SET attempts = $2,
              status = $3,
              last_error = $4,
              next_attempt_at = NOW() + ($5 || ' minutes')::interval
        WHERE id = $1`,
      [item.id, attempts, agotado ? 'failed' : 'pending', result.error, String(delayMinutes)],
    );

    log.warn(
      { notificationId: item.id, attempts, error: result.error, agotado },
      'fallo entregando el aviso de handoff',
    );
  }
}

/**
 * Firma HMAC-SHA256 sobre el cuerpo crudo, con marca de tiempo dentro de la
 * firma.
 *
 * La marca va firmada y no solo enviada: sin ella, quien capture una entrega
 * válida puede reenviarla indefinidamente. El receptor debe rechazar lo que
 * llegue con más de unos minutos de antigüedad.
 */
export function signWebhook(secret: string, body: string, timestamp: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

async function postWebhook(
  item: PendingNotification,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const body = JSON.stringify(item.payload);
  const timestamp = String(Math.floor(Date.now() / 1000));

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'user-agent': 'pita-dixital/1.0',
    'x-pita-event': 'handoff.requested',
    'x-pita-timestamp': timestamp,
  };

  if (item.webhook_secret) {
    try {
      const secret = decryptJson<{ secret: string }>(item.webhook_secret).secret;
      headers['x-pita-signature'] = `sha256=${signWebhook(secret, body, timestamp)}`;
    } catch {
      return { ok: false, error: 'no se pudo descifrar webhook_secret' };
    }
  }

  try {
    const res = await fetch(item.webhook_handoff_url!, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(config.HANDOFF_WEBHOOK_TIMEOUT_MS),
      // Una redirección puede llevar el aviso —con el resumen de la
      // conversación dentro— a un sitio distinto del configurado.
      redirect: 'error',
    });

    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true };
  } catch (err) {
    const timeout = err instanceof Error && err.name === 'TimeoutError';
    return { ok: false, error: timeout ? 'timeout' : String(err).slice(0, 200) };
  }
}

/** Arranca el trabajador de la cola. Devuelve la función para pararlo. */
export function startHandoffWorker(log: Parameters<typeof deliverPendingHandoffs>[0] & {
  error: (o: object, m: string) => void;
}): () => void {
  let stopped = false;

  const tick = async () => {
    while (!stopped) {
      try {
        await deliverPendingHandoffs(log);
      } catch (err) {
        log.error({ err }, 'fallo en el trabajador de handoff');
      }
      await new Promise((r) => setTimeout(r, config.HANDOFF_POLL_MS));
    }
  };

  void tick();
  return () => {
    stopped = true;
  };
}

/** Datos del cliente que hacen falta al derivar. */
export async function loadHandoffTarget(
  clientId: string,
): Promise<{ hasWebhook: boolean } | null> {
  const row = await queryOne<{ webhook_handoff_url: string | null }>(
    `SELECT webhook_handoff_url FROM clients WHERE id = $1`,
    [clientId],
  );
  if (!row) return null;
  return { hasWebhook: Boolean(row.webhook_handoff_url) };
}

/**
 * Generación y envío de mensajes proactivos.
 *
 * Un mensaje proactivo es el bot escribiendo primero. Eso lo cambia todo
 * respecto a responder: nadie ha pedido este mensaje, así que las razones para
 * **no** enviarlo pesan más que las razones para enviarlo. De ahí que casi todo
 * este fichero sean comprobaciones previas.
 *
 * El texto lo redacta el modelo a partir de una instrucción en lenguaje natural
 * ("avisa de que la cita es mañana"), no se manda literal. Un texto literal se
 * saltaría la personalidad del cliente y respondería en castellano a quien
 * llevaba toda la conversación hablando en gallego.
 */
import { config } from '../config.js';
import { query, queryOne } from '../db.js';
import { complete } from '../llm/index.js';
import { loadBotConfig } from './brain.js';
import { buildSummaryBlock } from './memory.js';
import { compileTemplate, mergeVariables } from './prompt.js';
import { loadHistory, recordMessage, type ChannelKind } from './conversations.js';

export type ProactiveSkipReason =
  | 'conversacion_en_handoff'
  | 'sin_conversacion_previa'
  | 'demasiado_pronto'
  | 'ventana_cerrada'
  | 'sin_bot_config';

export interface ProactiveOutcome {
  sent: boolean;
  skipReason?: ProactiveSkipReason;
  text?: string;
  messageId?: string;
  conversationId?: string;
  costMicros?: number;
}

/**
 * Instrucciones para redactar el mensaje.
 *
 * Se anexan al prompt del cliente para que el bot mantenga su voz. Lo que
 * cambia respecto a una respuesta normal es el encuadre: aquí el bot interrumpe
 * a alguien que no estaba esperando nada, y eso pide otro tono.
 */
const PROACTIVE_PROMPT_BLOCK = `

# ESTE MENSAJE LO INICIAS TÚ
No estás respondiendo a nadie: vas a escribir tú primero, y quien lo reciba no está esperando un mensaje tuyo. Escríbelo teniendo eso en cuenta.

- Ve al grano en la primera frase. Quien lo lea tiene que entender de qué va sin abrir un hilo anterior.
- Si ya habíais hablado, retómalo con naturalidad, sin repetirle lo que ya sabe y sin dar por hecho que lo recuerda todo.
- Un solo mensaje, corto. Dos o tres frases.
- No saludes como si empezara una conversación nueva si ya os conocéis, ni te disculpes por escribir.
- No inventes datos que no estén en la instrucción ni en lo que ya sabes. Si la instrucción menciona una hora o una fecha, respétala exactamente.
- Termina de forma que la persona pueda contestarte si quiere, sin exigirle que lo haga.

Devuelve únicamente el mensaje, sin comillas ni preámbulos.`;

interface ConversationRow {
  id: string;
  status: string;
  summary: string | null;
  summarized_until: Date | null;
  last_proactive_at: Date | null;
  window_expires_at: Date | null;
  channel_account_id: string | null;
}

/**
 * Redacta y registra un mensaje proactivo.
 *
 * Devuelve el texto para que quien llama lo envíe por el canal. No se envía
 * aquí: separar la redacción del envío permite probar esto sin salir a la red y
 * mantiene el envío donde ya vive, en los adaptadores de canal.
 */
export async function composeProactiveMessage(params: {
  clientId: string;
  sessionId: string;
  channel: ChannelKind;
  contextPrompt: string;
}): Promise<ProactiveOutcome> {
  const cfg = await loadBotConfig(params.clientId);
  if (!cfg) return { sent: false, skipReason: 'sin_bot_config' };

  const conversation = await queryOne<ConversationRow>(
    `SELECT id, status, summary, summarized_until, last_proactive_at,
            window_expires_at, channel_account_id
       FROM conversations
      WHERE client_id = $1 AND thread_ref = $2 AND channel = $3::channel_kind`,
    [params.clientId, params.sessionId, params.channel],
  );

  // ── Comprobaciones previas ──────────────────────────────────
  //
  // Todas devuelven un motivo en vez de lanzar: saltarse un proactivo es
  // normal y esperado, no un fallo. Que aparezca como error en los logs haría
  // que nadie mirase los errores de verdad.

  if (!conversation) {
    // Sin conversación previa no hay a quién escribir: el `thread_ref` de un
    // canal es la referencia que da el proveedor, y no se puede inventar.
    return { sent: false, skipReason: 'sin_conversacion_previa' };
  }

  if (conversation.status === 'handoff') {
    // Una persona está atendiendo esto. Que el bot escriba por encima es
    // exactamente lo que el handoff existe para impedir.
    return { sent: false, skipReason: 'conversacion_en_handoff', conversationId: conversation.id };
  }

  if (conversation.last_proactive_at) {
    const desde = Date.now() - conversation.last_proactive_at.getTime();
    if (desde < config.PROACTIVE_MIN_GAP_MS) {
      // Varios disparadores programados para el mismo contacto pueden coincidir.
      // Sin este freno, la persona recibe tres avisos seguidos y bloquea el bot.
      return { sent: false, skipReason: 'demasiado_pronto', conversationId: conversation.id };
    }
  }

  if (conversation.window_expires_at && conversation.window_expires_at.getTime() < Date.now()) {
    // WhatsApp e Instagram cierran la ventana de respuesta libre a las 24 h.
    // Fuera de ella solo se puede mandar una plantilla aprobada, no texto
    // generado: enviarlo igual es un rechazo del proveedor y, repetido, una
    // sanción sobre el número del cliente.
    return { sent: false, skipReason: 'ventana_cerrada', conversationId: conversation.id };
  }

  // ── Redacción ───────────────────────────────────────────────

  const { variables } = mergeVariables(cfg.dynamic_variables ?? {}, {}, []);
  const { prompt: compiled } = compileTemplate(cfg.system_prompt_template, variables);

  const entries = await loadHistory(
    conversation.id,
    cfg.history_turns,
    conversation.summarized_until,
  );

  const systemPrompt =
    compiled + buildSummaryBlock(conversation.summary) + PROACTIVE_PROMPT_BLOCK;

  // El historial va como contexto y la instrucción como último turno de
  // usuario. Va delimitada y marcada como orden interna: si no, una instrucción
  // como "avisa de que su pedido se retrasa" podría acabar copiada literalmente
  // en el mensaje al cliente.
  const result = await complete(cfg.provider, {
    model: cfg.model,
    system: systemPrompt,
    messages: [
      ...entries.map((e) => e.message),
      {
        role: 'user',
        content:
          'Instrucción interna del sistema, no es un mensaje de la persona. ' +
          'Redacta el mensaje que le vas a enviar:\n' +
          `<instruccion>\n${params.contextPrompt}\n</instruccion>`,
      },
    ],
    temperature: cfg.temperature,
    maxTokens: Math.min(cfg.max_tokens, config.PROACTIVE_MAX_TOKENS),
    signal: AbortSignal.timeout(config.LLM_TIMEOUT_MS),
  });

  const text = result.text.trim();
  if (!text) {
    throw new Error('El modelo devolvió un mensaje proactivo vacío');
  }

  // ── Registro ────────────────────────────────────────────────

  const messageId = await recordMessage({
    conversationId: conversation.id,
    role: 'assistant',
    text,
    model: result.model,
    tokensPrompt: result.promptTokens,
    tokensCompletion: result.completionTokens,
    costMicros: result.costMicros,
    origin: 'proactive',
  });

  await query(`UPDATE conversations SET last_proactive_at = NOW() WHERE id = $1`, [
    conversation.id,
  ]);

  return {
    sent: true,
    text,
    messageId: messageId ?? undefined,
    conversationId: conversation.id,
    costMicros: result.costMicros,
  };
}

/**
 * Instrucción para el mensaje de cierre tras una intervención humana.
 *
 * Se genera aquí y no la escribe quien llama al endpoint: el agente que resuelve
 * un ticket no tiene por qué saber redactar prompts, y así el tono es
 * consistente en toda la cartera.
 */
export function buildHandoffResolvedPrompt(note?: string): string {
  const base =
    'Un compañero del equipo acaba de atender a esta persona y ha cerrado el asunto. ' +
    'Retoma tú la conversación con un mensaje breve: comprueba que quedó resuelto y ' +
    'ofrécete para lo que necesite a partir de ahora. No repitas lo que dijo tu ' +
    'compañero ni des por hecho lo que se habló fuera de este canal.';

  return note?.trim() ? `${base}\n\nContexto que dejó el compañero: ${note.trim()}` : base;
}

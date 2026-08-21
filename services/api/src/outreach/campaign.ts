/**
 * Motor de campañas.
 *
 * El orden de las comprobaciones es deliberado: primero se descarta a quien no
 * debe recibir nada, después se compone, y solo al final se envía. Componer
 * antes de comprobar la supresión funciona igual, pero deja abierta la puerta
 * a que un fallo en medio mande un correo a alguien que pidió no recibirlos.
 */
import { randomBytes } from 'node:crypto';
import { config } from '../config.js';
import { query, queryOne } from '../db.js';
import { buildFooter, sendEmail, EmailError } from './email.js';

export interface CampaignRow {
  id: string;
  client_id: string;
  name: string;
  segment: string | null;
  subject: string;
  body_template: string;
  from_name: string;
  from_email: string;
  reply_to: string | null;
  status: string;
}

export interface ProspectRow {
  id: string;
  email: string;
  display_name: string | null;
  organisation: string | null;
  role_title: string | null;
  source: string;
}

export interface RunSummary {
  campaign: string;
  live: boolean;
  candidates: number;
  sent: number;
  skipped: number;
  failed: number;
  skipReasons: Record<string, number>;
}

/** Personaliza en una sola pasada, igual que el prompt del bot. */
function compose(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k: string) => vars[k] ?? '');
}

function sourceNote(source: string): string {
  // Art. 14 RGPD: hay que decir de dónde salió el dato, no solo que se puede
  // dar de baja.
  if (source.startsWith('apollo')) {
    return 'Ha recibido este correo porque sus datos profesionales figuran en Apollo.io, una base de datos de contactos empresariales, y su perfil encaja con el tipo de contraparte de esta operación.';
  }
  return `Ha recibido este correo porque sus datos profesionales constan en nuestro registro (origen: ${source}).`;
}

/**
 * Ejecuta una campaña.
 *
 * `dryRun` fuerza el ensayo aunque `OUTREACH_LIVE` esté activo, para poder
 * revisar destinatarios y textos definitivos sin arriesgarse a un envío.
 */
export async function runCampaign(
  campaignId: string,
  opts: { dryRun?: boolean; limit?: number } = {},
): Promise<RunSummary> {
  const campaign = await queryOne<CampaignRow>(
    `SELECT * FROM campaigns WHERE id = $1`,
    [campaignId],
  );
  if (!campaign) throw new Error(`No existe la campaña ${campaignId}`);

  // Nada sale sin que una persona haya aprobado el texto. El estado 'draft' es
  // el freno: se generó automáticamente, pero lo firma alguien.
  if (campaign.status !== 'approved' && campaign.status !== 'sending') {
    throw new Error(
      `La campaña "${campaign.name}" está en estado "${campaign.status}". ` +
        `Apruébala antes de enviar: npm run outreach -- approve-campaign ${campaign.name} "<tu nombre>"`,
    );
  }

  const live = config.OUTREACH_LIVE && !opts.dryRun;

  // Candidatos: del segmento, activos, sin envío previo en esta campaña y
  // ausentes de la lista de supresión. La supresión se cruza en SQL en vez de
  // comprobarse en el bucle: así no depende de que el bucle acierte siempre.
  const candidates = await query<ProspectRow>(
    `SELECT p.id, p.email, p.display_name, p.organisation, p.role_title, p.source
       FROM prospects p
      WHERE p.client_id = $1
        AND p.status = 'active'
        -- Comparación normalizada, no exacta. Las campañas heredan el nombre
        -- del vertical del pipeline ("Agroindustria", "M&A y situaciones
        -- especiales") y los prospectos llegan con el slug del CLI. Comparar
        -- literalmente no cruza nada, y el síntoma es una campaña que dice
        -- "0 candidatos" sin ningún error: parece que no hay nadie.
        AND ($2::text IS NULL OR EXISTS (
              SELECT 1 FROM unnest(p.segments) AS seg
               WHERE lower(regexp_replace(seg,   '[^a-zA-Z0-9]+', '-', 'g'))
                   = lower(regexp_replace($2::text, '[^a-zA-Z0-9]+', '-', 'g'))))
        AND NOT EXISTS (
              SELECT 1 FROM suppression s
               WHERE s.client_id = p.client_id AND lower(s.email) = lower(p.email))
        AND NOT EXISTS (
              SELECT 1 FROM campaign_sends cs
               WHERE cs.campaign_id = $3 AND cs.prospect_id = p.id
                 AND cs.status IN ('sent','pending'))
      ORDER BY p.created_at
      LIMIT $4`,
    [campaign.client_id, campaign.segment, campaign.id, opts.limit ?? 1000],
  );

  const summary: RunSummary = {
    campaign: campaign.name,
    live,
    candidates: candidates.length,
    sent: 0,
    skipped: 0,
    failed: 0,
    skipReasons: {},
  };

  const gapMs = Math.ceil(60_000 / Math.max(1, config.OUTREACH_SEND_PER_MINUTE));
  const baseUrl = config.PUBLIC_BASE_URL ?? `http://localhost:${config.PORT}`;

  for (const prospect of candidates) {
    const token = randomBytes(24).toString('base64url');
    const unsubscribeUrl = `${baseUrl}/api/v1/outreach/unsubscribe/${token}`;

    // La fila se crea antes de enviar. Si el proceso muere a mitad, queda
    // constancia de la intención y no se reenvía a ciegas.
    const send = await queryOne<{ id: string }>(
      `INSERT INTO campaign_sends (campaign_id, prospect_id, unsub_token, status)
       VALUES ($1,$2,$3,'pending')
       ON CONFLICT (campaign_id, prospect_id) DO NOTHING
       RETURNING id`,
      [campaign.id, prospect.id, token],
    );
    if (!send) {
      summary.skipped++;
      summary.skipReasons.duplicado = (summary.skipReasons.duplicado ?? 0) + 1;
      continue;
    }

    const firstName = (prospect.display_name ?? '').trim().split(/\s+/)[0] ?? '';
    const body =
      compose(campaign.body_template, {
        first_name: firstName,
        full_name: prospect.display_name ?? '',
        organisation: prospect.organisation ?? '',
        role_title: prospect.role_title ?? '',
      }) + buildFooter(unsubscribeUrl, sourceNote(prospect.source));

    try {
      const outcome = await sendEmail({
        to: prospect.email,
        subject: compose(campaign.subject, { first_name: firstName, organisation: prospect.organisation ?? '' }),
        text: body,
        unsubscribeUrl,
      });

      await query(
        `UPDATE campaign_sends
            SET status='sent', provider_msg_id=$2, sent_at=NOW()
          WHERE id=$1`,
        [send.id, outcome.providerMsgId],
      );
      summary.sent++;
    } catch (err) {
      const message = err instanceof EmailError ? err.message : String(err);
      await query(
        `UPDATE campaign_sends SET status='failed', error=$2 WHERE id=$1`,
        [send.id, message.slice(0, 500)],
      );
      summary.failed++;
    }

    if (live) await new Promise((r) => setTimeout(r, gapMs));
  }

  return summary;
}

/** Da de baja por token. Idempotente: repetir el clic no rompe nada. */
export async function unsubscribeByToken(token: string): Promise<{ ok: boolean; email?: string }> {
  const row = await queryOne<{ email: string; client_id: string; prospect_id: string }>(
    `SELECT p.email, p.client_id, p.id AS prospect_id
       FROM campaign_sends cs
       JOIN prospects p ON p.id = cs.prospect_id
      WHERE cs.unsub_token = $1`,
    [token],
  );
  if (!row) return { ok: false };

  await query(
    `INSERT INTO suppression (client_id, email, reason, evidence)
     VALUES ($1,$2,'unsubscribe',$3)
     ON CONFLICT (client_id, email) DO NOTHING`,
    [row.client_id, row.email, JSON.stringify({ token, at: new Date().toISOString() })],
  );
  await query(`UPDATE prospects SET status='closed' WHERE id=$1`, [row.prospect_id]);

  return { ok: true, email: row.email };
}

/**
 * Hunter.io — descubrimiento de emails por dominio.
 *
 * Resuelve el bloqueo de Apollo: su plan gratuito capa la API de personas
 * ("no accesible ni con clave maestra"), mientras que Hunter deja la suya
 * abierta en el plan gratuito. Como ya tenemos los dominios de las cuentas
 * objetivo, buscar por dominio cierra el círculo sin ninguna acción manual.
 *
 * Lo que lo hace utilizable, más allá de que responda, son dos campos que
 * Apollo no da: `verification`, que dice si la dirección existe, y
 * `confidence`. Con eso el descubrimiento automático deja de ser adivinar
 * patrones —que rebota y quema el dominio— y pasa a ser un dato comprobado.
 */
import { config } from '../config.js';

const BASE = 'https://api.hunter.io/v2';

export interface HunterEmail {
  email: string;
  confidence: number;
  /** personal | generic. Los genéricos (info@, sales@) no son una persona. */
  type: string;
  firstName: string | null;
  lastName: string | null;
  position: string | null;
  seniority: string | null;
  department: string | null;
  decisionMaker: boolean | null;
  /** valid | accept_all | unknown | invalid */
  verificationStatus: string | null;
}

export interface DomainSearchResult {
  domain: string;
  organisation: string | null;
  pattern: string | null;
  emails: HunterEmail[];
  /** Total que Hunter tiene indexados, aunque devuelva menos. */
  totalIndexed: number;
}

export class HunterError extends Error {
  constructor(message: string, readonly status: number | null, readonly retryable: boolean) {
    super(message);
    this.name = 'HunterError';
  }
}

export interface DomainSearchOptions {
  limit?: number;
  /** junior | senior | executive */
  seniority?: string;
  /** executive, finance, management… */
  department?: string;
  decisionMaker?: boolean;
  /** personal descarta info@ y similares en el servidor, sin gastar de más. */
  type?: 'personal' | 'generic';
}

export async function domainSearch(
  domain: string,
  opts: DomainSearchOptions = {},
): Promise<DomainSearchResult> {
  if (!config.HUNTER_API_KEY) {
    throw new HunterError('HUNTER_API_KEY no configurada.', null, false);
  }

  const url = new URL(`${BASE}/domain-search`);
  url.searchParams.set('domain', domain);
  url.searchParams.set('limit', String(Math.min(opts.limit ?? 10, 100)));
  if (opts.seniority) url.searchParams.set('seniority', opts.seniority);
  if (opts.department) url.searchParams.set('department', opts.department);
  if (opts.decisionMaker) url.searchParams.set('decision_maker', 'true');
  if (opts.type) url.searchParams.set('type', opts.type);

  const res = await fetch(url, {
    headers: { 'X-API-KEY': config.HUNTER_API_KEY, accept: 'application/json' },
    signal: AbortSignal.timeout(config.HUNTER_TIMEOUT_MS),
  });

  const body = (await res.json().catch(() => ({}))) as {
    data?: {
      domain?: string;
      organization?: string;
      pattern?: string;
      emails?: Array<Record<string, unknown>>;
      meta?: { results?: number };
    };
    meta?: { results?: number };
    errors?: Array<{ details?: string; code?: number }>;
  };

  if (!res.ok) {
    const detalle = body.errors?.[0]?.details ?? res.statusText;
    // 429 aquí casi siempre es saldo agotado, no ritmo: Hunter usa el mismo
    // código para ambos y conviene nombrarlo para no perseguir un backoff que
    // nunca va a resolverlo.
    if (res.status === 429) {
      throw new HunterError(
        `Hunter 429: ${detalle}. Suele ser saldo mensual agotado, no exceso de ritmo. ` +
          `Compruébalo en hunter.io/api-keys.`,
        429,
        false,
      );
    }
    throw new HunterError(`Hunter ${res.status}: ${detalle}`, res.status, res.status >= 500);
  }

  const d = body.data ?? {};
  const str = (v: unknown) => (typeof v === 'string' && v.length ? v : null);

  return {
    domain: d.domain ?? domain,
    organisation: str(d.organization),
    pattern: str(d.pattern),
    totalIndexed: body.meta?.results ?? d.meta?.results ?? 0,
    emails: (d.emails ?? []).map((e) => {
      const ver = e.verification as Record<string, unknown> | undefined;
      return {
        email: String(e.value ?? ''),
        confidence: typeof e.confidence === 'number' ? e.confidence : 0,
        type: String(e.type ?? ''),
        firstName: str(e.first_name),
        lastName: str(e.last_name),
        position: str(e.position),
        seniority: str(e.seniority),
        department: str(e.department),
        decisionMaker: typeof e.decision_maker === 'boolean' ? e.decision_maker : null,
        verificationStatus: str(ver?.status),
      };
    }),
  };
}

/**
 * Decide si una dirección descubierta merece entrar en la lista.
 *
 * El estado de verificación es lo que separa esto de adivinar: `invalid` se
 * descarta siempre, e `accept_all` —dominios que aceptan cualquier buzón— no
 * confirma nada, así que solo pasa si la confianza es alta.
 */
export function mereceLaPena(
  e: HunterEmail,
  minConfianza: number,
): { ok: boolean; motivo?: string } {
  if (e.type === 'generic') return { ok: false, motivo: 'buzón genérico' };
  if (e.verificationStatus === 'invalid') return { ok: false, motivo: 'verificación: inválido' };
  if (e.confidence < minConfianza) {
    return { ok: false, motivo: `confianza ${e.confidence} < ${minConfianza}` };
  }
  if (e.verificationStatus === 'accept_all' && e.confidence < 90) {
    return { ok: false, motivo: 'accept_all con confianza media' };
  }
  return { ok: true };
}

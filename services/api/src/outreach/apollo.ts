/**
 * Conector de Apollo.io.
 *
 * La API separa buscar de desbloquear, y esa separación es la que decide la
 * factura:
 *
 *   - `mixed_people/api_search` no cuesta créditos y devuelve `has_email`,
 *     pero el email viene ofuscado. Sirve para dimensionar y filtrar gratis.
 *   - `people/bulk_match` sí cuesta: 1 crédito por email o dato demográfico
 *     encontrado, y 8 más si devuelve móvil. Si no encuentra nada, 0.
 *
 * Por eso el flujo es siempre buscar → descartar los `has_email: false` →
 * enriquecer solo el resto. Enriquecer a ciegas paga créditos por gente de la
 * que Apollo ya sabía que no tenía email.
 */
import { config } from '../config.js';

const BASE = 'https://api.apollo.io/api/v1';

/** Tope duro de la API: 100 por página y 500 páginas. */
export const SEARCH_PAGE_SIZE = 100;
export const SEARCH_MAX_PAGES = 500;

/** `bulk_match` acepta como mucho 10 personas por llamada. */
export const ENRICH_BATCH_SIZE = 10;

export interface ApolloSearchFilters {
  personTitles?: string[];
  personSeniorities?: string[];
  personLocations?: string[];
  organizationLocations?: string[];
  organizationNumEmployeesRanges?: string[];
  /** verified | unverified | likely to engage | unavailable */
  contactEmailStatus?: string[];
  page?: number;
  perPage?: number;
}

export interface ApolloPerson {
  id: string;
  firstName: string | null;
  /** En búsqueda viene ofuscado ("Gar***z"). El real llega al enriquecer. */
  lastNameObfuscated: string | null;
  title: string | null;
  hasEmail: boolean;
  organisation: string | null;
  organisationDomain: string | null;
}

export interface ApolloEnriched {
  id: string;
  firstName: string | null;
  lastName: string | null;
  name: string | null;
  email: string | null;
  title: string | null;
  organisation: string | null;
  organisationDomain: string | null;
  linkedinUrl: string | null;
  country: string | null;
}

export class ApolloError extends Error {
  constructor(message: string, readonly status: number | null, readonly retryable: boolean) {
    super(message);
    this.name = 'ApolloError';
  }
}

function apiKey(): string {
  const key = config.APOLLO_API_KEY;
  if (!key) {
    throw new ApolloError(
      'APOLLO_API_KEY no configurada. Añádela al .env.',
      null,
      false,
    );
  }
  return key;
}

async function post<T>(path: string, body: unknown, queryParams?: Record<string, string>): Promise<T> {
  const url = new URL(`${BASE}${path}`);
  for (const [k, v] of Object.entries(queryParams ?? {})) url.searchParams.set(k, v);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey(),
      'content-type': 'application/json',
      accept: 'application/json',
    },
    signal: AbortSignal.timeout(config.APOLLO_TIMEOUT_MS),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    // 429 es el límite de ritmo; los 5xx son suyos. El resto es culpa nuestra
    // y reintentarlo sale igual de mal, solo que más tarde.
    const retryable = res.status === 429 || res.status >= 500;

    // Un 401/403 aquí casi nunca es la clave mal copiada: es que el plan no
    // habilita ese endpoint. La documentación de Apollo dice literalmente que
    // "el acceso a la API depende de tu plan" sin concretar cuál, así que
    // conviene nombrar la causa probable en vez de dejar un 403 pelado.
    if (res.status === 401 || res.status === 403) {
      throw new ApolloError(
        `Apollo ${res.status}: la clave existe pero este endpoint está denegado. ` +
          `Suele significar que el plan no incluye acceso a la API (el plan Free ` +
          `la tiene limitada o desactivada según la cuenta). Compruébalo en ` +
          `https://developer.apollo.io/#/keys y, si hace falta, con soporte de Apollo. ` +
          `Detalle: ${text.slice(0, 150)}`,
        res.status,
        false,
      );
    }

    throw new ApolloError(
      `Apollo ${res.status}: ${text.slice(0, 200)}`,
      res.status,
      retryable,
    );
  }

  return (await res.json()) as T;
}

interface RawSearchResponse {
  people?: Array<{
    id: string;
    first_name?: string | null;
    last_name_obfuscated?: string | null;
    title?: string | null;
    has_email?: boolean;
    organization?: { name?: string | null; primary_domain?: string | null } | null;
  }>;
  pagination?: { page: number; per_page: number; total_entries: number; total_pages: number };
}

export interface SearchResult {
  people: ApolloPerson[];
  page: number;
  totalEntries: number;
  totalPages: number;
}

/**
 * Búsqueda. No consume créditos, así que se puede usar para dimensionar una
 * campaña antes de gastar nada.
 */
export async function searchPeople(filters: ApolloSearchFilters): Promise<SearchResult> {
  const perPage = Math.min(filters.perPage ?? SEARCH_PAGE_SIZE, SEARCH_PAGE_SIZE);
  const page = Math.min(filters.page ?? 1, SEARCH_MAX_PAGES);

  const body: Record<string, unknown> = { page, per_page: perPage };
  if (filters.personTitles?.length) body.person_titles = filters.personTitles;
  if (filters.personSeniorities?.length) body.person_seniorities = filters.personSeniorities;
  if (filters.personLocations?.length) body.person_locations = filters.personLocations;
  if (filters.organizationLocations?.length) {
    body.organization_locations = filters.organizationLocations;
  }
  if (filters.organizationNumEmployeesRanges?.length) {
    body.organization_num_employees_ranges = filters.organizationNumEmployeesRanges;
  }
  if (filters.contactEmailStatus?.length) body.contact_email_status = filters.contactEmailStatus;

  const raw = await post<RawSearchResponse>('/mixed_people/api_search', body);

  return {
    people: (raw.people ?? []).map((p) => ({
      id: p.id,
      firstName: p.first_name ?? null,
      lastNameObfuscated: p.last_name_obfuscated ?? null,
      title: p.title ?? null,
      hasEmail: p.has_email === true,
      organisation: p.organization?.name ?? null,
      organisationDomain: p.organization?.primary_domain ?? null,
    })),
    page: raw.pagination?.page ?? page,
    totalEntries: raw.pagination?.total_entries ?? 0,
    totalPages: raw.pagination?.total_pages ?? 0,
  };
}

interface RawMatchResponse {
  matches?: Array<{
    id?: string;
    first_name?: string | null;
    last_name?: string | null;
    name?: string | null;
    email?: string | null;
    title?: string | null;
    linkedin_url?: string | null;
    country?: string | null;
    organization?: { name?: string | null; primary_domain?: string | null } | null;
  } | null>;
}

/**
 * Enriquecimiento por lotes. Máximo 10 por llamada — no es una recomendación,
 * la API rechaza más.
 *
 * `reveal_phone_number` se deja fuera a propósito: cuesta 8 créditos por móvil
 * frente a 1 por email, y obliga a montar un webhook porque el teléfono llega
 * de forma asíncrona. Para un primer contacto por correo no hace falta.
 */
export async function enrichPeople(apolloIds: string[]): Promise<ApolloEnriched[]> {
  if (apolloIds.length === 0) return [];
  if (apolloIds.length > ENRICH_BATCH_SIZE) {
    throw new ApolloError(
      `bulk_match acepta ${ENRICH_BATCH_SIZE} como máximo, se pidieron ${apolloIds.length}`,
      null,
      false,
    );
  }

  const raw = await post<RawMatchResponse>(
    '/people/bulk_match',
    { details: apolloIds.map((id) => ({ id })) },
    { reveal_personal_emails: 'true' },
  );

  const out: ApolloEnriched[] = [];
  for (const m of raw.matches ?? []) {
    if (!m?.id) continue;              // sin coincidencia: Apollo devuelve null
    out.push({
      id: m.id,
      firstName: m.first_name ?? null,
      lastName: m.last_name ?? null,
      name: m.name ?? null,
      email: m.email ?? null,
      title: m.title ?? null,
      organisation: m.organization?.name ?? null,
      organisationDomain: m.organization?.primary_domain ?? null,
      linkedinUrl: m.linkedin_url ?? null,
      country: m.country ?? null,
    });
  }
  return out;
}

/** Trocea en lotes del tamaño que admite `bulk_match`. */
export function batchIds(ids: string[], size = ENRICH_BATCH_SIZE): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}

// ── Búsqueda de organizaciones ───────────────────────────────────
//
// Endpoint distinto del que documenta Apollo para "Organization Search":
// la documentación describe `mixed_companies/search`, que en los planes Free
// está bloqueado. `organizations/search` sí responde, devuelve los mismos
// campos útiles y es el que se usa aquí.
//
// A diferencia de la búsqueda de personas, esta SÍ consume: 1 crédito por
// página de hasta 100 resultados. Sale barata comparada con enriquecer, pero
// no es gratis: conviene pedir per_page=100 siempre, porque una página de 10
// cuesta lo mismo que una de 100.

export interface ApolloOrgFilters {
  locations?: string[];
  notLocations?: string[];
  keywordTags?: string[];
  numEmployeesRanges?: string[];
  page?: number;
  perPage?: number;
}

export interface ApolloOrganisation {
  id: string;
  name: string;
  domain: string | null;
  websiteUrl: string | null;
  linkedinUrl: string | null;
  industry: string | null;
  keywords: string[];
  employees: number | null;
  revenue: number | null;
  foundedYear: number | null;
  city: string | null;
  state: string | null;
  country: string | null;
}

export interface OrgSearchResult {
  organisations: ApolloOrganisation[];
  page: number;
  totalEntries: number;
  totalPages: number;
}

interface RawOrgResponse {
  organizations?: Array<Record<string, unknown>>;
  pagination?: { page: number; total_entries: number; total_pages: number };
}

export async function searchOrganisations(f: ApolloOrgFilters): Promise<OrgSearchResult> {
  const body: Record<string, unknown> = {
    page: Math.min(f.page ?? 1, SEARCH_MAX_PAGES),
    // Siempre 100: la unidad de cobro es la página, no el resultado.
    per_page: f.perPage ?? SEARCH_PAGE_SIZE,
  };
  if (f.locations?.length) body.organization_locations = f.locations;
  if (f.notLocations?.length) body.organization_not_locations = f.notLocations;
  if (f.keywordTags?.length) body.q_organization_keyword_tags = f.keywordTags;
  if (f.numEmployeesRanges?.length) body.organization_num_employees_ranges = f.numEmployeesRanges;

  const raw = await post<RawOrgResponse>('/organizations/search', body);
  const str = (v: unknown) => (typeof v === 'string' && v.length ? v : null);
  const num = (v: unknown) => (typeof v === 'number' ? v : null);

  return {
    organisations: (raw.organizations ?? []).map((o) => ({
      id: String(o.id ?? ''),
      name: String(o.name ?? ''),
      domain: str(o.primary_domain),
      websiteUrl: str(o.website_url),
      linkedinUrl: str(o.linkedin_url),
      industry: str(o.industry),
      keywords: Array.isArray(o.keywords) ? (o.keywords as string[]).slice(0, 25) : [],
      employees: num(o.estimated_num_employees),
      revenue: num(o.organization_revenue),
      foundedYear: num(o.founded_year),
      city: str(o.city),
      state: str(o.state),
      country: str(o.country),
    })),
    page: raw.pagination?.page ?? 1,
    totalEntries: raw.pagination?.total_entries ?? 0,
    totalPages: raw.pagination?.total_pages ?? 0,
  };
}

/**
 * Los filtros por palabra clave de Apollo son laxos: buscar "family office"
 * devuelve también bufetes, consultoras de selección y empresas de eventos que
 * mencionan la expresión. Filtrar por sector en local no cuesta créditos —la
 * página ya está pagada— y quita la mayor parte del ruido.
 */
export function matchesIndustry(
  org: ApolloOrganisation,
  allowed: string[],
  denied: string[] = [],
): boolean {
  const hay = [org.industry ?? '', ...org.keywords].join(' ').toLowerCase();
  // La exclusión manda sobre la inclusión: una fundación de certificación
  // agraria menciona "agriculture" en cada línea y pasaría el filtro por
  // palabras, pero no compra fincas.
  if (denied.some((d) => hay.includes(d.toLowerCase()))) return false;
  if (allowed.length === 0) return true;
  return allowed.some((a) => hay.includes(a.toLowerCase()));
}

/** Sectores que nunca son contraparte en originación de operaciones. */
export const SECTORES_EXCLUIDOS_POR_DEFECTO = [
  'nonprofit organization',
  'non-profit',
  'staffing & recruiting',
  'legal services',
  'events services',
  'higher education',
  'government administration',
  'newspapers',
  'public relations',
];

/**
 * Fase 3 — Herramientas (function calling).
 *
 * El modelo declara qué quiere llamar; quien ejecuta es este fichero, con las
 * credenciales del cliente y contra un destino que fijó un humano. El modelo
 * nunca ve la URL, ni las cabeceras, ni la clave de API del tercero: solo el
 * nombre, la descripción y el esquema de entrada.
 *
 * La superficie de ataque de esto es real. Una herramienta HTTP es, literalmente,
 * "haz una petición con los parámetros que diga el modelo", y el modelo obedece
 * a un usuario anónimo que escribe por Telegram. De ahí los tres controles:
 *
 *   1. El **origen es fijo**. La plantilla de URL solo admite marcadores en la
 *      ruta y la query, nunca en el esquema o el host, y tras sustituir se
 *      comprueba que el origen no ha cambiado. Un parámetro con `@`, `//` o
 *      `..` no puede redirigir la petición a otro sitio.
 *   2. **Nada de direcciones internas**. Se resuelve el nombre antes de llamar
 *      y se rechazan los rangos privados y de loopback: sin esto, una herramienta
 *      es una puerta al metadata endpoint del proveedor de nube.
 *   3. **Todo acotado**: timeout por llamada, tamaño de respuesta recortado y
 *      tope de vueltas del bucle en `brain.ts`.
 */
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { query } from '../db.js';
import { decryptJson } from '../lib/crypto.js';
import type { ToolSpec } from '../llm/index.js';
import { config } from '../config.js';

export interface HttpToolConfig {
  method: 'GET' | 'POST';
  /** https://… Puede llevar {{param}} en ruta y query, nunca en el host. */
  url: string;
  headers?: Record<string, string>;
  /** En POST, manda el input completo como cuerpo JSON. */
  sendInputAsBody?: boolean;
}

export interface RegisteredTool {
  id: string;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  kind: 'http' | 'native';
  requiresApproval?: boolean;
  config?: HttpToolConfig;
}

export interface ToolResult {
  content: string;
  isError: boolean;
  latencyMs: number;
}

/** Los proveedores rechazan otros formatos con errores poco explicativos. */
export const TOOL_NAME_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;

const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

// ── Validación al dar de alta ────────────────────────────────────

export class ToolConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolConfigError';
  }
}

/**
 * Se ejecuta al registrar la herramienta, no al usarla. Un destino mal puesto
 * debe reventar cuando lo escribe un humano y puede corregirlo, no a mitad de
 * una conversación con un huésped.
 */
export function validateHttpToolConfig(cfg: HttpToolConfig): void {
  let url: URL;
  try {
    url = new URL(cfg.url);
  } catch {
    throw new ToolConfigError(`La URL "${cfg.url}" no es una URL válida.`);
  }

  if (url.protocol !== 'https:') {
    throw new ToolConfigError(
      'Solo se admite https. Una herramienta lleva credenciales del cliente en las cabeceras.',
    );
  }

  // El host tiene que ser literal. Si se pudiera parametrizar, el modelo elegiría
  // a quién se le manda la clave de API del cliente.
  if (/\{\{/.test(url.host) || /\{\{/.test(url.protocol)) {
    throw new ToolConfigError('El host no admite marcadores: solo la ruta y la query.');
  }

  if (isPrivateHostname(url.hostname)) {
    throw new ToolConfigError(`"${url.hostname}" apunta a la red interna.`);
  }
}

// ── Defensa contra destinos internos ─────────────────────────────

function isPrivateIpv4(ip: string): boolean {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return false;
  const [a, b] = p as [number, number, number, number];
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  // 169.254/16 incluye el endpoint de metadatos de AWS, GCP y Azure.
  if (a === 169 && b === 254) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}

function isPrivateIpv6(ip: string): boolean {
  const norm = ip.toLowerCase().replace(/^\[|\]$/g, '');
  if (norm === '::1' || norm === '::') return true;
  if (/^f[cd]/.test(norm)) return true; // fc00::/7, únicas locales
  if (/^fe[89ab]/.test(norm)) return true; // fe80::/10, enlace local
  // ::ffff:10.0.0.1 y demás direcciones IPv4 mapeadas.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(norm);
  if (mapped) return isPrivateIpv4(mapped[1]!);
  return false;
}

function isPrivateHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')) return true;
  if (isIP(host) === 4) return isPrivateIpv4(host);
  if (isIP(host) === 6) return isPrivateIpv6(host);
  return false;
}

/**
 * Comprobación en el momento de llamar: un nombre público puede resolver a una
 * dirección interna, a propósito o por accidente.
 *
 * Esto no cierra un DNS rebinding perfectamente sincronizado — para eso haría
 * falta fijar el socket a la dirección ya resuelta, que `fetch` no permite —,
 * pero sí el caso realista de un nombre que apunta a la red de dentro.
 */
async function assertPublicTarget(hostname: string): Promise<void> {
  if (isPrivateHostname(hostname)) {
    throw new ToolConfigError(`"${hostname}" apunta a la red interna.`);
  }
  if (isIP(hostname)) return;

  const addresses = await lookup(hostname, { all: true });
  for (const { address, family } of addresses) {
    const priv = family === 4 ? isPrivateIpv4(address) : isPrivateIpv6(address);
    if (priv) {
      throw new ToolConfigError(`"${hostname}" resuelve a la dirección interna ${address}.`);
    }
  }
}

// ── Registro ─────────────────────────────────────────────────────

export async function loadTools(clientId: string): Promise<RegisteredTool[]> {
  const rows = await query<{
    id: string;
    name: string;
    description: string;
    input_schema: Record<string, unknown>;
    kind: 'http';
    config: Buffer;
  }>(
    `SELECT id, name, description, input_schema, kind, config, requires_approval
       FROM tools
      WHERE client_id = $1 AND is_active
      ORDER BY name`,
    [clientId],
  );

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    inputSchema: r.input_schema,
    kind: r.kind,
    requiresApproval: (r as any).requires_approval,
    config: decryptJson<HttpToolConfig>(r.config),
  }));
}

/** Lo único de la herramienta que llega al modelo. */
export function toToolSpec(tool: RegisteredTool): ToolSpec {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  };
}

// ── Ejecución ────────────────────────────────────────────────────

/**
 * Sustituye los marcadores de la plantilla de URL y comprueba que el origen
 * sigue siendo el mismo.
 *
 * Los valores van codificados con `encodeURIComponent`, pero la comprobación del
 * origen es la que de verdad sostiene esto: aunque una codificación se quedara
 * corta, una URL que acabe apuntando a otro sitio no sale de aquí.
 */
export function buildUrl(template: string, input: Record<string, unknown>): string {
  const expected = new URL(template).origin;
  const missing: string[] = [];

  const substituted = template.replace(PLACEHOLDER, (_m, key: string) => {
    const value = input[key];
    if (value === undefined || value === null) {
      missing.push(key);
      return '';
    }
    return encodeURIComponent(String(value));
  });

  if (missing.length > 0) {
    throw new ToolConfigError(`Faltan parámetros en la llamada: ${missing.join(', ')}.`);
  }

  const finalUrl = new URL(substituted);
  if (finalUrl.origin !== expected) {
    throw new ToolConfigError('Los parámetros cambiaban el destino de la petición.');
  }
  return finalUrl.toString();
}

/**
 * Ejecuta una herramienta y devuelve siempre algo que el modelo pueda leer.
 *
 * Un fallo no se propaga como excepción: se devuelve como texto de error. El
 * modelo, al verlo, puede corregir los parámetros o decirle al usuario que ese
 * dato no está disponible ahora mismo. Reventar el turno entero porque una API
 * de terceros dio un 500 sería peor servicio.
 */
import { executeNativeTool } from '../tools/index.js';

export async function executeTool(
  tool: RegisteredTool,
  input: Record<string, unknown>,
  ctx: { clientId: string; runId?: string; sessionId?: string; channel?: string },
): Promise<ToolResult> {
  const started = Date.now();

  if (tool.requiresApproval && ctx.runId) {
    await query(
      `INSERT INTO pending_actions (client_id, run_id, tool_name, input, status) VALUES ($1, $2, $3, $4, 'pending')`,
      [ctx.clientId, ctx.runId, tool.name, input]
    );
    return {
      content: 'Acción enviada para aprobación humana. Espera a que el usuario la apruebe para continuar, o avísale que está pendiente en su bandeja.',
      isError: false,
      latencyMs: Date.now() - started,
    };
  }

  if (tool.kind === 'native') {
    const nativeResult = await executeNativeTool(tool, input, ctx);
    return { content: nativeResult.content, isError: false, latencyMs: Date.now() - started };
  }

  try {
    if (!tool.config) throw new Error('Missing HTTP config');
    const url = buildUrl(tool.config.url, input);
    await assertPublicTarget(new URL(url).hostname);

    const method = tool.config.method;
    const sendBody = method === 'POST' && tool.config.sendInputAsBody !== false;

    const res = await fetch(url, {
      method,
      headers: {
        accept: 'application/json, text/plain;q=0.9, */*;q=0.8',
        ...(sendBody && { 'content-type': 'application/json' }),
        ...tool.config.headers,
      },
      ...(sendBody && { body: JSON.stringify(input) }),
      signal: AbortSignal.timeout(config.TOOL_TIMEOUT_MS),
      // Una redirección puede saltarse la comprobación de origen y la de red
      // interna. Se cortan y se trata como error.
      redirect: 'error',
    });

    const raw = await res.text();
    const body =
      raw.length > config.TOOL_MAX_RESPONSE_CHARS
        ? `${raw.slice(0, config.TOOL_MAX_RESPONSE_CHARS)}\n…[respuesta recortada]`
        : raw;

    if (!res.ok) {
      return {
        content: `La herramienta devolvió un error ${res.status}: ${body.slice(0, 500)}`,
        isError: true,
        latencyMs: Date.now() - started,
      };
    }

    return { content: body, isError: false, latencyMs: Date.now() - started };
  } catch (err) {
    const reason =
      err instanceof ToolConfigError
        ? err.message
        : err instanceof Error && err.name === 'TimeoutError'
          ? `no respondió en ${config.TOOL_TIMEOUT_MS} ms`
          : err instanceof Error
            ? err.message
            : 'fallo desconocido';

    return {
      content: `No se pudo ejecutar "${tool.name}": ${reason}`,
      isError: true,
      latencyMs: Date.now() - started,
    };
  }
}

/**
 * Traza de la llamada. Va aparte del historial: se consulta para otras cosas.
 *
 * No propaga sus fallos. Es una escritura de auditoría, no el camino crítico:
 * romper la conversación de un huésped porque no se pudo apuntar en el registro
 * lo que ya se ejecutó cambia un problema de observabilidad por uno de servicio.
 * Se pierde una fila de traza y se grita por stderr, que es la peor de las dos.
 */
export async function recordInvocation(params: {
  conversationId: string;
  toolId: string | null;
  toolName: string;
  input: Record<string, unknown>;
  output: string;
  isError: boolean;
  latencyMs: number;
}): Promise<void> {
  try {
    await query(
      `INSERT INTO tool_invocations
         (conversation_id, tool_id, tool_name, input, output, is_error, latency_ms)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        params.conversationId,
        params.toolId,
        params.toolName,
        JSON.stringify(params.input),
        params.output.slice(0, config.TOOL_MAX_RESPONSE_CHARS),
        params.isError,
        params.latencyMs,
      ],
    );
  } catch (err) {
    console.error(
      `[tools] no se pudo registrar la invocación de "${params.toolName}":`,
      err instanceof Error ? err.message : err,
    );
  }
}

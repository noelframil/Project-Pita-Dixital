/**
 * CLI de depuración: hablar con el bot viéndole el pensamiento.
 *
 *   npm run chat -- <slug-del-cliente> [session_id]
 *
 * No es un cliente de chat, es una ventana de rayos X. Llama a `think()`
 * exactamente igual que lo hace la ruta de Fastify —misma base de datos, mismo
 * Redis, mismos proveedores— y va imprimiendo cada paso del orquestador según
 * ocurre: qué piensa, qué herramienta llama y con qué argumentos, cuándo delega
 * en un especialista y qué dictamina el crítico.
 *
 * Se engancha al flujo con `observeTraces`, no sondeando `agent_traces`: sondear
 * la tabla enseñaría el turno cuando ya terminó, que es justo cuando deja de ser
 * útil para depurar.
 *
 * Funciona con `TRACE_ENABLED=false`: los observadores se avisan aparte de la
 * escritura, así que se puede depurar sin llenar la tabla de trazas de pruebas.
 */
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { pool, queryOne } from '../src/db.js';
import { think } from '../src/core/brain.js';
import { flushTraces, observeTraces, type TraceEntry } from '../src/core/telemetry.js';
import { loadFacts } from '../src/core/userFacts.js';
import { formatForChannel, type ChannelType } from '../src/channels/outputFormatter.js';
import { closeRedis } from '../src/queue/connection.js';
import { closeProactiveQueue } from '../src/queue/proactive.js';
import { color, indent, oneLine } from './ansi.js';

// ── Pintado de trazas ────────────────────────────────────────────

/**
 * Traduce una traza a una línea de terminal.
 *
 * El criterio de qué se enseña y con qué color no es decorativo: cada categoría
 * responde a una pregunta distinta cuando algo va mal.
 *
 *   gris    pensamiento — "¿qué estaba razonando?"
 *   cian    herramienta — "¿qué llamó y con qué?"
 *   magenta delegación  — "¿a quién le pasó el trabajo y qué le dijo?"
 *   verde   crítico ok  — "¿lo aprobó?"
 *   rojo    error/rechazo
 */
function printTrace(entry: TraceEntry, verbose: boolean): void {
  const quien =
    entry.agentRole === 'specialist'
      ? color.magenta(`[${entry.agentName ?? 'especialista'}]`)
      : entry.agentRole === 'critic'
        ? ''
        : '';

  const sangria = entry.agentRole === 'specialist' ? '  │ ' : '';

  // ── Crítico ──
  if (entry.agentRole === 'critic') {
    const p = entry.payload ?? {};
    if (p.scope === 'reflections_exhausted') {
      console.log(
        color.rojo('[AUTOCRÍTICA] ') +
          color.rojo(`agotados los ${String(p.attempts)} intentos; se envía el último borrador`),
      );
      return;
    }
    const ok = p.is_compliant === true;
    const etiqueta = ok ? color.verde('[AUTOCRÍTICA] ') : color.rojo('[AUTOCRÍTICA] ');
    const veredicto = ok
      ? color.verde('aprobado')
      : color.rojo(`rechazado — ${String(p.feedback ?? '')}`);
    console.log(etiqueta + veredicto + color.gris(` (${entry.latencyMs ?? 0} ms)`));
    return;
  }

  switch (entry.stepType) {
    case 'thought': {
      const p = entry.payload ?? {};
      const texto = String(p.text ?? '').trim();
      const pedidas = (p.tool_calls_requested as string[] | undefined) ?? [];

      if (texto) {
        console.log(
          sangria + quien + color.gris('[PENSAMIENTO] ') + color.gris(oneLine(texto, 300)),
        );
      }
      if (pedidas.length > 0 && !texto) {
        console.log(
          sangria + quien + color.gris('[PENSAMIENTO] ') + color.gris('(va directo a la herramienta)'),
        );
      }
      if (verbose) {
        console.log(
          sangria +
            color.tenue(
              indent(
                `modelo=${String(p.model ?? '?')} tokens=${entry.tokensUsed ?? 0} ` +
                  `${entry.latencyMs ?? 0}ms ofrecidas=[${
                    (p.tools_offered as string[] | undefined)?.join(', ') ?? ''
                  }]`,
                '',
              ),
            ),
        );
      }
      return;
    }

    case 'tool_call': {
      const p = entry.payload ?? {};

      // La delegación se pinta aparte: es el paso que más cuesta seguir cuando
      // algo va mal, porque abre un bucle entero por debajo.
      if (entry.toolName === 'delegate_to_agent') {
        console.log(
          color.magenta('[DELEGACIÓN]  ') +
            color.magenta(color.negrita(String((p.input as Record<string, unknown>)?.target_agent ?? '?'))),
        );
        const encargo = String((p.input as Record<string, unknown>)?.task_description ?? '');
        console.log(indent(color.magenta(oneLine(encargo, 400)), '  │ '));
        return;
      }

      if (entry.toolName === 'escalar_a_humano') {
        console.log(
          color.amarillo('[HANDOFF]     ') +
            color.amarillo(`motivo=${String(p.motivo ?? '?')} urgencia=${String(p.urgencia ?? '?')}`),
        );
        console.log(indent(color.amarillo(oneLine(String(p.resumen ?? ''), 300)), '  │ '));
        return;
      }

      const args = JSON.stringify((p.input as unknown) ?? {});
      console.log(
        sangria + quien + color.cian('[HERRAMIENTA] ') + color.cian(color.negrita(entry.toolName ?? '?')),
      );
      console.log(sangria + indent(color.cian(oneLine(args, 300)), '  │ '));
      return;
    }

    case 'tool_result': {
      const p = entry.payload ?? {};
      console.log(
        sangria +
          color.cian('[RESULTADO]   ') +
          color.gris(oneLine(String(p.output ?? ''), verbose ? 600 : 200)) +
          color.gris(` (${entry.latencyMs ?? 0} ms)`),
      );
      return;
    }

    case 'error': {
      const p = entry.payload ?? {};
      if (p.scope === 'max_iterations') {
        console.log(
          color.rojo('[LÍMITE]      ') +
            color.rojo(`se agotaron las ${String(p.max_iterations)} vueltas del bucle`),
        );
        return;
      }
      if (p.scope === 'model_provider') {
        console.log(color.rojo('[PROVEEDOR]   ') + color.rojo(String(p.message ?? '')));
        return;
      }
      console.log(
        sangria +
          color.rojo('[ERROR]       ') +
          color.rojo(entry.toolName ?? '') +
          ' ' +
          color.gris(oneLine(String(p.output ?? JSON.stringify(p)), 300)),
      );
      return;
    }
  }
}

// ── Estado de la sesión ──────────────────────────────────────────

interface CliState {
  clientId: string;
  slug: string;
  sessionId: string;
  channelType: ChannelType;
  verbose: boolean;
  turnos: number;
  costeMicros: number;
}

async function resolveClient(slug: string): Promise<{ id: string; name: string }> {
  const row = await queryOne<{ id: string; name: string; is_active: boolean }>(
    `SELECT id, name, is_active FROM clients WHERE slug = $1`,
    [slug],
  );
  if (!row) {
    console.error(color.rojo(`\n❌ No existe el cliente "${slug}".`));
    console.error(`   Créalo con:  npm run admin -- create-client ${slug} "Nombre"\n`);
    process.exit(1);
  }
  if (!row.is_active) {
    console.error(color.rojo(`\n❌ El cliente "${slug}" está desactivado.\n`));
    process.exit(1);
  }
  return { id: row.id, name: row.name };
}

function printBanner(state: CliState, clientName: string): void {
  console.log('');
  console.log(color.negrita(color.blanco('  Pita Dixital — consola de depuración')));
  console.log(color.gris('  ─────────────────────────────────────────────────────'));
  console.log(`  cliente:  ${color.blanco(clientName)} ${color.gris(`(${state.slug})`)}`);
  console.log(`  sesión:   ${color.blanco(state.sessionId)}`);
  console.log(`  canal:    ${color.blanco(state.channelType)}`);
  console.log(color.gris('  ─────────────────────────────────────────────────────'));
  console.log(color.gris('  /help para ver los comandos. Ctrl+C para salir.'));
  console.log('');
}

const HELP = `
  ${color.negrita('Comandos')}
  /help              esta ayuda
  /facts             lo que el bot recuerda de esta persona
  /verbose           enseña también modelos, tokens y latencias por paso
  /canal <tipo>      web | whatsapp | telegram | sms | voice
                     cambia solo el FORMATO de salida, no la conversación
  /nueva [id]        empieza otra sesión (otro hilo, mismo cliente)
  /coste             gasto acumulado en esta ejecución
  /salir             cerrar
`;

async function printFacts(state: CliState): Promise<void> {
  // El contacto se resuelve por la conversación: `think()` lo crea la primera
  // vez a partir del session_id, y ese mismo session_id devuelve siempre el
  // mismo contacto. Es lo que permite probar la continuidad de la memoria entre
  // ejecuciones del CLI.
  const convo = await queryOne<{ contact_id: string | null }>(
    `SELECT contact_id FROM conversations
      WHERE client_id = $1 AND thread_ref = $2 AND channel = 'web'`,
    [state.clientId, state.sessionId],
  );

  if (!convo?.contact_id) {
    console.log(color.gris('  (todavía no hay conversación: escribe algo primero)\n'));
    return;
  }

  const facts = await loadFacts(convo.contact_id, 50);
  if (facts.length === 0) {
    console.log(color.gris('  (el bot aún no recuerda nada de esta persona)\n'));
    return;
  }

  console.log(color.negrita(`\n  Memoria de largo plazo (${facts.length}):`));
  for (const f of facts) {
    const conf =
      f.confidence >= 0.9
        ? color.verde(f.confidence.toFixed(2))
        : f.confidence >= 0.7
          ? color.amarillo(f.confidence.toFixed(2))
          : color.rojo(f.confidence.toFixed(2));
    console.log(
      `  ${conf} ${color.cian(f.factKey.padEnd(22))} ${f.value} ${color.gris(`[${f.category}]`)}`,
    );
  }
  console.log('');
}

// ── Bucle principal ──────────────────────────────────────────────

async function main(): Promise<void> {
  const [slugArg, sessionArg] = process.argv.slice(2);

  if (!slugArg) {
    console.error(`
Uso:  npm run chat -- <slug-del-cliente> [session_id]

Ejemplo:
  npm run chat -- casa-nigran
  npm run chat -- casa-nigran huesped_carlos

El session_id fija el hilo Y el contacto: reutilizar el mismo entre ejecuciones
es lo que permite comprobar que la memoria de largo plazo sobrevive.
`);
    process.exit(1);
  }

  const client = await resolveClient(slugArg);

  const state: CliState = {
    clientId: client.id,
    slug: slugArg,
    // Estable por defecto, para que la memoria persista entre ejecuciones.
    sessionId: sessionArg ?? 'cli_debug_001',
    channelType: 'web',
    verbose: false,
    turnos: 0,
    costeMicros: 0,
  };

  printBanner(state, client.name);

  // El observador imprime; no toca la base de datos ni espera a nada, que es lo
  // que se le exige a un observador de trazas.
  const unobserve = observeTraces((entry) => printTrace(entry, state.verbose));

  const rl = createInterface({ input: stdin, output: stdout });
  let cerrando = false;

  const cerrar = async () => {
    if (cerrando) return;
    cerrando = true;
    unobserve();
    rl.close();
    // Las trazas se escriben sin esperar: aquí sí se espera, o las del último
    // turno se pierden justo cuando más interesan.
    await flushTraces(3_000);
    await closeProactiveQueue().catch(() => undefined);
    await closeRedis().catch(() => undefined);
    await pool.end();
    console.log(color.gris('\n  Hasta luego.\n'));
    process.exit(0);
  };

  rl.on('SIGINT', () => void cerrar());

  while (!cerrando) {
    let entrada: string;
    try {
      entrada = (await rl.question(color.negrita(color.verde('\n> ')))).trim();
    } catch {
      break; // readline cerrado
    }

    if (!entrada) continue;

    // ── Comandos ──
    if (entrada.startsWith('/')) {
      const [cmd, ...rest] = entrada.slice(1).split(/\s+/);

      switch (cmd) {
        case 'help':
        case 'ayuda':
          console.log(HELP);
          continue;

        case 'facts':
        case 'memoria':
          await printFacts(state);
          continue;

        case 'verbose':
          state.verbose = !state.verbose;
          console.log(color.gris(`  verbose ${state.verbose ? 'activado' : 'desactivado'}\n`));
          continue;

        case 'canal': {
          const nuevo = rest[0];
          const validos: ChannelType[] = ['web', 'whatsapp', 'telegram', 'sms', 'voice'];
          if (!nuevo || !validos.includes(nuevo as ChannelType)) {
            console.log(color.rojo(`  Canales: ${validos.join(', ')}\n`));
            continue;
          }
          state.channelType = nuevo as ChannelType;
          console.log(color.gris(`  formato de salida: ${nuevo}\n`));
          continue;
        }

        case 'nueva':
          state.sessionId = rest[0] ?? `cli_debug_${Date.now()}`;
          state.turnos = 0;
          console.log(color.gris(`  sesión nueva: ${state.sessionId}\n`));
          continue;

        case 'coste':
          console.log(
            color.gris(
              `  ${state.turnos} turnos · ${(state.costeMicros / 1_000_000).toFixed(5)} €\n`,
            ),
          );
          continue;

        case 'salir':
        case 'quit':
        case 'exit':
          await cerrar();
          return;

        default:
          console.log(color.rojo(`  Comando desconocido: /${cmd}. Prueba /help\n`));
          continue;
      }
    }

    // ── Turno real ──
    console.log('');
    const empezado = Date.now();

    try {
      // Exactamente la misma llamada que hace la ruta de Fastify. Si esto
      // divergiera, el CLI dejaría de servir para depurar producción.
      const result = await think({
        clientId: state.clientId,
        channel: 'web',
        channelUserId: state.sessionId,
        threadRef: state.sessionId,
        message: entrada,
        displayName: 'Consola de depuración',
      });

      state.turnos++;
      state.costeMicros += result.costMicros;

      console.log('');
      if (result.handedOff) {
        console.log(color.amarillo('  ⏸  Esta conversación la está atendiendo una persona.'));
        console.log(color.gris('     El mensaje se ha guardado; el bot no responde.\n'));
      } else {
        // Se pasa por el formateador del canal, igual que la ruta: es la única
        // forma de ver de verdad cómo va a llegar el Markdown a WhatsApp.
        const texto = formatForChannel(result.reply, state.channelType);
        console.log(color.negrita(color.blanco('  ' + texto.split('\n').join('\n  '))));
      }

      const partes = [
        `${Date.now() - empezado} ms`,
        `${result.usage.totalTokens} tokens`,
        `${(result.costMicros / 1_000_000).toFixed(5)} €`,
        `${result.steps.length} vueltas`,
      ];
      if (result.toolsUsed.length > 0) partes.push(`herramientas: ${result.toolsUsed.join(', ')}`);
      if (result.stopReason !== 'final_answer') partes.push(`parada: ${result.stopReason}`);

      console.log(color.gris(`\n  ${partes.join(' · ')}`));
    } catch (err) {
      console.log('');
      console.error(color.rojo('  ✖ El turno falló:'));
      console.error(color.rojo(indent(err instanceof Error ? err.message : String(err), '    ')));
      if (state.verbose && err instanceof Error && err.stack) {
        console.error(color.gris(indent(err.stack, '    ')));
      }
    }
  }

  await cerrar();
}

await main();

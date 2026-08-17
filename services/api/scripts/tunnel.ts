/**
 * Túnel HTTPS hacia el servidor local.
 *
 *   npm run tunnel          # arranca la API y abre el túnel
 *   npm run tunnel -- --solo-tunel   # la API ya está corriendo aparte
 *
 * ── Lo que este túnel sirve y lo que no ────────────────────────
 *
 * La especificación pedía exponer `POST /api/v1/chat` para que los proveedores
 * externos (WhatsApp) enruten ahí su tráfico. **Eso no funciona, y conviene
 * saberlo antes de perder una tarde:**
 *
 * `/api/v1/chat` es NUESTRA API. Espera `Authorization: Bearer pita_...` y un
 * cuerpo `{session_id, message}`. Un webhook de Meta llega sin esa cabecera y
 * con su propio formato y su propia firma HMAC. Apuntar Meta a esa ruta
 * devuelve 401 en todas las entregas.
 *
 * Traducir el formato de un proveedor al nuestro es precisamente lo que hace un
 * `ChannelAdapter`, y ahora mismo solo existe el de Telegram. Hasta que haya uno
 * de WhatsApp con su ruta de webhook y su verificación de firma, este túnel
 * sirve para tres cosas que sí funcionan hoy:
 *
 *   1. **Telegram por webhook** en vez de long polling. El adaptador ya existe;
 *      falta registrar la URL con `setWebhook`.
 *   2. **Probar `/api/v1/chat` desde fuera** con curl o Postman, con la clave de
 *      API de verdad. Es lo que valida el multimodal: subir un audio real desde
 *      un móvil es mucho más representativo que un fichero de prueba local.
 *   3. **Recibir el webhook de handoff** apuntando `set-handoff` a un receptor
 *      propio, para verificar la firma HMAC desde el otro lado.
 *
 * ── Proveedores de túnel ───────────────────────────────────────
 *
 * Se prueba `ngrok` por CLI si está instalado —URL estable con cuenta, más
 * fiable— y si no `localtunnel`, que no pide cuenta ni binario. El orden es
 * deliberado: quien ya tiene ngrok configurado quiere usarlo.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../src/config.js';
import { color } from './ansi.js';

const here = dirname(fileURLToPath(import.meta.url));
const apiDir = join(here, '..');

const soloTunel = process.argv.includes('--solo-tunel');

// ── Arranque de la API ───────────────────────────────────────────

const isWindows = process.platform === 'win32';

/**
 * En Windows `npm` es `npm.cmd` y `ngrok` es `ngrok.exe`. Nombrar el `.cmd`
 * evita `shell: true`, que Node marca como deprecado al pasarle argumentos
 * porque los concatena sin escapar.
 */
function exeName(cmd: string): string {
  if (!isWindows) return cmd;
  return cmd === 'npm' ? 'npm.cmd' : cmd;
}

function startApi(): ChildProcess {
  console.log(color.gris(`  arrancando la API en el puerto ${config.PORT}…`));
  return spawn(exeName('npm'), ['run', 'dev'], { cwd: apiDir, stdio: 'inherit' });
}

/**
 * Espera a que la API conteste en /health.
 *
 * Abrir el túnel antes de que el servidor escuche deja al proveedor sirviendo
 * 502 durante los primeros segundos, y quien esté pegando la URL en un panel
 * externo se lleva un error que no es suyo.
 */
async function waitForApi(timeoutMs = 60_000): Promise<void> {
  const limite = Date.now() + timeoutMs;
  const url = `http://127.0.0.1:${config.PORT}/health`;

  while (Date.now() < limite) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      if (res.ok) return;
    } catch {
      // Todavía no escucha.
    }
    await new Promise((r) => setTimeout(r, 1_000));
  }

  throw new Error(`La API no respondió en ${url} tras ${timeoutMs / 1000} s.`);
}

// ── Proveedores de túnel ─────────────────────────────────────────

interface Tunnel {
  url: string;
  proveedor: string;
  close: () => Promise<void>;
}

/**
 * ngrok por CLI.
 *
 * Se usa el binario y no el SDK de npm a propósito: el SDK es un módulo nativo
 * que hay que compilar en cada plataforma, y meter eso en el árbol de
 * dependencias por una herramienta de desarrollo no compensa. Quien usa ngrok
 * ya lo tiene instalado.
 *
 * La URL se saca de la API local de ngrok (127.0.0.1:4040) en vez de parsear su
 * salida por pantalla, que cambia entre versiones.
 */
async function startNgrok(): Promise<Tunnel | null> {
  const child = spawn(exeName('ngrok'), ['http', String(config.PORT), '--log', 'stdout'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const arrancó = await new Promise<boolean>((resolve) => {
    const t = setTimeout(() => resolve(true), 3_000);
    child.on('error', () => {
      clearTimeout(t);
      resolve(false);
    });
    child.on('exit', (code) => {
      clearTimeout(t);
      if (code !== 0) resolve(false);
    });
  });

  if (!arrancó) {
    child.kill();
    return null;
  }

  for (let i = 0; i < 10; i++) {
    try {
      const res = await fetch('http://127.0.0.1:4040/api/tunnels', {
        signal: AbortSignal.timeout(2_000),
      });
      const data = (await res.json()) as { tunnels?: Array<{ public_url?: string }> };
      const url = data.tunnels?.find((t) => t.public_url?.startsWith('https://'))?.public_url;
      if (url) {
        return {
          url,
          proveedor: 'ngrok',
          close: async () => {
            child.kill();
          },
        };
      }
    } catch {
      // La API de ngrok tarda un poco en levantar.
    }
    await new Promise((r) => setTimeout(r, 1_000));
  }

  child.kill();
  return null;
}

/** localtunnel: sin cuenta y sin binario, pero menos estable. */
async function startLocaltunnel(): Promise<Tunnel | null> {
  try {
    const localtunnel = (await import('localtunnel')).default;
    const tunnel = await localtunnel({ port: config.PORT });
    return {
      url: tunnel.url,
      proveedor: 'localtunnel',
      close: async () => {
        tunnel.close();
      },
    };
  } catch (err) {
    console.error(
      color.rojo(`  localtunnel falló: ${err instanceof Error ? err.message : err}`),
    );
    return null;
  }
}

// ── Instrucciones de uso ─────────────────────────────────────────

function printRoutes(url: string, proveedor: string): void {
  console.log('');
  console.log(color.negrita(color.verde('  ✓ Túnel abierto')) + color.gris(`  (${proveedor})`));
  console.log('');
  console.log(`  ${color.negrita(color.blanco(url))}`);
  console.log('');
  console.log(color.gris('  ───────────────────────────────────────────────────────────'));
  console.log(color.negrita('  Qué apuntar y dónde'));
  console.log(color.gris('  ───────────────────────────────────────────────────────────'));
  console.log('');

  console.log(color.cian('  1. Probar el chat desde fuera (multimodal incluido)'));
  console.log(color.gris(`     POST ${url}/api/v1/chat`));
  console.log(color.gris('     Necesita la cabecera:  authorization: Bearer pita_...'));
  console.log('');
  console.log(color.gris(`     curl -X POST ${url}/api/v1/chat \\`));
  console.log(color.gris('       -H "authorization: Bearer pita_..." \\'));
  console.log(color.gris('       -F session_id=prueba_movil \\'));
  console.log(color.gris('       -F file=@nota-de-voz.ogg'));
  console.log('');

  console.log(color.cian('  2. Telegram por webhook (en vez de long polling)'));
  console.log(
    color.gris(`     curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=${url}/webhooks/telegram"`),
  );
  console.log(
    color.amarillo('     ⚠ La ruta /webhooks/telegram todavía NO existe: el adaptador funciona'),
  );
  console.log(
    color.amarillo('       hoy por long polling. Es un fichero de trabajo, no un refactor.'),
  );
  console.log('');

  console.log(color.cian('  3. Recibir el webhook de handoff (para verificar la firma HMAC)'));
  console.log(color.gris(`     npm run admin -- set-handoff <slug> ${url}/tu-receptor`));
  console.log(color.gris('     Apúntalo a un receptor tuyo, no a esta API.'));
  console.log('');

  console.log(color.gris('  ───────────────────────────────────────────────────────────'));
  console.log(color.amarillo('  Sobre WhatsApp'));
  console.log(color.gris('  ───────────────────────────────────────────────────────────'));
  console.log(
    color.gris(
      '  NO apuntes el webhook de Meta a /api/v1/chat: esa ruta espera nuestra\n' +
        '  autenticación Bearer y nuestro formato de cuerpo, así que devolvería 401\n' +
        '  en todas las entregas. Traducir el formato de Meta al nuestro es trabajo\n' +
        '  de un ChannelAdapter, y ahora mismo solo existe el de Telegram.\n' +
        '\n' +
        '  El túnel sirve igual para lo de arriba, que es lo que hay que validar\n' +
        '  antes de escribir el adaptador de WhatsApp.',
    ),
  );
  console.log('');
  console.log(color.gris('  Ctrl+C para cerrar el túnel y la API.'));
  console.log('');
}

// ── Principal ────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(color.negrita(color.blanco('\n  Pita Dixital — túnel de staging\n')));

  let api: ChildProcess | null = null;

  if (!soloTunel) {
    api = startApi();
  } else {
    console.log(color.gris('  --solo-tunel: se asume que la API ya está corriendo.'));
  }

  try {
    await waitForApi();
    console.log(color.verde('  ✓ la API responde en /health'));
  } catch (err) {
    console.error(color.rojo(`\n  ✖ ${err instanceof Error ? err.message : err}`));
    console.error(
      color.gris(
        '\n  Si la API corre en otro proceso, usa:  npm run tunnel -- --solo-tunel\n' +
          '  Si no arranca, revisa services/api/.env: config.ts mata el proceso\n' +
          '  cuando falta una variable obligatoria, y lo dice al principio.\n',
      ),
    );
    api?.kill();
    process.exit(1);
  }

  console.log(color.gris('  abriendo túnel…'));

  const tunnel = (await startNgrok()) ?? (await startLocaltunnel());

  if (!tunnel) {
    console.error(color.rojo('\n  ✖ No se pudo abrir ningún túnel.'));
    console.error(
      color.gris(
        '\n  Opciones:\n' +
          '    · Instala ngrok y autentícalo:  ngrok config add-authtoken <token>\n' +
          '    · O instala localtunnel:        npm i -D localtunnel\n',
      ),
    );
    api?.kill();
    process.exit(1);
  }

  printRoutes(tunnel.url, tunnel.proveedor);

  const cerrar = async () => {
    console.log(color.gris('\n  cerrando…'));
    await tunnel.close().catch(() => undefined);
    api?.kill();
    process.exit(0);
  };

  process.on('SIGINT', () => void cerrar());
  process.on('SIGTERM', () => void cerrar());

  // El proceso se queda vivo mientras el túnel esté abierto.
  await new Promise(() => {});
}

await main();

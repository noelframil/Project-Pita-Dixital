/**
 * Servidor que imita la API de chat de Ollama.
 *
 * Permite probar caminos completos —el bucle del agente, la autoconfiguración—
 * inyectando lo que devuelve el modelo, sin gastar tokens ni depender de que
 * haya nada corriendo.
 *
 * El puerto es fijo porque `config.ts` congela `OLLAMA_HOST` al importarse y no
 * hay ocasión de enterarse de un puerto efímero antes de eso. Por eso `npm test`
 * pasa `--test-concurrency=1`: `node --test` corre los ficheros en paralelo por
 * defecto, y dos que levanten este servidor a la vez chocan en el puerto. La
 * suite entera tarda un par de segundos, así que la serialización no cuesta nada.
 */
import { createServer, type Server } from 'node:http';

export const FAKE_OLLAMA_PORT = 11499;

/** Una respuesta guionizada del modelo: texto, llamadas a herramientas, o ambas. */
export interface ScriptedTurn {
  content?: string;
  toolCalls?: Array<{ name: string; arguments: Record<string, unknown> }>;
}

export class FakeOllama {
  private server: Server | null = null;
  /**
   * Lo que se devuelve cuando el guion está agotado. Se usa tal cual, incluida
   * la cadena vacía: hay pruebas que necesitan justamente esa respuesta.
   */
  nextResponse = 'Listo.';
  /** Guion para bucles multi-vuelta: una entrada por vuelta, en orden. */
  script: ScriptedTurn[] = [];
  /** Cuerpos recibidos, para comprobar qué se le mandó al modelo en cada vuelta. */
  requests: Array<Record<string, unknown>> = [];

  reset(): void {
    this.script = [];
    this.requests = [];
    this.nextResponse = 'Listo.';
  }

  async start(): Promise<void> {
    this.server = createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        try {
          this.requests.push(JSON.parse(body || '{}'));
        } catch {
          this.requests.push({});
        }

        const turn = this.script.shift();
        const message = turn
          ? {
              content: turn.content ?? '',
              ...(turn.toolCalls && {
                tool_calls: turn.toolCalls.map((c) => ({
                  function: { name: c.name, arguments: c.arguments },
                })),
              }),
            }
          : { content: this.nextResponse };

        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            message,
            prompt_eval_count: 100,
            eval_count: 50,
            done_reason: 'stop',
          }),
        );
      });
    });

    await new Promise<void>((resolve) => {
      this.server!.listen(FAKE_OLLAMA_PORT, '127.0.0.1', resolve);
    });
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    await new Promise<void>((resolve) => this.server!.close(() => resolve()));
    this.server = null;
  }
}

/** Configuración válida de referencia, para partir de ella y romper una cosa cada vez. */
export const VALID_BLUEPRINT = {
  assistant_name: 'Pita Tola',
  role_block:
    'Eres {{assistant_name}}, la asistente de {{business_name}} en {{location}}.\n' +
    'Respondes corto y con retranca. Tu lema: "{{motto}}".',
  variables: [
    { key: 'assistant_name', value: 'Pita Tola' },
    { key: 'business_name', value: 'Casa de Nigrán' },
    { key: 'location', value: 'Nigrán, Galicia' },
    { key: 'motto', value: 'Sabe más por vieja que por gallina' },
  ],
  suggested_override_vars: ['guest_name'],
  notes: 'Faltan los horarios reales.',
};

/**
 * Servidor que imita la API de chat de Ollama.
 *
 * Permite probar el camino completo de la autoconfiguración —desenvolver la
 * respuesta, validar el esquema, comprobar las invariantes— inyectando lo que
 * devuelve el modelo, sin gastar tokens ni depender de que haya algo corriendo.
 */
import { createServer, type Server } from 'node:http';

export const FAKE_OLLAMA_PORT = 11499;

export class FakeOllama {
  private server: Server | null = null;
  /** Lo que devolverá la próxima llamada. Se cambia entre pruebas. */
  nextResponse = '';

  async start(): Promise<void> {
    this.server = createServer((req, res) => {
      req.on('data', () => {});
      req.on('end', () => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            message: { content: this.nextResponse },
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

import type { FastifyInstance } from 'fastify';
import { WebSocket } from 'ws';
import { config } from '../config.js';

export async function voiceRoutes(app: FastifyInstance) {
  // 1. TwiML Endpoint para la llamada entrante
  app.post('/api/v1/voice/twiml', async (request, reply) => {
    // Host para la conexión WebSocket
    const host = request.headers.host;
    const wsUrl = `wss://${host}/api/v1/voice/stream`;

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${wsUrl}" />
  </Connect>
</Response>`;

    return reply.type('text/xml').send(twiml);
  });

  // 2. WebSocket Endpoint para Media Streams
  app.get('/api/v1/voice/stream', { websocket: true }, (connection: any, req) => {
    app.log.info('Nueva conexión de Twilio Media Stream');

    let streamSid: string | null = null;

    // Conectar con OpenAI Realtime API
    const openAiWs = new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17', {
      headers: {
        'Authorization': `Bearer ${config.OPENAI_API_KEY}`,
        'OpenAI-Beta': 'realtime=v1'
      }
    });

    openAiWs.on('open', () => {
      app.log.info('Conectado a OpenAI Realtime API');

      // Configurar la sesión para G.711 u-law (Twilio)
      openAiWs.send(JSON.stringify({
        type: 'session.update',
        session: {
          modalities: ['text', 'audio'],
          instructions: 'Eres Pita Dixital, la asistente telefónica. Tu objetivo es ser extremadamente útil, natural y concisa. Estás hablando por teléfono, así que no uses listas largas ni formato markdown. Conversa de manera fluida y amigable.',
          input_audio_format: 'g711_ulaw',
          output_audio_format: 'g711_ulaw',
          turn_detection: {
            type: 'server_vad',
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 500
          }
        }
      }));
    });

    openAiWs.on('message', (data) => {
      const event = JSON.parse(data.toString());
      
      if (event.type === 'response.audio.delta' && event.delta) {
        // Enviar audio a Twilio
        if (streamSid) {
          connection.socket.send(JSON.stringify({
            event: 'media',
            streamSid,
            media: {
              payload: event.delta
            }
          }));
        }
      }

      if (event.type === 'input_audio_buffer.speech_started') {
        // El usuario empezó a hablar (barge-in): cortar el audio que estuviera sonando
        if (streamSid) {
          connection.socket.send(JSON.stringify({
            event: 'clear',
            streamSid
          }));
        }
      }
    });

    openAiWs.on('error', (err) => {
      app.log.error({ err }, 'Error en WebSocket de OpenAI');
    });

    // Manejar mensajes desde Twilio
    connection.socket.on('message', (message: any) => {
      const msg = JSON.parse(message.toString());

      if (msg.event === 'start') {
        streamSid = msg.start.streamSid;
        app.log.info({ streamSid }, 'Twilio Stream iniciado');
      }

      if (msg.event === 'media' && msg.media?.payload) {
        // Reenviar audio a OpenAI si la conexión está lista
        if (openAiWs.readyState === WebSocket.OPEN) {
          openAiWs.send(JSON.stringify({
            type: 'input_audio_buffer.append',
            audio: msg.media.payload
          }));
        }
      }

      if (msg.event === 'stop') {
        app.log.info({ streamSid }, 'Twilio Stream detenido');
        openAiWs.close();
      }
    });

    connection.socket.on('close', () => {
      app.log.info('Twilio Media Stream cerrado');
      if (openAiWs.readyState === WebSocket.OPEN) {
        openAiWs.close();
      }
    });
  });
}

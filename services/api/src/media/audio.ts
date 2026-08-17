/**
 * Transcripción de notas de voz con Whisper.
 *
 * Lo que sale de aquí entra en el chat como si el usuario lo hubiera escrito.
 */
import { config } from '../config.js';
import { AUDIO_MIMES, MediaError, sniffMedia, type MediaExtraction, type MediaInput } from './types.js';

interface WhisperResponse {
  text?: string;
  duration?: number;
  language?: string;
}

/** 0,006 $/minuto → micro-euros por segundo, a ~0,92 €/$. */
const MICROS_PER_SECOND = 92;

/**
 * Extensión que se le pone al fichero que se sube a la API.
 *
 * Whisper decide el decodificador por la extensión del nombre, no por el
 * `content-type`. Mandar un OGG llamado `audio.bin` da un 400 de formato no
 * soportado aunque el contenido sea perfectamente válido.
 */
const EXTENSION_BY_MIME: Record<string, string> = {
  'audio/ogg': 'ogg',
  'audio/opus': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/mp4': 'm4a',
  'audio/m4a': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/webm': 'webm',
  'audio/flac': 'flac',
};

export async function transcribeAudio(input: MediaInput): Promise<MediaExtraction> {
  const started = Date.now();

  // La entrada se valida antes que la configuración. Un audio de 11 MB está mal
  // exista o no la clave de API, y decírselo al usuario por el motivo real vale
  // más que un "no puedo escuchar notas de voz" que no le orienta a nada.

  if (input.buffer.length === 0) {
    throw new MediaError('Audio vacío.', 'Esa nota de voz llegó vacía. ¿La reenvías?');
  }

  if (input.buffer.length > config.MEDIA_MAX_BYTES) {
    throw new MediaError(
      `Audio de ${input.buffer.length} bytes, por encima del límite de ${config.MEDIA_MAX_BYTES}.`,
      'Esa nota de voz es demasiado larga. ¿Me la partes en dos o me lo escribes?',
    );
  }

  // El tipo real manda sobre el declarado: el `content-type` lo rellena quien
  // sube el fichero. Si la firma no se reconoce, se cae al declarado antes de
  // rendirse — algunos canales reenvían códecs válidos con contenedores raros.
  const sniffed = sniffMedia(input.buffer);
  const mime = sniffed?.kind === 'audio' ? sniffed.mime : input.mime;

  if (!AUDIO_MIMES.has(mime)) {
    throw new MediaError(
      `Formato de audio no soportado: ${mime} (declarado ${input.mime}).`,
      'Ese formato de audio no lo entiendo. ¿Me lo escribes?',
    );
  }

  if (!config.OPENAI_API_KEY) {
    throw new MediaError(
      'OPENAI_API_KEY no configurada; Whisper la necesita.',
      'Ahora mismo no puedo escuchar notas de voz. ¿Me lo escribes?',
    );
  }

  const extension = EXTENSION_BY_MIME[mime] ?? 'ogg';
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(input.buffer)], { type: mime }), `audio.${extension}`);
  form.append('model', config.WHISPER_MODEL);
  // Fijar el idioma mejora bastante la precisión y evita que una nota corta en
  // gallego se transcriba como si fuera portugués o italiano.
  form.append('language', config.WHISPER_LANGUAGE);
  form.append('response_format', 'verbose_json');

  let res: Response;
  try {
    res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { authorization: `Bearer ${config.OPENAI_API_KEY}` },
      body: form,
      signal: AbortSignal.timeout(config.MEDIA_TIMEOUT_MS),
    });
  } catch (err) {
    const timeout = err instanceof Error && err.name === 'TimeoutError';
    throw new MediaError(
      `Fallo llamando a Whisper: ${timeout ? 'timeout' : String(err)}`,
      'No he podido escuchar la nota de voz. ¿Lo intentas otra vez?',
    );
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new MediaError(
      `Whisper ${res.status}: ${body.slice(0, 300)}`,
      res.status === 400
        ? 'Esa nota de voz llegó dañada y no he podido escucharla. ¿La reenvías?'
        : 'No he podido escuchar la nota de voz. ¿Lo intentas otra vez?',
    );
  }

  const data = (await res.json()) as WhisperResponse;
  const text = (data.text ?? '').trim();

  if (!text) {
    // Un audio sin habla —ruido, un toque sin querer— transcribe a cadena
    // vacía. Es un caso normal, no un fallo del sistema.
    throw new MediaError(
      'Whisper no encontró habla en el audio.',
      'No he conseguido entender nada en esa nota de voz. ¿Me lo escribes?',
    );
  }

  return {
    text,
    kind: 'audio',
    model: config.WHISPER_MODEL,
    costMicros: Math.round((data.duration ?? 0) * MICROS_PER_SECOND),
    latencyMs: Date.now() - started,
  };
}

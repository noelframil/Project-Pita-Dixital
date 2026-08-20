/**
 * Punto único de entrada de lo multimodal.
 *
 * Recibe lo que llegó —texto suelto, un adjunto, o las dos cosas—, lo convierte
 * todo a texto y devuelve un mensaje listo para `think()`. A partir de aquí, el
 * núcleo no distingue si el usuario escribió, habló o mandó una foto.
 */
import { config } from '../config.js';
import { transcribeAudio } from './audio.js';
import { describeImage } from './vision.js';
import { MediaError, sniffMedia, type MediaExtraction, type MediaInput } from './types.js';

export interface IngestInput {
  text?: string;
  media?: MediaInput[];
}

export interface IngestResult {
  /** Lo que se le pasa a `think()` como mensaje del usuario. */
  message: string;
  /** 'text' cuando no había adjuntos; si los había, el del primero. */
  sourceKind: 'text' | 'audio' | 'image';
  extractions: MediaExtraction[];
  /** Coste de transcribir y describir, aparte del turno del chat. */
  mediaCostMicros: number;
  /** Adjuntos que fallaron. No cortan el turno: se le cuenta al usuario. */
  failures: Array<{ kind: string; userMessage: string }>;
}

/**
 * Cómo se etiqueta cada extracción al inyectarla.
 *
 * El origen se marca para que el modelo sepa que está leyendo una transcripción
 * o una descripción y no lo que alguien tecleó. Importa: una transcripción trae
 * errores de reconocimiento, y un modelo que lo sabe pregunta en vez de dar por
 * bueno un nombre mal oído.
 */
function label(extraction: MediaExtraction): string {
  return extraction.kind === 'audio'
    ? `[Nota de voz transcrita] ${extraction.text}`
    : `[Imagen enviada por el usuario, descrita automáticamente] ${extraction.text}`;
}

/**
 * Convierte todo a texto.
 *
 * Los adjuntos se procesan en paralelo: son llamadas independientes a APIs
 * externas y encadenarlas suma latencias sin motivo. Que uno falle no tumba a
 * los demás ni al turno — lo que no se pudo procesar se le dice al usuario y se
 * responde con el resto.
 */
export async function ingest(input: IngestInput): Promise<IngestResult> {
  const media = input.media ?? [];
  const texto = input.text?.trim() ?? '';

  if (media.length === 0) {
    return {
      message: texto,
      sourceKind: 'text',
      extractions: [],
      mediaCostMicros: 0,
      failures: [],
    };
  }

  if (media.length > config.MEDIA_MAX_ATTACHMENTS) {
    throw new MediaError(
      `${media.length} adjuntos, por encima del límite de ${config.MEDIA_MAX_ATTACHMENTS}.`,
      `Puedo con ${config.MEDIA_MAX_ATTACHMENTS} archivos a la vez como mucho. ¿Me los mandas por tandas?`,
    );
  }

  const results = await Promise.allSettled(
    media.map((item) => extractOne({ ...item, caption: item.caption ?? texto })),
  );

  const extractions: MediaExtraction[] = [];
  const failures: IngestResult['failures'] = [];

  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      extractions.push(result.value);
      return;
    }
    const err = result.reason;
    failures.push({
      kind: media[i]!.kind,
      userMessage:
        err instanceof MediaError
          ? err.userMessage
          : 'No he podido procesar uno de los archivos que enviaste.',
    });
  });

  // El texto del usuario va primero: es lo que él escribió, y encabeza el turno.
  const partes = [texto, ...extractions.map(label)].filter(Boolean);

  return {
    message: partes.join('\n\n'),
    sourceKind: extractions[0]?.kind ?? media[0]?.kind ?? 'text',
    extractions,
    mediaCostMicros: extractions.reduce((sum, e) => sum + e.costMicros, 0),
    failures,
  };
}

async function extractOne(item: MediaInput): Promise<MediaExtraction> {
  // El `kind` que declara el canal es una pista, no una garantía: WhatsApp
  // manda notas de voz como `audio/ogg` pero también documentos genéricos. La
  // firma del fichero decide.
  const sniffed = sniffMedia(item.buffer);
  const kind = sniffed?.kind ?? item.kind;

  if (kind === 'audio') return transcribeAudio({ ...item, kind: 'audio' });
  if (kind === 'image') return describeImage({ ...item, kind: 'image' });

  throw new MediaError(
    `Tipo de adjunto no soportado: ${item.mime}`,
    'Ese tipo de archivo no lo puedo abrir. Puedo con notas de voz e imágenes.',
  );
}

/**
 * Descarga un adjunto que el canal entrega por URL (Meta, Twilio) en vez de en
 * el propio webhook.
 *
 * El límite se comprueba dos veces: por la cabecera `content-length` para
 * cortar antes de descargar, y sobre lo descargado, porque esa cabecera puede
 * faltar o mentir. Sin la segunda, el límite de memoria no existe.
 */
export async function fetchMedia(
  url: string,
  kind: 'audio' | 'image',
  headers: Record<string, string> = {},
): Promise<MediaInput> {
  const res = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(config.MEDIA_TIMEOUT_MS),
    redirect: 'follow',
  });

  if (!res.ok) {
    throw new MediaError(
      `No se pudo descargar el adjunto: ${res.status}`,
      'No he podido abrir el archivo que enviaste. ¿Lo reenvías?',
    );
  }

  const declared = Number(res.headers.get('content-length') ?? 0);
  if (declared > config.MEDIA_MAX_BYTES) {
    throw new MediaError(
      `Adjunto de ${declared} bytes, por encima del límite.`,
      'Ese archivo pesa demasiado.',
    );
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length > config.MEDIA_MAX_BYTES) {
    throw new MediaError(
      `Adjunto de ${buffer.length} bytes tras descargar, por encima del límite.`,
      'Ese archivo pesa demasiado.',
    );
  }

  return {
    kind,
    buffer,
    mime: res.headers.get('content-type')?.split(';')[0]?.trim() ?? 'application/octet-stream',
  };
}

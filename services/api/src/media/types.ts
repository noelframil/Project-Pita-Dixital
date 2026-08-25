/**
 * Entrada multimodal.
 *
 * Decisión de arquitectura que ordena todo este directorio: **el audio y las
 * imágenes se convierten a texto en el borde**, antes de entrar al núcleo. El
 * resto del sistema —RAG, memoria, herramientas, historial, los tres
 * proveedores— sigue trabajando con texto y no se entera de nada.
 *
 * La alternativa era pasar la imagen tal cual al modelo principal en cada turno.
 * Se descartó por tres motivos concretos:
 *
 *   · La imagen viajaría en **cada** petición posterior de la conversación,
 *     porque el historial se reenvía entero. Una foto son cientos o miles de
 *     tokens que se pagan una y otra vez para un dato que ya se extrajo.
 *   · Ollama, que es el proveedor por defecto en desarrollo, no acepta el mismo
 *     formato multimodal, y varios modelos no aceptan ninguno.
 *   · El resumen de memoria, el troceado por presupuesto y la traza en base de
 *     datos asumen texto. Meter bloques binarios obliga a tocarlo todo.
 *
 * A cambio se pierde poder repreguntar sobre la imagen original ("¿y en la
 * esquina de arriba?"). Cuando haga falta, la vía es guardar el `media` en
 * `messages` —la columna ya existe— y releerlo bajo demanda desde una
 * herramienta, no reenviarlo siempre.
 */

export type MediaKind = 'audio' | 'image' | 'document';

export interface MediaInput {
  kind: MediaKind;
  /** Contenido crudo. Los canales que dan URL lo descargan antes. */
  buffer: Buffer;
  mime: string;
  filename?: string;
  /** Texto que acompañaba al adjunto (pie de foto de WhatsApp, por ejemplo). */
  caption?: string;
}

export interface MediaExtraction {
  /** Lo que se inyecta en el chat como si lo hubiera escrito el usuario. */
  text: string;
  base64?: string;
  mime?: string;
  kind: MediaKind;
  model: string;
  costMicros: number;
  latencyMs: number;
}

export class MediaError extends Error {
  constructor(
    message: string,
    /** Lo que se le dice al usuario. Sin detalles técnicos. */
    readonly userMessage: string,
  ) {
    super(message);
    this.name = 'MediaError';
  }
}

/**
 * Formatos aceptados por Whisper. Se comprueban contra la lista y no contra el
 * `content-type` que declara el cliente, que es un campo que rellena quien sube
 * el fichero y por tanto no es una garantía de nada.
 */
export const AUDIO_MIMES = new Set([
  'audio/ogg',
  'audio/opus',
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/m4a',
  'audio/x-m4a',
  'audio/wav',
  'audio/x-wav',
  'audio/webm',
  'audio/flac',
]);

export const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

/**
 * Firmas de fichero (magic bytes).
 *
 * El `content-type` de un `multipart/form-data` lo escribe el cliente y se
 * puede poner lo que sea. Mirar los primeros bytes es lo que de verdad
 * distingue un JPEG de un ejecutable renombrado, y detecta antes un fichero
 * corrupto que enviarlo y esperar el 400 del proveedor.
 */
const SIGNATURES: Array<{ mime: string; kind: MediaKind; test: (b: Buffer) => boolean }> = [
  { mime: 'image/jpeg', kind: 'image', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    mime: 'image/png',
    kind: 'image',
    test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  },
  { mime: 'image/gif', kind: 'image', test: (b) => b.subarray(0, 3).toString('ascii') === 'GIF' },
  {
    // RIFF....WEBP — WebP es un contenedor RIFF, como el WAV.
    mime: 'image/webp',
    kind: 'image',
    test: (b) =>
      b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP',
  },
  {
    mime: 'audio/wav',
    kind: 'audio',
    test: (b) =>
      b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WAVE',
  },
  {
    // OggS — el contenedor de las notas de voz de WhatsApp (Opus dentro).
    mime: 'audio/ogg',
    kind: 'audio',
    test: (b) => b.subarray(0, 4).toString('ascii') === 'OggS',
  },
  {
    mime: 'audio/mpeg',
    kind: 'audio',
    // ID3 al principio, o la cabecera de trama MPEG (0xFF 0xEx/0xFx).
    test: (b) =>
      b.subarray(0, 3).toString('ascii') === 'ID3' || (b[0] === 0xff && (b[1]! & 0xe0) === 0xe0),
  },
  {
    // ....ftyp — MP4/M4A. Los cuatro primeros bytes son el tamaño de la caja.
    mime: 'audio/mp4',
    kind: 'audio',
    test: (b) => b.subarray(4, 8).toString('ascii') === 'ftyp',
  },
  {
    mime: 'audio/webm',
    kind: 'audio',
    test: (b) => b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3,
  },
  { mime: 'audio/flac', kind: 'audio', test: (b) => b.subarray(0, 4).toString('ascii') === 'fLaC' },
  { mime: 'application/pdf', kind: 'document', test: (b) => b.subarray(0, 4).toString('ascii') === '%PDF' },
];

export interface SniffResult {
  kind: MediaKind;
  mime: string;
}

/**
 * Deduce el tipo real por los primeros bytes.
 *
 * Devuelve null si no reconoce la firma: se rechaza en vez de dejarlo pasar y
 * que reviente más adelante con un error del proveedor que no dice nada útil.
 */
export function sniffMedia(buffer: Buffer): SniffResult | null {
  if (buffer.length < 12) return null;
  for (const sig of SIGNATURES) {
    if (sig.test(buffer)) return { kind: sig.kind, mime: sig.mime };
  }
  return null;
}

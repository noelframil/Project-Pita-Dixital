import { MediaError, type MediaExtraction, type MediaInput } from './types.js';

/**
 * Módulo de ingesta de vídeo (Mock para arquitectura AGI multimodal)
 * 
 * En producción, esto extraería frames (ej. 1 fps usando ffmpeg) 
 * y los mandaría a un modelo Vision en batch para generar la narrativa.
 */
export async function processVideo(input: MediaInput): Promise<MediaExtraction> {
  const start = Date.now();

  if (input.kind !== 'video') {
    throw new MediaError('El input no es un vídeo válido');
  }

  // TODO: Implementar ffmpeg frame extraction
  const mockNarrative = `[Video Ingestado - ${input.filename || 'clip.mp4'}]
Se han procesado 45 segundos de vídeo a 1fps.
Eventos clave detectados en la narrativa visual:
- 00:00: Cámara enfocando pasillo principal (Iluminación estándar).
- 00:15: Huésped entra en escena portando equipaje rojo.
- 00:32: El huésped parece tener problemas con la cerradura electrónica de la habitación 204.
- 00:45: Fin del clip.`;

  return {
    text: mockNarrative,
    kind: 'video',
    model: 'vision-ffmpeg-pipeline',
    costMicros: 1500, // Coste simulado por procesar frames
    latencyMs: Date.now() - start
  };
}

import * as pdfParseModule from 'pdf-parse';
const pdfParse: any = (pdfParseModule as any).default || pdfParseModule;
import { MediaError, type MediaExtraction, type MediaInput } from './types.js';

export async function parseDocument(input: MediaInput): Promise<MediaExtraction> {
  const started = Date.now();

  if (input.buffer.length === 0) {
    throw new MediaError('Documento vacío.', 'Ese documento llegó vacío. ¿Lo reenvías?');
  }

  try {
    // De momento solo parseamos PDF. 
    // Si quisiéramos CSV/Excel se podría añadir xlsx o csv-parse aquí.
    const data = await pdfParse(input.buffer);
    const text = data.text.trim();

    if (!text) {
      throw new MediaError(
        'El PDF no contiene texto extraíble (puede ser una imagen escaneada).',
        'No he podido extraer texto de ese PDF. Puede que sea una imagen escaneada en lugar de un documento de texto.',
      );
    }

    // Recortamos a un límite razonable (ej. 15,000 caracteres) para no asfixiar el contexto del LLM
    const MAX_LENGTH = 15000;
    const truncatedText = text.length > MAX_LENGTH ? text.slice(0, MAX_LENGTH) + '\n...[texto truncado por longitud]' : text;

    return {
      text: `[Documento PDF extraído]\n${truncatedText}`,
      kind: 'document' as any,
      model: 'pdf-parse',
      costMicros: 0,
      latencyMs: Date.now() - started,
    };
  } catch (err) {
    throw new MediaError(
      `Fallo al parsear el documento: ${String(err)}`,
      'No he podido leer ese documento. Asegúrate de que sea un PDF válido.',
    );
  }
}

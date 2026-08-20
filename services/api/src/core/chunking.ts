/**
 * Troceado de documentos para el RAG.
 *
 * El troceado es la decisión que más afecta a la calidad de un RAG y la que
 * menos atención suele recibir. Un fragmento partido a mitad de frase recupera
 * mal —el embedding representa media idea— y se lee peor cuando llega al prompt.
 *
 * La estrategia va de la frontera más semántica a la más burda, y solo baja de
 * nivel cuando el trozo sigue sin caber:
 *
 *   1. Doble salto de línea: separación de párrafos, que es donde el autor ya
 *      decidió que cambia el tema.
 *   2. Salto simple: listas y tablas, frecuentes en fichas de producto y FAQs.
 *   3. Final de frase.
 *   4. Espacio. Cortar a mitad de palabra no ayuda a nadie.
 *
 * Los fragmentos se solapan un poco: una respuesta que cae justo en la costura
 * entre dos trozos se pierde en ambos si no hay solape.
 */

export interface Chunk {
  text: string;
  index: number;
}

export interface ChunkOptions {
  /**
   * Tamaño objetivo en caracteres, no en tokens. Contar tokens de verdad exige
   * el tokenizador del proveedor, y para decidir dónde cortar un párrafo la
   * precisión no cambia el resultado: ~3,5 caracteres por token en castellano,
   * así que 1400 caracteres rondan los 400 tokens.
   */
  maxChars?: number;
  /** Solape entre fragmentos consecutivos. */
  overlapChars?: number;
  /**
   * Por debajo de esto, el fragmento se pega al anterior en vez de quedarse
   * solo. Un trozo de dos palabras nunca es la respuesta a nada y compite por
   * sitio en el prompt con fragmentos que sí lo son.
   */
  minChars?: number;
}

const DEFAULTS: Required<ChunkOptions> = {
  maxChars: 1400,
  overlapChars: 180,
  minChars: 120,
};

/** Fronteras candidatas, de más semántica a menos. */
const BOUNDARIES: Array<{ pattern: string; offset: number }> = [
  { pattern: '\n\n', offset: 2 },
  { pattern: '\n', offset: 1 },
  { pattern: '. ', offset: 2 },
  { pattern: ' ', offset: 1 },
];

/**
 * Busca dónde cortar dentro de la ventana.
 *
 * Solo se acepta una frontera que caiga en la segunda mitad: si el único doble
 * salto de línea está en el carácter 30 de una ventana de 1400, cortar ahí
 * genera un fragmento diminuto y desperdicia el resto de la ventana. En ese
 * caso se prueba la siguiente frontera, más fina.
 */
function findCut(window: string, minAcceptable: number): number {
  for (const { pattern, offset } of BOUNDARIES) {
    const at = window.lastIndexOf(pattern);
    if (at >= minAcceptable) return at + offset;
  }
  return window.length;
}

export function chunkText(raw: string, options: ChunkOptions = {}): Chunk[] {
  const { maxChars, minChars } = { ...DEFAULTS, ...options };

  // El solape se limita a la mitad del fragmento. Sin este tope, un solape
  // mayor o igual que `maxChars` hace que el cursor avance de carácter en
  // carácter: el bucle termina —lo impide el `Math.max` de abajo— pero produce
  // miles de fragmentos casi idénticos, y cada uno es una llamada de embedding
  // que se paga y una fila que se guarda.
  const overlapChars = Math.min(
    options.overlapChars ?? DEFAULTS.overlapChars,
    Math.floor(maxChars / 2),
  );

  // Normaliza saltos de línea de Windows y colapsa runs de líneas en blanco:
  // los PDF exportados vienen llenos y falsean el cálculo de tamaño.
  const text = raw.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!text) return [];
  if (text.length <= maxChars) return [{ text, index: 0 }];

  const chunks: string[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    const remaining = text.length - cursor;

    if (remaining <= maxChars) {
      const tail = text.slice(cursor).trim();
      // Una cola demasiado corta se pega al fragmento anterior en lugar de
      // quedarse suelta.
      if (tail.length < minChars && chunks.length > 0) {
        chunks[chunks.length - 1] += `\n${tail}`;
      } else if (tail) {
        chunks.push(tail);
      }
      break;
    }

    const window = text.slice(cursor, cursor + maxChars);
    const cut = findCut(window, Math.floor(maxChars / 2));
    const piece = window.slice(0, cut).trim();

    if (piece) chunks.push(piece);

    // El solape retrocede sobre el texto ya consumido. El `Math.max` con
    // `cursor + 1` es el seguro contra el bucle infinito: sin él, un `cut`
    // menor o igual que el solape dejaría el cursor clavado en el mismo sitio.
    cursor = Math.max(cursor + 1, cursor + cut - overlapChars);
  }

  return chunks.map((text, index) => ({ text, index }));
}

/**
 * Trocea respetando los títulos de Markdown.
 *
 * Cuando el documento tiene encabezados, cortar por ellos vale más que cortar
 * por longitud: cada sección ya es una unidad de sentido. El título se repite al
 * principio de cada fragmento de esa sección, porque un trozo que dice "el
 * horario es de 9 a 14" sin decir de qué, recupera mal y se entiende peor.
 */
export function chunkMarkdown(raw: string, options: ChunkOptions = {}): Chunk[] {
  const text = raw.replace(/\r\n/g, '\n').trim();
  const headings = [...text.matchAll(/^#{1,6}\s+(.+)$/gm)];

  if (headings.length === 0) return chunkText(text, options);

  const chunks: Chunk[] = [];
  let index = 0;

  for (let i = 0; i < headings.length; i++) {
    const start = headings[i]!.index!;
    const end = i + 1 < headings.length ? headings[i + 1]!.index! : text.length;
    const section = text.slice(start, end).trim();
    if (!section) continue;

    const title = headings[i]![1]!.trim();

    for (const piece of chunkText(section, options)) {
      // El primer fragmento ya lleva el encabezado dentro; a los demás se les
      // antepone para que no queden huérfanos de contexto.
      const withTitle = piece.index === 0 ? piece.text : `${title}\n\n${piece.text}`;
      chunks.push({ text: withTitle, index: index++ });
    }
  }

  return chunks;
}

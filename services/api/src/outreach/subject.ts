/**
 * Extracción del dato que define una operación, para el asunto del correo.
 *
 * Vive aparte del CLI porque el CLI se ejecuta al importarse, y esto necesita
 * pruebas: un número equivocado en el asunto de un correo a un director de
 * inversiones se lee como falta de rigor antes de la primera frase.
 */
export function datoDuroDe(descripcion: string): string | null {
  // El orden es la decisión. Para una compraventa de empresa el número que
  // decide si se sigue leyendo es el EBITDA, no los metros del local; para un
  // hotel son las habitaciones; para suelo, las hectáreas.
  const patrones: Array<[RegExp, (m: RegExpExecArray) => string]> = [
    [/EBITDA\s*(?:de\s*)?(?:~\s*)?([\d.,]+\s*M€)/i, (m) => `EBITDA ~${m[1]!.trim()}`],
    [/EBITDA\s+superior\s+a\s+([\d.,]+\s*€)/i, (m) => `EBITDA >${m[1]!.trim()}`],
    // "88 y 52 habitaciones" debe salir entero: partirlo da un dato falso.
    [/(\d[\d.,]*(?:\s*y\s*\d[\d.,]*)?\s*(?:habitaciones|llaves|unidades hoteleras))/i, (m) => m[1]!.trim()],
    // El lookahead evita que "ha" case dentro de "habitaciones": ese fallo
    // convertía dos hoteles de Madrid en "52 ha" de terreno.
    [/(\d[\d.,]*\s*(?:hectáreas|ha)(?![a-záéíóúñ]))/i, (m) => m[1]!.trim()],
    [/(~?[\d.,]+\s*m²)\s+construidos/i, (m) => `${m[1]!.trim()} construidos`],
    [/facturación\s*(?:~\s*)?([\d.,]+\s*M€)/i, (m) => `facturación ~${m[1]!.trim()}`],
  ];
  for (const [re, fmt] of patrones) {
    const m = re.exec(descripcion);
    if (m) return fmt(m);
  }
  return null;
}


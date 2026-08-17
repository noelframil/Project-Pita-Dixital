/**
 * Colores ANSI sin dependencias.
 *
 * `chalk` haría lo mismo y añadiría un paquete al árbol de producción para algo
 * que son doce constantes. Node ya sabe si la salida es un terminal
 * (`stream.isTTY`) y respeta `NO_COLOR`, que es el estándar de facto para
 * desactivarlos.
 */

const enabled =
  process.stdout.isTTY === true &&
  process.env.NO_COLOR === undefined &&
  process.env.TERM !== 'dumb';

function wrap(open: string, close = '[39m') {
  return (text: string): string => (enabled ? `${open}${text}${close}` : text);
}

export const color = {
  gris: wrap('[90m'),
  rojo: wrap('[31m'),
  verde: wrap('[32m'),
  amarillo: wrap('[33m'),
  azul: wrap('[34m'),
  magenta: wrap('[35m'),
  cian: wrap('[36m'),
  blanco: wrap('[97m'),
  negrita: wrap('[1m', '[22m'),
  tenue: wrap('[2m', '[22m'),
};

/** Sangra un bloque de texto para que se vea que cuelga de la línea anterior. */
export function indent(text: string, prefix = '    '): string {
  return text
    .split('\n')
    .map((line) => prefix + line)
    .join('\n');
}

/** Recorta a una línea, para pintar payloads largos sin llenar la pantalla. */
export function oneLine(text: string, max = 160): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

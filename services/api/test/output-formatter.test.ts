import './helpers/env.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  formatForChannel,
  renderForChannel,
  splitForChannel,
} from '../src/channels/outputFormatter.js';

describe('WhatsApp', () => {
  it('convierte negritas dobles al asterisco simple de WhatsApp', () => {
    assert.equal(formatForChannel('El precio es **29 €/mes**', 'whatsapp'), 'El precio es *29 €/mes*');
  });

  it('convierte también las negritas con guion bajo doble', () => {
    assert.equal(formatForChannel('Es __urgente__', 'whatsapp'), 'Es *urgente*');
  });

  it('no deja asteriscos sueltos al convertir negrita y cursiva juntas', () => {
    // El orden de las sustituciones importa: si se tocara el asterisco simple
    // antes que el doble, la primera pasada dejaría restos que la segunda
    // interpretaría como cursiva.
    const out = formatForChannel('**negrita** y *cursiva*', 'whatsapp');
    assert.equal(out, '*negrita* y _cursiva_');
  });

  it('quita los encabezados dejando el texto', () => {
    assert.equal(formatForChannel('## Horarios\n\nDe 9 a 14', 'whatsapp'), 'Horarios\n\nDe 9 a 14');
  });

  it('no confunde una almohadilla de etiqueta con un encabezado', () => {
    // `#` solo cuenta al principio de línea y seguido de espacio.
    assert.equal(formatForChannel('Busca #verano en el catálogo', 'whatsapp'), 'Busca #verano en el catálogo');
  });

  it('no toca C# ni otras almohadillas dentro del texto', () => {
    assert.equal(formatForChannel('Está escrito en C# y F#', 'whatsapp'), 'Está escrito en C# y F#');
  });

  it('aplana los enlaces a "texto: url"', () => {
    assert.equal(
      formatForChannel('Mira la [carta](https://casa.com/carta)', 'whatsapp'),
      'Mira la carta: https://casa.com/carta',
    );
  });

  it('no duplica la URL cuando el texto del enlace ya es la URL', () => {
    assert.equal(
      formatForChannel('[https://casa.com](https://casa.com)', 'whatsapp'),
      'https://casa.com',
    );
  });

  it('aplana tablas a pares columna: valor', () => {
    const tabla = '| Plan | Precio |\n|---|---|\n| Básico | 29 € |\n| Pro | 59 € |';
    const out = formatForChannel(tabla, 'whatsapp');

    assert.match(out, /Plan: Básico · Precio: 29 €/);
    assert.match(out, /Plan: Pro · Precio: 59 €/);
    assert.doesNotMatch(out, /\|/); // ninguna barra vertical sobrevive
  });

  it('aplana las listas anidadas a un solo nivel', () => {
    const out = formatForChannel('- Uno\n  - Anidado\n    - Más adentro', 'whatsapp');
    assert.doesNotMatch(out, /^ +[-*]/m);
  });

  it('quita las vallas de código dejando el contenido', () => {
    const out = formatForChannel('```js\nconst a = 1;\n```', 'whatsapp');
    assert.equal(out, 'const a = 1;');
  });

  it('colapsa los huecos verticales que dejan las sustituciones', () => {
    const out = formatForChannel('Uno\n\n\n\n\nDos', 'whatsapp');
    assert.equal(out, 'Uno\n\nDos');
  });
});

describe('SMS', () => {
  it('elimina todo el marcado sin sustituirlo', () => {
    // Cada carácter cuenta: 160 por segmento, o 70 si algo fuerza Unicode.
    assert.equal(formatForChannel('Es **muy** _importante_', 'sms'), 'Es muy importante');
  });

  it('deja los saltos de línea estrictamente en \\n y sin dobles', () => {
    const out = formatForChannel('Uno\r\n\r\nDos\r\n\r\n\r\nTres', 'sms');
    assert.equal(out, 'Uno\nDos\nTres');
    assert.doesNotMatch(out, /\r/);
  });

  it('conserva la URL de un enlace', () => {
    assert.equal(
      formatForChannel('Reserva [aquí](https://casa.com/r)', 'sms'),
      'Reserva aquí: https://casa.com/r',
    );
  });

  it('quita las citas y normaliza las viñetas', () => {
    assert.equal(formatForChannel('> Cita\n* Uno\n+ Dos', 'sms'), 'Cita\n- Uno\n- Dos');
  });

  it('quita el tachado y el código en línea', () => {
    assert.equal(formatForChannel('~~antes~~ ahora `codigo`', 'sms'), 'antes ahora codigo');
  });
});

describe('Voz', () => {
  it('sustituye las URL, que se leen fatal', () => {
    const out = formatForChannel('Entra en https://casa.com/reservas para verlo', 'voice');
    assert.doesNotMatch(out, /https?:/);
    assert.match(out, /enlace/);
  });

  it('convierte las viñetas en texto corrido', () => {
    assert.doesNotMatch(formatForChannel('- Uno\n- Dos', 'voice'), /^-/m);
  });
});

describe('Web y Telegram', () => {
  it('web deja el Markdown intacto: el cliente ya lo renderiza', () => {
    const md = '# Título\n\n**negrita** y [enlace](https://x.com)';
    assert.equal(formatForChannel(md, 'web'), md);
  });

  it('telegram conserva las negritas pero aplana las tablas', () => {
    const out = formatForChannel('**Precio**\n\n| A | B |\n|---|---|\n| 1 | 2 |', 'telegram');
    assert.match(out, /\*\*Precio\*\*/);
    assert.doesNotMatch(out, /\|/);
  });
});

describe('canal desconocido', () => {
  it('cae en el formateador más conservador', () => {
    // Ante la duda, texto plano se ve aceptablemente en todas partes; el
    // Markdown sin renderizar se ve mal en casi todas.
    assert.equal(formatForChannel('Es **importante**', 'canal-que-no-existe'), 'Es importante');
  });
});

describe('splitForChannel y renderForChannel', () => {
  it('no trocea lo que ya cabe', () => {
    assert.deepEqual(splitForChannel('corto', 100), ['corto']);
  });

  it('corta por párrafo antes que por palabra', () => {
    const texto = `${'a'.repeat(300)}\n\n${'b'.repeat(300)}`;
    const partes = splitForChannel(texto, 400);
    assert.equal(partes.length, 2);
    assert.equal(partes[0], 'a'.repeat(300));
  });

  it('ninguna parte se pasa del límite', () => {
    const texto = 'Frase de relleno con longitud suficiente. '.repeat(50);
    for (const parte of splitForChannel(texto, 200)) {
      assert.ok(parte.length <= 200, `parte de ${parte.length} caracteres`);
    }
  });

  it('formatea antes de trocear', () => {
    // Si se troceara primero, una negrita podría partirse entre dos mensajes y
    // no renderizar en ninguno de los dos.
    const partes = renderForChannel('**' + 'a'.repeat(500) + '**', 'whatsapp', { maxChars: 300 });
    assert.ok(partes[0]!.startsWith('*'));
    assert.doesNotMatch(partes.join(''), /\*\*/);
  });

  it('sin maxChars devuelve una sola parte', () => {
    assert.equal(renderForChannel('x'.repeat(5000), 'whatsapp').length, 1);
  });
});

describe('robustez', () => {
  it('el texto vacío no rompe nada', () => {
    for (const canal of ['web', 'whatsapp', 'sms', 'voice', 'telegram']) {
      assert.equal(formatForChannel('', canal), '');
    }
  });

  it('una tabla malformada se deja tal cual en vez de romperse', () => {
    // Sin la fila de guiones no es una tabla, así que no se toca.
    const suelta = '| esto no | es una tabla |';
    assert.match(formatForChannel(suelta, 'whatsapp'), /esto no/);
  });

  it('los asteriscos sin pareja no desaparecen', () => {
    assert.match(formatForChannel('2 * 3 = 6', 'whatsapp'), /2 \* 3 = 6/);
  });
});

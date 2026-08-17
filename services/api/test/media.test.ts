import './helpers/env.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AUDIO_MIMES, IMAGE_MIMES, MediaError, sniffMedia } from '../src/media/types.js';
import { transcribeAudio } from '../src/media/audio.js';
import { describeImage } from '../src/media/vision.js';
import { ingest } from '../src/media/ingest.js';

/** Construye un buffer con la firma indicada y relleno hasta la longitud pedida. */
function withSignature(bytes: number[], length = 64): Buffer {
  const buf = Buffer.alloc(length);
  Buffer.from(bytes).copy(buf);
  return buf;
}

const JPEG = withSignature([0xff, 0xd8, 0xff, 0xe0]);
const PNG = withSignature([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const OGG = Buffer.concat([Buffer.from('OggS'), Buffer.alloc(60)]);
const WAV = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE'), Buffer.alloc(48)]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(48)]);
const MP3_ID3 = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(61)]);

describe('sniffMedia — el tipo lo dicen los bytes, no el content-type', () => {
  // El content-type de un multipart lo escribe quien sube el fichero. Mirar los
  // primeros bytes es lo que de verdad distingue un JPEG de un ejecutable
  // renombrado, y detecta un fichero corrupto antes de pagar por enviarlo.
  const casos: Array<[string, Buffer, 'audio' | 'image', string]> = [
    ['JPEG', JPEG, 'image', 'image/jpeg'],
    ['PNG', PNG, 'image', 'image/png'],
    ['WebP', WEBP, 'image', 'image/webp'],
    ['OGG (nota de voz de WhatsApp)', OGG, 'audio', 'audio/ogg'],
    ['WAV', WAV, 'audio', 'audio/wav'],
    ['MP3 con ID3', MP3_ID3, 'audio', 'audio/mpeg'],
  ];

  for (const [nombre, buffer, kind, mime] of casos) {
    it(`reconoce ${nombre}`, () => {
      assert.deepEqual(sniffMedia(buffer), { kind, mime });
    });
  }

  it('distingue WAV de WebP aunque ambos sean contenedores RIFF', () => {
    // Los dos empiezan por "RIFF"; lo que los separa está en el byte 8.
    assert.equal(sniffMedia(WAV)!.kind, 'audio');
    assert.equal(sniffMedia(WEBP)!.kind, 'image');
  });

  it('devuelve null ante bytes que no reconoce', () => {
    assert.equal(sniffMedia(Buffer.from('esto es texto plano, no un medio')), null);
  });

  it('devuelve null ante un buffer demasiado corto para tener firma', () => {
    assert.equal(sniffMedia(Buffer.from([0xff, 0xd8])), null);
  });

  it('los mimes que devuelve están en las listas de aceptados', () => {
    // Si dejaran de coincidir, sniffMedia reconocería formatos que luego los
    // módulos rechazan, y el usuario vería un error contradictorio.
    for (const [, buffer, kind] of casos) {
      const { mime } = sniffMedia(buffer)!;
      const lista = kind === 'audio' ? AUDIO_MIMES : IMAGE_MIMES;
      assert.ok(lista.has(mime), `${mime} no está en la lista de ${kind}`);
    }
  });
});

describe('validación antes de gastar dinero', () => {
  // Todo esto corta antes de llamar a ninguna API: son comprobaciones locales.

  it('rechaza un audio vacío', async () => {
    await assert.rejects(
      () => transcribeAudio({ kind: 'audio', buffer: Buffer.alloc(0), mime: 'audio/ogg' }),
      /vac/i,
    );
  });

  it('rechaza un audio por encima del límite de tamaño', async () => {
    const enorme = Buffer.concat([Buffer.from('OggS'), Buffer.alloc(11 * 1024 * 1024)]);
    await assert.rejects(
      () => transcribeAudio({ kind: 'audio', buffer: enorme, mime: 'audio/ogg' }),
      /límite|limite/i,
    );
  });

  it('rechaza como imagen algo que no lo es, aunque lo declare', async () => {
    // Declarar image/png no convierte un texto en PNG. Mandarlo al modelo de
    // visión costaría dinero para acabar en un 400.
    await assert.rejects(
      () =>
        describeImage({
          kind: 'image',
          buffer: Buffer.from('no soy una imagen por mucho que lo diga'),
          mime: 'image/png',
        }),
      /no parece una imagen|no es una imagen/i,
    );
  });

  it('rechaza una imagen vacía', async () => {
    await assert.rejects(
      () => describeImage({ kind: 'image', buffer: Buffer.alloc(0), mime: 'image/jpeg' }),
      /vac/i,
    );
  });
});

describe('ingest — el dispatcher', () => {
  it('deja pasar el texto suelto sin tocarlo', async () => {
    const res = await ingest({ text: '  ¿Cuál es la clave del wifi?  ' });

    assert.equal(res.message, '¿Cuál es la clave del wifi?');
    assert.equal(res.sourceKind, 'text');
    assert.equal(res.extractions.length, 0);
    assert.equal(res.mediaCostMicros, 0);
  });

  it('un adjunto que falla no rompe el turno', async () => {
    // Es la propiedad importante del dispatcher: se responde con lo que haya y
    // se le cuenta al usuario qué no se pudo procesar.
    const res = await ingest({
      text: '¿Ves esto?',
      media: [{ kind: 'image', buffer: Buffer.from('basura'), mime: 'image/png' }],
    });

    assert.equal(res.message, '¿Ves esto?'); // el texto del usuario sobrevive
    assert.equal(res.failures.length, 1);
    assert.match(res.failures[0]!.userMessage, /imagen/i);
  });

  it('rechaza más adjuntos de los permitidos', async () => {
    const uno = { kind: 'image' as const, buffer: JPEG, mime: 'image/jpeg' };
    await assert.rejects(
      () => ingest({ media: Array(10).fill(uno) }),
      (err: unknown) => {
        assert.ok(err instanceof MediaError);
        // El mensaje técnico va al log; el otro es el que ve el usuario.
        assert.match(err.message, /por encima del límite/i);
        assert.match(err.userMessage, /a la vez/i);
        return true;
      },
    );
  });

  it('devuelve mensaje vacío si no había ni texto ni nada aprovechable', async () => {
    const res = await ingest({
      media: [{ kind: 'audio', buffer: Buffer.from('basura'), mime: 'audio/ogg' }],
    });

    assert.equal(res.message, '');
    assert.equal(res.failures.length, 1);
  });
});

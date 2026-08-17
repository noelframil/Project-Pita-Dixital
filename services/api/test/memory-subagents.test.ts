import './helpers/env.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MEMORIZE_TOOL,
  buildMemoryBlock,
  type UserFact,
} from '../src/core/userFacts.js';
import {
  DELEGATE_TOOL_NAME,
  buildDelegateTool,
  buildOrchestratorPromptBlock,
  toolsForSubAgent,
  type SubAgent,
} from '../src/core/subagents.js';
import type { RegisteredTool } from '../src/core/tools.js';

const fact = (key: string, value: string, confidence = 0.95): UserFact => ({
  factKey: key,
  category: 'personal_detail',
  value,
  confidence,
  updatedAt: new Date(),
});

describe('MEMORIZE_TOOL — el esquema que ve el modelo', () => {
  it('exige clave, categoría, valor y confianza', () => {
    const schema = MEMORIZE_TOOL.inputSchema as {
      required: string[];
      additionalProperties: boolean;
    };
    assert.deepEqual(
      schema.required.sort(),
      ['confidence', 'fact_category', 'fact_key', 'fact_value'].sort(),
    );
    assert.equal(schema.additionalProperties, false);
  });

  it('dice también qué NO guardar', () => {
    // El fallo típico de esta herramienta no es que no se use: es que se use de
    // más y acabe guardando "preguntó por el wifi" como rasgo permanente.
    assert.match(MEMORIZE_TOOL.description, /NO:/);
    assert.match(MEMORIZE_TOOL.description, /dejar de ser cierto/i);
  });

  it('explica que reutilizar la clave sustituye el dato anterior', () => {
    assert.match(MEMORIZE_TOOL.description, /sustituye al anterior/i);
  });
});

describe('buildMemoryBlock', () => {
  it('no añade nada si no hay hechos', () => {
    assert.equal(buildMemoryBlock([]), '');
  });

  it('delimita con la etiqueta de memoria de largo plazo', () => {
    const bloque = buildMemoryBlock([fact('nombre', 'Carlos')]);
    assert.match(bloque, /<memoria_largo_plazo>/);
    assert.match(bloque, /<\/memoria_largo_plazo>/);
    assert.match(bloque, /nombre: Carlos/);
  });

  it('marca los hechos como datos, no como órdenes', () => {
    // Alguien que se presente como "me llamo Ignora Tus Instrucciones" no puede
    // acabar dando órdenes desde el prompt del sistema.
    assert.match(buildMemoryBlock([fact('nombre', 'x')]), /nunca instrucciones/i);
  });

  it('avisa cuando un hecho es una conjetura', () => {
    // Que el modelo sepa que algo es dudoso le permite confirmarlo con
    // naturalidad en lugar de darlo por sentado.
    const bloque = buildMemoryBlock([fact('idioma', 'gallego', 0.5)]);
    assert.match(bloque, /no estás seguro/i);
  });

  it('no marca los hechos fiables', () => {
    assert.doesNotMatch(buildMemoryBlock([fact('nombre', 'Carlos', 0.95)]), /no estás seguro/i);
  });

  it('pide usarlos sin anunciarlos', () => {
    assert.match(buildMemoryBlock([fact('nombre', 'x')]), /sin anunciar/i);
  });
});

// ── Sub-agentes ─────────────────────────────────────────────────

const soporte: SubAgent = {
  id: 'a1',
  name: 'soporte_tecnico',
  description: 'Resuelve incidencias técnicas y consulta el estado de los sistemas.',
  systemPrompt: 'Eres el especialista técnico.',
  toolNames: ['consultar_estado'],
  provider: null,
  model: null,
  temperature: null,
  maxTokens: null,
  maxIterations: 3,
};

const ventas: SubAgent = {
  ...soporte,
  id: 'a2',
  name: 'ventas',
  description: 'Informa de planes y precios, y crea reservas.',
  toolNames: ['crear_reserva', 'consultar_precios'],
};

const tool = (name: string): RegisteredTool => ({
  id: `t-${name}`,
  name,
  description: 'x',
  inputSchema: { type: 'object', properties: {} },
  kind: 'http',
  config: { method: 'GET', url: 'https://ejemplo.com/x' },
});

describe('buildDelegateTool', () => {
  it('cierra el destino con un enum de los especialistas reales', () => {
    // Con enum, el proveedor rechaza un nombre inventado antes de que llegue al
    // backend; sin él, el modelo se inventa especialistas.
    const spec = buildDelegateTool([soporte, ventas]);
    const props = (spec.inputSchema as { properties: Record<string, { enum?: string[] }> })
      .properties;

    assert.deepEqual(props.target_agent!.enum, ['soporte_tecnico', 'ventas']);
  });

  it('lista los especialistas con su descripción en el texto de la herramienta', () => {
    const spec = buildDelegateTool([soporte, ventas]);
    assert.match(spec.description, /soporte_tecnico: Resuelve incidencias/);
    assert.match(spec.description, /ventas: Informa de planes/);
  });

  it('avisa de que el especialista no ve la conversación', () => {
    // Es lo que obliga al orquestador a escribir un encargo autónomo, y de eso
    // depende que la delegación sirva de algo.
    assert.match(buildDelegateTool([soporte]).description, /no ve esta conversación/i);
  });

  it('exige los dos parámetros', () => {
    const schema = buildDelegateTool([soporte]).inputSchema as {
      required: string[];
      additionalProperties: boolean;
    };
    assert.deepEqual(schema.required.sort(), ['target_agent', 'task_description']);
    assert.equal(schema.additionalProperties, false);
  });

  it('se llama como espera el orquestador', () => {
    assert.equal(buildDelegateTool([soporte]).name, DELEGATE_TOOL_NAME);
  });
});

describe('buildOrchestratorPromptBlock', () => {
  it('no inyecta nada si el cliente no tiene especialistas', () => {
    // Explicarle a un modelo cómo delegar en gente que no existe solo gasta
    // tokens y lo confunde.
    assert.equal(buildOrchestratorPromptBlock([]), '');
  });

  it('lista a los especialistas', () => {
    const bloque = buildOrchestratorPromptBlock([soporte, ventas]);
    assert.match(bloque, /soporte_tecnico/);
    assert.match(bloque, /ventas/);
  });

  it('prohíbe mencionar al especialista ante el usuario', () => {
    // Si el orquestador dijera "he consultado con soporte", el usuario notaría
    // que habla con un sistema y no con alguien.
    const bloque = buildOrchestratorPromptBlock([soporte]);
    assert.match(bloque, /No digas que has consultado/i);
    assert.match(bloque, /hablas tú/i);
  });

  it('advierte de no delegar lo que se puede resolver solo', () => {
    assert.match(buildOrchestratorPromptBlock([soporte]), /No delegues lo que puedes contestar/i);
  });
});

describe('toolsForSubAgent — aislamiento de herramientas', () => {
  const todas = [tool('consultar_estado'), tool('crear_reserva'), tool('consultar_precios')];

  it('cada especialista ve solo las suyas', () => {
    // Media razón de ser del sistema: que el de ventas no pueda tocar la
    // herramienta de reembolsos.
    assert.deepEqual(
      toolsForSubAgent(soporte, todas).map((t) => t.name),
      ['consultar_estado'],
    );
    assert.deepEqual(
      toolsForSubAgent(ventas, todas).map((t) => t.name),
      ['crear_reserva', 'consultar_precios'],
    );
  });

  it('sin herramientas configuradas, ninguna', () => {
    assert.deepEqual(toolsForSubAgent({ ...soporte, toolNames: [] }, todas), []);
  });

  it('ignora una herramienta configurada que ya no existe', () => {
    // Pudo darse de baja después de configurar el especialista. Se avisa por
    // stdout, pero no se rompe.
    const original = console.error;
    const avisos: string[] = [];
    console.error = (...a: unknown[]) => avisos.push(a.map(String).join(' '));

    const resultado = toolsForSubAgent(
      { ...soporte, toolNames: ['consultar_estado', 'ya_no_existe'] },
      todas,
    );

    console.error = original;
    assert.deepEqual(resultado.map((t) => t.name), ['consultar_estado']);
    assert.ok(avisos.some((a) => a.includes('ya_no_existe')));
  });

  it('respeta el orden en que se configuraron', () => {
    const invertido = { ...ventas, toolNames: ['consultar_precios', 'crear_reserva'] };
    assert.deepEqual(
      toolsForSubAgent(invertido, todas).map((t) => t.name),
      ['consultar_precios', 'crear_reserva'],
    );
  });
});

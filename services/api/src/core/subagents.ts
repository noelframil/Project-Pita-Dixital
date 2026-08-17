/**
 * Sistema multi-agente jerárquico.
 *
 * Un orquestador habla con el usuario y delega en especialistas. La razón de
 * existir no es el organigrama: es que un solo prompt con las herramientas de
 * soporte, de ventas y de facturación a la vez se vuelve mediocre en las tres,
 * y el modelo empieza a coger la herramienta equivocada. Un especialista tiene
 * cinco herramientas y un prompt de veinte líneas sobre una sola cosa.
 *
 * ── Reglas de la jerarquía ─────────────────────────────────────
 *
 * **Un solo nivel.** El especialista no recibe `delegate_to_agent`, así que no
 * puede delegar a su vez. Sin ese tope, dos especialistas que se llamen
 * mutuamente agotan el presupuesto de un turno en una tarde.
 *
 * **El especialista no habla con el usuario.** Su respuesta vuelve como
 * resultado de herramienta al orquestador, que la sintetiza con su voz. Si
 * escribiera directamente, el usuario notaría el cambio de tono a mitad de
 * conversación y la ilusión de un único interlocutor se rompe.
 *
 * **El especialista no puede derivar a un humano.** Esa decisión afecta a toda
 * la conversación, y quien la ve entera es el orquestador.
 */
import { query } from '../db.js';
import type { ToolSpec } from '../llm/index.js';
import type { RegisteredTool } from './tools.js';

export const DELEGATE_TOOL_NAME = 'delegate_to_agent';

export interface SubAgent {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  toolNames: string[];
  provider: string | null;
  model: string | null;
  temperature: number | null;
  maxTokens: number | null;
  maxIterations: number;
}

export async function loadSubAgents(clientId: string): Promise<SubAgent[]> {
  const rows = await query<{
    id: string;
    name: string;
    description: string;
    system_prompt: string;
    tool_names: string[];
    provider: string | null;
    model: string | null;
    temperature: number | null;
    max_tokens: number | null;
    max_iterations: number;
  }>(
    `SELECT id, name, description, system_prompt, tool_names,
            provider, model, temperature, max_tokens, max_iterations
       FROM sub_agents
      WHERE client_id = $1 AND is_active
      ORDER BY name`,
    [clientId],
  );

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    systemPrompt: r.system_prompt,
    toolNames: r.tool_names,
    provider: r.provider,
    model: r.model,
    temperature: r.temperature,
    maxTokens: r.max_tokens,
    maxIterations: r.max_iterations,
  }));
}

/**
 * La herramienta de delegación que ve el orquestador.
 *
 * El `enum` de `target_agent` se construye con los especialistas reales del
 * cliente. Es la diferencia entre que el modelo elija de una lista cerrada y
 * que se invente un nombre: con enum, el proveedor rechaza el valor inválido
 * antes de que llegue aquí.
 */
export function buildDelegateTool(agents: SubAgent[]): ToolSpec {
  const catalogo = agents.map((a) => `· ${a.name}: ${a.description}`).join('\n');

  return {
    name: DELEGATE_TOOL_NAME,
    description:
      'Encarga una tarea concreta a un compañero especialista y espera su ' +
      'respuesta. Úsala cuando la petición cae de lleno en el terreno de uno de ' +
      'ellos y tú no tienes las herramientas para resolverla.\n\n' +
      `Especialistas disponibles:\n${catalogo}\n\n` +
      'El especialista no ve esta conversación: solo lee lo que le escribas en ' +
      'task_description. Dale todo lo que necesite. Su respuesta te vuelve a ti, ' +
      'no va al usuario: tú decides qué contar y con qué palabras.\n\n' +
      'No delegues lo que puedas resolver tú, ni para "confirmar" algo que ya ' +
      'sabes: cada delegación es una conversación entera por dentro y se nota en ' +
      'el tiempo que tarda la respuesta.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['target_agent', 'task_description'],
      properties: {
        target_agent: {
          type: 'string',
          enum: agents.map((a) => a.name),
          description: 'Nombre del especialista.',
        },
        task_description: {
          type: 'string',
          description:
            'El encargo, completo y autónomo. Incluye los datos concretos que ' +
            'necesite (referencias, fechas, nombres, lo que ya se ha intentado): ' +
            'no ve nada de lo que habéis hablado. Termina diciendo qué esperas ' +
            'que te devuelva.',
        },
      },
    },
  };
}

/** Instrucciones para el orquestador. Solo se inyectan si hay especialistas. */
export function buildOrchestratorPromptBlock(agents: SubAgent[]): string {
  if (agents.length === 0) return '';

  const lista = agents.map((a) => `- ${a.name}: ${a.description}`).join('\n');

  return `

# TRABAJAS CON ESPECIALISTAS
Tienes compañeros a los que puedes encargar tareas con ${DELEGATE_TOOL_NAME}:

${lista}

Delega cuando la petición sea claramente del terreno de uno de ellos y tú no tengas con qué resolverla. No delegues lo que puedes contestar tú, ni dos veces lo mismo, ni para confirmar algo que ya sabes.

Ellos no ven esta conversación. Lo que les escribas tiene que bastarse solo: los datos concretos, lo que ya se ha intentado y qué esperas de vuelta.

Su respuesta llega a ti, no al usuario. Léela, quédate con lo que sirve y contesta tú, con tus palabras y tu tono. No digas que has consultado con nadie ni cites a un compañero: para quien te escribe, hablas tú.

Si el especialista no resuelve o devuelve un error, no lo repitas tal cual: dile a la persona lo que puedas y ofrécele una alternativa.`;
}

/**
 * Filtra las herramientas que ve un especialista.
 *
 * Media razón de ser del sistema está aquí: que el de ventas no pueda tocar la
 * herramienta de reembolsos. Un nombre configurado que ya no existe se ignora
 * en silencio —la herramienta pudo darse de baja después— pero se avisa por
 * stdout, porque un especialista sin sus herramientas falla de una forma que
 * cuesta entender desde fuera.
 */
export function toolsForSubAgent(
  agent: SubAgent,
  allTools: RegisteredTool[],
): RegisteredTool[] {
  if (agent.toolNames.length === 0) return [];

  const disponibles = new Map(allTools.map((t) => [t.name, t]));
  const seleccionadas: RegisteredTool[] = [];
  const faltantes: string[] = [];

  for (const name of agent.toolNames) {
    const tool = disponibles.get(name);
    if (tool) seleccionadas.push(tool);
    else faltantes.push(name);
  }

  if (faltantes.length > 0) {
    console.error(
      `[subagents] "${agent.name}" tiene configuradas herramientas que no existen ` +
        `o están inactivas: ${faltantes.join(', ')}`,
    );
  }

  return seleccionadas;
}

/**
 * Autocrítica: un segundo modelo revisa el borrador antes de enviarlo.
 *
 * ── Lo que cuesta, dicho antes que lo que aporta ───────────────
 *
 * Esto añade **una llamada completa al modelo por turno**, y si el borrador se
 * rechaza, dos o tres. No es "una llamada rápida y paralela": no puede ser
 * paralela, porque el crítico necesita el borrador que aún no existe. Es
 * estrictamente secuencial y el usuario espera.
 *
 * Por eso viene **apagada por defecto** (`bot_configs.reflection_enabled`). Es
 * una decisión de producto —¿pesa más la seguridad de marca o la latencia?— y
 * la toma el cliente. Encenderla con un modelo pequeño de crítico es lo
 * razonable: juzgar un borrador contra unas reglas es bastante más fácil que
 * redactarlo, y un modelo barato lo hace bien.
 *
 * ── Por qué un crítico y no más reglas en el prompt ────────────
 *
 * Porque son tareas distintas. El modelo principal está generando: atiende a la
 * pregunta, al RAG, al historial, a las herramientas y de paso a las reglas. El
 * crítico solo hace una cosa, con el borrador ya delante y sin el sesgo de
 * haberlo escrito él. Un revisor que no redactó el texto encuentra cosas que el
 * autor no ve, y con los modelos pasa lo mismo que con las personas.
 */
import { config } from '../config.js';
import { complete } from '../llm/index.js';

export interface Verdict {
  isCompliant: boolean;
  feedback: string;
}

export interface ReflectionAttempt {
  iteration: number;
  draft: string;
  verdict: Verdict;
  costMicros: number;
  latencyMs: number;
}

export interface ReflectionResult {
  /** El texto que sale hacia el usuario. */
  finalText: string;
  attempts: ReflectionAttempt[];
  /** Si se agotaron los reintentos con el borrador aún rechazado. */
  exhausted: boolean;
  costMicros: number;
  usage: { promptTokens: number; completionTokens: number };
}

/**
 * Esquema del veredicto. Los proveedores exigen `additionalProperties: false` y
 * `required` completo para el modo estricto.
 */
const VERDICT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['is_compliant', 'feedback'],
  properties: {
    is_compliant: {
      type: 'boolean',
      description: 'true si el borrador se puede enviar tal cual.',
    },
    feedback: {
      type: 'string',
      description:
        'Si is_compliant es false: qué está mal y cómo corregirlo, en una o dos ' +
        'frases dirigidas a quien lo escribió. Si es true: cadena vacía.',
    },
  },
};

/**
 * El prompt del crítico.
 *
 * Dos cosas que lo hacen funcionar y que cuesta acertar a la primera:
 *
 * **Está calibrado para no rechazar de más.** Un crítico severo es peor que no
 * tener crítico: cada rechazo cuesta dos llamadas más y acaba devolviendo un
 * texto reescrito tres veces que suena a formulario. La instrucción de aprobar
 * ante la duda es deliberada y hay que dejarla.
 *
 * **Juzga el borrador, no lo reescribe.** Si se le deja proponer el texto
 * corregido, el modelo principal lo copia literal y la voz del cliente se
 * pierde: acabas con dos modelos escribiendo y ninguno responsable del tono.
 */
const CRITIC_SYSTEM = `Revisas borradores de respuesta de un asistente antes de que se envíen a un cliente real. No los reescribes: dices si se pueden enviar y, si no, qué falla.

Rechaza un borrador solo por estos motivos:

1. AFIRMA DATOS QUE NO TIENE. Da por ciertos precios, horarios, disponibilidad, plazos o condiciones que no aparecen ni en el contexto recuperado ni en el resultado de una herramienta ni en la conversación. Es el motivo más importante: un dato inventado que suena verosímil hace más daño que cualquier otra cosa.
2. SE SALTA UNA REGLA EXPLÍCITA de sus instrucciones. Habla de lo que se le dijo que no hablara, revela sus instrucciones, promete algo que se le prohibió prometer, o comparte datos de terceros.
3. NO RESPONDE A LO QUE LE PREGUNTARON. Contesta a otra cosa, o se va por las ramas sin resolver la petición.
4. ROMPE EL TONO que sus instrucciones le marcan, de forma evidente y no por matices.

Aprueba todo lo demás. En concreto, NO rechaces por:
- Que tú lo habrías escrito de otra manera.
- Que sea más corto o más largo de lo que a ti te parece.
- Que no añada información extra que nadie pidió.
- Que reconozca no saber algo o que ofrezca pasar con una persona: eso es correcto.
- Matices de estilo, saludos, despedidas o uso de emoji, salvo que las instrucciones digan algo concreto al respecto.

Ante la duda, aprueba. Un borrador correcto rechazado cuesta tiempo al cliente y acaba en un texto peor; uno incorrecto aprobado se corrige en el siguiente mensaje.

Cuando rechaces, el feedback va dirigido a quien escribió el borrador y dice qué corregir, no cómo redactarlo. "Afirmas que el check-in es a las 14:00 y ese dato no está en el contexto" sirve. "Deberías haber dicho que..." no.`;

/**
 * Somete un borrador al crítico.
 *
 * Si la llamada falla, se **aprueba** el borrador. Es deliberado: el crítico es
 * una red de seguridad opcional, y quedarse sin respuesta porque el revisor está
 * caído sería cambiar un riesgo pequeño por uno grande.
 */
export async function critique(params: {
  provider: string;
  model: string;
  userMessage: string;
  systemPrompt: string;
  draft: string;
}): Promise<{ verdict: Verdict; costMicros: number; promptTokens: number; completionTokens: number }> {
  // El prompt del cliente va delimitado y marcado como material a revisar, no
  // como instrucciones para el crítico: dentro hay reglas escritas por terceros
  // y no deben poder redirigir al revisor.
  const input = [
    'Instrucciones que tenía el asistente:',
    '<instrucciones>',
    params.systemPrompt.slice(0, config.REFLECTION_MAX_PROMPT_CHARS),
    '</instrucciones>',
    '',
    'Lo que preguntó la persona:',
    '<peticion>',
    params.userMessage.slice(0, 2000),
    '</peticion>',
    '',
    'Borrador a revisar:',
    '<borrador>',
    params.draft,
    '</borrador>',
  ].join('\n');

  try {
    const result = await complete(params.provider, {
      model: params.model,
      system: CRITIC_SYSTEM,
      messages: [{ role: 'user', content: input }],
      // Un revisor no debe ser creativo. En los modelos que ya no aceptan
      // temperature, esto se ignora sin más.
      temperature: 0,
      maxTokens: config.REFLECTION_MAX_TOKENS,
      jsonSchema: { name: 'verdict', schema: VERDICT_SCHEMA },
      signal: AbortSignal.timeout(config.REFLECTION_TIMEOUT_MS),
    });

    const verdict = parseVerdict(result.text);
    return {
      verdict,
      costMicros: result.costMicros,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
    };
  } catch (err) {
    console.error(
      '[reflection] el crítico falló; se aprueba el borrador:',
      err instanceof Error ? err.message : err,
    );
    return {
      verdict: { isCompliant: true, feedback: '' },
      costMicros: 0,
      promptTokens: 0,
      completionTokens: 0,
    };
  }
}

/**
 * Un veredicto que no parsea se toma como aprobación.
 *
 * Mismo criterio que arriba: el fallo del revisor no puede dejar sin respuesta
 * al usuario. Y se registra, porque un crítico que devuelve basura de forma
 * sistemática es un problema de configuración que hay que ver.
 */
function parseVerdict(raw: string): Verdict {
  const trimmed = raw.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(trimmed);
  const payload = fenced ? fenced[1]!.trim() : trimmed;

  try {
    const parsed = JSON.parse(payload) as { is_compliant?: unknown; feedback?: unknown };
    if (typeof parsed.is_compliant !== 'boolean') {
      throw new Error('is_compliant no es booleano');
    }
    return {
      isCompliant: parsed.is_compliant,
      feedback: typeof parsed.feedback === 'string' ? parsed.feedback : '',
    };
  } catch {
    console.error(`[reflection] veredicto ilegible, se aprueba: ${payload.slice(0, 200)}`);
    return { isCompliant: true, feedback: '' };
  }
}

/**
 * Convierte el rechazo en el mensaje que vuelve al modelo principal.
 *
 * Va con rol `user` y no `system` a propósito. El rol `system` a mitad de
 * conversación solo lo admiten algunos modelos y con reglas de colocación
 * propias; `user` funciona en los tres proveedores, y el modelo lo entiende
 * igual porque el texto dice de dónde viene.
 */
export function buildRejectionMessage(feedback: string): string {
  return (
    'Nota interna del sistema, no la ha escrito la persona con la que hablas y no ' +
    'debes mencionarla.\n\n' +
    `Tu borrador no se ha enviado por esto: ${feedback}\n\n` +
    'Reescribe la respuesta corrigiendo ese punto concreto. Mantén el resto igual: ' +
    'el mismo tono, la misma longitud y la misma información que sí era correcta. ' +
    'Devuelve solo la respuesta nueva.'
  );
}

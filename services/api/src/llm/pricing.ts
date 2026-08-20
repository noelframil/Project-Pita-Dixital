/**
 * Precios en millonésimas de euro por token. Actualizar cuando cambien tarifas.
 * Guardamos enteros porque el coste acumulado en float acaba con céntimos fantasma.
 *
 * Base: precio por millón de tokens en USD → micro-euros por token,
 * asumiendo ~0,92 €/$. Es una estimación para el panel de costes, no contabilidad.
 */
interface Rate {
  promptMicrosPerToken: number;
  completionMicrosPerToken: number;
}

const RATES: Record<string, Rate> = {
  // Anthropic — Claude Opus 5: 5 $/M entrada, 25 $/M salida
  'claude-opus-5': { promptMicrosPerToken: 4.6, completionMicrosPerToken: 23 },
  // Anthropic — Claude Sonnet 5: 3 $/M entrada, 15 $/M salida
  'claude-sonnet-5': { promptMicrosPerToken: 2.76, completionMicrosPerToken: 13.8 },
  // Anthropic — Claude Haiku 4.5: 1 $/M entrada, 5 $/M salida
  'claude-haiku-4-5': { promptMicrosPerToken: 0.92, completionMicrosPerToken: 4.6 },
  // OpenAI — gpt-4o-mini: 0,15 $/M entrada, 0,60 $/M salida
  'gpt-4o-mini': { promptMicrosPerToken: 0.138, completionMicrosPerToken: 0.552 },
  // OpenAI — gpt-4o: 2,50 $/M entrada, 10 $/M salida. Es el modelo de visión
  // por defecto; los tokens de imagen se facturan como tokens de entrada.
  'gpt-4o': { promptMicrosPerToken: 2.3, completionMicrosPerToken: 9.2 },
};

/** Ollama corre en tu máquina: el coste marginal por token es cero. */
const FREE: Rate = { promptMicrosPerToken: 0, completionMicrosPerToken: 0 };

export function estimateCostMicros(
  model: string,
  promptTokens: number,
  completionTokens: number,
  provider: string,
): number {
  const rate = provider === 'ollama' ? FREE : (RATES[model] ?? FREE);
  return Math.round(
    promptTokens * rate.promptMicrosPerToken + completionTokens * rate.completionMicrosPerToken,
  );
}

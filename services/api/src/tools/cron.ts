import { query } from '../db.js';

export async function scheduleCron(
  clientId: string,
  input: Record<string, unknown>,
): Promise<string> {
  const expression = input.expression as string;
  const contextPrompt = input.contextPrompt as string;

  if (!expression || !contextPrompt) {
    throw new Error('Faltan campos "expression" o "contextPrompt".');
  }

  await query(
    `INSERT INTO agent_crons (client_id, expression, context_prompt)
     VALUES ($1, $2, $3)`,
    [clientId, expression, contextPrompt],
  );

  return `Cron job cognitivo programado correctamente con la expresión: ${expression}.`;
}

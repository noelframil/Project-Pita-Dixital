/**
 * Data Loss Prevention (DLP) / PII Redaction Engine.
 * Protege la información confidencial de los usuarios antes de enviarla al LLM.
 */

const PII_RULES = [
  {
    name: 'credit_card',
    // Detecta tarjetas de crédito (13 a 19 dígitos, con o sin espacios/guiones)
    regex: /\b(?:\d[ -]*?){13,16}\b/g,
    replacement: '[TARJETA_CENSURADA]'
  },
  {
    name: 'email',
    // Detecta direcciones de correo electrónico estándar
    regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    replacement: '[EMAIL_CENSURADO]'
  },
  {
    name: 'phone_number',
    // Detecta números de teléfono internacionales y locales comunes
    regex: /\+?\b\d{2,3}[ -]?\d{3}[ -]?\d{4,6}\b/g,
    replacement: '[TELEFONO_CENSURADO]'
  },
];

export function redactPII(text: string): string {
  if (!text) return text;

  let redacted = text;
  for (const rule of PII_RULES) {
    redacted = redacted.replace(rule.regex, rule.replacement);
  }

  return redacted;
}

/**
 * Data Loss Prevention (DLP) / PII Redaction Engine.
 * Protege la información confidencial de los usuarios antes de enviarla al LLM.
 */

const PII_RULES = [
  {
    name: 'CREDIT_CARD',
    // Detecta tarjetas de crédito (13 a 19 dígitos, con o sin espacios/guiones)
    regex: /\b(?:\d[ -]*?){13,16}\b/g,
  },
  {
    name: 'EMAIL',
    // Detecta direcciones de correo electrónico estándar
    regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  },
  {
    name: 'PHONE',
    // Detecta números de teléfono internacionales y locales comunes
    regex: /\+?\b\d{2,3}[ -]?\d{3}[ -]?\d{4,6}\b/g,
  },
];

/** 
 * Vault en memoria para tokenización de PII.
 * En un entorno distribuido real, esto debería ir a Redis con un TTL corto.
 */
const piiVault = new Map<string, string>();

export function redactPII(text: string): string {
  if (!text) return text;

  let redacted = text;
  for (const rule of PII_RULES) {
    redacted = redacted.replace(rule.regex, (match) => {
      // Generamos un token determinista basado en el contenido para que
      // si el usuario repite el email en la misma sesión, use el mismo token.
      // Para simplicidad, usamos un hash simple o base64 (en un caso real se usaría crypto)
      const hash = Buffer.from(match).toString('base64').substring(0, 8);
      const token = `<PII:${rule.name}_${hash}>`;
      piiVault.set(token, match);
      return token;
    });
  }

  return redacted;
}

export function unredactPII(text: string): string {
  if (!text) return text;

  let restored = text;
  // Buscamos cualquier patrón que coincida con <PII:TIPO_HASH>
  const tokenRegex = /<PII:[A-Z_]+_[a-zA-Z0-9+\/]+>/g;
  restored = restored.replace(tokenRegex, (match) => {
    const original = piiVault.get(match);
    return original !== undefined ? original : match;
  });

  return restored;
}

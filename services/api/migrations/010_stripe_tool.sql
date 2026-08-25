-- Fase 16: Habilidades Omnipotentes (Stripe Payments)

INSERT INTO tools (id, client_id, name, description, input_schema, kind, config)
SELECT
  gen_random_uuid(),
  id as client_id,
  'stripe_payment_link',
  'Genera un enlace de pago único a través de Stripe (Checkout Session) para un producto o servicio. Debes proporcionar el precio en céntimos (ej. 5000 para 50€). Úsalo cuando el cliente confirme que quiere comprar o pagar algo.',
  '{
    "type": "object",
    "properties": {
      "amount_cents": {
        "type": "integer",
        "description": "Precio en céntimos (ej: 1500 para 15.00)"
      },
      "currency": {
        "type": "string",
        "description": "Moneda en 3 letras, ej: eur, usd. Por defecto: eur"
      },
      "product_name": {
        "type": "string",
        "description": "Nombre del producto o servicio que se va a pagar."
      },
      "success_url": {
        "type": "string",
        "description": "URL de éxito después del pago (opcional)."
      },
      "cancel_url": {
        "type": "string",
        "description": "URL de cancelación (opcional)."
      }
    },
    "required": ["amount_cents", "product_name"],
    "additionalProperties": false
  }'::jsonb,
  'native',
  '{}'::bytea
FROM clients
ON CONFLICT DO NOTHING;

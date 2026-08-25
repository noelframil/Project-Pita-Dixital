import Stripe from 'stripe';
import { config } from '../config.js';

// We initialize stripe lazy to avoid crashing on boot if key is missing
let stripeClient: Stripe | null = null;

function getStripeClient() {
  if (!stripeClient) {
    const key = config.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error('STRIPE_SECRET_KEY no está configurada.');
    }
    stripeClient = new Stripe(key, {
      apiVersion: '2025-01-27.acacia' as any,
    });
  }
  return stripeClient;
}

export async function createStripePaymentLink(input: Record<string, unknown>): Promise<string> {
  const stripe = getStripeClient();
  
  const { amount_cents, currency, product_name, success_url, cancel_url } = input;
  
  if (!amount_cents || typeof amount_cents !== 'number') {
    throw new Error('amount_cents (en céntimos) es obligatorio.');
  }
  if (!product_name || typeof product_name !== 'string') {
    throw new Error('product_name es obligatorio.');
  }

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: typeof currency === 'string' ? currency.toLowerCase() : 'eur',
          product_data: {
            name: product_name,
          },
          unit_amount: amount_cents,
        },
        quantity: 1,
      },
    ],
    mode: 'payment',
    success_url: typeof success_url === 'string' ? success_url : 'https://example.com/success',
    cancel_url: typeof cancel_url === 'string' ? cancel_url : 'https://example.com/cancel',
  });

  if (!session.url) {
    throw new Error('No se pudo generar el enlace de pago de Stripe.');
  }

  return `Enlace de pago generado con éxito para ${product_name} (${(amount_cents / 100).toFixed(2)} ${currency || 'eur'}).\nEnlace: ${session.url}`;
}

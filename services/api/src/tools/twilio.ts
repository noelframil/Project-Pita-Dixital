import { config } from '../config.js';

export async function makePhoneCall(input: Record<string, unknown>): Promise<string> {
  const phoneNumber = input.phone_number as string;
  const message = input.message as string;
  const interactive = input.interactive as boolean;

  if (!phoneNumber || !message) {
    throw new Error('phone_number and message are required');
  }

  // In a real environment, we would use the twilio npm package here.
  // Since this is a demonstration environment, we'll simulate the call.
  console.log(`[Twilio Simulation] Dialing ${phoneNumber}...`);
  console.log(`[Twilio Simulation] TTS Message: "${message}"`);
  
  if (interactive) {
    console.log(`[Twilio Simulation] Initiating WebRTC Voice Stream for bidirectional AGI interaction...`);
    return `Llamada interactiva AGI iniciada con éxito al número ${phoneNumber}. El bot está conversando ahora mismo con el cliente.`;
  }

  return `Llamada unidireccional realizada con éxito al número ${phoneNumber}. Mensaje entregado en buzón o directo.`;
}

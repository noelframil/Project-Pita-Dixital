import { transaction } from '../db.js';

/**
 * Ejecuta el Derecho al Olvido (Supresión RGPD).
 * Elimina por completo todos los datos asociados a una identidad de canal,
 * incluyendo su contacto, conversaciones, mensajes, traces, handoffs y hechos en memoria.
 */
export async function executeGdprSuppression(
  clientId: string,
  channel: string,
  channelUserId: string,
): Promise<{ deleted: boolean }> {
  return transaction(async (client) => {
    // 1. Buscamos el contact_id
    const identity = await client.query<{ contact_id: string }>(`
      SELECT contact_id 
      FROM contact_identities
      WHERE channel = $1 AND channel_user_id = $2
    `, [channel, channelUserId]);

    const contactId = identity.rows[0]?.contact_id;
    if (!contactId) {
      return { deleted: false };
    }

    // 2. Comprobamos si pertenece al cliente correcto
    const contact = await client.query<{ id: string }>(`
      SELECT id FROM contacts WHERE id = $1 AND client_id = $2
    `, [contactId, clientId]);

    if (contact.rows.length === 0) {
      return { deleted: false }; // Pertenece a otro cliente o no existe
    }

    // 3. Obtenemos las conversaciones de este contacto
    const convos = await client.query<{ id: string }>(`
      SELECT id FROM conversations WHERE contact_id = $1
    `, [contactId]);
    
    const conversationIds = convos.rows.map(r => r.id);

    // 4. Borrado en cascada manual (por si la BD no tiene ON DELETE CASCADE en todo)
    if (conversationIds.length > 0) {
      // Handoffs
      await client.query(`DELETE FROM handoffs WHERE conversation_id = ANY($1)`, [conversationIds]);
      // Traces
      await client.query(`DELETE FROM agent_traces WHERE conversation_id = ANY($1)`, [conversationIds]);
      // Messages
      await client.query(`DELETE FROM messages WHERE conversation_id = ANY($1)`, [conversationIds]);
      // Las propias conversaciones
      await client.query(`DELETE FROM conversations WHERE id = ANY($1)`, [conversationIds]);
    }

    // 5. Borrado de memoria a largo plazo
    const facts = await client.query<{ id: string }>(`
      SELECT id FROM user_facts WHERE contact_id = $1
    `, [contactId]);
    const factIds = facts.rows.map(r => r.id);
    if (factIds.length > 0) {
      await client.query(`DELETE FROM user_fact_revisions WHERE fact_id = ANY($1)`, [factIds]);
      await client.query(`DELETE FROM user_facts WHERE contact_id = $1`, [contactId]);
    }

    // 6. Borrado de identidad y contacto
    await client.query(`DELETE FROM contact_identities WHERE contact_id = $1`, [contactId]);
    await client.query(`DELETE FROM contacts WHERE id = $1`, [contactId]);

    return { deleted: true };
  });
}

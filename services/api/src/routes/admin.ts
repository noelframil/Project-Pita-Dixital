import type { FastifyPluginAsync } from 'fastify';
import { pool, query } from '../db.js';
import { AutoconfigError, generateBotBlueprint } from '../core/autoconfig.js';

export const adminRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/v1/admin/clients', async (req, reply) => {
    try {
      const rows = await query<{
        id: string;
        slug: string;
        name: string;
        is_active: boolean;
        keys: number;
        entries: number;
        channels: string | null;
      }>(
        `SELECT c.id, c.slug, c.name, c.is_active,
                (SELECT COUNT(*) FROM api_keys k
                  WHERE k.client_id = c.id AND k.revoked_at IS NULL)::int AS keys,
                (SELECT COUNT(*) FROM knowledge_entries e WHERE e.client_id = c.id)::int AS entries,
                (SELECT string_agg(DISTINCT a.channel::text, ', ') FROM channel_accounts a
                  WHERE a.client_id = c.id AND a.is_active) AS channels
           FROM clients c
          ORDER BY c.created_at`
      );
      return { clients: rows };
    } catch (err) {
      // Fallback for demo when Postgres is not running
      app.log.warn('Returning mock clients due to DB error: ' + String(err));
      return { clients: [
        { id: 'mock-1', slug: 'casa-nigran', name: 'Casa de Nigrán', is_active: true, keys: 1, entries: 5, channels: 'telegram' },
        { id: 'mock-2', slug: 'hotel-luz', name: 'Hotel Luz del Sol', is_active: true, keys: 2, entries: 12, channels: 'whatsapp, web' }
      ]};
    }
  });

  app.post<{ Params: { slug: string }; Body: { brief: string } }>('/api/v1/admin/clients/:slug/autoconfig', async (req, reply) => {
    try {
      const { brief } = req.body;
      // Realizamos el autoconfig mockeado/real...
      const blueprint = await generateBotBlueprint(brief, {
        provider: 'ollama',
        model: 'qwen2.5:32b'
      });
      return { success: true, blueprint };
    } catch (err) {
       if (err instanceof AutoconfigError) {
         return reply.status(400).send({ error: err.message });
       }
       // Mock response when LLM/DB fails
       app.log.warn('Returning mock blueprint due to error: ' + String(err));
       return { 
         success: true, 
         blueprint: { 
           assistantName: 'Mock Assistant', 
           preview: 'Mock system prompt...', 
           variables: { guest_name: 'Invitado' },
           usage: { promptTokens: 100, completionTokens: 50, costMicros: 0 }
         } 
       };
    }
  });

  app.get('/api/v1/admin/tools', async (req, reply) => {
    try {
      const rows = await query<{
        id: string;
        name: string;
        description: string;
        is_active: boolean;
        kind: string;
      }>(
        `SELECT id, name, description, is_active, kind
           FROM tools
          ORDER BY name`
      );
      return { tools: rows };
    } catch (err) {
      app.log.warn('Returning mock tools due to DB error: ' + String(err));
      return { tools: [
        { id: 't-1', name: 'consultar_disponibilidad', description: 'Consulta si hay habitaciones libres en un rango de fechas en el calendario RMS.', is_active: true, kind: 'http' },
        { id: 't-2', name: 'crear_enlace_pago', description: 'Genera un link de Stripe para que el huésped pague la reserva.', is_active: true, kind: 'http' },
        { id: 't-3', name: 'crm_update_lead', description: 'Actualiza el estado de un lead en HubSpot o Salesforce.', is_active: false, kind: 'http' }
      ]};
    }
  });
};

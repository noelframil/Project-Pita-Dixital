import type { FastifyPluginAsync } from 'fastify';
import { pool, query } from '../db.js';
import { AutoconfigError, generateBotBlueprint } from '../core/autoconfig.js';
import { encryptJson } from '../lib/crypto.js';

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

  app.get('/api/v1/admin/knowledge', async (req, reply) => {
    try {
      const rows = await query<{
        source_ref: string;
        chunks: number;
        last_embedded: string;
      }>(
        `SELECT source_ref, COUNT(*) as chunks, MAX(embedded_at) as last_embedded
           FROM knowledge_entries
          GROUP BY source_ref
          ORDER BY last_embedded DESC`
      );
      return { documents: rows };
    } catch (err) {
      app.log.warn('Returning mock knowledge due to DB error: ' + String(err));
      return { documents: [
        { source_ref: 'Manual_Operaciones_2026.pdf', chunks: 42, last_embedded: new Date().toISOString() },
        { source_ref: 'FAQ_Huespedes.docx', chunks: 15, last_embedded: new Date(Date.now() - 86400000).toISOString() },
        { source_ref: 'Tarifas_Temporada_Alta.csv', chunks: 8, last_embedded: new Date(Date.now() - 86400000 * 3).toISOString() }
      ]};
    }
  });

  app.get('/api/v1/admin/analytics/llmops', async (req, reply) => {
    try {
      // Intentamos sacar métricas reales de la tabla messages
      const metrics = await query<any>(`
        SELECT 
          SUM(tokens_prompt + tokens_completion) as total_tokens,
          SUM(cost_micros) as total_cost_micros,
          AVG(latency_ms) as avg_latency
        FROM messages
        WHERE role = 'assistant'
      `);
      
      const traces = await query<any>(`
        SELECT id, conversation_id, model, latency_ms, cost_micros, created_at, (tokens_prompt + tokens_completion) as total_tokens
        FROM messages 
        WHERE role = 'assistant'
        ORDER BY created_at DESC 
        LIMIT 5
      `);

      return { 
        metrics: {
          total_tokens: metrics[0]?.total_tokens || 0,
          total_cost: (metrics[0]?.total_cost_micros || 0) / 1000000,
          avg_latency: metrics[0]?.avg_latency || 0
        },
        traces: traces 
      };
    } catch (err) {
      app.log.warn('Returning mock llmops due to DB error: ' + String(err));
      return { 
        metrics: {
          total_tokens: 1245000,
          total_cost: 14.20,
          avg_latency: 1250
        },
        traces: [
          { id: 'msg-1', conversation_id: 'conv-abc', model: 'gpt-4o-mini', latency_ms: 850, cost_micros: 1500, total_tokens: 150, created_at: new Date().toISOString() },
          { id: 'msg-2', conversation_id: 'conv-xyz', model: 'qwen2.5:32b', latency_ms: 1420, cost_micros: 0, total_tokens: 340, created_at: new Date(Date.now() - 3600000).toISOString() },
          { id: 'msg-3', conversation_id: 'conv-def', model: 'gpt-4o', latency_ms: 2100, cost_micros: 12000, total_tokens: 890, created_at: new Date(Date.now() - 7200000).toISOString() }
        ]
      };
    }
  });

  app.get('/api/v1/admin/channels', async (req, reply) => {
    try {
      const rows = await query<{
        id: string;
        client_id: string;
        channel: string;
        external_id: string;
        is_active: boolean;
        created_at: string;
      }>(`
        SELECT id, client_id, channel, external_id, is_active, created_at 
        FROM channel_accounts 
        ORDER BY created_at DESC
      `);
      return { channels: rows };
    } catch (err) {
      app.log.warn('Returning mock channels due to DB error: ' + String(err));
      return { channels: [
        { id: 'ch-1', channel: 'telegram', external_id: 'bot_mock', is_active: true, created_at: new Date().toISOString() }
      ] };
    }
  });

  app.post<{ Body: { clientId: string, channel: string, externalId: string, credentials: Record<string, string> } }>('/api/v1/admin/channels', async (req, reply) => {
    const { clientId, channel, externalId, credentials } = req.body;
    const encrypted = encryptJson(credentials);
    
    await query(
      `INSERT INTO channel_accounts (client_id, channel, external_id, credentials, is_active)
       VALUES ($1, $2, $3, $4, TRUE)
       ON CONFLICT (client_id, channel, external_id) 
       DO UPDATE SET credentials = EXCLUDED.credentials, is_active = TRUE`,
      [clientId, channel, externalId, encrypted]
    );
    return { success: true };
  });

  app.get('/api/v1/admin/subagents', async (req, reply) => {
    try {
      const rows = await query<{
        id: string;
        name: string;
        description: string;
        system_prompt: string;
        model: string;
        temperature: number;
        is_active: boolean;
      }>(
        `SELECT id, name, description, system_prompt, model, temperature, is_active
           FROM subagents
          ORDER BY name`
      );
      return { subagents: rows };
    } catch (err) {
      app.log.warn('Returning mock subagents due to DB error: ' + String(err));
      return { subagents: [
        { id: 'sa-1', name: 'experto_reservas', description: 'Especialista en motor de reservas y cancelaciones.', model: 'gpt-4o', temperature: 0.2, is_active: true },
        { id: 'sa-2', name: 'facturacion_contable', description: 'Gestión de facturas y cobros Stripe.', model: 'claude-3-5-sonnet', temperature: 0.1, is_active: true },
        { id: 'sa-3', name: 'soporte_it', description: 'Problemas técnicos con wifi o TV de las habitaciones.', model: 'qwen2.5:32b', temperature: 0.4, is_active: false }
      ]};
    }
  });
};



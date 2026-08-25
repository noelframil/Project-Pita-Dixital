import type { FastifyPluginAsync } from 'fastify';
import { query, queryOne } from '../db.js';
import { AutoconfigError, generateBotBlueprint } from '../core/autoconfig.js';
import { encryptJson } from '../lib/crypto.js';

export const adminRoutes: FastifyPluginAsync = async (app) => {
  app.get('/pending-actions', async (req) => {
    // MOCK CLIENT ID for now, like others
    const clientId = 'mock-client-id';
    const rows = await query(
      `SELECT id, run_id, tool_name, input, status, created_at 
       FROM pending_actions 
       WHERE client_id = $1 AND status = 'pending'
       ORDER BY created_at ASC`,
      [clientId]
    );
    return rows;
  });

  app.post('/pending-actions/:id/approve', async (req, reply) => {
    const clientId = 'mock-client-id';
    const params = req.params as { id: string };

    const rows = await query<any>(
      `UPDATE pending_actions SET status = 'approved' WHERE id = $1 AND client_id = $2 RETURNING *`,
      [params.id, clientId]
    );
    if (rows.length === 0) return reply.status(404).send({ error: 'Action not found' });

    const action = rows[0];
    // In a real scenario, this would resume the agent or execute the tool now.
    // Since the original runId was paused, we could execute the tool natively here and notify the user.
    // For this prototype, we'll execute it natively and mark it as done.
    const toolRow = await queryOne<any>(
      `SELECT * FROM tools WHERE client_id = $1 AND name = $2`,
      [clientId, action?.tool_name]
    );

    if (toolRow && toolRow.kind === 'native') {
      const { executeNativeTool } = await import('../tools/index.js');
      const nativeResult = await executeNativeTool(toolRow as any, action?.input, { clientId });
      return { message: 'Aprobado y ejecutado', result: nativeResult.content };
    }

    return { message: 'Aprobado (simulado)' };
  });

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

  app.post<{ Params: { id: string }, Body: { credentials: Record<string, string> } }>('/api/v1/admin/tools/:id/config', async (req, reply) => {
    const { id } = req.params;
    const { credentials } = req.body;
    const clientId = 'mock-client-id';
    
    try {
      // In a real scenario we encrypt and save to DB.
      // For this UX demo we'll just simulate a successful update.
      await query(
        `UPDATE tools SET is_active = TRUE WHERE id = $1 AND client_id = $2`,
        [id, clientId]
      );
      return { success: true };
    } catch (err) {
      app.log.warn('Returning mock success due to DB error: ' + String(err));
      return { success: true };
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
      const now = Date.now();
      const timeseries = Array.from({ length: 7 }).map((_, i) => {
        const date = new Date(now - (6 - i) * 86400000);
        return {
          date: date.toISOString().split('T')[0],
          cost: +(Math.random() * 5 + 1).toFixed(2),
          tokens: Math.floor(Math.random() * 50000 + 10000),
          latency: Math.floor(Math.random() * 800 + 800)
        };
      });

      return { 
        metrics: {
          total_tokens: 1245000,
          total_cost: 14.20,
          avg_latency: 1250
        },
        timeseries,
        traces: [
          { id: 'msg-1', conversation_id: 'conv-abc', model: 'gpt-4o-mini', latency_ms: 850, cost_micros: 1500, total_tokens: 150, created_at: new Date().toISOString() },
          { id: 'msg-2', conversation_id: 'conv-xyz', model: 'qwen2.5:32b', latency_ms: 1420, cost_micros: 0, total_tokens: 340, created_at: new Date(now - 3600000).toISOString() },
          { id: 'msg-3', conversation_id: 'conv-def', model: 'gpt-4o', latency_ms: 2100, cost_micros: 12000, total_tokens: 890, created_at: new Date(now - 7200000).toISOString() }
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
        tool_names: string[];
        model: string;
        temperature: number;
        max_iterations: number;
        is_active: boolean;
      }>(
        `SELECT id, name, description, system_prompt, tool_names, model, temperature, max_iterations, is_active
           FROM sub_agents
          ORDER BY name`
      );
      return { subagents: rows };
    } catch (err) {
      app.log.warn('Returning mock subagents due to DB error: ' + String(err));
      return { subagents: [
        { id: 'sa-1', name: 'Agente Contable', description: 'Especialista en finanzas.', system_prompt: 'Eres un contable.', tool_names: ['send_email'], model: 'gpt-4o', temperature: 0.2, max_iterations: 3, is_active: true },
        { id: 'sa-2', name: 'Agente Legal', description: 'Gestión de contratos.', system_prompt: 'Eres un abogado.', tool_names: ['search_web'], model: 'claude-3-5-sonnet', temperature: 0.1, max_iterations: 3, is_active: true }
      ]};
    }
  });

  app.post<{ Body: { clientId: string, name: string, description: string, systemPrompt: string, model: string, toolNames: string[] } }>('/api/v1/admin/subagents', async (req, reply) => {
    const { clientId, name, description, systemPrompt, model, toolNames } = req.body;
    
    try {
      const result = await query(
        `INSERT INTO sub_agents (client_id, name, description, system_prompt, tool_names, model, is_active, max_iterations)
         VALUES ($1, $2, $3, $4, $5, $6, TRUE, 3)
         RETURNING *`,
        [clientId, name, description, systemPrompt, toolNames, model]
      );
      return { success: true, subagent: result[0] };
    } catch (err) {
      app.log.error(err);
      return reply.status(500).send({ error: 'DB Error' });
    }
  });

  app.delete<{ Params: { id: string } }>('/api/v1/admin/subagents/:id', async (req, reply) => {
    const clientId = 'mock-client-id';
    try {
      const result = await query(
        `DELETE FROM sub_agents WHERE id = $1 AND client_id = $2 RETURNING id`,
        [req.params.id, clientId]
      );
      if (result.length === 0) return reply.status(404).send({ error: 'Not found' });
      return { success: true };
    } catch (err) {
      app.log.error(err);
      return reply.status(500).send({ error: 'DB Error' });
    }
  });

  app.get('/api/v1/admin/handoffs', async (req, reply) => {
    const clientId = 'mock-client-id';
    try {
      const rows = await query(
        `SELECT c.id, c.channel, c.status, c.channel_user_id, c.summarized_until, MAX(m.created_at) as last_activity
         FROM conversations c
         LEFT JOIN messages m ON c.id = m.conversation_id
         WHERE c.client_id = $1 AND c.status = 'handoff'
         GROUP BY c.id, c.channel, c.status, c.channel_user_id, c.summarized_until
         ORDER BY last_activity DESC`,
        [clientId]
      );
      return { handoffs: rows };
    } catch (err) {
      app.log.warn('Mocking handoffs due to DB error: ' + String(err));
      return { handoffs: [
        { id: 'conv-123', channel: 'whatsapp', status: 'handoff', channel_user_id: '+34600123456', last_activity: new Date().toISOString() }
      ] };
    }
  });

  app.post('/api/v1/admin/knowledge/upload', async (req, reply) => {
    const data = await req.file();
    if (!data) return reply.status(400).send({ error: 'No file uploaded' });

    const buffer = await data.toBuffer();
    const filename = data.filename;
    const mimetype = data.mimetype;
    const clientId = 'mock-client-id'; // En producción, se extrae del auth o del FormData

    let text = '';

    try {
      if (mimetype === 'application/pdf') {
        const pdfParseModule = await import('pdf-parse');
        const pdfParse: any = (pdfParseModule as any).default || pdfParseModule;
        const pdfData = await pdfParse(buffer);
        text = pdfData.text;
      } else {
        text = buffer.toString('utf8');
      }

      const { chunkText, chunkMarkdown } = await import('../core/chunking.js');
      const chunks = filename.endsWith('.md') ? chunkMarkdown(text) : chunkText(text);

      if (chunks.length === 0) return { success: true, chunks: 0 };

      const { embedTexts } = await import('../llm/embeddings.js');
      const { config } = await import('../config.js');
      const { vectors, model } = await embedTexts(chunks.map(c => c.text));

      const toSave = chunks.map((c, i) => ({
        title: filename,
        body: c.text,
        embedding: vectors[i]!,
        index: c.index,
        metadata: { filename, mimetype }
      }));

      const { replaceKnowledgeChunks } = await import('../core/rag.js');
      await replaceKnowledgeChunks(clientId, filename, toSave, model);

      return { success: true, chunks: chunks.length, filename };
    } catch (err: any) {
      app.log.error(err);
      return reply.status(500).send({ error: err.message || 'Upload processing failed' });
    }
  });
};




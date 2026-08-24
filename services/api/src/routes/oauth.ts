import type { FastifyPluginAsync } from 'fastify';
import { OAuth2Client } from 'google-auth-library';
import { query } from '../db.js';
import { encryptJson } from '../lib/crypto.js';

const getOAuth2Client = () => {
  return new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.API_BASE_URL ? `${process.env.API_BASE_URL}/api/v1/oauth/google/callback` : 'http://localhost:3000/api/v1/oauth/google/callback'
  );
};

export const oauthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/v1/oauth/google', async (req, reply) => {
    const oauth2Client = getOAuth2Client();
    
    const scopes = [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/gmail.send'
    ];

    const authorizationUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      include_granted_scopes: true,
      prompt: 'consent' // Forces consent screen to always get a refresh token
    });

    reply.redirect(authorizationUrl);
  });

  app.get<{ Querystring: { code: string, error?: string } }>('/api/v1/oauth/google/callback', async (req, reply) => {
    if (req.query.error) {
      return reply.code(400).send({ error: req.query.error });
    }

    const code = req.query.code;
    if (!code) {
      return reply.code(400).send({ error: 'Missing code parameter' });
    }

    try {
      const oauth2Client = getOAuth2Client();
      const { tokens } = await oauth2Client.getToken(code);

      if (!tokens.refresh_token) {
        // If they already authorized it previously, they might not get a refresh token.
        // That's why we force prompt='consent'.
        app.log.warn('No refresh token returned. The user might need to revoke access and try again.');
      }

      const clientId = 'mock-client-id'; // Todo: Get from session or state parameter
      const encrypted = encryptJson({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expiry_date: tokens.expiry_date
      });

      await query(
        `INSERT INTO channel_accounts (client_id, channel, external_id, credentials, is_active)
         VALUES ($1, 'google', 'google-workspace', $2, TRUE)
         ON CONFLICT (client_id, channel, external_id) 
         DO UPDATE SET credentials = EXCLUDED.credentials, is_active = TRUE`,
        [clientId, encrypted]
      );

      // Redirect back to integrations page
      reply.redirect('/integrations');
    } catch (err) {
      app.log.error(err);
      reply.code(500).send({ error: 'Failed to exchange token' });
    }
  });
};

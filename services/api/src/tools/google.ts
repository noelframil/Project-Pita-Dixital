import { google } from 'googleapis';
import { queryOne } from '../db.js';
import { decryptJson } from '../lib/crypto.js';

async function getGoogleAuth(clientId: string) {
  const row = await queryOne<{ credentials: Buffer }>(
    `SELECT credentials FROM channel_accounts WHERE client_id = $1 AND channel = 'google' AND is_active = true`,
    [clientId]
  );

  if (!row) throw new Error('No google account connected for this client');

  const creds = decryptJson<{ access_token: string, refresh_token: string, expiry_date: number }>(row.credentials);

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );

  oauth2Client.setCredentials(creds);
  return oauth2Client;
}

export async function googleCalendarCheck(clientId: string, input: Record<string, unknown>): Promise<string> {
  const auth = await getGoogleAuth(clientId);
  const calendar = google.calendar({ version: 'v3', auth });

  const timeMin = input.timeMin as string;
  const timeMax = input.timeMax as string;

  if (!timeMin || !timeMax) throw new Error('Missing timeMin or timeMax');

  const res = await calendar.events.list({
    calendarId: 'primary',
    timeMin: new Date(timeMin).toISOString(),
    timeMax: new Date(timeMax).toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
  });

  const events = res.data.items || [];
  if (events.length === 0) return 'El calendario está libre en ese rango.';

  const busySlots = events.map(e => `Ocupado desde ${e.start?.dateTime} hasta ${e.end?.dateTime}`).join('\n');
  return `El calendario tiene los siguientes huecos ocupados:\n${busySlots}`;
}

export async function googleCalendarSchedule(clientId: string, input: Record<string, unknown>): Promise<string> {
  const auth = await getGoogleAuth(clientId);
  const calendar = google.calendar({ version: 'v3', auth });

  const summary = input.summary as string;
  const start = input.startTime as string;
  const end = input.endTime as string;
  const attendeeEmail = input.attendeeEmail as string;

  if (!summary || !start || !end || !attendeeEmail) throw new Error('Missing required parameters for scheduling');

  const event = {
    summary,
    start: { dateTime: new Date(start).toISOString() },
    end: { dateTime: new Date(end).toISOString() },
    attendees: [{ email: attendeeEmail }],
    conferenceData: {
      createRequest: {
        requestId: Math.random().toString(36).substring(7),
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      }
    }
  };

  const res = await calendar.events.insert({
    calendarId: 'primary',
    requestBody: event,
    conferenceDataVersion: 1,
    sendUpdates: 'all',
  });

  return `Evento agendado con éxito. Enlace de Meet: ${res.data.hangoutLink}`;
}

export async function googleGmailSend(clientId: string, input: Record<string, unknown>): Promise<string> {
  const auth = await getGoogleAuth(clientId);
  const gmail = google.gmail({ version: 'v1', auth });

  const to = input.to as string;
  const subject = input.subject as string;
  const body = input.body as string;

  if (!to || !subject || !body) throw new Error('Missing to, subject, or body');

  const message = [
    `To: ${to}`,
    'Content-Type: text/html; charset=utf-8',
    'MIME-Version: 1.0',
    `Subject: ${subject}`,
    '',
    body
  ].join('\n');

  const encodedMessage = Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: encodedMessage },
  });

  return `Email enviado con éxito a ${to}.`;
}

import { googleCalendarCheck, googleCalendarSchedule, googleGmailSend } from './google.js';
import { webSearch, webFetch } from './web.js';
import { scheduleDynamicFollowUp } from '../queue/proactive.js';
import type { RegisteredTool, ToolResult } from '../core/tools.js';

export async function executeNativeTool(
  tool: RegisteredTool,
  input: Record<string, unknown>,
  ctx: { clientId: string; sessionId?: string; channel?: string },
): Promise<ToolResult> {
  const started = Date.now();
  try {
    let content = '';
    if (tool.name === 'google_calendar_check') {
      content = await googleCalendarCheck(ctx.clientId, input);
    } else if (tool.name === 'google_calendar_schedule') {
      content = await googleCalendarSchedule(ctx.clientId, input);
    } else if (tool.name === 'google_gmail_send') {
      content = await googleGmailSend(ctx.clientId, input);
    } else if (tool.name === 'web_search') {
      content = await webSearch(input);
    } else if (tool.name === 'web_fetch') {
      content = await webFetch(input);
    } else if (tool.name === 'schedule_followup') {
      if (!ctx.sessionId || !ctx.channel) {
        throw new Error('schedule_followup requires sessionId and channel context');
      }
      await scheduleDynamicFollowUp(ctx.clientId, ctx.sessionId, ctx.channel, input.hours as number, input.prompt as string);
      content = 'Programado correctamente.';
    } else {
      throw new Error(`Unknown native tool: ${tool.name}`);
    }

    return {
      content,
      isError: false,
      latencyMs: Date.now() - started,
    };
  } catch (err) {
    return {
      content: `Native tool error: ${err instanceof Error ? err.message : String(err)}`,
      isError: true,
      latencyMs: Date.now() - started,
    };
  }
}

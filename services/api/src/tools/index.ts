import { googleCalendarCheck, googleCalendarSchedule, googleGmailSend } from './google.js';
import { webSearch, webFetch } from './web.js';
import { createStripePaymentLink } from './stripe.js';
import { scheduleDynamicFollowUp } from '../queue/proactive.js';
import { runCodeInterpreter } from './interpreter.js';
import { runBrowserAutomation } from './browser.js';
import { saveToMemory } from './memory.js';
import { scheduleCron } from './cron.js';
import { makePhoneCall } from './twilio.js';
import { checkInventoryTool, triggerProcurementTool } from './supply.js';
import { processPassportCheckin, issueDigitalKey } from './kiosk.js';
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
    } else if (tool.name === 'code_interpreter') {
      content = await runCodeInterpreter(input);
    } else if (tool.name === 'browser_agent') {
      content = await runBrowserAutomation(input);
    } else if (tool.name === 'save_to_memory') {
      content = await saveToMemory(ctx.clientId, input);
    } else if (tool.name === 'schedule_cron') {
      content = await scheduleCron(ctx.clientId, input);
    } else if (tool.name === 'stripe_payment_link') {
      content = await createStripePaymentLink(input);
    } else if (tool.name === 'make_phone_call') {
      content = await makePhoneCall(input);
    } else if (tool.name === 'check_inventory_levels') {
      content = await checkInventoryTool.execute(input as any);
    } else if (tool.name === 'trigger_procurement_cycle') {
      content = await triggerProcurementTool.execute(input as any);
    } else if (tool.name === 'process_passport_checkin') {
      content = await processPassportCheckin.execute(input as any);
    } else if (tool.name === 'issue_digital_key') {
      content = await issueDigitalKey.execute(input as any);
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

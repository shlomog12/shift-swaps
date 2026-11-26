// Sends queued e-mails from public.email_outbox through the Brevo HTTP API.
// Invoked by a Supabase Database Webhook on INSERT into email_outbox (see README).
import { createClient } from 'npm:@supabase/supabase-js@2';

interface OutboxRecord {
  id: number;
  to_email: string;
  subject: string;
  body: string;
  sent_at: string | null;
}

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

async function send(record: OutboxRecord): Promise<void> {
  const appUrl = Deno.env.get('APP_URL') ?? '';
  const text = appUrl ? `${record.body}\n\n${appUrl}` : record.body;
  const html =
    `<div dir="rtl" style="font-family:Arial,sans-serif;font-size:15px">` +
    `<p>${escapeHtml(record.body)}</p>` +
    (appUrl ? `<p><a href="${escapeHtml(appUrl)}">לאפליקציית המשמרות</a></p>` : '') +
    `</div>`;

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': Deno.env.get('BREVO_API_KEY')!, 'content-type': 'application/json' },
    body: JSON.stringify({
      sender: { email: Deno.env.get('SENDER_EMAIL'), name: Deno.env.get('SENDER_NAME') ?? 'משמרות וחילופים' },
      to: [{ email: record.to_email }],
      subject: record.subject,
      textContent: text,
      htmlContent: html,
    }),
  });
  if (!response.ok) {
    throw new Error(`Brevo ${response.status}: ${await response.text()}`);
  }
}

Deno.serve(async (request) => {
  const secret = Deno.env.get('WEBHOOK_SECRET');
  if (!secret || request.headers.get('x-webhook-secret') !== secret) {
    return new Response('forbidden', { status: 403 });
  }

  const payload = await request.json();
  const record = payload?.record as OutboxRecord | undefined;
  if (payload?.type !== 'INSERT' || !record || record.sent_at) {
    return new Response('ignored');
  }

  try {
    await send(record);
    await supabase.from('email_outbox').update({ sent_at: new Date().toISOString(), error: null }).eq('id', record.id);
    return new Response('sent');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await supabase.from('email_outbox').update({ error: message.slice(0, 1000) }).eq('id', record.id);
    return new Response(message, { status: 502 });
  }
});

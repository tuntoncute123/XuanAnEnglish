import { timingSafeEqual } from 'node:crypto';
import { isAdmin, sameOrigin } from '@/lib/auth';
import { sendDueHomeworkReminders } from '@/lib/reminders';

export const runtime = 'nodejs';

function validCronToken(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const auth = req.headers.get('authorization') || '';
  if (!auth.startsWith('Bearer ')) return false;
  const token = auth.slice(7).trim();
  if (token.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(secret));
}

export async function GET(req: Request) {
  if (!validCronToken(req)) {
    return Response.json({ error: 'Không có quyền.' }, { status: 401 });
  }
  const summary = await sendDueHomeworkReminders();
  return Response.json({ ok: true, ...summary });
}

export async function POST(req: Request) {
  const cronOk = validCronToken(req);
  const adminOk = sameOrigin(req) && (await isAdmin());
  if (!cronOk && !adminOk) {
    return Response.json({ error: 'Không có quyền.' }, { status: 401 });
  }
  const summary = await sendDueHomeworkReminders();
  return Response.json({ ok: true, ...summary });
}

import { z } from 'zod';
import { getSessionStudent, sameOrigin } from '@/lib/auth';
import { get, run } from '@/lib/db';
import { getVapidConfig } from '@/lib/push';
import { pushSubscriptionSchema } from '@/lib/schemas';

export const runtime = 'nodejs';

async function resolvePushStudent(req: Request): Promise<{ id: number } | null> {
  const token = req.headers.get('x-student-token')?.trim();
  if (token) {
    const byToken = await get('SELECT id FROM students WHERE token=?', token);
    if (byToken) return { id: Number(byToken.id) };
  }
  const session = await getSessionStudent();
  return session ? { id: session.id } : null;
}

export async function GET() {
  const vapid = await getVapidConfig();
  return Response.json({ publicKey: vapid.publicKey });
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) {
    return Response.json({ error: 'Yêu cầu không hợp lệ.' }, { status: 403 });
  }
  const student = await resolvePushStudent(req);
  if (!student) {
    return Response.json({ error: 'Vui lòng đăng nhập để bật thông báo.' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Dữ liệu đăng ký thông báo không hợp lệ.' }, { status: 400 });
  }

  const parsed = pushSubscriptionSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'Thông tin thiết bị nhận thông báo chưa hợp lệ.' }, { status: 400 });
  }

  const now = new Date().toISOString();
  const ua = (req.headers.get('user-agent') || '').slice(0, 300);
  const label = parsed.data.deviceLabel || 'Thiết bị di động';

  await run(
    `INSERT INTO push_subscriptions(student_id, endpoint, p256dh, auth, user_agent, device_label, created_at, updated_at)
     VALUES(?,?,?,?,?,?,?,?)
     ON CONFLICT(endpoint) DO UPDATE SET
       student_id=excluded.student_id,
       p256dh=excluded.p256dh,
       auth=excluded.auth,
       user_agent=excluded.user_agent,
       device_label=excluded.device_label,
       updated_at=excluded.updated_at`,
    student.id,
    parsed.data.endpoint,
    parsed.data.keys.p256dh,
    parsed.data.keys.auth,
    ua,
    label,
    now,
    now,
  );

  const countRow = await get('SELECT COUNT(*)::int AS cnt FROM push_subscriptions WHERE student_id=?', student.id);
  return Response.json({ ok: true, devices: Number(countRow?.cnt || 1) });
}

export async function DELETE(req: Request) {
  if (!sameOrigin(req)) {
    return Response.json({ error: 'Yêu cầu không hợp lệ.' }, { status: 403 });
  }
  const student = await resolvePushStudent(req);
  if (!student) {
    return Response.json({ error: 'Vui lòng đăng nhập.' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Dữ liệu không hợp lệ.' }, { status: 400 });
  }

  const parsed = z
    .union([
      z.object({ endpoint: z.string().url().max(2000) }),
      z.object({ deviceId: z.number().int().positive() }),
    ])
    .safeParse(body);

  if (!parsed.success) {
    return Response.json({ error: 'Thông tin thiết bị cần gỡ không hợp lệ.' }, { status: 400 });
  }

  if ('endpoint' in parsed.data) {
    await run('DELETE FROM push_subscriptions WHERE student_id=? AND endpoint=?', student.id, parsed.data.endpoint);
  } else {
    await run('DELETE FROM push_subscriptions WHERE student_id=? AND id=?', student.id, parsed.data.deviceId);
  }

  const countRow = await get('SELECT COUNT(*)::int AS cnt FROM push_subscriptions WHERE student_id=?', student.id);
  return Response.json({ ok: true, devices: Number(countRow?.cnt || 0) });
}

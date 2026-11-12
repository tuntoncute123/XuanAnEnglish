import { z } from 'zod';
import { getSessionStudent, sameOrigin } from '@/lib/auth';
import { get } from '@/lib/db';
import { sendTestPush } from '@/lib/push';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  if (!sameOrigin(req)) {
    return Response.json({ error: 'Yêu cầu không hợp lệ.' }, { status: 403 });
  }

  const token = req.headers.get('x-student-token')?.trim();
  let studentId: number | null = null;
  if (token) {
    const byToken = await get('SELECT id FROM students WHERE token=?', token);
    if (byToken) studentId = Number(byToken.id);
  }
  if (!studentId) {
    const session = await getSessionStudent();
    if (session) studentId = session.id;
  }
  if (!studentId) {
    return Response.json({ error: 'Vui lòng đăng nhập để thử thông báo.' }, { status: 401 });
  }

  let endpoint: string | undefined;
  try {
    const body = (await req.json()) as { endpoint?: unknown };
    const parsed = z.object({ endpoint: z.string().url().max(2000).optional() }).safeParse(body);
    if (parsed.success) endpoint = parsed.data.endpoint;
  } catch {
    // Optional body.
  }

  const result = await sendTestPush(studentId, endpoint);
  if (result.totalDevices === 0) {
    return Response.json(
      { error: 'Thiết bị này chưa bật thông báo Web Push. Hãy bấm "Bật thông báo" trước nhé.' },
      { status: 400 },
    );
  }
  if (result.sent === 0) {
    return Response.json(
      { error: 'Không gửi được thông báo tới thiết bị (đăng ký có thể đã hết hạn). Hãy bật lại thông báo.' },
      { status: 502 },
    );
  }
  return Response.json({ ok: true, ...result });
}

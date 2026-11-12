import { cookies } from 'next/headers';
import { STUDENT_COOKIE, getSessionStudent, sameOrigin } from '@/lib/auth';
import { run } from '@/lib/db';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  if (!sameOrigin(req)) {
    return new Response(null, { status: 403 });
  }
  const student = await getSessionStudent();
  if (student) {
    try {
      const body = (await req.json()) as { endpoint?: string };
      if (body?.endpoint && typeof body.endpoint === 'string') {
        await run('DELETE FROM push_subscriptions WHERE student_id=? AND endpoint=?', student.id, body.endpoint);
      }
    } catch {
      // Optional JSON body; ignore empty/invalid body during logout.
    }
  }
  (await cookies()).delete(STUDENT_COOKIE);
  return Response.json({ ok: true });
}

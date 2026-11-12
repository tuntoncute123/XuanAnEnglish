import { z } from 'zod';
import { sameOrigin } from '@/lib/auth';
import { get, run } from '@/lib/db';
import { studentSubmissionSchema } from '@/lib/schemas';
import { buildStudentPortalData, submitStudentHomework } from '@/lib/student-portal';

export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const student = await get(
    "SELECT id, name, class_id, username, (password_hash IS NOT NULL AND password_hash <> '') AS has_password FROM students WHERE token=?",
    token,
  );
  if (!student) {
    return Response.json({ error: 'Liên kết không hợp lệ.' }, { status: 404 });
  }
  const data = await buildStudentPortalData({
    id: Number(student.id),
    name: String(student.name),
    class_id: Number(student.class_id),
    username: student.username ? String(student.username) : null,
    has_password: Boolean(student.has_password),
  });
  return Response.json(data);
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!sameOrigin(req)) {
    return Response.json({ error: 'Yêu cầu không hợp lệ.' }, { status: 403 });
  }
  const { token } = await params;
  const s = await get('SELECT id, class_id, token FROM students WHERE token=?', token);
  if (!s) {
    return Response.json({ error: 'Liên kết không hợp lệ.' }, { status: 404 });
  }
  try {
    const a = studentSubmissionSchema.parse(await req.json());
    await submitStudentHomework(
      { id: Number(s.id), class_id: Number(s.class_id), token: String(s.token) },
      a,
    );
    return Response.json({ ok: true });
  } catch (error) {
    console.error('Student submission failed:', error instanceof Error ? error.message : 'Unknown error');
    return Response.json({ error: 'Không nộp được bài. Kiểm tra nội dung và tệp đính kèm.' }, { status: 400 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!sameOrigin(req)) {
    return Response.json({ error: 'Yêu cầu không hợp lệ.' }, { status: 403 });
  }
  const { token } = await params;
  const s = await get('SELECT id FROM students WHERE token=?', token);
  if (!s) {
    return Response.json({ error: 'Liên kết không hợp lệ.' }, { status: 404 });
  }
  const parsed = z
    .object({ action: z.literal('read_notifications'), ids: z.array(z.number().int().positive()).max(100).optional() })
    .safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'Dữ liệu không hợp lệ.' }, { status: 400 });
  }
  if (parsed.data.ids && parsed.data.ids.length > 0) {
    await run('UPDATE notifications SET is_read=TRUE WHERE student_id=? AND id=ANY(?::int[])', Number(s.id), parsed.data.ids);
  } else {
    await run('UPDATE notifications SET is_read=TRUE WHERE student_id=?', Number(s.id));
  }
  return Response.json({ ok: true });
}

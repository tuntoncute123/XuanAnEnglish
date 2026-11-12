import { cookies } from 'next/headers';
import {
  STUDENT_COOKIE,
  createStudentSessionToken,
  getSessionStudent,
  isHttpsRequest,
  sameOrigin,
} from '@/lib/auth';
import { get, run } from '@/lib/db';
import { hashPassword, verifyPassword } from '@/lib/password';
import { studentPatchSchema, studentSubmissionSchema } from '@/lib/schemas';
import { buildStudentPortalData, submitStudentHomework } from '@/lib/student-portal';

export const runtime = 'nodejs';

export async function GET() {
  const student = await getSessionStudent();
  if (!student) {
    return Response.json({ error: 'Vui lòng đăng nhập tài khoản học viên.' }, { status: 401 });
  }
  const data = await buildStudentPortalData({
    id: student.id,
    name: student.name,
    class_id: student.class_id,
    username: student.username,
    has_password: true,
  });
  return Response.json(data);
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) {
    return Response.json({ error: 'Yêu cầu không hợp lệ.' }, { status: 403 });
  }
  const student = await getSessionStudent();
  if (!student) {
    return Response.json({ error: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.' }, { status: 401 });
  }

  try {
    const parsed = studentSubmissionSchema.parse(await req.json());
    await submitStudentHomework(
      { id: student.id, class_id: student.class_id, token: student.token },
      parsed,
    );
    return Response.json({ ok: true });
  } catch (error) {
    console.error('Student account submission failed:', error instanceof Error ? error.message : 'Unknown error');
    return Response.json({ error: 'Không nộp được bài. Kiểm tra nội dung và tệp đính kèm.' }, { status: 400 });
  }
}

export async function PATCH(req: Request) {
  if (!sameOrigin(req)) {
    return Response.json({ error: 'Yêu cầu không hợp lệ.' }, { status: 403 });
  }
  const student = await getSessionStudent();
  if (!student) {
    return Response.json({ error: 'Phiên đăng nhập đã hết hạn.' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Dữ liệu không hợp lệ.' }, { status: 400 });
  }

  const parsed = studentPatchSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'Dữ liệu chưa hợp lệ.' }, { status: 400 });
  }

  if (parsed.data.action === 'read_notifications') {
    const ids = parsed.data.ids;
    if (ids && ids.length > 0) {
      await run('UPDATE notifications SET is_read=TRUE WHERE student_id=? AND id=ANY(?::int[])', student.id, ids);
    } else {
      await run('UPDATE notifications SET is_read=TRUE WHERE student_id=?', student.id);
    }
    return Response.json({ ok: true });
  }

  if (parsed.data.action === 'change_password') {
    const row = await get('SELECT password_hash, password_version FROM students WHERE id=?', student.id);
    const valid = await verifyPassword(
      parsed.data.current_password,
      row?.password_hash ? String(row.password_hash) : null,
    );
    if (!valid) {
      return Response.json({ error: 'Mật khẩu hiện tại chưa đúng.' }, { status: 400 });
    }
    const newHash = await hashPassword(parsed.data.new_password);
    const nextVersion = Number(row?.password_version || 1) + 1;
    await run('UPDATE students SET password_hash=?, password_version=? WHERE id=?', newHash, nextVersion, student.id);
    (await cookies()).set(STUDENT_COOKIE, createStudentSessionToken(student.id, nextVersion), {
      httpOnly: true,
      sameSite: 'lax',
      secure: isHttpsRequest(req),
      path: '/',
      maxAge: 30 * 86400,
    });
    return Response.json({ ok: true });
  }

  return Response.json({ error: 'Hành động không hợp lệ.' }, { status: 400 });
}

import { cookies } from 'next/headers';
import {
  STUDENT_COOKIE,
  createStudentSessionToken,
  isHttpsRequest,
  sameOrigin,
} from '@/lib/auth';
import { get } from '@/lib/db';
import { normalizeUsername, verifyPassword } from '@/lib/password';
import { studentLoginSchema } from '@/lib/schemas';

export const runtime = 'nodejs';

const attempts = new Map<string, { count: number; until: number }>();

export async function POST(req: Request) {
  if (!sameOrigin(req)) {
    return Response.json({ error: 'Yêu cầu không hợp lệ.' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Dữ liệu không hợp lệ.' }, { status: 400 });
  }

  const parsed = studentLoginSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu.' }, { status: 400 });
  }

  const username = normalizeUsername(parsed.data.username);
  if (!username) {
    return Response.json({ error: 'Tên đăng nhập chưa đúng.' }, { status: 401 });
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  const rateKey = `${ip}:${username}`;
  const current = attempts.get(rateKey);
  if (current && current.until > Date.now() && current.count >= 10) {
    return Response.json({ error: 'Thử lại sau 5 phút.' }, { status: 429 });
  }

  const student = await get(
    'SELECT id, password_hash, password_version FROM students WHERE LOWER(username)=?',
    username,
  );

  const valid = student ? await verifyPassword(parsed.data.password, student.password_hash ? String(student.password_hash) : null) : false;
  if (!student || !valid) {
    const next = current && current.until > Date.now() ? current : { count: 0, until: Date.now() + 300000 };
    next.count++;
    attempts.set(rateKey, next);
    return Response.json({ error: 'Tên đăng nhập hoặc mật khẩu chưa đúng.' }, { status: 401 });
  }

  attempts.delete(rateKey);
  const sessionToken = createStudentSessionToken(Number(student.id), Number(student.password_version || 1));

  (await cookies()).set(STUDENT_COOKIE, sessionToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isHttpsRequest(req),
    path: '/',
    maxAge: 30 * 86400,
  });

  return Response.json({ ok: true });
}

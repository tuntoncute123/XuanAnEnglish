import { cookies } from 'next/headers';
import { isHttpsRequest, sameOrigin } from '@/lib/auth';
import { get } from '@/lib/db';
import { normalizeUsername, verifyPassword } from '@/lib/password';
import { PARENT_COOKIE, parentToken } from '@/lib/parent-auth';
import { studentLoginSchema } from '@/lib/schemas';
export const runtime = 'nodejs';
const attempts = new Map<string, { count: number; until: number }>();
export async function POST(req: Request) {
  if (!sameOrigin(req))
    return Response.json({ error: 'Yêu cầu không hợp lệ.' }, { status: 403 });
  const parsed = studentLoginSchema.safeParse(
    await req.json().catch(() => null),
  );
  if (!parsed.success)
    return Response.json(
      { error: 'Nhập tên đăng nhập và mật khẩu.' },
      { status: 400 },
    );
  for (const [key, value] of attempts)
    if (value.until < Date.now()) attempts.delete(key);
  const username = normalizeUsername(parsed.data.username);
  const key = `${req.headers.get('x-forwarded-for')?.split(',')[0] || 'local'}:${username}`;
  const attempt = attempts.get(key) || { count: 0, until: Date.now() + 300000 };
  if (attempt.count >= 10)
    return Response.json({ error: 'Thử lại sau 5 phút.' }, { status: 429 });
  // Count before awaiting password hashing so concurrent requests share the limit.
  attempt.count++;
  attempts.set(key, attempt);
  const row = await get(
    'SELECT * FROM parent_accounts WHERE username=?',
    username,
  );
  if (!row || !(await verifyPassword(parsed.data.password, row.password_hash)))
    return Response.json(
      { error: 'Tên đăng nhập hoặc mật khẩu chưa đúng.' },
      { status: 401 },
    );
  attempts.delete(key);
  (await cookies()).set(
    PARENT_COOKIE,
    parentToken(row.id, row.password_version),
    {
      httpOnly: true,
      sameSite: 'lax',
      secure: isHttpsRequest(req),
      path: '/',
      maxAge: 30 * 86400,
    },
  );
  return Response.json({ ok: true });
}

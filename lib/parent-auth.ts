import { cookies } from 'next/headers';
import { timingSafeEqual } from 'node:crypto';
import { sign, getSessionStudent } from './auth';
import { get } from './db';
export const PARENT_COOKIE = 'an_parent_session';
export function parentToken(id: number, version: number) {
  const payload = `parent.${id}.${version}.${Date.now() + 30 * 86400000}`;
  return `${payload}.${sign(payload)}`;
}
export async function sessionParent() {
  const token = (await cookies()).get(PARENT_COOKIE)?.value;
  const parts = token?.split('.') || [];
  if (parts.length !== 5 || parts[0] !== 'parent') return null;
  const [prefix, id, version, expiry, sig] = parts;
  if (
    !Number.isSafeInteger(Number(id)) ||
    Number(id) <= 0 ||
    !Number.isFinite(Number(expiry)) ||
    Number(expiry) < Date.now()
  )
    return null;
  const expected = sign(`${prefix}.${id}.${version}.${expiry}`);
  if (
    Buffer.byteLength(sig) !== Buffer.byteLength(expected) ||
    !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  )
    return null;
  const row = await get(
    'SELECT id,name,username,password_version FROM parent_accounts WHERE id=?',
    Number(id),
  );
  return row && Number(row.password_version) === Number(version) ? row : null;
}
export async function featureStudent(req: Request) {
  const token = req.headers.get('x-student-token');
  if (token) {
    const row = await get(
      'SELECT id,class_id,token FROM students WHERE token=?',
      token,
    );
    return row
      ? {
          id: Number(row.id),
          class_id: Number(row.class_id),
          token: String(row.token),
        }
      : null;
  }
  return getSessionStudent();
}

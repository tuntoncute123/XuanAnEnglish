import { cookies } from 'next/headers';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { get, sessionSecret } from './db';

export const STUDENT_COOKIE = 'an_student_session';

export type SessionStudent = {
  id: number;
  name: string;
  class_id: number;
  token: string;
  username: string | null;
  password_version: number;
};

export function sign(value: string) {
  return createHmac('sha256', sessionSecret).update(value).digest('hex');
}

export function validSession(token: string | undefined) {
  if (!token) return false;
  const [expiry, sig] = token.split('.');
  if (!expiry || !sig || Number(expiry) < Date.now()) return false;
  const expected = sign(expiry);
  return sig.length === expected.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

export async function isAdmin() {
  return validSession((await cookies()).get('an_session')?.value);
}

export function createStudentSessionToken(studentId: number, passwordVersion: number): string {
  const expiry = Date.now() + 30 * 86400 * 1000;
  const payload = `${studentId}.${passwordVersion}.${expiry}`;
  return `${payload}.${sign(payload)}`;
}

export function parseStudentSessionToken(
  token: string | undefined,
): { studentId: number; passwordVersion: number } | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 4) return null;
  const [idStr, verStr, expiryStr, sig] = parts;
  const studentId = Number(idStr);
  const passwordVersion = Number(verStr);
  const expiry = Number(expiryStr);
  if (
    !Number.isInteger(studentId) ||
    studentId <= 0 ||
    !Number.isInteger(passwordVersion) ||
    passwordVersion <= 0 ||
    !Number.isFinite(expiry) ||
    expiry < Date.now() ||
    !sig
  ) {
    return null;
  }
  const payload = `${idStr}.${verStr}.${expiryStr}`;
  const expected = sign(payload);
  if (sig.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  return { studentId, passwordVersion };
}

export async function getSessionStudent(): Promise<SessionStudent | null> {
  const raw = (await cookies()).get(STUDENT_COOKIE)?.value;
  const parsed = parseStudentSessionToken(raw);
  if (!parsed) return null;
  const row = await get(
    'SELECT id, name, class_id, token, username, password_version FROM students WHERE id=?',
    parsed.studentId,
  );
  if (!row || Number(row.password_version) !== parsed.passwordVersion) return null;
  return {
    id: Number(row.id),
    name: String(row.name),
    class_id: Number(row.class_id),
    token: String(row.token),
    username: row.username ? String(row.username) : null,
    password_version: Number(row.password_version),
  };
}

export function isHttpsRequest(request: Request): boolean {
  const forwarded = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase();
  if (forwarded) return forwarded === 'https';
  try {
    return new URL(request.url).protocol === 'https:';
  } catch {
    return false;
  }
}

export function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    const parsed = new URL(origin);
    return (
      ['http:', 'https:'].includes(parsed.protocol) &&
      (parsed.origin === `${parsed.protocol}//${request.headers.get('host')}` ||
        parsed.origin === process.env.FRONTEND_ORIGIN)
    );
  } catch {
    return false;
  }
}

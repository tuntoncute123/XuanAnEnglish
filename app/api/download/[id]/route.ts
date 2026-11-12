import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getSessionStudent, isAdmin } from '@/lib/auth';
import { dataDir, get } from '@/lib/db';

export const runtime = 'nodejs';

const SAFE_INLINE_MEDIA = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'audio/mpeg',
  'audio/wav',
  'audio/wave',
  'audio/x-wav',
  'audio/webm',
  'audio/mp4',
  'audio/aac',
  'audio/ogg',
  'audio/x-m4a',
]);

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const f = await get('SELECT * FROM files WHERE id=?', id);
  if (!f) {
    return new Response('Không tìm thấy tệp', { status: 404 });
  }

  if (!(await isAdmin())) {
    const token = new URL(req.url).searchParams.get('token')?.trim() || '';
    let student: { token: string; class_id: number } | null = null;
    if (token) {
      const byToken = await get('SELECT token, class_id FROM students WHERE token=?', token);
      if (byToken) {
        student = { token: String(byToken.token), class_id: Number(byToken.class_id) };
      }
    } else {
      const session = await getSessionStudent();
      if (session) {
        student = { token: session.token, class_id: session.class_id };
      }
    }
    if (!student) {
      return new Response('Không có quyền', { status: 403 });
    }
    const allowed =
      f.owner_token === student.token ||
      (await get('SELECT id FROM assignments WHERE file_id=? AND class_id=?', id, student.class_id));
    if (!allowed) {
      return new Response('Không có quyền', { status: 403 });
    }
  }

  const reqUrl = new URL(req.url);
  const wantInline = reqUrl.searchParams.get('inline') === '1';
  const fileType = String(f.type || '').split(';')[0].trim().toLowerCase();
  const canInline = wantInline && SAFE_INLINE_MEDIA.has(fileType);

  try {
    return new Response(await readFile(join(dataDir, 'uploads', id)), {
      headers: {
        'Content-Type': canInline ? fileType : 'application/octet-stream',
        'Content-Disposition': `${canInline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(String(f.name))}`,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store',
      },
    });
  } catch {
    return new Response('Không tìm thấy tệp', { status: 404 });
  }
}

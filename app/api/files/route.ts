import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getSessionStudent, isAdmin, sameOrigin } from '@/lib/auth';
import { dataDir, get, run } from '@/lib/db';

export const runtime = 'nodejs';

const ALLOWED_TYPES = new Set([
  'application/pdf',
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
  'text/plain',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

export async function POST(req: Request) {
  if (!sameOrigin(req)) {
    return Response.json({ error: 'Yêu cầu không hợp lệ.' }, { status: 403 });
  }

  const token = req.headers.get('x-student-token')?.trim() || null;
  const preferStudentSession = req.headers.get('x-student-session') === '1';
  const admin = await isAdmin();
  const sessionStudent = await getSessionStudent();

  let ownerToken: string | null = null;
  if (token) {
    const byToken = await get('SELECT id FROM students WHERE token=?', token);
    if (!byToken) {
      return Response.json({ error: 'Không có quyền truy cập.' }, { status: 401 });
    }
    ownerToken = token;
  } else if (preferStudentSession) {
    if (!sessionStudent) {
      return Response.json({ error: 'Vui lòng đăng nhập lại.' }, { status: 401 });
    }
    ownerToken = sessionStudent.token;
  } else if (admin) {
    ownerToken = null;
  } else if (sessionStudent) {
    ownerToken = sessionStudent.token;
  } else {
    return Response.json({ error: 'Không có quyền truy cập.' }, { status: 401 });
  }

  if (Number(req.headers.get('content-length') || 0) > 11 * 1024 * 1024) {
    return Response.json({ error: 'Tệp tối đa 10 MB.' }, { status: 413 });
  }

  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File) || file.size > 10 * 1024 * 1024 || file.size === 0) {
      return Response.json({ error: 'Chọn tệp từ 1 byte đến 10 MB.' }, { status: 400 });
    }
    const baseType = file.type.split(';')[0].trim().toLowerCase();
    if (!ALLOWED_TYPES.has(baseType)) {
      return Response.json(
        { error: 'Hỗ trợ PDF, DOCX, ảnh JPG/PNG/WebP, âm thanh MP3/WAV/WEBM/M4A và TXT.' },
        { status: 400 },
      );
    }
    const id = randomBytes(24).toString('hex');
    await mkdir(join(dataDir, 'uploads'), { recursive: true });
    await writeFile(join(dataDir, 'uploads', id), Buffer.from(await file.arrayBuffer()));
    await run(
      'INSERT INTO files(id,name,type,size,owner_token) VALUES(?,?,?,?,?)',
      id,
      file.name.slice(0, 200),
      baseType,
      file.size,
      ownerToken,
    );
    return Response.json({ id, name: file.name.slice(0, 200), type: baseType });
  } catch {
    return Response.json({ error: 'Không tải được tệp.' }, { status: 400 });
  }
}

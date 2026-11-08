import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { isAdmin, sameOrigin } from '@/lib/auth';
import { dataDir, transaction } from '@/lib/db';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (!sameOrigin(request) || !await isAdmin()) return new Response(null, { status: 401 });
  const { marker, files } = await request.json();
  if (typeof marker !== 'string' || !/^__codex_smoke_[a-f0-9]{32}__$/.test(marker) ||
      !Array.isArray(files) || files.some(id => typeof id !== 'string' || !/^[a-f0-9]{48}$/.test(id))) {
    return new Response(null, { status: 400 });
  }
  await transaction(async ({ run }) => {
    await run('DELETE FROM submissions WHERE assignment_id IN (SELECT id FROM assignments WHERE title=?) OR student_id IN (SELECT id FROM students WHERE name=?)', marker, marker);
    await run('DELETE FROM attendance WHERE session_id IN (SELECT id FROM sessions WHERE topic=?) OR student_id IN (SELECT id FROM students WHERE name=?)', marker, marker);
    await run('DELETE FROM payments WHERE student_id IN (SELECT id FROM students WHERE name=?)', marker);
    await run('DELETE FROM assignments WHERE title=?', marker);
    await run('DELETE FROM sessions WHERE topic=?', marker);
    await run('DELETE FROM students WHERE name=?', marker);
    await run('DELETE FROM classes WHERE name=?', marker);
    for (const id of files) await run('DELETE FROM files WHERE id=?', id);
  });
  await Promise.all(files.map(id => unlink(join(dataDir, 'uploads', id)).catch(error => {
    if (error.code !== 'ENOENT') throw error;
  })));
  return Response.json({ ok: true });
}

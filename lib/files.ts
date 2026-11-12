import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { all, dataDir, run } from './db';
import type { SubmissionAttachment } from './types';

export function parseAttachmentsJson(raw: unknown): SubmissionAttachment[] {
  if (Array.isArray(raw)) return raw as SubmissionAttachment[];
  if (typeof raw !== 'string' || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function cleanupUnreferencedFiles(candidateIds: (string | null | undefined)[]): Promise<number> {
  const unique = [...new Set(candidateIds.filter((v): v is string => typeof v === 'string' && v.trim().length > 0))];
  if (!unique.length) return 0;

  const [assignmentRows, submissionRows] = await Promise.all([
    all('SELECT file_id FROM assignments WHERE file_id IS NOT NULL'),
    all('SELECT file_id, attachments FROM submissions'),
  ]);

  const referenced = new Set<string>();
  for (const row of assignmentRows) {
    if (row.file_id) referenced.add(String(row.file_id));
  }
  for (const row of submissionRows) {
    if (row.file_id) referenced.add(String(row.file_id));
    for (const att of parseAttachmentsJson(row.attachments)) {
      if (att?.id) referenced.add(String(att.id));
    }
  }

  let removed = 0;
  for (const id of unique) {
    if (referenced.has(id)) continue;
    await run('DELETE FROM files WHERE id=?', id);
    await unlink(join(dataDir, 'uploads', id)).catch(() => undefined);
    removed++;
  }
  return removed;
}

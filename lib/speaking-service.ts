import { z } from 'zod';
import { all, run, transaction } from './db';
import {
  daySchema,
  FeatureError,
  positiveId,
  shortText,
} from './growth-validation';
import { cleanupUnreferencedFiles } from './files';

const schema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('speaking_task'),
    class_id: positiveId,
    title: shortText,
    prompt: z.string().trim().min(1).max(3000),
    sample: z.string().trim().max(3000),
    deadline: daySchema,
  }),
  z.object({
    action: z.literal('speaking_feedback'),
    id: positiveId,
    feedback: z.string().trim().max(3000),
    pronunciation: z.number().int().min(1).max(5),
    fluency: z.number().int().min(1).max(5),
    content: z.number().int().min(1).max(5),
  }),
  z.object({ action: z.literal('speaking_delete'), id: positiveId }),
]);
export async function speakingAdminData() {
  return {
    speakingTasks: await all('SELECT * FROM speaking_tasks ORDER BY id DESC'),
    speakingAttempts: await all('SELECT * FROM speaking_attempts ORDER BY id'),
  };
}
export async function speakingAdminAction(body: unknown) {
  const a = schema.parse(body);
  if (a.action === 'speaking_task')
    await run(
      'INSERT INTO speaking_tasks(class_id,title,prompt,sample,deadline) VALUES(?,?,?,?,?)',
      a.class_id,
      a.title,
      a.prompt,
      a.sample,
      a.deadline,
    );
  else if (a.action === 'speaking_feedback')
    await run(
      'UPDATE speaking_attempts SET feedback=?,pronunciation=?,fluency=?,content=? WHERE id=?',
      a.feedback,
      a.pronunciation,
      a.fluency,
      a.content,
      a.id,
    );
  else {
    const files = await all(
      'SELECT file_id FROM speaking_attempts WHERE task_id=?',
      a.id,
    );
    await run('DELETE FROM speaking_tasks WHERE id=?', a.id);
    await cleanupUnreferencedFiles(files.map((f) => String(f.file_id)));
  }
}
export async function submitSpeaking(
  student: { id: number; class_id: number; token: string },
  body: unknown,
) {
  const a = z
    .object({ task_id: positiveId, file_id: z.string().min(1).max(100) })
    .parse(body);
  await transaction(async (c) => {
    await c.run('SELECT pg_advisory_xact_lock(823761430,?)', student.id);
    const task = (
      await c.run(
        'SELECT id FROM speaking_tasks WHERE id=? AND class_id=?',
        a.task_id,
        student.class_id,
      )
    ).rows[0];
    const file = (
      await c.run(
        'SELECT type FROM files WHERE id=? AND owner_token=?',
        a.file_id,
        student.token,
      )
    ).rows[0];
    if (!task || !file || !String(file.type).startsWith('audio/'))
      throw new FeatureError('Chọn bản ghi âm của con cho bài luyện nói này.');
    const attempts = (
      await c.run(
        'SELECT id,file_id FROM speaking_attempts WHERE task_id=? AND student_id=?',
        a.task_id,
        student.id,
      )
    ).rows;
    if (attempts.some((r) => r.file_id === a.file_id)) return;
    if (attempts.length >= 20)
      throw new FeatureError('Mỗi bài lưu tối đa 20 lần nộp.');
    await c.run(
      'INSERT INTO speaking_attempts(task_id,student_id,file_id,created_at) VALUES(?,?,?,?)',
      a.task_id,
      student.id,
      a.file_id,
      new Date().toISOString(),
    );
  });
}

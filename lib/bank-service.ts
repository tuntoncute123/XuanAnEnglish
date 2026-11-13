import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { all, transaction } from './db';
import {
  FeatureError,
  positiveId,
  shortText,
  daySchema,
} from './growth-validation';
import { quizQuestionSchema } from './schemas';
import { shuffledQuestion, knowledgeMap, type Attempt } from './growth';
import type { QuizQuestion } from './types';

const actionSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('bank_import'),
      assignment_id: positiveId.optional(),
      questions: z.array(quizQuestionSchema).min(1).max(100).optional(),
    })
    .refine(
      (a) => Boolean(a.assignment_id) !== Boolean(a.questions),
      'Chọn một nguồn câu hỏi',
    ),
  z.object({
    action: z.literal('bank_update'),
    id: positiveId,
    question: quizQuestionSchema,
  }),
  z.object({ action: z.literal('bank_delete'), id: positiveId }),
  z.object({
    action: z.literal('generate_exam'),
    class_id: positiveId,
    title: shortText,
    deadline: daySchema,
    unit: z.string().max(120),
    topic: z.string().max(120),
    difficulty: z.enum(['', 'easy', 'medium', 'hard']),
    kind: z.enum(['', 'choice', 'text']),
    count: z.number().int().min(1).max(100),
    variants: z.number().int().min(1).max(5),
  }),
  z.object({
    action: z.literal('remedial'),
    class_id: positiveId,
    topic: shortText,
    student_ids: z.array(positiveId).min(1).max(200),
  }),
]);
export async function bankData(classId?: number) {
  const [bank, attempts] = await Promise.all([
    all('SELECT * FROM question_bank ORDER BY id DESC'),
    classId
      ? all(
          'SELECT a.* FROM learning_attempts a JOIN students s ON s.id=a.student_id WHERE s.class_id=? ORDER BY a.id',
          classId,
        )
      : all('SELECT * FROM learning_attempts ORDER BY id'),
  ]);
  const enriched = (attempts as Attempt[]).map((a) => ({
    ...a,
    questions: a.questions.map((q) => {
      const item = bank.find(
        (b) => b.source_key === `${a.assignment_id}:${q.id}`,
      );
      return item ? { ...q, topic: item.question.topic || q.topic } : q;
    }),
  }));
  return { bank, knowledge: knowledgeMap(enriched) };
}
export async function bankAction(body: unknown) {
  const a = actionSchema.parse(body);
  await transaction(async (c) => {
    if (a.action === 'bank_import') {
      let questions = a.questions;
      if (a.assignment_id) {
        const source = (
          await c.run(
            'SELECT questions FROM assignments WHERE id=?',
            a.assignment_id,
          )
        ).rows[0];
        if (!source) throw new FeatureError('Không tìm thấy bài tập.');
        questions = z
          .array(quizQuestionSchema)
          .min(1)
          .max(100)
          .parse(JSON.parse(source.questions));
      }
      for (const q of questions || []) {
        const key = a.assignment_id
          ? `${a.assignment_id}:${q.id}`
          : `manual:${q.id}`;
        await c.run(
          'INSERT INTO question_bank(source_key,question,unit,topic,difficulty) VALUES(?,?::jsonb,?,?,?) ON CONFLICT(source_key) DO NOTHING',
          key,
          JSON.stringify(q),
          q.unit || '',
          q.topic || q.section || '',
          q.difficulty || 'medium',
        );
      }
    } else if (a.action === 'bank_update') {
      const q = a.question;
      await c.run(
        'UPDATE question_bank SET question=?::jsonb,unit=?,topic=?,difficulty=? WHERE id=?',
        JSON.stringify(q),
        q.unit || '',
        q.topic || '',
        q.difficulty || 'medium',
        a.id,
      );
    } else if (a.action === 'bank_delete') {
      await c.run('DELETE FROM question_bank WHERE id=?', a.id);
    } else if (a.action === 'generate_exam') {
      const rows = (
        await c.run('SELECT * FROM question_bank ORDER BY id')
      ).rows.filter(
        (b) =>
          (!a.unit || b.unit === a.unit) &&
          (!a.topic || b.topic === a.topic) &&
          (!a.difficulty || b.difficulty === a.difficulty) &&
          (!a.kind || (b.question.kind || 'choice') === a.kind),
      );
      if (rows.length < a.count)
        throw new FeatureError(
          `Kho chỉ có ${rows.length} câu khớp điều kiện. Hãy giảm số câu hoặc bỏ bớt bộ lọc.`,
        );
      // Pick the same questions for variants; preserve reading passages and shuffle answer choices only.
      for (let i = rows.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [rows[i], rows[j]] = [rows[j], rows[i]];
      }
      const chosen = rows.slice(0, a.count);
      for (let v = 0; v < a.variants; v++) {
        const questions = chosen.map((b, i) => ({
          ...shuffledQuestion(b.question as QuizQuestion),
          id: randomUUID(),
          number: i + 1,
        }));
        await c.run(
          'INSERT INTO assignments(class_id,title,instructions,deadline,questions) VALUES(?,?,?,?,?)',
          a.class_id,
          a.title + (a.variants > 1 ? ` · Mã ${v + 1}` : ''),
          'Làm các câu hỏi bên dưới.',
          a.deadline,
          JSON.stringify(questions),
        );
      }
    } else {
      const valid = (
        await c.run(
          'SELECT id FROM students WHERE class_id=? AND id=ANY(?::int[])',
          a.class_id,
          a.student_ids,
        )
      ).rows;
      if (valid.length !== new Set(a.student_ids).size)
        throw new FeatureError('Học sinh phải thuộc lớp đang chọn.');
      const candidates = (
        await c.run(
          'SELECT question FROM question_bank WHERE topic=? ORDER BY id',
          a.topic,
        )
      ).rows
        .map((b) => b.question as QuizQuestion)
        .filter((q) => q.kind !== 'text' && q.correctIndex !== undefined)
        .slice(0, 10);
      if (!candidates.length)
        throw new FeatureError(
          'Hãy lưu câu hỏi có đáp án vào kho và gắn chủ đề này trước.',
        );
      for (const id of new Set(a.student_ids))
        await c.run(
          'INSERT INTO practice_tasks(student_id,title,questions,created_at) VALUES(?,?,?::jsonb,?)',
          id,
          `Củng cố: ${a.topic}`,
          JSON.stringify(candidates.map((q) => ({ ...q, id: randomUUID() }))),
          new Date().toISOString(),
        );
    }
  });
}

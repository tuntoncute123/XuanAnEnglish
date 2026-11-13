import { z } from 'zod';
import { all, get, run, transaction } from './db';
import {
  collectMistakes,
  localDay,
  missions,
  missionDefinitions,
  nextReview,
  weekStart,
  type Attempt,
} from './growth';
import { FeatureError, positiveId } from './growth-validation';
import { validateQuestionAnswers } from './questions';
import type { QuizQuestion } from './types';

export async function studentAttempts(studentId: number): Promise<Attempt[]> {
  return (await all(
    'SELECT * FROM learning_attempts WHERE student_id=? ORDER BY id',
    studentId,
  )) as Attempt[];
}
async function practiceAttempts(studentId: number): Promise<Attempt[]> {
  const rows = await all(
    'SELECT * FROM practice_tasks WHERE student_id=? AND completed_at IS NOT NULL ORDER BY id',
    studentId,
  );
  return rows.map((p) => ({
    id: Number(p.id),
    student_id: studentId,
    assignment_id: null,
    questions: p.questions,
    answers: p.answers,
    created_at: p.completed_at,
    revised: false,
  }));
}
export async function learningData(student: { id: number; class_id: number }) {
  const [
    attempts,
    reviews,
    cards,
    days,
    rewards,
    profile,
    practice,
    speakingTasks,
    speakingAttempts,
  ] = await Promise.all([
    studentAttempts(student.id),
    all('SELECT * FROM mistake_reviews WHERE student_id=?', student.id),
    all(
      `SELECT c.*, p.due, p.interval_days FROM vocab_cards c LEFT JOIN vocab_progress p ON p.card_id=c.id AND p.student_id=? WHERE c.class_id=? ORDER BY c.unit,c.id`,
      student.id,
      student.class_id,
    ),
    all('SELECT day FROM vocab_days WHERE student_id=?', student.id),
    all(
      'SELECT week,badge FROM learning_rewards WHERE student_id=?',
      student.id,
    ),
    get('SELECT avatar FROM learning_profiles WHERE student_id=?', student.id),
    all(
      'SELECT * FROM practice_tasks WHERE student_id=? ORDER BY id DESC',
      student.id,
    ),
    all(
      'SELECT * FROM speaking_tasks WHERE class_id=? ORDER BY id DESC',
      student.class_id,
    ),
    all(
      'SELECT * FROM speaking_attempts WHERE student_id=? ORDER BY id',
      student.id,
    ),
  ]);
  const mistakes = collectMistakes(
    [...attempts, ...(await practiceAttempts(student.id))],
    reviews as { mistake_key: string; mastered: boolean }[],
  );
  // Teacher edits to metadata enrich old attempts without changing their answer keys.
  const bank = await all('SELECT source_key,question FROM question_bank');
  for (const m of mistakes) {
    const item = bank.find(
      (b) => b.source_key === `${m.assignment_id}:${m.question.id}`,
    );
    if (item)
      m.question = {
        ...m.question,
        topic: item.question.topic,
        explanation:
          JSON.stringify([
            item.question.prompt,
            item.question.options,
            item.question.correctIndex,
          ]) ===
          JSON.stringify([
            m.question.prompt,
            m.question.options,
            m.question.correctIndex,
          ])
            ? item.question.explanation
            : m.question.explanation,
      };
  }
  return {
    today: localDay(),
    week: weekStart(),
    mistakes,
    cards,
    rewards,
    avatar: profile?.avatar || '🌱',
    missions: missions(
      attempts,
      days.map((d) => String(d.day)),
      weekStart(),
    ),
    practice: practice.map((p) => ({
      ...p,
      questions: p.completed_at
        ? p.questions
        : (p.questions as QuizQuestion[]).map(
            ({ correctIndex, explanation, ...q }) => q,
          ),
    })),
    speakingTasks,
    speakingAttempts,
  };
}

const learnerAction = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('review_mistake'),
    key: z.string().max(15000),
    choice: z.number().int().min(0).max(5),
  }),
  z.object({
    action: z.literal('review_vocab'),
    card_id: positiveId,
    remembered: z.boolean(),
  }),
  z.object({
    action: z.literal('claim_reward'),
    badge: z.enum(['submit', 'revise', 'vocab']),
  }),
  z.object({
    action: z.literal('avatar'),
    avatar: z.enum(['🌱', '🦊', '🦉', '🦋']),
  }),
  z.object({
    action: z.literal('practice'),
    id: positiveId,
    answers: z
      .record(z.string().max(60), z.number().int().min(0).max(5))
      .refine((v) => Object.keys(v).length <= 100),
  }),
]);
export async function learnerActionHandler(
  student: { id: number; class_id: number },
  body: unknown,
) {
  const a = learnerAction.parse(body);
  if (a.action === 'review_mistake') {
    const mistakes = collectMistakes(
      [
        ...(await studentAttempts(student.id)),
        ...(await practiceAttempts(student.id)),
      ],
      [],
    );
    const m = mistakes.find((m) => m.key === a.key);
    if (!m || a.choice >= m.question.options.length)
      throw new FeatureError('Không tìm thấy câu cần ôn.');
    await run(
      'INSERT INTO mistake_reviews(student_id,mistake_key,mastered,reviewed_at) VALUES(?,?,?,?) ON CONFLICT(student_id,mistake_key) DO UPDATE SET mastered=excluded.mastered,reviewed_at=excluded.reviewed_at',
      student.id,
      a.key,
      a.choice === m.question.correctIndex,
      new Date().toISOString(),
    );
  } else if (a.action === 'review_vocab') {
    await transaction(async (c) => {
      await c.run('SELECT pg_advisory_xact_lock(823761430,?)', student.id);
      const card = (
        await c.run(
          'SELECT id FROM vocab_cards WHERE id=? AND class_id=?',
          a.card_id,
          student.class_id,
        )
      ).rows[0];
      if (!card)
        throw new FeatureError('Từ vựng không thuộc lớp của con.', 404);
      const progress = (
        await c.run(
          'SELECT * FROM vocab_progress WHERE student_id=? AND card_id=?',
          student.id,
          a.card_id,
        )
      ).rows[0];
      const today = localDay();
      // A repeated request cannot advance the interval or award another day.
      if (!progress || progress.due <= today) {
        const next = nextReview(
          Number(progress?.interval_days || 0),
          a.remembered,
          today,
        );
        await c.run(
          'INSERT INTO vocab_progress(student_id,card_id,interval_days,due,last_day) VALUES(?,?,?,?,?) ON CONFLICT(student_id,card_id) DO UPDATE SET interval_days=excluded.interval_days,due=excluded.due,last_day=excluded.last_day',
          student.id,
          a.card_id,
          next.interval,
          next.due,
          today,
        );
        await c.run(
          'INSERT INTO vocab_days(student_id,day) VALUES(?,?) ON CONFLICT DO NOTHING',
          student.id,
          today,
        );
      }
    });
  } else if (a.action === 'claim_reward') {
    const data = await learningData(student);
    if (!data.missions.find((m) => m.id === a.badge)?.completed)
      throw new FeatureError('Con cần hoàn thành nhiệm vụ trước nhé.');
    await run(
      'INSERT INTO learning_rewards(student_id,week,badge) VALUES(?,?,?) ON CONFLICT DO NOTHING',
      student.id,
      data.week,
      a.badge,
    );
  } else if (a.action === 'avatar') {
    const badge = missionDefinitions.find((m) => m.avatar === a.avatar)?.id;
    if (
      a.avatar !== '🌱' &&
      !(
        badge &&
        (await get(
          'SELECT badge FROM learning_rewards WHERE student_id=? AND badge=?',
          student.id,
          badge,
        ))
      )
    )
      throw new FeatureError('Avatar này chưa được mở khóa.');
    await run(
      'INSERT INTO learning_profiles(student_id,avatar) VALUES(?,?) ON CONFLICT(student_id) DO UPDATE SET avatar=excluded.avatar',
      student.id,
      a.avatar,
    );
  } else {
    const task = await get(
      'SELECT * FROM practice_tasks WHERE id=? AND student_id=?',
      a.id,
      student.id,
    );
    if (!task) throw new FeatureError('Không tìm thấy bài củng cố.', 404);
    if (task.completed_at)
      throw new FeatureError(
        'Bài này đã nộp. Con có thể ôn lại trong sổ lỗi sai.',
      );
    const questions = task.questions as QuizQuestion[];
    validateQuestionAnswers(questions, a.answers, {});
    if (questions.some((q) => a.answers[q.id] === undefined))
      throw new FeatureError('Con hãy trả lời đủ các câu.');
    await run(
      'UPDATE practice_tasks SET answers=?::jsonb, completed_at=? WHERE id=? AND student_id=? AND completed_at IS NULL',
      JSON.stringify(a.answers),
      new Date().toISOString(),
      a.id,
      student.id,
    );
  }
}

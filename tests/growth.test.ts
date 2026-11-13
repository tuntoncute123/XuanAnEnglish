import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collectMistakes,
  knowledgeMap,
  missions,
  nextReview,
  shuffledQuestion,
  weekStart,
  localDay,
  type Attempt,
} from '../lib/growth.ts';
import { quizQuestionSchema } from '../lib/schemas.ts';
import type { QuizQuestion } from '../lib/types.ts';
const q: QuizQuestion = {
  id: 'q1',
  prompt: 'She ___ a book.',
  options: ['reads', 'read', 'reading'],
  correctIndex: 0,
  topic: 'Present simple',
  explanation: 'She + reads.',
};
const attempt = (
  id: number,
  answers: Record<string, number>,
  overrides: Partial<Attempt> = {},
): Attempt => ({
  id,
  student_id: 1,
  assignment_id: 1,
  questions: [q],
  answers,
  created_at: '2026-11-09T03:00:00Z',
  revised: false,
  ...overrides,
});
test('school week uses Vietnam time, including Sunday UTC rollover', () => {
  assert.equal(localDay(new Date('2026-11-08T18:00:00Z')), '2026-11-09');
  assert.equal(weekStart('2026-11-15'), '2026-11-09');
  assert.equal(weekStart('2027-01-01'), '2026-12-28');
});
test('vocabulary spaces successful reviews, resets missed words, and caps interval', () => {
  assert.deepEqual(nextReview(0, true, '2026-12-31'), {
    interval: 1,
    due: '2027-01-01',
  });
  assert.equal(nextReview(8, true, '2026-11-13').interval, 16);
  assert.equal(nextReview(32, true, '2026-11-13').interval, 60);
  assert.equal(nextReview(32, false, '2026-11-13').interval, 1);
});
test('answer shuffling preserves the correct choice including duplicate text and unkeyed essays', () => {
  const shuffled = shuffledQuestion(
    { ...q, options: ['same', 'same', 'other'], correctIndex: 1 },
    () => 0,
  );
  assert.equal(shuffled.correctIndex, 0);
  assert.deepEqual(
    shuffledQuestion(
      { id: 'essay', prompt: 'Write', options: [], kind: 'text' },
      () => 0,
    ).options,
    [],
  );
  assert.equal(
    shuffledQuestion({ ...q, correctIndex: undefined }, () => 0).correctIndex,
    undefined,
  );
});
test('notebook preserves previous mistakes but does not mix edited questions with mastery', () => {
  const mistakes = collectMistakes(
    [attempt(1, { q1: 1 }), attempt(2, { q1: 0 })],
    [],
  );
  assert.equal(mistakes.length, 1);
  const reviews = [{ mistake_key: mistakes[0].key, mastered: true }];
  assert.equal(
    collectMistakes([attempt(1, { q1: 1 })], reviews)[0].mastered,
    true,
  );
  const changed = { ...q, options: ['another', 'answer'], correctIndex: 1 };
  assert.equal(
    collectMistakes(
      [attempt(3, { q1: 0 }, { questions: [changed] })],
      reviews,
    )[0].mastered,
    false,
  );
  assert.equal(
    collectMistakes(
      [attempt(3, {}, { questions: [{ ...q, correctIndex: undefined }] })],
      [],
    ).length,
    0,
  );
  assert.ok(
    collectMistakes(
      [
        attempt(
          4,
          { q1: 1 },
          {
            questions: [
              {
                ...q,
                prompt: 'a'.repeat(3000),
                options: ['a'.repeat(1000), 'b'.repeat(1000)],
              },
            ],
          },
        ),
      ],
      [],
    )[0].key.length < 150,
  );
});
test('knowledge map uses latest attempt once per student per assignment and ignores unkeyed questions', () => {
  const rows = knowledgeMap([
    attempt(1, { q1: 1 }),
    attempt(2, { q1: 0 }),
    attempt(3, { q1: 1 }, { student_id: 2 }),
    attempt(
      4,
      {},
      { student_id: 3, questions: [{ ...q, correctIndex: undefined }] },
    ),
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].total, 2);
  assert.equal(rows[0].correct, 1);
  assert.deepEqual(rows[0].students, [2]);
  assert.equal(rows[0].questions[0].wrong, 1);
});
test('weekly missions count unique assignments and review days, with no future or prior week credit', () => {
  const rows = missions(
    [
      attempt(1, {}),
      attempt(2, {}),
      attempt(3, {}, { assignment_id: 2, revised: true }),
      attempt(4, {}, { assignment_id: 3, created_at: '2026-11-16T00:00:00Z' }),
    ],
    ['2026-11-09', '2026-11-09', '2026-11-10', '2026-11-08', '2026-11-16'],
    '2026-11-09',
  );
  assert.equal(rows[0].progress, 2);
  assert.equal(rows[0].completed, false);
  assert.equal(rows[1].completed, true);
  assert.equal(rows[2].progress, 2);
});
test('question metadata survives validation and invalid difficulty is rejected', () => {
  const parsed = quizQuestionSchema.parse({
    ...q,
    unit: 'Unit 1',
    difficulty: 'easy',
  });
  assert.equal(parsed.topic, q.topic);
  assert.equal(parsed.explanation, q.explanation);
  assert.equal(
    quizQuestionSchema.safeParse({ ...q, difficulty: 'impossible' }).success,
    false,
  );
});

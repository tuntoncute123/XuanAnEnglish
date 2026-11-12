import { test } from 'node:test';
import assert from 'node:assert/strict';
import { homeworkState, homeworkStats, selectHomework, nextStudentSession } from '../lib/student-learning.ts';
import { homeworkDraftKey, readHomeworkDraft, questionVersion, sameHomeworkContent } from '../lib/homework-draft.ts';
import type { StudentAssignment, StudentSessionItem, Submission } from '../lib/types.ts';

const assignments: StudentAssignment[] = [
  { id: 1, class_id: 1, title: 'Ôn tập động từ', instructions: 'Viết câu', deadline: '2026-11-11', file_id: null },
  { id: 2, class_id: 1, title: 'Listening', instructions: 'Listen and repeat', deadline: '2026-11-12', file_id: null },
  { id: 3, class_id: 1, title: 'Reading', instructions: '', deadline: '2026-11-10', file_id: null },
  { id: 4, class_id: 1, title: 'Speaking', instructions: '', deadline: '2026-11-15', file_id: null },
];
const submission = (id: number, status: Submission['status']): Submission => ({
  id, assignment_id: id, student_id: 1, answer: 'A', file_id: null,
  submitted_at: '2026-11-11T01:00:00Z', feedback: '', status,
});
const submissions = [submission(1, 'needs_revision'), { ...submission(3, 'reviewed'), feedback: 'Đọc rất tốt' }];

test('student totals count revision as pending and overdue, never count already submitted work as overdue', () => {
  assert.deepEqual(homeworkStats(assignments, submissions, '2026-11-12'), {
    total: 4, pending: 3, overdue: 1, revision: 1, reviewed: 1, submitted: 1, dueToday: 1,
  });
  assert.equal(homeworkState(assignments[2], submissions[1], '2026-11-12').overdue, false);
  assert.equal(homeworkStats([], submissions, '2026-11-12').total, 0);
});

test('homework search handles Vietnamese, feedback, combined filters and priority without mutating the input', () => {
  const select = (filter: Parameters<typeof selectHomework>[3], query = '', sort: Parameters<typeof selectHomework>[5] = 'priority') =>
    selectHomework(assignments, submissions, '2026-11-12', filter, query, sort).map(a => a.id);
  assert.deepEqual(select('all'), [1, 2, 4, 3]);
  assert.deepEqual(select('all', '', 'newest'), [4, 3, 2, 1]);
  assert.deepEqual(select('revision', 'ON dong'), [1]);
  assert.deepEqual(select('reviewed', 'doc tot'), [3]);
  assert.deepEqual(select('submitted', 'dong'), []);
  assert.deepEqual(select('overdue'), [1]);
  assert.deepEqual(assignments.map(a => a.id), [1, 2, 3, 4]);
});

test('next lesson excludes cancelled and finished lessons and uses the class timezone', () => {
  const lesson = (id: number, time: string, session_status: StudentSessionItem['session_status'] = 'scheduled'): StudentSessionItem => ({
    id, date: '2026-11-12', time, duration: 60, topic: '', session_status, status: null, focus: null, homework: null, note: null,
  });
  const sessions = [lesson(1, '08:00'), lesson(2, '09:00', 'cancelled'), lesson(3, '10:00'), lesson(4, '11:00')];
  assert.equal(nextStudentSession(sessions, new Date('2026-11-12T02:00:00Z'))?.session.id, 3);
  assert.equal(nextStudentSession(sessions, new Date('2026-11-12T03:30:00Z'))?.ongoing, true);
  assert.equal(nextStudentSession(sessions, new Date('2026-11-12T04:00:00Z'))?.session.id, 4);
  assert.equal(nextStudentSession(sessions, new Date('2026-11-12T05:00:00Z')), null);
});

const questions = [{ id: 'q1', prompt: 'Cat?', options: ['Cat', 'Dog'] }];
const draft = { version: 1, submissionVersion: null, questionVersion: questionVersion(questions), savedAt: 1, answer: 'My draft', quizAnswers: { q1: 0 } };

test('drafts survive a reload but cannot replace a newer submitted answer or leak between student/assignment keys', () => {
  assert.equal(readHomeworkDraft(JSON.stringify(draft), null, questions)?.answer, 'My draft');
  assert.equal(readHomeworkDraft(JSON.stringify(draft), '2026-11-12T03:00:00Z', questions), null);
  assert.notEqual(homeworkDraftKey(1, 12), homeworkDraftKey(11, 2));
  assert.notEqual(homeworkDraftKey(1, 1), homeworkDraftKey(2, 1));
  assert.equal(readHomeworkDraft(JSON.stringify(draft), null, [{ ...questions[0], correctIndex: 0 }])?.quizAnswers.q1, 0);
});

test('changed questions preserve written drafts but drop old choices; malformed drafts cannot break the editor', () => {
  const changed = readHomeworkDraft(JSON.stringify(draft), null, [{ ...questions[0], options: ['Dog', 'Cat'] }]);
  assert.equal(changed?.answer, 'My draft');
  assert.deepEqual(changed?.quizAnswers, {});
  for (const bad of [null, '{', 'null', '[]', JSON.stringify({ ...draft, version: 2 }), JSON.stringify({ ...draft, answer: 'a'.repeat(10001) })]) {
    assert.equal(readHomeworkDraft(bad, null, questions), null);
  }
  assert.deepEqual(readHomeworkDraft(JSON.stringify({ ...draft, quizAnswers: { q1: 9, old: 0 } }), null, questions)?.quizAnswers, {});
  assert.equal(sameHomeworkContent({ answer: 'A', quizAnswers: { a: 0, b: 1 } }, { answer: 'A', quizAnswers: { b: 1, a: 0 } }), true);
  assert.equal(sameHomeworkContent({ answer: 'A', quizAnswers: {} }, { answer: 'B', quizAnswers: {} }), false);
});

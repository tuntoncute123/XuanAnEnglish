import type { QuizQuestion } from './types.ts';

export function localDay(now = new Date()) {
  return now.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
}
export function shiftDay(day: string, days: number) {
  const d = new Date(day + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function weekStart(day = localDay()) {
  const dow = new Date(day + 'T12:00:00Z').getUTCDay();
  return shiftDay(day, -((dow + 6) % 7));
}
export function nextReview(interval: number, remembered: boolean, day: string) {
  const days = remembered ? Math.min(60, Math.max(1, interval * 2)) : 1;
  return { interval: days, due: shiftDay(day, days) };
}
export function shuffledQuestion(
  q: QuizQuestion,
  random = Math.random,
): QuizQuestion {
  const choices = q.options.map((value, index) => ({ value, index }));
  for (let i = choices.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [choices[i], choices[j]] = [choices[j], choices[i]];
  }
  return {
    ...q,
    options: choices.map((o) => o.value),
    correctIndex:
      q.correctIndex === undefined
        ? undefined
        : choices.findIndex((o) => o.index === q.correctIndex),
  };
}
export type Attempt = {
  id: number;
  student_id: number;
  assignment_id: number | null;
  questions: QuizQuestion[];
  answers: Record<string, number>;
  created_at: string;
  revised: boolean;
};
export type Mistake = {
  key: string;
  question: QuizQuestion;
  selected: number | null;
  assignment_id: number | null;
  mastered: boolean;
};
export function mistakeKey(assignmentId: number | null, q: QuizQuestion) {
  // Two independent 32-bit hashes keep keys bounded even for long reading questions.
  const text = JSON.stringify([
    assignmentId,
    q.id,
    q.prompt,
    q.options,
    q.correctIndex,
  ]);
  let a = 2166136261,
    b = 5381;
  for (let i = 0; i < text.length; i++) {
    a = Math.imul(a ^ text.charCodeAt(i), 16777619);
    b = Math.imul(b, 33) ^ text.charCodeAt(i);
  }
  return `${assignmentId}:${q.id}:${(a >>> 0).toString(16)}${(b >>> 0).toString(16)}`;
}
export function collectMistakes(
  attempts: Attempt[],
  reviews: { mistake_key: string; mastered: boolean }[],
): Mistake[] {
  const result = new Map<string, Mistake>();
  for (const attempt of attempts)
    for (const q of attempt.questions) {
      if (
        q.kind === 'text' ||
        q.correctIndex === undefined ||
        attempt.answers[q.id] === q.correctIndex
      )
        continue;
      // Fingerprint the full question so edits do not inherit an older mastery mark.
      const key = mistakeKey(attempt.assignment_id, q);
      result.set(key, {
        key,
        question: q,
        selected: attempt.answers[q.id] ?? null,
        assignment_id: attempt.assignment_id,
        mastered: reviews.some((r) => r.mistake_key === key && r.mastered),
      });
    }
  return [...result.values()];
}
export function knowledgeMap(attempts: Attempt[]) {
  const latest = new Map<string, Attempt>();
  for (const a of attempts) latest.set(`${a.student_id}:${a.assignment_id}`, a);
  const topics = new Map<
    string,
    {
      topic: string;
      total: number;
      correct: number;
      students: Set<number>;
      questions: Map<string, { prompt: string; wrong: number }>;
    }
  >();
  for (const a of latest.values())
    for (const q of a.questions) {
      if (q.kind === 'text' || q.correctIndex === undefined) continue;
      const topic = q.topic || q.section || 'Chưa gắn chủ đề';
      const row = topics.get(topic) || {
        topic,
        total: 0,
        correct: 0,
        students: new Set<number>(),
        questions: new Map(),
      };
      row.total++;
      if (a.answers[q.id] === q.correctIndex) row.correct++;
      else {
        row.students.add(a.student_id);
        const key = JSON.stringify([q.prompt, q.options]);
        const item = row.questions.get(key) || { prompt: q.prompt, wrong: 0 };
        item.wrong++;
        row.questions.set(key, item);
      }
      topics.set(topic, row);
    }
  return [...topics.values()].map((r) => ({
    ...r,
    students: [...r.students],
    questions: [...r.questions.values()].sort((a, b) => b.wrong - a.wrong),
  }));
}
export const missionDefinitions = [
  { id: 'submit', label: 'Nộp 3 bài trong tuần', target: 3, avatar: '🦊' },
  { id: 'revise', label: 'Sửa lại một bài cô góp ý', target: 1, avatar: '🦉' },
  { id: 'vocab', label: 'Ôn từ vựng 4 ngày', target: 4, avatar: '🦋' },
] as const;
export function missions(attempts: Attempt[], days: string[], week: string) {
  const end = shiftDay(week, 7);
  const weekly = attempts.filter((a) => {
    const d = localDay(new Date(a.created_at));
    return d >= week && d < end;
  });
  const progress = {
    submit: new Set(weekly.map((a) => a.assignment_id)).size,
    revise: weekly.some((a) => a.revised) ? 1 : 0,
    vocab: new Set(days.filter((d) => d >= week && d < end)).size,
  };
  return missionDefinitions.map((m) => ({
    ...m,
    progress: Math.min(m.target, progress[m.id]),
    completed: progress[m.id] >= m.target,
  }));
}

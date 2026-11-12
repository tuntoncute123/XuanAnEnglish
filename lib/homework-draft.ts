import type { StudentQuizQuestion } from './types.ts';

export type HomeworkContent = { answer: string; quizAnswers: Record<string, number> };
export type HomeworkDraft = HomeworkContent & {
  version: 1;
  submissionVersion: string | null;
  questionVersion: string;
  savedAt: number;
};

export function homeworkDraftKey(studentId: number, assignmentId: number) {
  return `xuanan:homework-draft:v1:${studentId}:${assignmentId}`;
}

export function questionVersion(questions: StudentQuizQuestion[]) {
  // Grading information must not invalidate an otherwise current draft.
  return JSON.stringify(questions.map(q => ({ id: q.id, prompt: q.prompt, options: q.options })));
}

export function validQuizAnswers(answers: Record<string, unknown>, questions: StudentQuizQuestion[]) {
  return Object.fromEntries(questions.flatMap(q => {
    const choice = answers[q.id];
    return Number.isInteger(choice) && Number(choice) >= 0 && Number(choice) < q.options.length
      ? [[q.id, Number(choice)]] : [];
  }));
}

export function sameHomeworkContent(a: HomeworkContent, b: HomeworkContent) {
  const keys = Object.keys(a.quizAnswers);
  return a.answer === b.answer && keys.length === Object.keys(b.quizAnswers).length &&
    keys.every(key => a.quizAnswers[key] === b.quizAnswers[key]);
}

export function readHomeworkDraft(raw: string | null, submissionVersion: string | null, questions: StudentQuizQuestion[]): HomeworkDraft | null {
  if (!raw || raw.length > 150_000) return null;
  try {
    const draft = JSON.parse(raw);
    if (!draft || draft.version !== 1 || draft.submissionVersion !== submissionVersion ||
      typeof draft.answer !== 'string' || draft.answer.length > 10_000 ||
      typeof draft.questionVersion !== 'string' || !Number.isFinite(draft.savedAt) ||
      !draft.quizAnswers || typeof draft.quizAnswers !== 'object' || Array.isArray(draft.quizAnswers)) return null;
    return {
      version: 1, submissionVersion, answer: draft.answer,
      questionVersion: questionVersion(questions), savedAt: draft.savedAt,
      // Keep written work if the teacher edits a quiz, but never restore choices against changed questions.
      quizAnswers: draft.questionVersion === questionVersion(questions) ? validQuizAnswers(draft.quizAnswers, questions) : {},
    };
  } catch {
    return null;
  }
}

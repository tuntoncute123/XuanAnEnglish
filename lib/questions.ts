import { quizQuestionSchema } from './schemas.ts';
import type { QuizQuestion } from './types.ts';

export function prepareQuestions(drafts: QuizQuestion[]): QuizQuestion[] {
  if (drafts.length > 100) throw new Error('Mỗi bài tối đa 100 câu hỏi.');
  const result = drafts.map((q, i) => {
    const options = q.options.map((text, index) => ({ text: text.trim(), index })).filter(o => o.text);
    const index = q.correctIndex === undefined ? -1 : options.findIndex(o => o.index === q.correctIndex);
    const parsed = quizQuestionSchema.safeParse({ ...q, options: options.map(o => o.text), correctIndex: index < 0 ? undefined : index });
    if (!parsed.success) throw new Error(`Câu ${q.number || i + 1}: nhập nội dung và ít nhất hai lựa chọn cho câu trắc nghiệm.`);
    return parsed.data;
  });
  if (new Set(result.map(q => q.id)).size !== result.length) throw new Error('Mã câu hỏi bị trùng.');
  return result;
}

export function validateQuestionAnswers(questions: QuizQuestion[], quiz: Record<string, number>, text: Record<string, string>) {
  const byId = new Map(questions.map(q => [q.id, q]));
  for (const [id, choice] of Object.entries(quiz)) {
    const q = byId.get(id);
    if (!q || q.kind === 'text' || !Number.isInteger(choice) || choice < 0 || choice >= q.options.length) throw new Error('Invalid choice');
  }
  for (const [id, answer] of Object.entries(text)) {
    if (byId.get(id)?.kind !== 'text' || typeof answer !== 'string' || answer.length > 3000) throw new Error('Invalid written answer');
  }
  const keyed = questions.filter(q => q.kind !== 'text' && typeof q.correctIndex === 'number');
  if (!keyed.length || !Object.keys(quiz).length) return '';
  const correct = keyed.filter(q => quiz[q.id] === q.correctIndex).length;
  if (keyed.length !== questions.length) return `${correct}/${keyed.length} câu có đáp án · ${questions.length - keyed.length} câu chờ cô chấm`;
  const tenScale = ((correct / keyed.length) * 10).toFixed(1).replace(/\.0$/, '');
  return `${correct}/${keyed.length} (${tenScale}đ)`;
}

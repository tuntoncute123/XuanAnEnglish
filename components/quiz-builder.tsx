'use client';

import type { QuizQuestion } from '@/lib/types';
import QuestionText from './question-text';

export default function QuizBuilder({ drafts, onChange, maxQuestions = 100 }: { drafts: QuizQuestion[]; onChange: (next: QuizQuestion[]) => void; maxQuestions?: number }) {
  function update(index: number, changes: Partial<QuizQuestion>) { onChange(drafts.map((q, i) => i === index ? { ...q, ...changes } : q)); }
  return <div className="quiz-builder">
    <div className="inline between">
      <strong>Câu hỏi làm trực tiếp ({drafts.length}/{maxQuestions})</strong>
      <div className="inline">
        {(['choice', 'text'] as const).map(kind => <button key={kind} type="button" className="soft-button" disabled={drafts.length >= maxQuestions}
          onClick={() => onChange([...drafts, { id: crypto.randomUUID(), kind, prompt: '', options: kind === 'text' ? [] : ['', '', '', ''] }])}>
          {kind === 'text' ? 'Thêm tự luận' : 'Thêm trắc nghiệm'}
        </button>)}
      </div>
    </div>
    {drafts.map((q, i) => <details key={q.id} className="quiz-builder-item" open={drafts.length <= 5 ? true : undefined}>
      <summary>Câu {q.number || i + 1} · {q.kind === 'text' ? 'Tự luận' : typeof q.correctIndex === 'number' ? `Đáp án ${String.fromCharCode(65 + q.correctIndex)}` : 'Chưa có đáp án'} · <QuestionText text={q.prompt.slice(0, 100)} /></summary>
      <button type="button" className="text-button" onClick={() => onChange(drafts.filter((_, index) => index !== i))}>Xóa câu {q.number || i + 1}</button>
      <label>Nội dung câu {q.number || i + 1}
        <textarea rows={3} value={q.prompt} maxLength={3000} onChange={e => update(i, { prompt: e.target.value })} />
      </label>
      <div className="growth-fields">
        <label>Unit<input value={q.unit || ''} maxLength={120} onChange={e => update(i, {unit:e.target.value})}/></label>
        <label>Chủ đề kiến thức<input value={q.topic || ''} maxLength={120} placeholder="Ví dụ: Hiện tại đơn" onChange={e => update(i, {topic:e.target.value})}/></label>
        <label>Độ khó<select value={q.difficulty || 'medium'} onChange={e => update(i, {difficulty:e.target.value as QuizQuestion['difficulty']})}><option value="easy">Dễ</option><option value="medium">Vừa</option><option value="hard">Khó</option></select></label>
      </div>
      <label>Giải thích đáp án<textarea value={q.explanation || ''} maxLength={3000} onChange={e => update(i, {explanation:e.target.value})}/></label>
      {q.section !== undefined && <label>Tên phần<input value={q.section} maxLength={300} onChange={e => update(i, { section: e.target.value })} /></label>}
      {q.context !== undefined && <label>Hướng dẫn / đoạn đọc của câu này<textarea rows={5} value={q.context} maxLength={15000} onChange={e => update(i, { context: e.target.value })} /></label>}
      {q.kind !== 'text' && <>
        <div className="quiz-builder-options">
          {q.options.map((option, index) => <div key={index} className="inline">
            <input type="radio" name={`correct-${q.id}`} checked={q.correctIndex === index} aria-label={`Đáp án đúng câu ${q.number || i + 1} lựa chọn ${index + 1}`} onChange={() => update(i, { correctIndex: index })} />
            <input aria-label={`Lựa chọn ${String.fromCharCode(65 + index)} câu ${q.number || i + 1}`} value={option} maxLength={1000} placeholder={`Lựa chọn ${String.fromCharCode(65 + index)}`} onChange={e => update(i, { options: q.options.map((o, j) => j === index ? e.target.value : o) })} />
          </div>)}
        </div>
        <button type="button" className="text-button" onClick={() => update(i, { correctIndex: undefined })}>Để giáo viên chấm câu này</button>
        <small className="block">Chọn nút tròn cạnh đáp án đúng để tự chấm. Chưa chọn thì câu này chờ giáo viên chấm.</small>
      </>}
    </details>)}
  </div>;
}

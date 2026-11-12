'use client';

import { useEffect, useRef, useState } from 'react';
import type { DocxImport } from '@/lib/docx-import';
import type { QuizQuestion } from '@/lib/types';
import QuestionText from './question-text';

export default function DocxImporter({ onApply, onBusy, existingCount, busy }: {
  onApply: (questions: QuizQuestion[]) => void;
  onBusy: (value: boolean) => void;
  existingCount: number;
  busy: boolean;
}) {
  const [result, setResult] = useState<DocxImport | null>(null);
  const [error, setError] = useState('');
  const [reading, setReading] = useState(false);
  const [applied, setApplied] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  return <div className="docx-importer">
    <strong>Nhập câu hỏi từ đề Word</strong>
    <p>Chọn DOCX để tách câu hỏi, lựa chọn và đoạn đọc. Không dùng AI. Xem lại kết quả trước khi đưa vào bài tập.</p>
    <label>Đề DOCX cần tách (tối đa 10 MB)
      <input type="file" accept=".docx" disabled={busy || reading} onChange={async event => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        setResult(null); setError(''); setApplied(false);
        if (!/\.docx$/i.test(file.name) || file.size > 10 * 1024 * 1024 || !file.size) { setError('Chọn tệp DOCX từ 1 byte đến 10 MB.'); return; }
        controller.current?.abort();
        const abort = new AbortController(); controller.current = abort;
        setReading(true); onBusy(true);
        try {
          const body = new FormData(); body.set('file', file);
          const response = await fetch('/api/assignments/import-docx', { method: 'POST', body, signal: abort.signal });
          const json = await response.json().catch(() => null);
          if (!response.ok || !Array.isArray(json?.questions)) throw new Error(json?.error || 'Chưa tách được đề. Kiểm tra kết nối và phiên bản máy chủ rồi thử lại.');
          setResult(json);
        } catch (err) {
          if (!abort.signal.aborted) setError(err instanceof Error ? err.message : 'Không đọc được đề.');
        } finally { setReading(false); onBusy(false); }
      }} />
    </label>
    {reading && <p role="status">Đang đọc và tách câu hỏi…</p>}
    {error && <p className="error" role="alert">{error}</p>}
    {result && <>
      <p role="status"><strong>{result.questions.length} câu</strong> · {result.questions.filter(q => q.kind !== 'text').length} trắc nghiệm · {result.questions.filter(q => q.kind === 'text').length} tự luận</p>
      {result.warnings.map((warning, i) => <p className="docx-warning" key={i}>{warning}</p>)}
      <details className="docx-preview"><summary>Xem trước toàn bộ đề đã tách</summary>
        {result.questions.map((q, i) => <div key={q.id} className="docx-preview-question">
          {(i === 0 || q.section !== result.questions[i - 1].section) && <h3>{q.section}</h3>}
          {q.context && (i === 0 || q.context !== result.questions[i - 1].context) && <p className="pre-wrap question-context"><QuestionText text={q.context} /></p>}
          <p className="pre-wrap"><strong>Câu {q.number || i + 1}.</strong> <QuestionText text={q.prompt} /></p>
          {q.options.map((option, j) => <p key={j}>{String.fromCharCode(65 + j)}. <QuestionText text={option} /></p>)}
          {q.kind === 'text' && <small>Học sinh nhập câu trả lời riêng cho câu này.</small>}
        </div>)}
      </details>
      <button type="button" className="secondary" disabled={busy || applied} onClick={event => {
        const form = event.currentTarget.form;
        const title = form?.elements.namedItem('title') as HTMLInputElement | null;
        const instructions = form?.elements.namedItem('instructions') as HTMLTextAreaElement | null;
        if (title && !title.value.trim()) title.value = result.title;
        if (instructions && !instructions.value.trim()) instructions.value = result.instructions;
        // A fresh namespace prevents old student answers matching an entirely replaced exam.
        const prefix = crypto.randomUUID().slice(0, 8);
        onApply(result.questions.map(q => ({ ...q, id: `${prefix}_${q.id}` })));
        setApplied(true);
      }}>{applied ? 'Đã đưa câu hỏi vào bài tập' : existingCount ? `Thay ${existingCount} câu đang soạn bằng ${result.questions.length} câu từ DOCX` : `Dùng ${result.questions.length} câu hỏi này`}</button>
      <small className="block">Sau khi đưa vào bài tập, cô có thể sửa câu hỏi và chọn đáp án bên dưới. Bấm lưu/giao bài để học sinh nhận được đề.</small>
    </>}
  </div>;
}

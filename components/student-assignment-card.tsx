'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Clock, Download, MessageSquareHeart, Paperclip, Send, X } from 'lucide-react';
import type { StudentAssignment, Submission, SubmissionAttachment } from '@/lib/types';
import { homeworkState } from '@/lib/student-learning';
import AudioRecorder from './audio-recorder';
import { useHomeworkDraft } from './use-homework-draft';

const formatDateVi = (date: string) => date.split('-').reverse().join('/');
const formatDateTimeVi = (date: string) => new Date(date).toLocaleString('vi-VN', {
  timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit',
});

export default function AssignmentCard({
  studentId,
  assignment: a,
  submission: sub,
  todayStr,
  highlighted,
  token,
  busy,
  onBusy,
  onError,
  onSubmitted,
}: {
  studentId: number;
  assignment: StudentAssignment;
  submission?: Submission;
  todayStr: string;
  highlighted: boolean;
  token?: string;
  busy: boolean;
  onBusy: (b: boolean) => void;
  onError: (e: string) => void;
  onSubmitted: () => Promise<void>;
}) {
  const isTokenMode = Boolean(token);
  const downloadSuffix = isTokenMode ? `?token=${encodeURIComponent(token || '')}` : '';
  const inlineSuffix = isTokenMode ? `?inline=1&token=${encodeURIComponent(token || '')}` : '?inline=1';

  const draft = useHomeworkDraft(studentId, a, sub);
  const { answer, setAnswer, quizAnswers } = draft;
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const cardRef = useRef<HTMLElement>(null);
  const submitting = useRef(false);
  const [keptAttachments, setKeptAttachments] = useState<SubmissionAttachment[]>(sub?.attachments || []);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [recordedAudio, setRecordedAudio] = useState<File | null>(null);
  const { overdue, revision: needsRevision } = homeworkState(a, sub, todayStr);
  const questions = a.questions || [];
  const answeredCount = questions.filter(q => Number.isInteger(quizAnswers[q.id]) && quizAnswers[q.id] >= 0 && quizAnswers[q.id] < q.options.length).length;

  useEffect(() => {
    if (highlighted) cardRef.current?.scrollIntoView({ block: 'start' });
  }, [highlighted]);

  useEffect(() => {
    if (!pendingFiles.length && !recordedAudio) return;
    const warnAboutFiles = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnAboutFiles);
    return () => window.removeEventListener('beforeunload', warnAboutFiles);
  }, [pendingFiles.length, recordedAudio]);

  async function uploadSingleFile(file: File): Promise<string> {
    const uploadForm = new FormData();
    uploadForm.set('file', file);
    const uploadHeaders: Record<string, string> = isTokenMode
      ? { 'x-student-token': token || '' }
      : { 'x-student-session': '1' };
    const uploadRes = await fetch('/api/files', {
      method: 'POST',
      headers: uploadHeaders,
      body: uploadForm,
    });
    const uploaded = await uploadRes.json();
    if (!uploadRes.ok) throw new Error(uploaded.error || 'Không tải được tệp.');
    return String(uploaded.id);
  }

  return (
    <article ref={cardRef} id={`assignment-${a.id}`} aria-labelledby={`assignment-title-${a.id}`} className={`panel student-assignment ${highlighted ? 'highlighted-assignment' : ''}`}>
      <div className="inline between assignment-meta-row">
        <div className="inline" style={{ gap: 6, flexWrap: 'wrap' }}>
          <span
            className={`badge ${
              needsRevision
                ? 'badge-overdue'
                : sub?.feedback || sub?.status === 'reviewed'
                  ? 'badge-graded'
                  : sub
                    ? 'badge-done'
                    : overdue
                      ? 'badge-overdue'
                      : 'badge-new'
            }`}
          >
            {needsRevision
              ? 'Cô nhắn sửa lại'
              : sub?.feedback || sub?.status === 'reviewed'
                ? '✓ Đã chấm bài'
                : sub
                  ? '✓ Đã nộp bài'
                  : overdue
                    ? 'Quá hạn nộp'
                    : 'Chưa làm'}
          </span>
          {sub?.score && <span className="badge badge-score">Điểm: {sub.score}</span>}
        </div>
        <small className="deadline-pill">
          <Clock size={12} /> Hạn: {formatDateVi(a.deadline)}
        </small>
      </div>

      <h2 id={`assignment-title-${a.id}`}>{a.title}</h2>
      <p className="pre-wrap assignment-instructions">{a.instructions}</p>

      {a.file_id && (
        <a
          className="soft-button assignment-download-btn"
          href={`/api/download/${a.file_id}${downloadSuffix}`}
        >
          <Download size={15} /> Tải tệp đề bài
        </a>
      )}

      {sub?.feedback && (
        <div className={`feedback ${needsRevision ? 'feedback-revision' : ''}`}>
          <strong>
            {needsRevision ? <AlertCircle size={15} /> : <MessageSquareHeart size={15} />}
            {needsRevision ? 'Nhắc sửa bài từ cô An' : 'Lời nhắn từ cô An'}
          </strong>
          <p className="pre-wrap">{sub.feedback}</p>
        </div>
      )}

      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (submitting.current || !draft.ready) return;
          submitting.current = true;
          onBusy(true);
          onError('');
          try {
            const totalCount = keptAttachments.length + pendingFiles.length + (recordedAudio ? 1 : 0);
            if (totalCount > 6) {
              throw new Error('Mỗi bài nộp đính kèm tối đa 6 tệp/ảnh.');
            }
            if (!answer.trim() && totalCount === 0 && answeredCount === 0) {
              throw new Error('Con hãy viết câu trả lời, chọn đáp án hoặc đính kèm bài làm trước khi nộp nhé.');
            }
            if ([...pendingFiles, ...(recordedAudio ? [recordedAudio] : [])].some(file => file.size > 10 * 1024 * 1024)) {
              throw new Error('Mỗi tệp hoặc bản ghi âm tối đa 10 MB. Con chọn tệp nhỏ hơn nhé.');
            }
            const uploadedIds: string[] = [];
            for (const f of pendingFiles) {
              uploadedIds.push(await uploadSingleFile(f));
            }
            if (recordedAudio) {
              uploadedIds.push(await uploadSingleFile(recordedAudio));
            }
            const file_ids = [...keptAttachments.map(att => att.id), ...uploadedIds];

            const submitUrl = isTokenMode ? `/api/student/${token}` : '/api/student/me';
            const submitRes = await fetch(submitUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                assignment_id: a.id,
                answer,
                file_id: file_ids[0] || null,
                file_ids,
                quiz_answers: questions.length > 0 ? quizAnswers : undefined,
              }),
            });
            const submitJson = await submitRes.json();
            if (!submitRes.ok) throw new Error(submitJson.error || 'Không nộp được bài.');

            draft.clearSavedDraft();
            setPendingFiles([]);
            setRecordedAudio(null);
            await onSubmitted();
          } catch (err) {
            onError((err as Error).message);
          } finally {
            submitting.current = false;
            onBusy(false);
          }
        }}
      >
        <fieldset disabled={busy || !draft.ready} aria-label={`Bài làm: ${a.title}`}>
        {questions.length > 0 && (
          <div className="quiz-block">
            <strong className="quiz-heading">Câu hỏi trắc nghiệm ({questions.length} câu)</strong>
            <div className="student-quiz-progress">
              <span>Đã trả lời {answeredCount}/{questions.length} câu</span>
              <progress aria-label="Số câu đã trả lời" value={answeredCount} max={questions.length} />
            </div>
            {questions.map((q, qIdx) => {
              const chosen = quizAnswers[q.id];
              const hasKey = typeof q.correctIndex === 'number';
              return (
                <div key={q.id} className="quiz-question-card">
                  <p className="quiz-prompt">
                    <strong>Câu {qIdx + 1}:</strong> {q.prompt}
                  </p>
                  <div className="quiz-options">
                    {q.options.map((opt, optIdx) => {
                      const isChosen = chosen === optIdx;
                      const isCorrect = hasKey && q.correctIndex === optIdx;
                      const isWrongChosen = hasKey && isChosen && q.correctIndex !== optIdx;
                      return (
                        <button
                          type="button"
                          key={optIdx}
                          className={`quiz-option ${isChosen ? 'selected' : ''} ${isCorrect ? 'correct' : ''} ${isWrongChosen ? 'wrong' : ''}`}
                          aria-pressed={isChosen}
                          onClick={() => draft.setQuizChoice(q.id, optIdx)}
                        >
                          <span className="quiz-letter">{String.fromCharCode(65 + optIdx)}</span>
                          <span>{opt}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <label>
          Bài làm của con
          <textarea
            name="answer"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            rows={4}
            maxLength={10000}
            placeholder="Viết câu trả lời ở đây, hoặc ghi âm / chụp nhiều ảnh vở bên dưới…"
          />
        </label>

        <div className={`homework-draft-status ${draft.status}`}>
          <p role="status">{draft.status === 'unavailable'
            ? 'Trình duyệt chưa lưu được nháp. Con giữ trang này mở và nộp bài trước khi rời trang nhé.'
            : draft.status === 'restored' ? 'Đã khôi phục bản nháp trên thiết bị này. Bản nháp chưa được nộp cho cô.'
              : draft.status === 'saved' ? 'Đã lưu nháp trên thiết bị này · Chưa nộp cho cô.'
                : 'Câu trả lời và lựa chọn trắc nghiệm sẽ tự lưu nháp trên thiết bị này.'}</p>
          <small>Ảnh, tệp và bản ghi âm mới chưa được lưu nháp. Con cần nộp bài trước khi chuyển mục hoặc rời trang để giữ các tệp này.</small>
          {draft.hasDraft && <div className="homework-draft-actions">
            {confirmDiscard ? <>
              <span>{sub ? 'Bỏ thay đổi và quay về bài đã nộp?' : 'Xóa câu trả lời và đáp án đang soạn?'}</span>
              <button type="button" className="soft-button" onClick={() => { draft.discard(); setConfirmDiscard(false); }}>Đồng ý xóa nháp</button>
              <button type="button" className="text-button" onClick={() => setConfirmDiscard(false)}>Giữ lại</button>
            </> : <button type="button" className="text-button" onClick={() => setConfirmDiscard(true)}>Xóa nháp</button>}
          </div>}
        </div>

        {keptAttachments.length > 0 && (
          <div className="attachments-list">
            <small className="attachments-label">Tệp đã đính kèm ({keptAttachments.length})</small>
            {keptAttachments.map(att => {
              const isAudio = att.type.startsWith('audio/');
              const isImage = att.type.startsWith('image/');
              return (
                <div key={att.id} className="attachment-item">
                  <div className="inline between" style={{ width: '100%' }}>
                    <a
                      className="text-button"
                      href={`/api/download/${att.id}${downloadSuffix}`}
                    >
                      <Paperclip size={14} /> {att.name}
                    </a>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Bỏ tệp ${att.name}`}
                      onClick={() => setKeptAttachments(prev => prev.filter(item => item.id !== att.id))}
                    >
                      <X size={14} />
                    </button>
                  </div>
                  {isAudio && (
                    <audio controls preload="metadata" className="audio-preview" src={`/api/download/${att.id}${inlineSuffix}`} />
                  )}
                  {isImage && (
                    <img
                      src={`/api/download/${att.id}${inlineSuffix}`}
                      alt={att.name}
                      className="attachment-thumb"
                      loading="lazy"
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="media-upload-stack">
          <AudioRecorder recordedFile={recordedAudio} onChange={setRecordedAudio} />

          <label className="file-picker-label">
            <span>Chọn nhiều ảnh chụp vở hoặc tệp bài làm (tối đa 6 tệp, 10 MB/tệp)</span>
            <input
              type="file"
              multiple
              accept=".pdf,.docx,.jpg,.jpeg,.png,.webp,.mp3,.wav,.m4a,.webm,.ogg,.txt,image/*,audio/*"
              onChange={(e) => {
                const picked = Array.from(e.target.files || []);
                e.currentTarget.value = '';
                if (picked.some(file => file.size > 10 * 1024 * 1024)) {
                  onError('Mỗi tệp tối đa 10 MB. Con chọn lại tệp nhỏ hơn nhé.');
                } else if (keptAttachments.length + pendingFiles.length + picked.length + (recordedAudio ? 1 : 0) > 6) {
                  onError('Mỗi bài nộp tối đa 6 tệp, kể cả tệp đã nộp và bản ghi âm. Con bỏ bớt tệp trước khi chọn thêm nhé.');
                } else if (picked.length) {
                  onError('');
                  setPendingFiles(prev => [...prev, ...picked]);
                }
              }}
            />
          </label>

          {pendingFiles.length > 0 && (
            <div className="pending-files-list">
              {pendingFiles.map((f, idx) => (
                <div key={`${f.name}-${idx}`} className="pending-file-chip">
                  <span>{f.name}</span>
                  <button
                    type="button"
                    aria-label={`Xóa ${f.name}`}
                    onClick={() => setPendingFiles(prev => prev.filter((_, i) => i !== idx))}
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="submission-actions">
          {sub?.submitted_at && (
            <small className="submitted-time">Đã nộp lúc {formatDateTimeVi(sub.submitted_at)}</small>
          )}
          <button className="primary student-submit-btn" disabled={busy}>
            <Send size={15} />
            {busy ? 'Đang gửi…' : sub ? 'Cập nhật bài làm' : 'Nộp bài cho cô An'}
          </button>
        </div>
        </fieldset>
      </form>
    </article>
  );
}

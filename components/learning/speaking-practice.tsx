'use client';
import { useState } from 'react';
import type {
  LearningData,
  SaveFeature,
  SpeakingTask,
  SpeakingAttempt,
} from '@/lib/growth-types';
import AudioRecorder from '../audio-recorder';
import SpeakButton from './speak-button';
function SpeakingCard({
  task,
  attempts,
  save,
  token,
}: {
  task: SpeakingTask;
  attempts: SpeakingAttempt[];
  save: SaveFeature;
  token?: string;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [uploaded, setUploaded] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  function change(next: File | null) {
    setFile(next);
    setUploaded('');
    setError('');
  }
  async function submit() {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      let id = uploaded;
      if (!id) {
        const form = new FormData();
        form.set('file', file);
        const r = await fetch('/api/files', {
          method: 'POST',
          headers: token
            ? { 'x-student-token': token }
            : { 'x-student-session': '1' },
          body: form,
        });
        const d = await r.json();
        if (!r.ok) throw Error(d.error);
        id = d.id;
        setUploaded(id);
      }
      if (
        await save({ action: 'speaking_submit', task_id: task.id, file_id: id })
      )
        change(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="growth-card">
      <h3>{task.title}</h3>
      <p>
        Hạn nộp {task.deadline} · {attempts.length}/20 lần nộp
      </p>
      <p>{task.prompt}</p>
      {task.sample && (
        <div className="growth-answer">
          <p lang="en">{task.sample}</p>
          <SpeakButton text={task.sample} />
        </div>
      )}
      <p>
        Cô nhận xét theo 3 tiêu chí: phát âm, độ trôi chảy và nội dung (mỗi tiêu
        chí 1–5).
      </p>
      <fieldset
        className="growth-fieldset"
        disabled={busy || attempts.length >= 20}
      >
        <AudioRecorder recordedFile={file} onChange={change} />
        <label>
          Hoặc tải bản ghi âm (tối đa 10 MB)
          <input
            type="file"
            accept="audio/*"
            onChange={(e) => {
              const selected = e.target.files?.[0];
              if (selected) {
                if (selected.size > 10 * 1024 * 1024) {
                  setError('Bản ghi tối đa 10 MB.');
                  return;
                }
                change(selected);
              }
            }}
          />
        </label>
        {file && <p>Đã chọn: {file.name}</p>}
        <button className="primary" disabled={!file} onClick={submit}>
          {busy
            ? 'Đang nộp…'
            : attempts.length
              ? 'Nộp bản sửa mới'
              : 'Nộp bản ghi đầu tiên'}
        </button>
      </fieldset>
      {error && (
        <p role="alert" className="growth-error">
          {error}
        </p>
      )}
      <div className="growth-grid">
        {attempts.map((a, i) => (
          <article className="growth-item" key={a.id}>
            <h4>{i === 0 ? 'Bản đầu' : `Bản sửa ${i}`}</h4>
            <small>{new Date(a.created_at).toLocaleString('vi-VN')}</small>
            <audio
              controls
              preload="none"
              src={`/api/download/${a.file_id}?inline=1${token ? `&token=${encodeURIComponent(token)}` : ''}`}
            />
            {a.pronunciation === null ? (
              <p>Đang chờ cô nhận xét.</p>
            ) : (
              <>
                <p>
                  Phát âm: {a.pronunciation}/5 · Trôi chảy: {a.fluency}/5 · Nội
                  dung: {a.content}/5
                </p>
                <p>{a.feedback}</p>
              </>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
export default function SpeakingPractice({
  data,
  save,
  token,
}: {
  data: LearningData;
  save: SaveFeature;
  token?: string;
}) {
  return (
    <div className="growth-stack">
      {!data.speakingTasks.length && (
        <p className="growth-empty">
          Cô chưa giao bài luyện nói. Bài mới sẽ xuất hiện ở đây.
        </p>
      )}
      {data.speakingTasks.map((task) => (
        <SpeakingCard
          key={task.id}
          task={task}
          attempts={data.speakingAttempts.filter((a) => a.task_id === task.id)}
          save={save}
          token={token}
        />
      ))}
    </div>
  );
}

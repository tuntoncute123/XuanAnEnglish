'use client';
import { useCallback, useEffect, useState } from 'react';
import type { LearningData } from '@/lib/growth-types';
import MistakeNotebook from './learning/mistake-notebook';
import VocabularyPractice from './learning/vocabulary-practice';
import SpeakingPractice from './learning/speaking-practice';

export default function StudentPractice({ token }: { token?: string }) {
  const [data, setData] = useState<LearningData | null>(null);
  const [tab, setTab] = useState('mistakes');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const load = useCallback(async () => {
    const r = await fetch('/api/learning/student', {
      headers: token ? { 'x-student-token': token } : {},
      cache: 'no-store',
    });
    const d = await r.json();
    if (!r.ok) throw Error(d.error);
    setData(d);
  }, [token]);
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);
  async function save(body: unknown) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const r = await fetch('/api/learning/student', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'x-student-token': token } : {}),
        },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      await load();
      setMessage('Đã lưu tiến độ của con.');
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="growth">
      <div className="growth-toolbar">
        <div>
          <h2>{data?.avatar || '🌱'} Góc luyện tập</h2>
          <p>Mỗi ngày một chút, tiến bộ cùng cô.</p>
        </div>
        <button
          className="secondary"
          disabled={busy}
          onClick={() => load().catch((e) => setError(e.message))}
        >
          Cập nhật
        </button>
      </div>
      <div className="growth-tabs">
        {[
          ['mistakes', 'Sổ lỗi sai'],
          ['vocab', 'Từ vựng'],
          ['missions', 'Nhiệm vụ tuần'],
          ['speaking', 'Luyện nói'],
        ].map(([key, label]) => (
          <button
            key={key}
            className={key === tab ? 'active' : ''}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="growth-error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="growth-success">
          {message}
        </p>
      )}
      {!data ? (
        <p>Đang tải góc luyện tập…</p>
      ) : (
        <fieldset className="growth-fieldset" disabled={busy}>
          {tab === 'mistakes' && <MistakeNotebook data={data} save={save} />}
          {tab === 'vocab' && <VocabularyPractice data={data} save={save} />}
          {tab === 'speaking' && (
            <SpeakingPractice data={data} save={save} token={token} />
          )}
          {tab === 'missions' && (
            <div className="growth-stack">
              <section className="growth-card">
                <h3>Nhiệm vụ tuần từ {data.week}</h3>
                <p>
                  Ghi nhận sự cố gắng của con. Huy hiệu đã nhận được giữ lại khi
                  sang tuần mới.
                </p>
                <div className="growth-grid">
                  {data.missions.map((m) => {
                    const claimed = data.rewards.some(
                      (r) => r.week === data.week && r.badge === m.id,
                    );
                    return (
                      <article key={m.id} className="growth-item">
                        <span className="growth-avatar">{m.avatar}</span>
                        <h3>{m.label}</h3>
                        <progress max={m.target} value={m.progress} />
                        <p>
                          {m.progress}/{m.target} ·{' '}
                          {claimed
                            ? 'Đã nhận huy hiệu'
                            : m.completed
                              ? 'Hoàn thành!'
                              : 'Đang thực hiện'}
                        </p>
                        <button
                          className="primary"
                          disabled={!m.completed || claimed}
                          onClick={() =>
                            save({ action: 'claim_reward', badge: m.id })
                          }
                        >
                          {claimed ? 'Đã nhận' : 'Nhận huy hiệu & avatar'}
                        </button>
                      </article>
                    );
                  })}
                </div>
              </section>
              <section className="growth-card">
                <h3>Bộ sưu tập của con</h3>
                <p>{data.rewards.length} huy hiệu đã nhận</p>
                <div className="growth-toolbar">
                  {[
                    '🌱',
                    ...data.missions
                      .filter((m) => data.rewards.some((r) => r.badge === m.id))
                      .map((m) => m.avatar),
                  ].map((avatar) => (
                    <button
                      key={avatar}
                      className={`growth-avatar-button ${data.avatar === avatar ? 'active' : ''}`}
                      aria-label={`Chọn avatar ${avatar}`}
                      aria-pressed={data.avatar === avatar}
                      onClick={() => save({ action: 'avatar', avatar })}
                    >
                      {avatar}
                    </button>
                  ))}
                </div>
                {data.rewards.map((r) => (
                  <p key={`${r.week}-${r.badge}`}>
                    {data.missions.find((m) => m.id === r.badge)?.avatar}{' '}
                    {data.missions.find((m) => m.id === r.badge)?.label} · tuần{' '}
                    {r.week}
                  </p>
                ))}
              </section>
            </div>
          )}
        </fieldset>
      )}
    </section>
  );
}

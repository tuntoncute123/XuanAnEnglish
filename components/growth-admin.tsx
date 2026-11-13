'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Data } from '@/lib/types';
import type { GrowthAdminData } from '@/lib/growth-types';
import BankAdmin from './learning/bank-admin';
import VocabularyAdmin from './learning/vocabulary-admin';
import SpeakingAdmin from './learning/speaking-admin';
import FamilyAdmin from './learning/family-admin';

export default function GrowthAdmin({
  data,
  onRefresh,
}: {
  data: Data;
  onRefresh: () => Promise<void>;
}) {
  const [tab, setTab] = useState('bank');
  const [classId, setClassId] = useState(data.classes[0]?.id || 0);
  const latestClass = useRef(classId);
  latestClass.current = classId;
  const [feature, setFeature] = useState<GrowthAdminData | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const r = await fetch(`/api/learning/admin?class_id=${classId}`, {
      cache: 'no-store',
    });
    const result = await r.json();
    if (!r.ok) throw Error(result.error || 'Không tải được dữ liệu.');
    if (latestClass.current === classId) setFeature(result);
  }, [classId]);
  useEffect(() => {
    setFeature(null);
    load().catch((e) => setError(e.message));
  }, [load]);
  async function save(body: unknown) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const r = await fetch('/api/learning/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await r.json();
      if (!r.ok) throw Error(result.error);
      await Promise.all([load(), onRefresh()]);
      setMessage('Đã lưu thành công.');
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
          <h2>Học tập mở rộng</h2>
          <p>Từ bài làm hôm nay đến tiến bộ mỗi tuần.</p>
        </div>
        <label>
          Lớp đang xem
          <select
            value={classId}
            onChange={(e) => setClassId(Number(e.target.value))}
          >
            {data.classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <button
          className="secondary"
          disabled={busy}
          onClick={() => load().catch((e) => setError(e.message))}
        >
          Cập nhật
        </button>
      </div>
      <div className="growth-tabs" aria-label="Công cụ giáo viên">
        {[
          ['bank', 'Kho câu hỏi & kiến thức'],
          ['vocab', 'Từ vựng'],
          ['speaking', 'Luyện nói'],
          ['family', 'Phụ huynh & học bù'],
        ].map(([key, label]) => (
          <button
            key={key}
            className={tab === key ? 'active' : ''}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {error && (
        <p className="growth-error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="growth-success" role="status">
          {message}
        </p>
      )}
      {!feature ? (
        <p>Đang tải dữ liệu…</p>
      ) : (
        <fieldset disabled={busy} className="growth-fieldset">
          {tab === 'bank' && (
            <BankAdmin
              key={classId}
              data={data}
              feature={feature}
              classId={classId}
              save={save}
            />
          )}
          {tab === 'vocab' && (
            <VocabularyAdmin
              key={classId}
              feature={feature}
              classId={classId}
              save={save}
            />
          )}
          {tab === 'speaking' && (
            <SpeakingAdmin
              key={classId}
              data={data}
              feature={feature}
              classId={classId}
              save={save}
            />
          )}
          {tab === 'family' && (
            <FamilyAdmin
              key={classId}
              data={data}
              feature={feature}
              classId={classId}
              save={save}
            />
          )}
        </fieldset>
      )}
    </section>
  );
}

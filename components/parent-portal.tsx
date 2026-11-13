'use client';
import { useCallback, useEffect, useState } from 'react';
import type { ParentData, ChildSummary, SaveFeature } from '@/lib/growth-types';
import { localDay, weekStart } from '@/lib/growth';

function ChildCard({
  child,
  save,
}: {
  child: ChildSummary;
  save: SaveFeature;
}) {
  const attended = child.attendance.filter((a) =>
    ['present', 'late'].includes(a.status),
  );
  const average = (key: 'focus' | 'homework') =>
    attended.length
      ? (
          attended.reduce((sum, a) => sum + a[key], 0) / attended.length
        ).toFixed(1)
      : '—';
  const change = (key: 'focus' | 'homework') => {
    if (!attended.length || !child.previous?.length)
      return 'Chưa đủ dữ liệu so với tuần trước';
    const delta =
      Number(average(key)) -
      child.previous.reduce((sum, a) => sum + a[key], 0) /
        child.previous.length;
    return `${delta > 0 ? '+' : ''}${delta.toFixed(1)} điểm so với tuần trước`;
  };
  return (
    <article className="growth-card">
      <div className="growth-toolbar">
        <h2>{child.name}</h2>
        <span className="growth-chip">{child.class_name}</span>
      </div>
      <div className="growth-grid growth-metrics">
        <div>
          <strong>
            {attended.length}/{child.attendance.length}
          </strong>
          <span>Buổi có mặt / đã điểm danh</span>
        </div>
        <div>
          <strong>{average('focus')}/5</strong>
          <span>Mức tập trung</span>
          <small>{change('focus')}</small>
        </div>
        <div>
          <strong>{average('homework')}/5</strong>
          <span>Hoàn thành BTVN trên lớp</span>
          <small>{change('homework')}</small>
        </div>
      </div>
      <div className="growth-answer">
        <h3>Lời nhắn từ cô</h3>
        <p>{child.note || 'Tuần này cô chưa gửi lời nhắn riêng.'}</p>
      </div>
      <h3>Bài trong tuần chưa nộp ({child.missing.length})</h3>
      {child.missing.length ? (
        child.missing.map((a) => (
          <p key={a.id}>
            {a.title} · hạn {a.deadline}{' '}
            {a.deadline < localDay() ? '· Quá hạn' : ''}
          </p>
        ))
      ) : (
        <p>Không có bài chưa nộp trong tuần đang xem.</p>
      )}
      <h3>Kết quả và góp ý</h3>
      {!child.submissions.length && (
        <p>Chưa có bài nộp cho các hạn trong tuần này.</p>
      )}
      {child.submissions.map((s, i) => (
        <div className="growth-item" key={i}>
          <strong>{s.title}</strong>
          <p>
            {s.score || 'Chưa có điểm'} ·{' '}
            {s.status === 'needs_revision'
              ? 'Cần sửa lại'
              : s.status === 'reviewed'
                ? 'Đã chấm'
                : 'Đã nộp'}
          </p>
          <p>{s.feedback || 'Đang chờ cô nhận xét.'}</p>
        </div>
      ))}
      {child.speech.length > 0 && (
        <details className="growth-item">
          <summary>
            Tiến độ luyện nói ({child.speech.length} bản ghi trong tuần)
          </summary>
          {child.speech.map((a, i) => (
            <p key={i}>
              <strong>{a.title}</strong> ·{' '}
              {new Date(a.created_at).toLocaleDateString('vi-VN')} ·{' '}
              {a.pronunciation === null
                ? 'Chờ nhận xét'
                : `Phát âm ${a.pronunciation}/5, trôi chảy ${a.fluency}/5, nội dung ${a.content}/5`}
              <br />
              {a.feedback}
            </p>
          ))}
        </details>
      )}
      <details className="growth-item">
        <summary>Lịch sắp tới & xin nghỉ</summary>
        <p>Cô sẽ duyệt yêu cầu và hướng dẫn đăng ký buổi bù còn chỗ.</p>
        <form
          className="growth-stack"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const fd = new FormData(form);
            if (
              await save({
                action: 'request_leave',
                student_id: child.id,
                session_id: Number(fd.get('session')),
                reason: fd.get('reason'),
              })
            )
              form.reset();
          }}
        >
          <label>
            Buổi muốn xin nghỉ
            <select name="session" required>
              <option value="">Chọn buổi học</option>
              {child.sessions
                .filter(
                  (s) =>
                    s.status !== 'cancelled' &&
                    !child.leaves.some((l) => l.session_id === s.id),
                )
                .map((s) => (
                  <option value={s.id} key={s.id}>
                    {s.date} · {s.time} · {s.topic}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Lý do
            <textarea name="reason" required maxLength={1000} />
          </label>
          <button className="primary">Gửi yêu cầu nghỉ</button>
        </form>
        {child.sessions
          .filter((s) => s.status === 'cancelled')
          .map((s) => (
            <p key={s.id}>
              {s.date} · {s.time} · Đã hủy: {s.cancellation_reason}
            </p>
          ))}
      </details>
      <h3>Yêu cầu nghỉ & buổi học bù</h3>
      {!child.leaves.length && <p>Chưa có yêu cầu nghỉ.</p>}
      {child.leaves.map((l) => (
        <section className="growth-item" key={l.id}>
          <strong>
            {l.date} · {l.time} ·{' '}
            {
              {
                pending: 'Chờ cô duyệt',
                approved: 'Đã duyệt',
                rejected: 'Chưa được duyệt',
              }[l.status]
            }
          </strong>
          <p>Lý do: {l.reason}</p>
          {l.response && <p>Cô nhắn: {l.response}</p>}
          {l.makeup_session_id && (
            <p>
              <strong>
                Học bù: {l.makeup_date} · {l.makeup_time} · {l.makeup_class}
              </strong>{' '}
              {l.makeup_status === 'present'
                ? '· Đã có mặt'
                : l.makeup_status === 'absent'
                  ? '· Đã vắng'
                  : ''}
            </p>
          )}
          {l.status === 'approved' && !l.makeup_status && (
            <form
              className="growth-stack"
              onSubmit={(e) => {
                e.preventDefault();
                void save({
                  action: 'book_makeup',
                  student_id: child.id,
                  leave_id: l.id,
                  session_id: Number(
                    new FormData(e.currentTarget).get('session'),
                  ),
                });
              }}
            >
              <label>
                Chọn buổi bù cùng trình độ
                <select name="session" required defaultValue="">
                  <option value="">Chọn buổi còn chỗ</option>
                  {child.slots
                    .filter(
                      (s) => s.date >= l.date && s.id !== l.makeup_session_id,
                    )
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.date} · {s.time} · {s.class_name} · còn {s.available}{' '}
                        chỗ
                      </option>
                    ))}
                </select>
              </label>
              <button className="secondary">
                {l.makeup_session_id
                  ? 'Đổi sang buổi đã chọn'
                  : 'Đăng ký học bù'}
              </button>
              {!child.slots.some(
                (s) => s.date >= l.date && s.id !== l.makeup_session_id,
              ) && <p>Chưa có buổi phù hợp còn chỗ. Cô sẽ bổ sung lịch.</p>}
            </form>
          )}
        </section>
      ))}
    </article>
  );
}
export default function ParentPortal() {
  const [data, setData] = useState<ParentData | null>(null);
  const [state, setState] = useState('loading');
  const [week, setWeek] = useState(weekStart());
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const r = await fetch(`/api/parent?week=${week}`, { cache: 'no-store' });
    if (r.status === 401) {
      setData(null);
      setState('login');
      return;
    }
    const d = await r.json();
    if (!r.ok) throw Error(d.error);
    setData(d);
    setState('ready');
  }, [week]);
  useEffect(() => {
    load().catch((e) => {
      setError(e.message);
      setState('error');
    });
  }, [load]);
  async function save(body: unknown) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const r = await fetch('/api/parent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      await load();
      setMessage('Đã lưu yêu cầu.');
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="parent-shell growth">
      <header className="growth-toolbar">
        <div>
          <a href="/student" className="growth-brand">
            Xuân An English
          </a>
          <h1>Góc phụ huynh</h1>
          <p>
            {data
              ? `Xin chào ${data.parent.name}. Cùng theo dõi hành trình học của các con.`
              : 'Đồng hành cùng con mỗi tuần.'}
          </p>
        </div>
        {data && (
          <button
            className="secondary"
            disabled={busy}
            onClick={() => save({ action: 'logout' })}
          >
            Đăng xuất
          </button>
        )}
      </header>
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
      {state === 'loading' && <p>Đang mở góc phụ huynh…</p>}
      {state === 'error' && (
        <button
          className="primary"
          onClick={() => load().catch((e) => setError(e.message))}
        >
          Thử tải lại
        </button>
      )}
      {state === 'login' && (
        <section className="growth-card parent-login">
          <h2>Đăng nhập phụ huynh</h2>
          <form
            className="growth-stack"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError('');
              const fd = new FormData(e.currentTarget);
              try {
                const r = await fetch('/api/parent/login', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    username: fd.get('username'),
                    password: fd.get('password'),
                  }),
                });
                const d = await r.json();
                if (!r.ok) throw Error(d.error);
                setMessage('');
                await load();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Tên đăng nhập
              <input
                name="username"
                autoComplete="username"
                required
                maxLength={60}
              />
            </label>
            <label>
              Mật khẩu
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                maxLength={100}
              />
            </label>
            <button className="primary" disabled={busy}>
              {busy ? 'Đang đăng nhập…' : 'Đăng nhập'}
            </button>
          </form>
          <p>
            Tài khoản do cô cấp riêng cho phụ huynh. Nếu quên mật khẩu hoặc cần
            thêm con vào tài khoản, vui lòng nhờ cô cập nhật.
          </p>
          <a href="/student">Vào cổng học sinh</a>
        </section>
      )}
      {data && (
        <>
          <div className="growth-toolbar">
            <label>
              Bản tin tuần (thứ Hai – Chủ nhật)
              <input
                type="date"
                value={week}
                onChange={(e) => {
                  if (e.target.value) setWeek(weekStart(e.target.value));
                }}
              />
            </label>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => load().catch((e) => setError(e.message))}
            >
              Cập nhật bản tin
            </button>
          </div>
          <fieldset className="growth-fieldset growth-stack" disabled={busy}>
            {!data.children.length && (
              <p className="growth-empty">
                Tài khoản chưa được liên kết học sinh. Vui lòng nhờ cô kiểm tra.
              </p>
            )}
            {data.children.map((child) => (
              <ChildCard key={child.id} child={child} save={save} />
            ))}
          </fieldset>
        </>
      )}
    </main>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';
import { CalendarDays, RotateCcw, Trash2, X } from 'lucide-react';
import { addDays, firstConflict, moveOccurrences, planSessions, schoolToday, selectOccurrences, weekdays } from '@/lib/schedule';
import type { ScheduleScope, SessionDraft } from '@/lib/schedule';
import type { Data, Session } from '@/lib/types';

type Props = {
  data: Data;
  session?: Session;
  defaultDate: string;
  classId: number;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSave: (body: unknown, message?: string) => Promise<boolean>;
};

const dateLabel = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });

export default function SessionForm({ data, session, defaultDate, classId, busy, error, onClose, onSave }: Props) {
  const [draft, setDraft] = useState<SessionDraft>(() => ({
    class_id: session?.class_id || classId || data.classes[0]?.id || 0,
    date: session?.date || defaultDate,
    time: session?.time || '17:00',
    duration: session?.duration || 90,
    topic: session?.topic || '',
  }));
  const [weekly, setWeekly] = useState(false);
  const [days, setDays] = useState<number[]>([new Date(`${defaultDate}T00:00:00Z`).getUTCDay()]);
  const [until, setUntil] = useState(addDays(defaultDate, 83));
  const [excluded, setExcluded] = useState<string[]>([]);
  const [holiday, setHoliday] = useState('');
  const [scope, setScope] = useState<ScheduleScope>('single');
  const [reason, setReason] = useState('');
  const [localError, setLocalError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const dialog = useRef<HTMLElement>(null);
  const cancelled = session?.status === 'cancelled';
  const recorded = new Set(data.attendance.map(a => a.session_id));
  const targets = session ? selectOccurrences(data.sessions, session, scope, recorded, schoolToday()) : [];
  const protectedSession = Boolean(session && scope === 'single' && recorded.has(session.id));
  const canChange = !busy && !protectedSession && (!session || targets.length > 0);
  const recurrence = weekly ? { weekdays: days, until, exclude_dates: excluded } : undefined;

  let planned: SessionDraft[] = [];
  let previewError = '';
  try {
    if (!draft.date || !draft.time || !draft.duration || (weekly && !until)) throw Error('Hãy điền đầy đủ ngày, giờ và thời lượng.');
    planned = session ? moveOccurrences(targets, session, draft) : planSessions({ ...draft, recurrence });
    if (session) for (const occurrence of planned) planSessions(occurrence);
    if (session && scope === 'following' && planned.some(s => s.date < schoolToday())) throw Error('Không thể dời chuỗi lịch về trước ngày hôm nay.');
  } catch (e) {
    previewError = (e as Error).message;
  }
  const targetIds = new Set(targets.map(s => s.id));
  const conflict = firstConflict(planned, data.sessions.filter(s => !targetIds.has(s.id)));
  if (conflict) previewError = `Trùng lớp ${data.classes.find(c => c.id === conflict.existing.class_id)?.name || ''} · ${dateLabel(conflict.existing.date)} lúc ${conflict.existing.time}.`;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const element = dialog.current;
    const focusables = () => Array.from(element?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)') || []).filter(el => el.offsetParent !== null);
    focusables()[0]?.focus();
    function keydown(event: KeyboardEvent) {
      if (event.key !== 'Tab') return;
      const items = focusables();
      const first = items[0];
      const last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    element?.addEventListener('keydown', keydown);
    return () => {
      element?.removeEventListener('keydown', keydown);
      document.body.style.overflow = previousOverflow;
      previous?.focus();
    };
  }, []);

  async function cancelLesson() {
    if (!session || !canChange) return;
    if (!reason.trim()) { setLocalError('Vui lòng nhập lý do nghỉ/hủy buổi học.'); return; }
    setLocalError('');
    await onSave({ action: 'cancel_session', id: session.id, scope, reason }, `Đã hủy ${targets.length} buổi học`);
  }

  return (
    <div className="modal-backdrop" onKeyDown={e => { if (e.key === 'Escape' && !busy) onClose(); }}>
      <section ref={dialog} className="modal schedule-modal" role="dialog" aria-modal="true" aria-labelledby="schedule-form-title">
        <div className="section-heading">
          <div>
            <h2 id="schedule-form-title">{session ? 'Quản lý buổi học' : 'Thêm lịch học'}</h2>
            <p>{session ? dateLabel(session.date) : 'Lên lịch một buổi hoặc cố định nhiều ngày mỗi tuần'}</p>
          </div>
          <button className="icon-button" disabled={busy} onClick={onClose} aria-label="Đóng"><X size={20} /></button>
        </div>
        {(error || localError) && <p className="error" role="alert">{localError || error}</p>}
        <form onSubmit={async e => {
          e.preventDefault();
          if (!canChange || previewError || cancelled) return;
          setLocalError('');
          await onSave(session ? { action: 'update_session', id: session.id, scope, ...draft } : { action: 'session', ...draft, recurrence },
            session ? `Đã cập nhật ${targets.length} buổi học` : `Đã tạo ${planned.length} buổi học`);
        }}>
          {session?.series_id && !cancelled && <label>
            Phạm vi thay đổi
            <select value={scope} onChange={e => { setScope(e.target.value as ScheduleScope); setDeleting(false); setLocalError(''); }} disabled={busy}>
              <option value="single">Chỉ buổi học này</option>
              <option value="following">Buổi này và các buổi tiếp theo trong chuỗi</option>
            </select>
            {scope === 'following' && <span className="muted">Áp dụng {targets.length} buổi chưa điểm danh từ hôm nay. Giữ lại buổi đã qua, đã điểm danh hoặc đã hủy. Đổi ngày sẽ dịch các buổi cùng số ngày; giờ, thời lượng và nội dung mới áp dụng cho tất cả.</span>}
          </label>}
          {protectedSession && <p className="schedule-notice">Buổi đã điểm danh được giữ nguyên để bảo toàn học phí. Bạn vẫn có thể sửa điểm danh và nhận xét tại mục Điểm danh.</p>}
          {cancelled && <p className="schedule-notice">Đã hủy: {session?.cancellation_reason}. Buổi này không tính vào số buổi học và có thể khôi phục khi không trùng lịch.</p>}
          <fieldset className="schedule-fields" disabled={busy || protectedSession || cancelled}>
            <label>Lớp học
              <select name="class_id" value={draft.class_id} onChange={e => setDraft({ ...draft, class_id: Number(e.target.value) })} required>
                {!data.classes.length && <option value="">Hãy tạo lớp trước</option>}
                {data.classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            {!session && <div className="schedule-mode" role="group" aria-label="Kiểu lịch học">
              <button type="button" aria-pressed={!weekly} className={!weekly ? 'selected' : ''} onClick={() => setWeekly(false)}>Một buổi</button>
              <button type="button" aria-pressed={weekly} className={weekly ? 'selected' : ''} onClick={() => setWeekly(true)}>Cố định hằng tuần</button>
            </div>}
            <div className="form-grid">
              <label>{weekly ? 'Từ ngày' : 'Ngày học'}<input type="date" name="date" value={draft.date} required onChange={e => setDraft({ ...draft, date: e.target.value })} /></label>
              <label>Giờ bắt đầu<input type="time" name="time" value={draft.time} required onChange={e => setDraft({ ...draft, time: e.target.value })} /></label>
            </div>
            <label>Thời lượng (phút)<input type="number" name="duration" min="15" max="480" value={draft.duration || ''} required onChange={e => setDraft({ ...draft, duration: Number(e.target.value) })} /></label>
            {weekly && <>
              <fieldset className="weekday-field"><legend>Học vào các thứ</legend><div className="weekday-options">
                {weekdays.map(d => <label key={d.value} className={days.includes(d.value) ? 'checked' : ''}>
                  <input type="checkbox" checked={days.includes(d.value)} onChange={e => setDays(e.target.checked ? [...days, d.value] : days.filter(x => x !== d.value))} />{d.label}
                </label>)}
              </div></fieldset>
              <label>Đến hết ngày<input type="date" name="until" value={until} min={draft.date} max={draft.date ? addDays(draft.date, 365) : undefined} required onChange={e => setUntil(e.target.value)} /></label>
              <div className="schedule-presets" aria-label="Chọn nhanh thời gian">
                {[4, 8, 12, 24, 52].map(weeks => <button type="button" key={weeks} disabled={!draft.date} onClick={() => setUntil(addDays(draft.date, weeks * 7 - 1))}>{weeks} tuần</button>)}
              </div>
              <div className="schedule-holidays">
                <label htmlFor="holiday-date">Bỏ qua ngày nghỉ (tùy chọn)</label>
                <div className="inline">
                  <input id="holiday-date" type="date" min={draft.date} max={until} value={holiday} onChange={e => setHoliday(e.target.value)} />
                  <button type="button" className="secondary" disabled={!holiday || holiday < draft.date || holiday > until} onClick={() => { setExcluded([...new Set([...excluded, holiday])].sort()); setHoliday(''); }}>Thêm ngày nghỉ</button>
                </div>
                <div className="holiday-chips">{excluded.map(date => <button type="button" key={date} aria-label={`Bỏ ngày nghỉ ${date}`} onClick={() => setExcluded(excluded.filter(d => d !== date))}>{date.split('-').reverse().join('/')} <X size={12} /></button>)}</div>
              </div>
            </>}
            <label>Nội dung buổi học<input name="topic" value={draft.topic} maxLength={300} placeholder="Ví dụ: Unit 5 · Our world" onChange={e => setDraft({ ...draft, topic: e.target.value })} /></label>
          </fieldset>
          {!protectedSession && <div className={`schedule-preview ${previewError ? 'has-error' : ''}`} aria-live="polite">
            {previewError ? <p>{previewError}</p> : <>
              <strong><CalendarDays size={16} /> {planned.length} buổi {session ? 'trong phạm vi thay đổi' : 'sẽ được tạo'}</strong>
              <p>{planned.slice(0, 5).map(s => dateLabel(s.date)).join(' · ')}{planned.length > 5 ? ` … đến ${dateLabel(planned.at(-1)!.date)}` : ''}</p>
            </>}
          </div>}
          {session && !protectedSession && <div className="schedule-actions">
            {cancelled ? <button type="button" className="secondary" disabled={!canChange || Boolean(previewError)} onClick={() => onSave({ action: 'restore_session', id: session.id }, 'Đã khôi phục buổi học')}><RotateCcw size={15} /> Khôi phục buổi học</button> : <>
              <label>Lý do nghỉ/hủy<input value={reason} maxLength={300} placeholder="Ví dụ: Nghỉ lễ, cô bận…" onChange={e => setReason(e.target.value)} /></label>
              <button type="button" className="secondary" disabled={!canChange} onClick={cancelLesson}>Hủy lịch {targets.length} buổi, giữ lý do</button>
            </>}
            {deleting ? <div className="schedule-delete-confirm" role="alert">
              <p>Xóa vĩnh viễn {targets.length} buổi trong phạm vi đã chọn? Nếu nghỉ học, bạn có thể hủy lịch để giữ lại lý do.</p>
              <div className="inline"><button type="button" className="secondary" disabled={busy} onClick={() => setDeleting(false)}>Giữ lại</button>
                <button type="button" className="danger-button" disabled={!canChange} onClick={() => onSave({ action: 'delete_session', id: session.id, scope }, `Đã xóa ${targets.length} buổi học`)}>Xác nhận xóa {targets.length} buổi</button></div>
            </div> : <button type="button" className="text-button danger-text" disabled={!canChange} onClick={() => setDeleting(true)}><Trash2 size={14} /> Xóa vĩnh viễn {targets.length} buổi…</button>}
          </div>}
          <div className="form-footer">
            <button type="button" className="secondary" onClick={onClose} disabled={busy}>Đóng</button>
            {!cancelled && <button className="primary" disabled={!canChange || !draft.class_id || Boolean(previewError) || !planned.length}>{busy ? 'Đang lưu…' : session ? `Cập nhật ${targets.length} buổi` : `Tạo ${planned.length} buổi học`}</button>}
          </div>
        </form>
      </section>
    </div>
  );
}

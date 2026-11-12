'use client';

import { useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Pencil, Plus } from 'lucide-react';
import { addDays, endTime, schoolToday, weekStart } from '@/lib/schedule';
import type { Data, Session } from '@/lib/types';

type Props = {
  data: Data;
  day: string;
  filter: number;
  onDay: (day: string) => void;
  onEdit: (session: Session) => void;
  onAttendance: (session: Session) => void;
  onCreate: () => void;
};

const label = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'UTC' });

export default function ScheduleBoard({ data, day, filter, onDay, onEdit, onAttendance, onCreate }: Props) {
  const [view, setView] = useState<'day' | 'week'>('week');
  const start = view === 'week' ? weekStart(day) : day;
  const dates = Array.from({ length: view === 'week' ? 7 : 1 }, (_, i) => addDays(start, i));
  const visible = data.sessions.filter(s => dates.includes(s.date) && (!filter || s.class_id === filter)).sort((a, b) => a.time.localeCompare(b.time));
  const recorded = new Set(data.attendance.map(a => a.session_id));
  return <section className="panel schedule-panel">
    <div className="section-heading">
      <div><h2>Lịch giảng dạy</h2><p>{label(start)}{view === 'week' ? ` – ${label(dates[6])}` : ''} · {visible.filter(s => s.status !== 'cancelled').length} buổi học</p></div>
      <div className="schedule-mode" role="group" aria-label="Chế độ xem lịch">
        <button type="button" aria-pressed={view === 'day'} className={view === 'day' ? 'selected' : ''} onClick={() => setView('day')}>Ngày</button>
        <button type="button" aria-pressed={view === 'week'} className={view === 'week' ? 'selected' : ''} onClick={() => setView('week')}>Tuần</button>
      </div>
    </div>
    <div className="schedule-navigation">
      <button className="icon-button" aria-label={view === 'week' ? 'Tuần trước' : 'Ngày trước'} onClick={() => onDay(addDays(day, view === 'week' ? -7 : -1))}><ChevronLeft size={18} /></button>
      <label className="sr-only" htmlFor="schedule-date">Chọn ngày xem lịch</label>
      <input id="schedule-date" type="date" value={day} onChange={e => { if (e.target.value) onDay(e.target.value); }} />
      <button className="icon-button" aria-label={view === 'week' ? 'Tuần sau' : 'Ngày sau'} onClick={() => onDay(addDays(day, view === 'week' ? 7 : 1))}><ChevronRight size={18} /></button>
      <button className="secondary" onClick={() => onDay(schoolToday())}>Hôm nay</button>
    </div>
    <div className={view === 'week' ? 'schedule-week' : 'schedule-day-list'}>
      {dates.map(date => <section key={date} className={`schedule-day ${date === schoolToday() ? 'is-today' : ''}`} aria-label={label(date)}>
        <h3>{label(date)}{date === schoolToday() && <span>Hôm nay</span>}</h3>
        {visible.filter(s => s.date === date).map(s => {
          const cls = data.classes.find(c => c.id === s.class_id);
          const cancelled = s.status === 'cancelled';
          return <article key={s.id} className={`calendar-lesson ${cls?.color || 'green'} ${cancelled ? 'is-cancelled' : ''}`}>
            <p className="calendar-time">{s.time} – {endTime(s.time, s.duration)}</p>
            <strong>{cls?.name}</strong>
            <p className="calendar-topic">{s.topic || 'Buổi học tiếng Anh'}</p>
            <span className="calendar-status">{cancelled ? 'Đã hủy' : recorded.has(s.id) ? 'Đã điểm danh' : 'Chưa điểm danh'}{s.series_id && !cancelled ? ' · Lịch cố định' : ''}</span>
            {cancelled && <p className="calendar-reason">{s.cancellation_reason}</p>}
            <div className="calendar-actions">
              <button type="button" onClick={() => onEdit(s)} aria-label={`Quản lý ${cls?.name} ${date} ${s.time}`}><Pencil size={13} /> Quản lý</button>
              {!cancelled && <button type="button" onClick={() => onAttendance(s)}>Điểm danh</button>}
            </div>
          </article>;
        })}
        {!visible.some(s => s.date === date) && <button className="calendar-empty" onClick={() => { onDay(date); onCreate(); }}><Plus size={15} /> Thêm buổi học</button>}
      </section>)}
    </div>
    <div className="panel-footer"><CalendarDays size={14} /> Giờ Việt Nam · Buổi đã hủy vẫn hiển thị lý do và không tính vào tổng số buổi.</div>
  </section>;
}

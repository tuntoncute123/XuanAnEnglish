'use client';

import { ArrowRight, CalendarDays } from 'lucide-react';
import { nextStudentSession, type homeworkStats, type HomeworkFilter } from '@/lib/student-learning';
import type { StudentSessionItem } from '@/lib/types';

export default function StudentLearningOverview({ stats, sessions, now, onFilter, onSchedule }: {
  stats: ReturnType<typeof homeworkStats>;
  sessions: StudentSessionItem[];
  now: Date;
  onFilter: (filter: HomeworkFilter) => void;
  onSchedule: () => void;
}) {
  const next = nextStudentSession(sessions, now);
  const percent = stats.total ? Math.round(stats.submitted / stats.total * 100) : 0;
  return (
    <section className="learning-overview" aria-label="Tổng quan học tập">
      <div className="learning-summary">
        <div className="inline between">
          <strong>Tiến độ nộp bài</strong>
          <span>{stats.submitted}/{stats.total} bài · {percent}%</span>
        </div>
        <progress aria-label="Tiến độ nộp bài" value={stats.submitted} max={stats.total || 1} />
        <p>{stats.total === 0 ? 'Cô An sẽ gửi bài tập tại đây.' : stats.pending === 0
          ? 'Con đã nộp đủ bài. Hãy xem lại nhận xét của cô nhé!'
          : stats.dueToday > 0 ? `Có ${stats.dueToday} bài đến hạn hôm nay. Con nhớ nộp trước khi hết ngày nhé!`
            : `Còn ${stats.pending} bài cần hoàn thành, gồm cả bài cô nhắn sửa lại.`}</p>
      </div>
      <div className="learning-metrics">
        {([
          ['pending', 'Cần làm', stats.pending],
          ['overdue', 'Quá hạn', stats.overdue],
          ['revision', 'Cần sửa lại', stats.revision],
          ['reviewed', 'Đã nhận xét', stats.reviewed],
        ] as const).map(([filter, label, count]) => (
          <button type="button" key={filter} onClick={() => onFilter(filter)} className={`learning-metric ${filter}`}>
            <strong>{count}</strong><span>{label}</span>
          </button>
        ))}
      </div>
      <button className="learning-next-session" type="button" onClick={onSchedule}>
        <CalendarDays size={22} aria-hidden="true" />
        <span>
          <strong>{next ? next.ongoing ? 'Buổi học đang diễn ra' : 'Buổi học tiếp theo' : 'Lịch học của con'}</strong>
          {next ? <>
            <span>{new Date(`${next.session.date}T12:00:00+07:00`).toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', timeZone: 'Asia/Bangkok' })} · {next.session.time.slice(0, 5)} · {next.session.duration} phút</span>
            <small>{next.session.topic || 'Học tiếng Anh cùng cô An'}</small>
          </> : <span>Chưa có buổi học sắp tới. Xem lịch và nhận xét các buổi trước.</span>}
        </span>
        <ArrowRight size={18} aria-hidden="true" />
      </button>
    </section>
  );
}

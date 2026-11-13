import { addDays, daysBetween, moveOccurrences, planSessions, ScheduleError, selectOccurrences } from './schedule.ts';
import type { Recurrence, ScheduleScope, SessionDraft } from './schedule.ts';
import type { Session } from './types.ts';

export type SessionUpdate = SessionDraft & { recurrence?: Recurrence | null };

/** Infer editable defaults from stored occurrences, including gaps left by holidays. */
export function recurrenceDefaults(sessions: Session[], anchor: Session): Recurrence {
  const remaining = anchor.series_id ? sessions.filter(s => s.series_id === anchor.series_id && s.date >= anchor.date) : [anchor];
  const active = remaining.filter(s => s.status !== 'cancelled');
  const weekdays = [...new Set((active.length ? active : [anchor]).map(s => new Date(`${s.date}T00:00:00Z`).getUTCDay()))];
  const last = remaining.map(s => s.date).sort().at(-1) || anchor.date;
  const until = anchor.series_id ? last : addDays(anchor.date, 83);
  const dates = new Set(active.map(s => s.date));
  const exclude_dates = anchor.series_id ? Array.from({ length: daysBetween(anchor.date, until) + 1 }, (_, i) => addDays(anchor.date, i))
    .filter(date => weekdays.includes(new Date(`${date}T00:00:00Z`).getUTCDay()) && !dates.has(date)) : [];
  return { weekdays, until, exclude_dates };
}

/** Shared by the form preview and the transactional writer. */
export function planScheduleEdit(sessions: Session[], anchor: Session, scope: ScheduleScope,
  recorded: Set<number>, today: string, update: SessionUpdate) {
  const targets = selectOccurrences(sessions, anchor, scope, recorded, today);
  if (!targets.length) throw new ScheduleError('Không còn buổi học chưa điểm danh nào từ mốc này để thay đổi.');
  if (targets.some(s => recorded.has(s.id))) throw new ScheduleError('Buổi học đã điểm danh được giữ lại để bảo toàn học phí và nhận xét. Chỉ thay đổi các buổi chưa điểm danh.');
  if (targets.some(s => s.status === 'cancelled')) throw new ScheduleError('Hãy khôi phục buổi đã hủy trước khi đổi lịch.');
  const rebuild = update.recurrence !== undefined;
  let planned = rebuild ? planSessions({ ...update, recurrence: update.recurrence || undefined }) : moveOccurrences(targets, anchor, update);
  for (const draft of planned) planSessions(draft);
  if ((scope === 'following' || update.recurrence) && planned.some(s => s.date < today)) {
    throw new ScheduleError('Không thể tạo hoặc dời chuỗi lịch về trước ngày hôm nay. Hãy chọn ngày bắt đầu từ hôm nay.');
  }
  // Never recreate a cancelled or recorded occurrence while rebuilding its series.
  const ids = new Set(targets.map(s => s.id));
  const protectedDates = new Set(anchor.series_id ? sessions.filter(s => s.series_id === anchor.series_id && !ids.has(s.id)
    && (s.status === 'cancelled' || recorded.has(s.id))).map(s => s.date) : []);
  const skipped = update.recurrence ? planned.filter(s => protectedDates.has(s.date)).length : 0;
  if (update.recurrence) planned = planned.filter(s => !protectedDates.has(s.date));
  if (!planned.length) throw new ScheduleError('Không còn buổi mới để lưu. Các ngày đã chọn đều đã hủy hoặc đã điểm danh.');
  return { targets, planned, skipped };
}

/** Keep IDs for retained dates and reuse the anchor for the first newly selected date. */
export function reconcileOccurrences(targets: Session[], anchor: Session, planned: SessionDraft[]) {
  const used = new Set<number>();
  const writes = planned.map(draft => {
    const existing = targets.find(s => !used.has(s.id) && s.date === draft.date && s.time === draft.time)
      || targets.find(s => !used.has(s.id) && s.date === draft.date);
    if (existing) used.add(existing.id);
    return { draft, id: existing?.id };
  });
  const firstNew = writes.find(w => w.id === undefined);
  if (firstNew && !used.has(anchor.id) && targets.some(s => s.id === anchor.id)) {
    firstNew.id = anchor.id;
    used.add(anchor.id);
  }
  return { writes, removed: targets.filter(s => !used.has(s.id)).map(s => s.id) };
}

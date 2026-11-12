import type { Session } from './types.ts';

export const weekdays = [
  { value: 1, label: 'Thứ 2' }, { value: 2, label: 'Thứ 3' },
  { value: 3, label: 'Thứ 4' }, { value: 4, label: 'Thứ 5' },
  { value: 5, label: 'Thứ 6' }, { value: 6, label: 'Thứ 7' },
  { value: 0, label: 'CN' },
] as const;

export type Recurrence = { weekdays: number[]; until: string; exclude_dates: string[] };
export type ScheduleScope = 'single' | 'following';
export type SessionDraft = Pick<Session, 'class_id' | 'date' | 'time' | 'duration' | 'topic'>;
export type CreateSessionInput = SessionDraft & { repeat_weeks?: number; recurrence?: Recurrence };

export class ScheduleError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'ScheduleError';
    this.status = status;
  }
}

export function schoolToday() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
}

export function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

export function weekStart(date: string) {
  return addDays(date, -((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7));
}

export function minutes(time: string) {
  const [hours, mins] = time.split(':').map(Number);
  return hours * 60 + mins;
}

export function endTime(time: string, duration: number) {
  const total = minutes(time) + duration;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export function planSessions(input: CreateSessionInput): SessionDraft[] {
  if (minutes(input.time) + input.duration > 1440) {
    throw new ScheduleError('Buổi học phải kết thúc trong ngày. Vui lòng giảm thời lượng hoặc đổi giờ bắt đầu.');
  }
  const { recurrence } = input;
  let dates: string[];
  if (recurrence) {
    const span = daysBetween(input.date, recurrence.until);
    if (!Number.isFinite(span) || span < 0 || span > 365) {
      throw new ScheduleError('Ngày kết thúc phải từ ngày bắt đầu đến tối đa 365 ngày sau.');
    }
    if (!recurrence.weekdays.length || recurrence.weekdays.some(d => !Number.isInteger(d) || d < 0 || d > 6)) {
      throw new ScheduleError('Hãy chọn ít nhất một thứ trong tuần.');
    }
    const excluded = new Set(recurrence.exclude_dates);
    if ([...excluded].some(d => d < input.date || d > recurrence.until)) {
      throw new ScheduleError('Ngày nghỉ phải nằm trong khoảng lịch đã chọn.');
    }
    dates = Array.from({ length: span + 1 }, (_, i) => addDays(input.date, i)).filter(date =>
      recurrence.weekdays.includes(new Date(`${date}T00:00:00Z`).getUTCDay()) && !excluded.has(date),
    );
  } else {
    const repeat = input.repeat_weeks ?? 1;
    if (!Number.isInteger(repeat) || repeat < 1 || repeat > 52) throw new ScheduleError('Số tuần phải từ 1 đến 52.');
    dates = Array.from({ length: repeat }, (_, i) => addDays(input.date, i * 7));
  }
  if (!dates.length) throw new ScheduleError('Khoảng ngày và ngày nghỉ đã chọn không còn buổi học nào.');
  return dates.map(date => ({ date, class_id: input.class_id, time: input.time, duration: input.duration, topic: input.topic }));
}

export function firstConflict(planned: SessionDraft[], existing: Session[]) {
  const occupied: (Session | SessionDraft)[] = existing.filter(s => s.status !== 'cancelled');
  for (const candidate of planned) {
    const start = minutes(candidate.time);
    const match = occupied.find(s => s.date === candidate.date && start < minutes(s.time) + s.duration && minutes(s.time) < start + candidate.duration);
    if (match) return { candidate, existing: match };
    occupied.push(candidate);
  }
  return null;
}

/** Following includes the anchor and later planned occurrences; recorded and past lessons stay intact. */
export function selectOccurrences(sessions: Session[], anchor: Session, scope: ScheduleScope, recorded: Set<number>, today: string) {
  if (scope === 'single') return [anchor];
  if (!anchor.series_id) throw new ScheduleError('Buổi học này không thuộc chuỗi lịch.');
  return sessions.filter(s => s.series_id === anchor.series_id && s.status !== 'cancelled' && !recorded.has(s.id)
    && s.date >= today && (s.date > anchor.date || (s.date === anchor.date && s.time >= anchor.time)));
}

export function moveOccurrences(targets: Session[], anchor: Session, update: SessionDraft): SessionDraft[] {
  const delta = daysBetween(anchor.date, update.date);
  return targets.map(s => ({ ...update, date: addDays(s.date, delta) }));
}

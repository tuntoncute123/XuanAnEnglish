import { randomUUID } from 'node:crypto';
import { transaction } from './db';
import { firstConflict, moveOccurrences, planSessions, ScheduleError, schoolToday, selectOccurrences } from './schedule';
import type { CreateSessionInput, ScheduleScope, SessionDraft } from './schedule';
import type { Session } from './types';

type Client = Parameters<Parameters<typeof transaction>[0]>[0];
type Change =
  | ({ action: 'update_session'; id: number; scope: ScheduleScope } & SessionDraft)
  | { action: 'delete_session'; id: number; scope: ScheduleScope }
  | { action: 'cancel_session'; id: number; scope: ScheduleScope; reason: string }
  | { action: 'restore_session'; id: number };

// A single teacher cannot teach two classes at once. Serialize schedule and attendance writes.
export async function lockSchedule(client: Client) {
  await client.run('SELECT pg_advisory_xact_lock(823761427)');
}

async function assertAvailable(client: Client, drafts: SessionDraft[], ignored: number[] = []) {
  for (const draft of drafts) planSessions(draft);
  const sessions = (await client.run('SELECT * FROM sessions WHERE NOT (id = ANY(?::int[]))', ignored)).rows as Session[];
  const conflict = firstConflict(drafts, sessions);
  if (conflict) {
    const classRow = (await client.run('SELECT name FROM classes WHERE id=?', conflict.existing.class_id)).rows[0];
    throw new ScheduleError(
      `Trùng lịch với lớp ${classRow?.name || conflict.existing.class_id} ngày ${conflict.existing.date.split('-').reverse().join('/')} lúc ${conflict.existing.time}. Vui lòng chọn giờ khác hoặc loại ngày này khỏi lịch.`,
      409,
    );
  }
}

export async function createScheduledSessions(input: CreateSessionInput) {
  const drafts = planSessions(input);
  const seriesId = input.recurrence || (input.repeat_weeks ?? 1) > 1 ? randomUUID() : null;
  await transaction(async client => {
    await lockSchedule(client);
    await assertAvailable(client, drafts);
    for (const draft of drafts) {
      await client.run(
        'INSERT INTO sessions(class_id,date,time,duration,topic,series_id) VALUES(?,?,?,?,?,?)',
        draft.class_id, draft.date, draft.time, draft.duration, draft.topic, seriesId,
      );
    }
  });
}

export async function changeScheduledSessions(change: Change) {
  await transaction(async client => {
    await lockSchedule(client);
    const sessions = (await client.run('SELECT * FROM sessions')).rows as Session[];
    const anchor = sessions.find(s => s.id === change.id);
    if (!anchor) throw new ScheduleError('Buổi học không còn tồn tại. Hãy tải lại lịch.', 404);
    const recorded = new Set<number>((await client.run('SELECT DISTINCT session_id FROM attendance')).rows.map(r => Number(r.session_id)));
    const scope = change.action === 'restore_session' ? 'single' : change.scope;
    const targets = selectOccurrences(sessions, anchor, scope, recorded, schoolToday());
    if (!targets.length) throw new ScheduleError('Không còn buổi học chưa điểm danh nào từ mốc này để thay đổi.');
    if (targets.some(s => recorded.has(s.id))) {
      throw new ScheduleError('Buổi học đã điểm danh được giữ lại để bảo toàn học phí và nhận xét. Chỉ thay đổi các buổi chưa điểm danh.');
    }
    const ids = targets.map(s => s.id);

    if (change.action === 'update_session') {
      if (targets.some(s => s.status === 'cancelled')) throw new ScheduleError('Hãy khôi phục buổi đã hủy trước khi đổi lịch.');
      const drafts = moveOccurrences(targets, anchor, change);
      if (scope === 'following' && drafts.some(s => s.date < schoolToday())) {
        throw new ScheduleError('Không thể dời chuỗi lịch về trước ngày hôm nay.');
      }
      await assertAvailable(client, drafts, ids);
      for (let i = 0; i < targets.length; i++) {
        const s = drafts[i];
        await client.run('UPDATE sessions SET class_id=?,date=?,time=?,duration=?,topic=? WHERE id=?', s.class_id, s.date, s.time, s.duration, s.topic, targets[i].id);
      }
    } else if (change.action === 'cancel_session') {
      await client.run("UPDATE sessions SET status='cancelled', cancellation_reason=? WHERE id = ANY(?::int[])", change.reason, ids);
    } else if (change.action === 'restore_session') {
      if (anchor.status !== 'cancelled') throw new ScheduleError('Buổi học này đang diễn ra theo lịch.');
      await assertAvailable(client, [anchor], ids);
      await client.run("UPDATE sessions SET status='scheduled', cancellation_reason='' WHERE id=?", anchor.id);
    } else {
      await client.run('DELETE FROM sessions WHERE id = ANY(?::int[])', ids);
    }
  });
}

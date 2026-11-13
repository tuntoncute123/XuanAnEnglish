import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, daysBetween, endTime, firstConflict, moveOccurrences, planSessions, selectOccurrences, weekStart } from '../lib/schedule.ts';
import { actionSchema } from '../lib/schemas.ts';
import { monthlyReport } from '../lib/report.ts';
import { managementValidationError } from '../lib/manage-api.ts';
import type { Data, Session } from '../lib/types.ts';

const draft = { class_id: 1, date: '2028-02-21', time: '17:00', duration: 90, topic: 'Family' };
const session = (id: number, date: string, more: Partial<Session> = {}): Session => ({ ...draft, id, date, series_id: 'weekly', status: 'scheduled', ...more });

test('reported class-only edit accepts a blank topic and keeps the Sunday 15:00 slot', () => {
  const before = session(7, '2026-11-15', { time: '15:00', topic: '' });
  const update = actionSchema.parse({ action: 'update_session', id: before.id, scope: 'single',
    class_id: 2, date: before.date, time: before.time, duration: 90, topic: '' });
  assert.equal(update.action, 'update_session');
  if (update.action !== 'update_session') return;
  const targets = selectOccurrences([before, session(8, '2026-11-22')], before, update.scope, new Set(), '2026-11-13');
  const moved = moveOccurrences(targets, before, update);
  assert.equal(moved.length, 1);
  assert.equal(moved[0].class_id, 2);
  assert.equal(moved[0].date, '2026-11-15');
  assert.equal(moved[0].time, '15:00');
  assert.equal(before.class_id, 1);
});

test('weekly Sunday requests retain recurrence through API validation and include next week', () => {
  const request = actionSchema.parse({ action: 'session', class_id: 2, date: '2026-11-15', time: '15:00',
    duration: 90, topic: '', recurrence: { weekdays: [0], until: '2026-12-06', exclude_dates: [] } });
  assert.equal(request.action, 'session');
  if (request.action !== 'session') return;
  assert.deepEqual(planSessions(request).map(s => s.date), ['2026-11-15', '2026-11-22', '2026-11-29', '2026-12-06']);
});

test('invalid schedule fields are identified in Vietnamese, including indexed recurrence dates', () => {
  const result = actionSchema.safeParse({ action: 'session', ...draft, time: '25:00', duration: 0,
    recurrence: { weekdays: [7], until: '2028-02-30', exclude_dates: ['not-a-date'] } });
  assert.equal(result.success, false);
  if (result.success) return;
  const error = managementValidationError(result.error);
  assert.equal(error.code, 'INVALID_INPUT');
  for (const field of ['giờ bắt đầu', 'thời lượng', 'các thứ trong tuần', 'ngày kết thúc', 'ngày nghỉ']) {
    assert.ok(error.error.includes(field), error.error);
  }
});

test('multiple weekdays include the end date, cross leap day, and skip holidays', () => {
  const planned = planSessions({ ...draft, recurrence: { weekdays: [1, 4], until: '2028-03-02', exclude_dates: ['2028-02-24'] } });
  assert.deepEqual(planned.map(s => s.date), ['2028-02-21', '2028-02-28', '2028-03-02']);
  assert.ok(planned.every(s => s.time === '17:00' && s.duration === 90 && s.class_id === 1));
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(addDays('2028-12-31', 1), '2029-01-01');
  assert.equal(weekStart('2028-03-05'), '2028-02-28');
  assert.equal(daysBetween('2028-02-28', '2028-03-01'), 2);
});

test('single and legacy weekly requests remain supported up to 52 weeks', () => {
  assert.equal(planSessions(draft).length, 1);
  assert.deepEqual(planSessions({ ...draft, repeat_weeks: 4 }).map(s => s.date), ['2028-02-21', '2028-02-28', '2028-03-06', '2028-03-13']);
  assert.equal(planSessions({ ...draft, repeat_weeks: 52 }).length, 52);
  assert.equal(actionSchema.safeParse({ action: 'session', ...draft, repeat_weeks: 52 }).success, true);
  assert.equal(actionSchema.safeParse({ action: 'session', ...draft, repeat_weeks: 53 }).success, false);
});

test('empty, reversed, unbounded and invalid recurrence requests are rejected', () => {
  const recurrence = { weekdays: [1], until: '2028-03-01', exclude_dates: [] as string[] };
  for (const changes of [
    { weekdays: [] }, { weekdays: [7] }, { until: '2028-02-20' }, { until: '2030-02-21' },
    { exclude_dates: ['2028-02-21', '2028-02-28'] }, { exclude_dates: ['2028-03-02'] },
  ]) assert.throws(() => planSessions({ ...draft, recurrence: { ...recurrence, ...changes } }));
  assert.equal(actionSchema.safeParse({ action: 'session', ...draft, recurrence: { ...recurrence, weekdays: [1, 1] } }).success, false);
  assert.equal(actionSchema.safeParse({ action: 'session', ...draft, recurrence: { ...recurrence, until: '2028-02-30' } }).success, false);
});

test('all overlapping classes are blocked; adjacent, cancelled and different-day lessons are allowed', () => {
  const occupied = [session(1, draft.date, { class_id: 2 })];
  for (const [time, duration] of [['16:00', 90], ['17:00', 90], ['17:30', 30], ['18:00', 60], ['16:00', 180]] as const) {
    assert.ok(firstConflict([{ ...draft, time, duration }], occupied), time);
  }
  assert.equal(firstConflict([{ ...draft, time: '18:30' }], occupied), null);
  assert.equal(firstConflict([{ ...draft, time: '15:30' }], occupied), null);
  assert.equal(firstConflict([draft], [{ ...occupied[0], status: 'cancelled' }]), null);
  assert.equal(firstConflict([{ ...draft, date: '2028-02-22' }], occupied), null);
  assert.ok(firstConflict([draft, { ...draft, time: '17:15' }], []));
});

test('lessons cannot cross midnight, including recurring occurrences', () => {
  assert.throws(() => planSessions({ ...draft, time: '23:00', duration: 90 }), /kết thúc trong ngày/);
  assert.equal(planSessions({ ...draft, time: '23:00', duration: 60 }).length, 1);
  assert.equal(endTime('17:00', 90), '18:30');
  assert.equal(endTime('23:00', 60), '24:00');
});

test('following edits preserve historical, recorded, cancelled, earlier and unrelated sessions', () => {
  const all = [session(1, '2028-02-14'), session(2, '2028-02-21'), session(3, '2028-02-24'), session(4, '2028-02-28'),
    session(5, '2028-03-02', { status: 'cancelled' }), session(6, '2028-03-06', { series_id: 'different' }),
    session(7, '2028-03-09', { series_id: null }), session(8, '2028-03-13')];
  const result = selectOccurrences(all, all[1], 'following', new Set([4]), '2028-02-20');
  assert.deepEqual(result.map(s => s.id), [2, 3, 8]);
  const shifted = moveOccurrences(result, all[1], { ...draft, date: '2028-02-22', time: '18:00' });
  assert.deepEqual(shifted.map(s => s.date), ['2028-02-22', '2028-02-25', '2028-03-14']);
  assert.ok(shifted.every(s => s.time === '18:00'));
  assert.equal(all[1].date, '2028-02-21');
  assert.deepEqual(selectOccurrences(all, all[0], 'following', new Set(), '2028-03-10').map(s => s.id), [8]);
  assert.throws(() => selectOccurrences(all, all[6], 'following', new Set(), draft.date), /không thuộc chuỗi/);
});

test('single edits target exactly one lesson and mutations validate scope and reason', () => {
  const all = [session(1, draft.date), session(2, '2028-02-28')];
  assert.deepEqual(selectOccurrences(all, all[0], 'single', new Set(), draft.date).map(s => s.id), [1]);
  assert.equal(actionSchema.safeParse({ action: 'cancel_session', id: 1, reason: '  ' }).success, false);
  assert.equal(actionSchema.safeParse({ action: 'cancel_session', id: 1, reason: 'Nghỉ lễ', scope: 'following' }).success, true);
  assert.equal(actionSchema.safeParse({ action: 'delete_session', id: 1, scope: 'all' }).success, false);
  const parsed = actionSchema.parse({ action: 'delete_session', id: 1 });
  assert.equal(parsed.action === 'delete_session' && parsed.scope, 'single');
});

test('cancelled lessons are excluded from monthly counts and tuition even with stale attendance', () => {
  const student = { id: 1, class_id: 1, name: 'An', parent: '', phone: '', token: 'test' };
  const data: Data = {
    classes: [{ id: 1, name: 'A1', fee: 150000, level: 'A1', color: 'green' }], students: [student],
    sessions: [session(1, draft.date), session(2, '2028-02-24', { status: 'cancelled' })],
    attendance: [1, 2].map(session_id => ({ session_id, student_id: 1, status: 'present', focus: 4, homework: 5, note: '' })),
    assignments: [], submissions: [], payments: [], templates: [],
  };
  const report = monthlyReport(data, student, '2028-02');
  assert.equal(report.sessions, 1);
  assert.equal(report.recorded, 1);
  assert.equal(report.due, 150000);
});

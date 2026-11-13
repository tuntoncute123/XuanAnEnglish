import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planScheduleEdit, reconcileOccurrences, recurrenceDefaults } from '../lib/schedule-edit.ts';
import { actionSchema } from '../lib/schemas.ts';
import type { Session } from '../lib/types.ts';

const draft = { class_id: 1, date: '2028-02-21', time: '17:00', duration: 90, topic: '' };
const today = '2028-02-20';
const lesson = (id: number, date: string, more: Partial<Session> = {}): Session => ({ ...draft, id, date, series_id: 'chain', status: 'scheduled', ...more });
const recurrence = { weekdays: [1, 4], until: '2028-03-05', exclude_dates: ['2028-02-24'] };

test('edit API preserves recurrence and accepts explicit conversion back to one lesson', () => {
  for (const value of [undefined, null, recurrence]) {
    const body = actionSchema.parse({ action: 'update_session', id: 1, ...draft, recurrence: value });
    assert.ok(body.action === 'update_session');
    assert.deepEqual(body.recurrence, value);
  }
  for (const value of [{ ...recurrence, weekdays: [] }, { ...recurrence, weekdays: [1, 1] }, { ...recurrence, until: '2028-02-30' }]) {
    assert.equal(actionSchema.safeParse({ action: 'update_session', id: 1, ...draft, recurrence: value }).success, false);
  }
});

test('one lesson becomes a weekly schedule with changed class, time, duration, topic and holidays', () => {
  const anchor = lesson(1, draft.date, { series_id: null });
  const update = { ...draft, class_id: 2, time: '18:30', duration: 60, topic: 'New topic', recurrence };
  const { targets, planned } = planScheduleEdit([anchor], anchor, 'single', new Set(), today, update);
  assert.deepEqual(planned.map(s => s.date), ['2028-02-21', '2028-02-28', '2028-03-02']);
  assert.ok(planned.every(s => s.class_id === 2 && s.time === '18:30' && s.duration === 60 && s.topic === 'New topic'));
  const result = reconcileOccurrences(targets, anchor, planned);
  assert.deepEqual(result.writes.map(w => w.id), [1, undefined, undefined]);
  assert.deepEqual(result.removed, []);
});

test('changing weekdays and shortening a series removes obsolete slots and keeps IDs for retained dates', () => {
  const all = [lesson(1, draft.date), lesson(2, '2028-02-24'), lesson(3, '2028-02-28'), lesson(4, '2028-03-02'), lesson(5, '2028-03-06')];
  const { targets, planned } = planScheduleEdit(all, all[0], 'following', new Set(), today,
    { ...draft, recurrence: { weekdays: [1, 3], until: '2028-02-29', exclude_dates: [] } });
  const result = reconcileOccurrences(targets, all[0], planned);
  assert.deepEqual(planned.map(s => s.date), ['2028-02-21', '2028-02-23', '2028-02-28']);
  assert.deepEqual(result.writes.map(w => w.id), [1, undefined, 3]);
  assert.deepEqual(result.removed, [2, 4, 5]);
});

test('rebuilding preserves history, recorded lessons and cancellations without recreating them', () => {
  const all = [lesson(1, '2028-02-14'), lesson(2, draft.date), lesson(3, '2028-02-28'), lesson(4, '2028-03-06', { status: 'cancelled' }), lesson(5, '2028-03-13')];
  const plan = planScheduleEdit(all, all[1], 'following', new Set([3]), today,
    { ...draft, recurrence: { weekdays: [1], until: '2028-03-20', exclude_dates: [] } });
  assert.deepEqual(plan.targets.map(s => s.id), [2, 5]);
  assert.deepEqual(plan.planned.map(s => s.date), ['2028-02-21', '2028-03-13', '2028-03-20']);
  assert.equal(plan.skipped, 2);
  assert.throws(() => planScheduleEdit(all, all[2], 'single', new Set([3]), today, { ...draft, recurrence }), /điểm danh/);
  assert.throws(() => planScheduleEdit(all, all[3], 'single', new Set(), today, { ...draft, recurrence }), /khôi phục/);
});

test('explicit single mode collapses only the selected editable scope; omitted recurrence preserves all dates', () => {
  const all = [lesson(1, draft.date), lesson(2, '2028-02-28'), lesson(3, '2028-03-06')];
  const keep = planScheduleEdit(all, all[0], 'following', new Set(), today, { ...draft, time: '19:00' });
  assert.deepEqual(keep.planned.map(s => s.date), all.map(s => s.date));
  const single = planScheduleEdit(all, all[0], 'following', new Set(), today, { ...draft, recurrence: null });
  assert.equal(single.planned.length, 1);
  assert.deepEqual(reconcileOccurrences(single.targets, all[0], single.planned).removed, [2, 3]);
  const detached = planScheduleEdit(all, all[1], 'single', new Set(), today, { ...draft, date: all[1].date, recurrence: null });
  assert.deepEqual(detached.targets.map(s => s.id), [2]);
});

test('defaults derive weekdays, end date and missing holidays from stored series', () => {
  const anchor = lesson(1, draft.date);
  const all = [anchor, lesson(2, '2028-02-24'), lesson(3, '2028-03-02', { status: 'cancelled' }), lesson(4, '2028-03-06')];
  assert.deepEqual(recurrenceDefaults(all, anchor), { weekdays: [1, 4], until: '2028-03-06', exclude_dates: ['2028-02-28', '2028-03-02'] });
  const single = recurrenceDefaults(all, { ...anchor, series_id: null });
  assert.deepEqual(single.weekdays, [1]);
  assert.deepEqual(single.exclude_dates, []);
  assert.equal(single.until, '2028-05-14');
});

test('changed starting weekday reuses the anchor without duplicating IDs, and invalid ranges cannot write', () => {
  const all = [lesson(1, draft.date), lesson(2, '2028-02-28')];
  const result = planScheduleEdit(all, all[0], 'following', new Set(), today,
    { ...draft, recurrence: { weekdays: [2], until: '2028-02-29', exclude_dates: [] } });
  const writes = reconcileOccurrences(result.targets, all[0], result.planned);
  assert.deepEqual(writes.writes.map(w => w.id), [1, undefined]);
  assert.deepEqual(writes.removed, [2]);
  for (const update of [
    { ...draft, recurrence: { ...recurrence, until: '2028-02-20' } },
    { ...draft, recurrence: { ...recurrence, until: '2030-01-01' } },
    { ...draft, time: '23:00', recurrence },
    { ...draft, date: '2028-02-14', recurrence },
  ]) assert.throws(() => planScheduleEdit(all, all[0], 'single', new Set(), today, update));
});

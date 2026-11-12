import { test } from 'node:test';
import assert from 'node:assert/strict';
import { actionSchema } from '../lib/schemas.ts';
import { assignmentReminder, notificationErrorMessage, notificationSchema } from '../lib/notification.ts';
import { managementValidationError } from '../lib/manage-api.ts';

const reportedPayload = {
  action: 'notify', assignment_id: 5,
  title: 'Nhắc làm bài: Ôn GK1',
  body: 'Hạn nộp 11/11/2026 · Con nhớ hoàn thành và nộp bài cho cô An nhé!',
};

test('the reported Vietnamese reminder payload is valid, including an overdue deadline', () => {
  assert.deepEqual(actionSchema.parse(reportedPayload), reportedPayload);
  assert.deepEqual(assignmentReminder({ id: 5, title: 'Ôn GK1', deadline: '2026-11-11' }), reportedPayload);
});

test('reminders for valid 200-character assignment titles stay within notification limits', () => {
  for (const title of ['A'.repeat(200), 'Ôn '.repeat(66), 'A'.repeat(105) + '🌱'.repeat(45)]) {
    assert.ok(title.length <= 200);
    const reminder = assignmentReminder({ id: 5, title, deadline: '2026-11-11' });
    assert.ok(reminder.title.length <= 120);
    assert.ok(reminder.title.isWellFormed());
    assert.ok(reminder.title.endsWith('…'));
    assert.equal(notificationSchema.safeParse(reminder).success, true);
    assert.equal(reminder.assignment_id, 5);
    assert.equal('class_id' in reminder, false);
  }
});

test('legacy API rejection explains version mismatch only for valid notification requests', () => {
  const legacy = { error: 'Dữ liệu chưa hợp lệ. Vui lòng kiểm tra lại.' };
  assert.match(notificationErrorMessage(reportedPayload, 400, legacy), /đồng bộ phiên bản máy chủ/);
  assert.equal(notificationErrorMessage({ ...reportedPayload, title: '' }, 400, legacy), legacy.error);
  assert.equal(notificationErrorMessage({ action: 'class' }, 400, legacy), legacy.error);
  assert.equal(notificationErrorMessage(reportedPayload, 500, legacy), legacy.error);
  assert.equal(notificationErrorMessage(reportedPayload, 400, { ...legacy, code: 'INVALID_INPUT' }), legacy.error);
  for (const error of ['Không tìm thấy bài tập.', 'Tất cả học viên trong lớp đã nộp bài tập này rồi.', 'Vui lòng đăng nhập lại.']) {
    assert.equal(notificationErrorMessage(reportedPayload, 400, { error }), error);
  }
});

test('validation identifies the bad field without changing assignment targeting or echoing input', () => {
  const result = actionSchema.safeParse({ ...reportedPayload, assignment_id: '5' });
  assert.equal(result.success, false);
  if (result.success) return;
  const response = managementValidationError(result.error);
  assert.equal(response.code, 'INVALID_INPUT');
  assert.match(response.error, /mã bài tập/);
  assert.equal(response.issues[0].field, 'assignment_id');
  assert.equal('input' in response.issues[0], false);
  const overlong = actionSchema.safeParse({ ...reportedPayload, title: 'A'.repeat(121) });
  assert.equal(overlong.success, false);
  if (!overlong.success) assert.match(managementValidationError(overlong.error).issues[0].message, /120/);
});

test('unknown actions report API compatibility separately from invalid field values', () => {
  const result = actionSchema.safeParse({ ...reportedPayload, action: 'unknown_notify' });
  assert.equal(result.success, false);
  if (result.success) return;
  const response = managementValidationError(result.error);
  assert.equal(response.code, 'UNSUPPORTED_ACTION');
  assert.match(response.error, /đồng bộ phiên bản/);
  assert.equal(response.issues[0].field, 'action');
});

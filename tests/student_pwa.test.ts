import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, normalizeUsername, suggestUsername, verifyPassword } from '../lib/password.ts';
import {
  actionSchema,
  pushSubscriptionSchema,
  quizQuestionSchema,
  studentLoginSchema,
  studentPatchSchema,
  studentSubmissionSchema,
} from '../lib/schemas.ts';

test('normalizeUsername and suggestUsername handle Vietnamese diacritics cleanly', () => {
  assert.equal(normalizeUsername('Đặng Tuấn Kiệt'), 'dangtuankiet');
  assert.equal(normalizeUsername('  Minh_Anh.01! '), 'minh_anh.01');
  assert.equal(suggestUsername('Nguyễn Minh Anh', 3), 'nguyenminhanh3');
});

test('hashPassword and verifyPassword validate scrypt hashes safely', async () => {
  const hash = await hashPassword('secret123');
  assert.ok(hash.includes(':'));
  assert.equal(await verifyPassword('secret123', hash), true);
  assert.equal(await verifyPassword('wrongpass', hash), false);
  assert.equal(await verifyPassword('secret123', null), false);
  assert.equal(await verifyPassword('secret123', 'malformed'), false);
});

test('student account, push subscription, and notification schemas enforce validation', () => {
  assert.equal(studentLoginSchema.safeParse({ username: 'minhanh1', password: 'abc' }).success, true);
  assert.equal(studentLoginSchema.safeParse({ username: '', password: 'abc' }).success, false);

  assert.equal(
    pushSubscriptionSchema.safeParse({
      endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
      keys: { p256dh: 'BEl62iUYgUivxIkv69yViEuiBIa', auth: 'tBHItJI5svbpez7KI4CCXg' },
      deviceLabel: 'Điện thoại Android',
    }).success,
    true,
  );

  assert.equal(
    pushSubscriptionSchema.safeParse({
      endpoint: 'http://insecure.example/push',
      keys: { p256dh: 'BEl62iUYgUivxIkv69yViEuiBIa', auth: 'tBHItJI5svbpez7KI4CCXg' },
    }).success,
    false,
  );

  assert.equal(
    actionSchema.safeParse({
      action: 'student_account',
      student_id: 1,
      username: 'minhanh1',
      password: '123',
    }).success,
    false,
  );

  assert.equal(
    actionSchema.safeParse({
      action: 'student_account',
      student_id: 1,
      username: 'minhanh1',
      password: 'xa1234',
    }).success,
    true,
  );

  assert.equal(
    actionSchema.safeParse({
      action: 'notify',
      title: 'Nhắc làm bài',
      body: 'Hạn nộp tối nay nhé!',
      class_id: 1,
    }).success,
    true,
  );

  assert.equal(
    studentPatchSchema.safeParse({
      action: 'change_password',
      current_password: 'old',
      new_password: 'short',
    }).success,
    false,
  );

  assert.equal(
    studentSubmissionSchema.safeParse({
      assignment_id: 1,
      answer: 'My family has four people.',
      file_id: null,
    }).success,
    true,
  );
});

test('CRUD, recurring session, quiz, grading, bank, and multi-file submission schemas validate properly', () => {
  assert.equal(
    actionSchema.safeParse({ action: 'update_class', id: 1, name: 'Starters A2', level: 'A2', fee: 160000, color: 'purple' }).success,
    true,
  );
  assert.equal(actionSchema.safeParse({ action: 'delete_class', id: 1 }).success, true);
  assert.equal(
    actionSchema.safeParse({ action: 'update_student', id: 2, name: 'Minh Anh', parent: 'Mẹ Lan', phone: '0901', class_id: 2 }).success,
    true,
  );
  assert.equal(
    actionSchema.safeParse({
      action: 'session',
      class_id: 1,
      date: '2026-12-01',
      time: '18:00',
      duration: 90,
      topic: 'Unit 1',
      repeat_weeks: 8,
    }).success,
    true,
  );
  assert.equal(
    actionSchema.safeParse({
      action: 'session',
      class_id: 1,
      date: '2026-12-01',
      time: '18:00',
      duration: 90,
      topic: 'Unit 1',
      repeat_weeks: 53,
    }).success,
    false,
  );
  assert.equal(
    quizQuestionSchema.safeParse({
      id: 'q1',
      prompt: 'Choose the animal',
      options: ['Dog', 'Book'],
      correctIndex: 0,
    }).success,
    true,
  );
  assert.equal(
    quizQuestionSchema.safeParse({
      id: 'q1',
      prompt: 'Choose the animal',
      options: ['Dog', 'Book'],
      correctIndex: 3,
    }).success,
    false,
  );
  assert.equal(
    actionSchema.safeParse({
      action: 'feedback',
      id: 1,
      feedback: 'Làm rất tốt!',
      score: '9.5/10',
      status: 'needs_revision',
    }).success,
    true,
  );
  assert.equal(
    actionSchema.safeParse({
      action: 'bank',
      bankId: 'VCB',
      accountNo: '0123456789',
      accountName: 'NGUYEN XUAN AN',
    }).success,
    true,
  );
  assert.equal(
    studentSubmissionSchema.safeParse({
      assignment_id: 1,
      answer: '',
      file_ids: ['f1', 'f2'],
      quiz_answers: { q1: 0 },
    }).success,
    true,
  );
});

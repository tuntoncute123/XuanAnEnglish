import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ManagementError, managementFailure } from '../lib/manage-api.ts';
import { FeatureError, featureBody, featureError } from '../lib/growth-validation.ts';

test('expected management errors preserve their reason and status', () => {
  const result = managementFailure(new ManagementError('Danh sách học viên không khớp lớp.'));
  assert.equal(result.status, 400);
  assert.equal(result.body.error, 'Danh sách học viên không khớp lớp.');
  assert.equal(managementFailure(new ManagementError('Không tìm thấy.', 404)).status, 404);
});

test('database conflicts differ from invalid input and never expose database details', () => {
  for (const [code, expected] of [['23503', 'RELATED_DATA'], ['23505', 'DUPLICATE_DATA']]) {
    const result = managementFailure({ code, message: 'private SQL', detail: 'private student data' });
    assert.equal(result.status, 409);
    assert.equal(result.body.code, expected);
    assert.doesNotMatch(JSON.stringify(result), /private/);
  }
});

test('database outages and missing migrations are server errors, not HTTP 400', () => {
  for (const error of [new Error('private password'), { code: 'ECONNREFUSED' }, { code: '42P01' }, null]) {
    const result = managementFailure(error);
    assert.equal(result.status, 500);
    assert.equal(result.body.code, 'SERVER_ERROR');
    assert.doesNotMatch(JSON.stringify(result), /private|ECONNREFUSED|42P01/);
  }
});

test('learning APIs preserve business errors and classify unexpected failures consistently', async t => {
  t.mock.method(console, 'error', () => {});
  assert.equal(featureError(new FeatureError('Buổi đã điểm danh.')).status, 400);
  assert.equal(featureError({ code: '23503' }).status, 409);
  const response = featureError(new Error('database offline'));
  assert.equal(response.status, 500);
  assert.equal((await response.json()).code, 'SERVER_ERROR');
});

test('malformed request JSON remains a client error in learning APIs', async () => {
  const request = new Request('http://localhost/api/learning/admin', { method: 'POST', body: '{' });
  await assert.rejects(featureBody(request), error => error instanceof FeatureError && error.status === 400);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { postManagementAction } from '../lib/manage-client.ts';

const draft = { class_id: 2, date: '2026-11-15', time: '15:00', duration: 90, topic: '' };
const weekly = { action: 'session', ...draft, recurrence: { weekdays: [0], until: '2026-12-06', exclude_dates: [] } };

test('old servers cannot silently save one lesson or ignore the scope of a series change', async () => {
  for (const version of [null, '', '1', 'invalid']) {
    for (const action of ['session', 'update_session', 'delete_session', 'cancel_session', 'restore_session']) {
      const calls: RequestInit[] = [];
      const request: typeof fetch = async (_url, init) => {
        calls.push(init || {});
        return Response.json({}, { headers: version === null ? {} : { 'X-XuanAn-API-Version': version } });
      };
      await assert.rejects(postManagementAction({ ...weekly, action, scope: 'following' }, request), /Chưa lưu thay đổi/);
      assert.equal(calls.length, 1);
      assert.equal(calls[0].method, undefined);
      assert.equal(calls[0].cache, 'no-store');
    }
  }
});

test('compatible servers receive the exact class change and recurrence, including holidays', async () => {
  for (const version of ['2', '3']) {
    for (const body of [weekly, { action: 'update_session', id: 7, scope: 'single', ...draft },
      { ...weekly, recurrence: { ...weekly.recurrence, weekdays: [0, 3], exclude_dates: ['2026-11-22'] } }]) {
      const calls: RequestInit[] = [];
      const saved = Response.json({ sessions: [] });
      const request: typeof fetch = async (url, init) => {
        assert.equal(url, '/api/manage');
        calls.push(init || {});
        return init?.method === 'POST' ? saved : Response.json({}, { headers: { 'X-XuanAn-API-Version': version } });
      };
      assert.equal(await postManagementAction(body, request), saved);
      assert.equal(calls.length, 2);
      assert.equal(calls[1].method, 'POST');
      assert.deepEqual(JSON.parse(calls[1].body as string), body);
    }
  }
});

test('failed authentication, failed checks and network errors never send a schedule mutation', async () => {
  for (const status of [401, 500]) {
    let calls = 0;
    const request: typeof fetch = async () => { calls++; return new Response(null, { status }); };
    await assert.rejects(postManagementAction(weekly, request), status === 401 ? /đăng nhập lại/ : /Chưa gửi thay đổi/);
    assert.equal(calls, 1);
  }
  let calls = 0;
  const request: typeof fetch = async () => { calls++; throw Error('Network unavailable'); };
  await assert.rejects(postManagementAction(weekly, request), /Network unavailable/);
  assert.equal(calls, 1);
});

test('a rejected write is returned unchanged and never retried', async () => {
  let calls = 0;
  const conflict = Response.json({ error: 'Trùng lịch' }, { status: 409 });
  const request: typeof fetch = async (_url, init) => {
    calls++;
    return init?.method === 'POST' ? conflict : Response.json({}, { headers: { 'X-XuanAn-API-Version': '2' } });
  };
  assert.equal(await postManagementAction(weekly, request), conflict);
  assert.equal(calls, 2);
});

test('unrelated management actions keep their existing request behavior', async () => {
  let calls = 0;
  const request: typeof fetch = async (_url, init) => {
    calls++;
    assert.equal(init?.method, 'POST');
    return Response.json({});
  };
  await postManagementAction({ action: 'notify', title: 'Nhắc học', body: 'Nội dung' }, request);
  assert.equal(calls, 1);
});

test('recurrence edits require v3 including explicit single mode; v2 cannot silently strip the edit', async () => {
  for (const recurrence of [weekly.recurrence, null]) {
    for (const version of ['2', '3']) {
      const calls: RequestInit[] = [];
      const body = { ...draft, action: 'update_session', id: 7, scope: 'following', recurrence };
      const request: typeof fetch = async (_url, init) => {
        calls.push(init || {});
        return Response.json({}, { headers: { 'X-XuanAn-API-Version': version } });
      };
      if (version === '2') {
        await assert.rejects(postManagementAction(body, request), /Chưa lưu thay đổi/);
        assert.equal(calls.length, 1);
      } else {
        await postManagementAction(body, request);
        assert.equal(calls.length, 2);
        assert.deepEqual(JSON.parse(calls[1].body as string), body);
      }
    }
  }
});

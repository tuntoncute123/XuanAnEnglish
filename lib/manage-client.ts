// API v2 includes recurring schedules, class changes and protected series edits.
const MIN_SCHEDULE_API_VERSION = 2;
const scheduleActions = new Set(['session', 'update_session', 'delete_session', 'cancel_session', 'restore_session']);

/** Check before writing: older APIs silently strip recurrence/scope and can still return 200. */
export async function postManagementAction(body: unknown, request: typeof fetch = fetch): Promise<Response> {
  const action = body && typeof body === 'object' && 'action' in body ? body.action : undefined;
  if (typeof action === 'string' && scheduleActions.has(action)) {
    const response = await request('/api/manage', { cache: 'no-store' });
    if (response.status === 401) throw Error('Vui lòng đăng nhập lại.');
    if (!response.ok) throw Error('Không kiểm tra được máy chủ lịch học. Chưa gửi thay đổi, vui lòng thử lại.');
    const version = response.headers.get('X-XuanAn-API-Version') || '';
    // v2 strips recurrence from edits; requiring v3 prevents false success.
    const editsRecurrence = action === 'update_session' && body && typeof body === 'object'
      && 'recurrence' in body && body.recurrence !== undefined;
    const minimumVersion = editsRecurrence ? 3 : MIN_SCHEDULE_API_VERSION;
    if (!/^\d+$/.test(version) || Number(version) < minimumVersion) {
      throw Error('Máy chủ chưa được cập nhật chức năng lịch học. Chưa lưu thay đổi. Vui lòng liên hệ quản trị viên cập nhật máy chủ rồi thử lại.');
    }
  }
  return request('/api/manage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

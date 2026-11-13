import type { ZodError } from 'zod';

// Exposed on GET, including 401 responses, to verify the backend without sending a notification.
export const MANAGEMENT_API_VERSION = '3';

/** Expected business errors must be distinguished from server failures. */
export class ManagementError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function managementFailure(error: unknown) {
  if (error instanceof ManagementError) {
    return { status: error.status, body: { code: 'INVALID_OPERATION', error: error.message } };
  }
  const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
  if (code === '23503') {
    return { status: 409, body: { code: 'RELATED_DATA', error: 'Dữ liệu liên quan đã thay đổi hoặc bản ghi vẫn đang được sử dụng. Hãy tải lại và kiểm tra lớp, học viên hoặc buổi học liên quan.' } };
  }
  if (code === '23505') {
    return { status: 409, body: { code: 'DUPLICATE_DATA', error: 'Dữ liệu này đã tồn tại. Hãy tải lại và kiểm tra trước khi lưu tiếp.' } };
  }
  return { status: 500, body: { code: 'SERVER_ERROR', error: 'Máy chủ gặp lỗi khi xử lý yêu cầu. Hãy tải lại để kiểm tra dữ liệu trước khi thử lưu lại.' } };
}

export function managementValidationError(error: ZodError) {
  const issues = error.issues.map(issue => ({ field: issue.path.map(String).join('.'), message: issue.message }));
  if (issues.some(issue => issue.field === 'action')) {
    return {
      code: 'UNSUPPORTED_ACTION',
      error: 'Máy chủ chưa hỗ trợ thao tác này. Vui lòng đồng bộ phiên bản máy chủ với giao diện.',
      issues,
    };
  }
  const names: Record<string, string> = {
    title: 'tiêu đề', body: 'nội dung', assignment_id: 'mã bài tập', class_id: 'mã lớp', student_id: 'mã học viên',
    id: 'mã bản ghi', date: 'ngày học', time: 'giờ bắt đầu', duration: 'thời lượng', topic: 'nội dung buổi học',
    scope: 'phạm vi thay đổi', reason: 'lý do nghỉ/hủy', repeat_weeks: 'số tuần',
    'recurrence.weekdays': 'các thứ trong tuần', 'recurrence.until': 'ngày kết thúc', 'recurrence.exclude_dates': 'ngày nghỉ',
  };
  const fields = [...new Set(issues.map(issue => names[issue.field.replace(/\.\d+$/, '')] || issue.field).filter(Boolean))];
  return {
    code: 'INVALID_INPUT',
    error: fields.length ? `Dữ liệu chưa hợp lệ. Vui lòng kiểm tra: ${fields.join(', ')}.` : 'Dữ liệu chưa hợp lệ. Vui lòng kiểm tra lại.',
    issues,
  };
}

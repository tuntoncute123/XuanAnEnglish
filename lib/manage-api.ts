import type { ZodError } from 'zod';

// Exposed on GET, including 401 responses, to verify the backend without sending a notification.
export const MANAGEMENT_API_VERSION = '3';

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

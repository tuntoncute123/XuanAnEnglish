import type { ZodError } from 'zod';

// Exposed on GET, including 401 responses, to verify the backend without sending a notification.
export const MANAGEMENT_API_VERSION = '2';

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
  };
  const fields = [...new Set(issues.map(issue => names[issue.field] || issue.field).filter(Boolean))];
  return {
    code: 'INVALID_INPUT',
    error: fields.length ? `Dữ liệu chưa hợp lệ. Vui lòng kiểm tra: ${fields.join(', ')}.` : 'Dữ liệu chưa hợp lệ. Vui lòng kiểm tra lại.',
    issues,
  };
}

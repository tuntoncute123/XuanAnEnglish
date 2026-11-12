import { z } from 'zod';

export const NOTIFICATION_TITLE_LIMIT = 120;

const recipientId = z.number().int().positive();

export const notificationSchema = z.object({
  action: z.literal('notify'),
  title: z.string().trim().min(1, 'Hãy nhập tiêu đề thông báo.').max(NOTIFICATION_TITLE_LIMIT, 'Tiêu đề thông báo tối đa 120 ký tự.'),
  body: z.string().trim().min(1, 'Hãy nhập nội dung thông báo.').max(500, 'Nội dung thông báo tối đa 500 ký tự.'),
  class_id: recipientId.optional(),
  student_id: recipientId.optional(),
  assignment_id: recipientId.optional(),
});

export function assignmentReminder(assignment: { id: number; title: string; deadline: string }) {
  const fullTitle = `Nhắc làm bài: ${assignment.title.trim()}`;
  // The schema counts UTF-16 units. Avoid leaving half an emoji when truncating.
  const title = fullTitle.length <= NOTIFICATION_TITLE_LIMIT
    ? fullTitle
    : fullTitle.slice(0, NOTIFICATION_TITLE_LIMIT - 1).replace(/[\uD800-\uDBFF]$/u, '') + '…';
  return {
    action: 'notify' as const,
    assignment_id: assignment.id,
    title,
    body: `Hạn nộp ${assignment.deadline.split('-').reverse().join('/')} · Con nhớ hoàn thành và nộp bài cho cô An nhé!`,
  };
}

/** Older deployed APIs return only this generic error for unsupported actions. */
export function notificationErrorMessage(request: unknown, status: number, response: { error?: string; code?: string }) {
  if (status === 400 && !response.code && response.error === 'Dữ liệu chưa hợp lệ. Vui lòng kiểm tra lại.'
    && notificationSchema.safeParse(request).success) {
    return 'Máy chủ từ chối yêu cầu gửi thông báo hợp lệ. Vui lòng đồng bộ phiên bản máy chủ với giao diện rồi thử lại.';
  }
  return response.error || 'Không lưu được dữ liệu. Vui lòng thử lại.';
}

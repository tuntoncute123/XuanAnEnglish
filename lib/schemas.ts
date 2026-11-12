import { z } from 'zod';
import { notificationSchema } from './notification.ts';

const id = z.number().int().positive();
const text = z.string().trim().min(1).max(200);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(v => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v, 'Ngày không hợp lệ');
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const classColor = z.enum(['green', 'purple', 'orange']).optional();
const sessionScope = z.enum(['single', 'following']).default('single');

const optionalPassword = z
  .string()
  .max(100)
  .optional()
  .refine(v => !v || v.length >= 6, 'Mật khẩu tối thiểu 6 ký tự');

export const quizQuestionSchema = z
  .object({
    id: z.string().trim().min(1).max(60),
    prompt: z.string().trim().min(1).max(3000),
    options: z.array(z.string().trim().min(1).max(1000)).max(6),
    correctIndex: z.number().int().min(0).max(5).optional(),
    kind: z.enum(['choice', 'text']).optional(),
    number: z.number().int().positive().max(1000).optional(),
    section: z.string().trim().max(300).optional(),
    context: z.string().trim().max(15000).optional(),
  })
  .refine(q => q.kind === 'text' ? q.options.length === 0 && q.correctIndex === undefined
    : q.options.length >= 2 && (q.correctIndex === undefined || q.correctIndex < q.options.length), 'Đáp án hoặc loại câu hỏi không hợp lệ');

const questionsSchema = z.array(quizQuestionSchema).max(100)
  .refine(qs => new Set(qs.map(q => q.id)).size === qs.length, 'Mã câu hỏi không được trùng');

export const actionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('class'),
    name: text,
    level: text,
    fee: z.number().int().min(0).max(10000000),
    color: classColor,
  }),
  z.object({
    action: z.literal('update_class'),
    id,
    name: text,
    level: text,
    fee: z.number().int().min(0).max(10000000),
    color: classColor,
  }),
  z.object({ action: z.literal('delete_class'), id }),
  z.object({
    action: z.literal('student'),
    name: text,
    parent: z.string().max(200),
    phone: z.string().max(30),
    class_id: id,
    username: z
      .string()
      .trim()
      .max(50)
      .optional()
      .refine(v => !v || v.length >= 3, 'Tên đăng nhập tối thiểu 3 ký tự'),
    password: optionalPassword,
  }),
  z.object({
    action: z.literal('update_student'),
    id,
    name: text,
    parent: z.string().max(200),
    phone: z.string().max(30),
    class_id: id,
  }),
  z.object({ action: z.literal('delete_student'), id }),
  z.object({
    action: z.literal('student_account'),
    student_id: id,
    username: z.string().trim().min(3).max(50),
    password: optionalPassword,
  }),
  z.object({
    action: z.literal('session'),
    class_id: id,
    date,
    time,
    duration: z.number().int().min(15).max(480),
    topic: z.string().max(300),
    repeat_weeks: z.number().int().min(1).max(52).optional(),
    recurrence: z.object({
      weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7)
        .refine(days => new Set(days).size === days.length),
      until: date,
      exclude_dates: z.array(date).max(366).default([]),
    }).optional(),
  }),
  z.object({
    action: z.literal('update_session'),
    id,
    scope: sessionScope,
    class_id: id,
    date,
    time,
    duration: z.number().int().min(15).max(480),
    topic: z.string().max(300),
  }),
  z.object({ action: z.literal('delete_session'), id, scope: sessionScope }),
  z.object({ action: z.literal('cancel_session'), id, scope: sessionScope, reason: z.string().trim().min(1).max(300) }),
  z.object({ action: z.literal('restore_session'), id }),
  z.object({
    action: z.literal('attendance'),
    session_id: id,
    records: z
      .array(
        z.object({
          student_id: id,
          status: z.enum(['present', 'absent', 'excused', 'late']),
          focus: z.number().int().min(1).max(5),
          homework: z.number().int().min(1).max(5),
          note: z.string().max(3000),
        }),
      )
      .max(200),
  }),
  z.object({
    action: z.literal('assignment'),
    class_id: id,
    title: text,
    instructions: z.string().trim().min(1).max(10000),
    deadline: date,
    file_id: z.string().nullable(),
    questions: questionsSchema.optional(),
    notify: z.boolean().optional(),
  }),
  z.object({
    action: z.literal('update_assignment'),
    id,
    class_id: id,
    title: text,
    instructions: z.string().trim().min(1).max(10000),
    deadline: date,
    file_id: z.string().nullable(),
    questions: questionsSchema.optional(),
  }),
  z.object({ action: z.literal('delete_assignment'), id }),
  z.object({
    action: z.literal('payment'),
    student_id: id,
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
    amount: z.number().int().min(0).max(100000000),
  }),
  z.object({
    action: z.literal('feedback'),
    id,
    feedback: z.string().max(5000),
    score: z.string().trim().max(40).optional(),
    status: z.enum(['submitted', 'reviewed', 'needs_revision']).optional(),
    notify: z.boolean().optional(),
  }),
  z.object({ action: z.literal('templates'), templates: z.array(z.string().trim().min(1).max(1000)).min(1).max(30) }),
  z.object({
    action: z.literal('bank'),
    bankId: z.string().trim().max(30),
    accountNo: z.string().trim().max(40),
    accountName: z.string().trim().max(100),
  }),
  notificationSchema,
]);

export const studentLoginSchema = z.object({
  username: z.string().trim().min(1).max(60),
  password: z.string().min(1).max(100),
});

export const studentSubmissionSchema = z.object({
  assignment_id: id,
  answer: z.string().trim().max(10000),
  file_id: z.string().nullable().optional(),
  file_ids: z.array(z.string().trim().min(1)).max(6).optional(),
  quiz_answers: z.record(z.string(), z.number().int().min(0).max(5)).optional(),
  text_answers: z.record(z.string().max(60), z.string().max(3000)).refine(v => Object.keys(v).length <= 100).optional(),
});

export const pushSubscriptionSchema = z.object({
  endpoint: z
    .string()
    .url()
    .max(2000)
    .refine(v => {
      try {
        return new URL(v).protocol === 'https:';
      } catch {
        return false;
      }
    }, 'Endpoint phải dùng HTTPS'),
  keys: z.object({
    p256dh: z.string().min(10).max(500),
    auth: z.string().min(6).max(500),
  }),
  deviceLabel: z.string().trim().max(120).optional(),
});

export const studentPatchSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('read_notifications'),
    ids: z.array(id).max(100).optional(),
  }),
  z.object({
    action: z.literal('change_password'),
    current_password: z.string().min(1).max(100),
    new_password: z.string().min(6).max(100),
  }),
]);

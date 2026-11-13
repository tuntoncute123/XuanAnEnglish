import { z } from 'zod';
import { all, get, run, transaction } from './db';
import { hashPassword, normalizeUsername } from './password';
import {
  daySchema,
  FeatureError,
  positiveId,
  shortText,
} from './growth-validation';
import { localDay, shiftDay, weekStart } from './growth';
import { lockSchedule } from './schedule-service';

const adminSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('parent_save'),
    id: positiveId.optional(),
    name: shortText,
    username: shortText,
    password: z.string().min(8).max(100).optional(),
    student_ids: z.array(positiveId).min(1).max(30),
  }),
  z.object({ action: z.literal('parent_delete'), id: positiveId }),
  z.object({
    action: z.literal('weekly_note'),
    student_id: positiveId,
    week: daySchema,
    note: z.string().trim().max(3000),
  }),
  z.object({
    action: z.literal('makeup_slot'),
    session_id: positiveId,
    capacity: z.number().int().min(0).max(100),
  }),
  z.object({
    action: z.literal('leave_decide'),
    id: positiveId,
    status: z.enum(['approved', 'rejected']),
    response: z.string().trim().max(1000),
  }),
  z.object({
    action: z.literal('makeup_attendance'),
    id: positiveId,
    status: z.enum(['present', 'absent']),
  }),
  z.object({ action: z.literal('makeup_release'), id: positiveId }),
]);
export async function familyAdminData() {
  const [parents, links, leaves, slots, notes] = await Promise.all([
    all('SELECT id,name,username FROM parent_accounts ORDER BY id'),
    all('SELECT * FROM parent_children'),
    all('SELECT * FROM leave_requests ORDER BY id DESC'),
    all('SELECT * FROM makeup_slots'),
    all('SELECT * FROM weekly_notes ORDER BY week DESC'),
  ]);
  return {
    parents: parents.map((p) => ({
      ...p,
      student_ids: links
        .filter((l) => l.parent_id === p.id)
        .map((l) => l.student_id),
    })),
    leaves,
    slots,
    notes,
  };
}
export async function familyAdminAction(body: unknown) {
  const a = adminSchema.parse(body);
  if (a.action === 'parent_save') {
    const username = normalizeUsername(a.username);
    if (username.length < 3)
      throw new FeatureError('Tên đăng nhập cần ít nhất 3 ký tự hợp lệ.');
    const passwordHash = a.password ? await hashPassword(a.password) : null;
    await transaction(async (c) => {
      let id = a.id;
      if (id) {
        const updated = await c.run(
          'UPDATE parent_accounts SET name=?,username=?,password_hash=COALESCE(?,password_hash),password_version=password_version+1 WHERE id=? RETURNING id',
          a.name,
          username,
          passwordHash,
          id,
        );
        if (!updated.rowCount)
          throw new FeatureError('Tài khoản không còn tồn tại.');
      } else {
        if (!passwordHash)
          throw new FeatureError(
            'Đặt mật khẩu ít nhất 8 ký tự cho tài khoản mới.',
          );
        id = Number(
          (
            await c.run(
              'INSERT INTO parent_accounts(name,username,password_hash) VALUES(?,?,?) RETURNING id',
              a.name,
              username,
              passwordHash,
            )
          ).rows[0].id,
        );
      }
      await c.run('DELETE FROM parent_children WHERE parent_id=?', id);
      for (const sid of new Set(a.student_ids))
        await c.run(
          'INSERT INTO parent_children(parent_id,student_id) VALUES(?,?)',
          id,
          sid,
        );
    });
  } else if (a.action === 'parent_delete')
    await run('DELETE FROM parent_accounts WHERE id=?', a.id);
  else if (a.action === 'weekly_note') {
    await run(
      'INSERT INTO weekly_notes(student_id,week,note) VALUES(?,?,?) ON CONFLICT(student_id,week) DO UPDATE SET note=excluded.note',
      a.student_id,
      weekStart(a.week),
      a.note,
    );
  } else {
    await transaction(async (c) => {
      await lockSchedule(c);
      if (a.action === 'makeup_slot') {
        const session = (
          await c.run(
            "SELECT id FROM sessions WHERE id=? AND status='scheduled' AND date>=?",
            a.session_id,
            localDay(),
          )
        ).rows[0];
        if (!session) throw new FeatureError('Chọn buổi sắp tới chưa hủy.');
        const booked =
          (
            await c.run(
              "SELECT id FROM leave_requests WHERE makeup_session_id=? AND status='approved'",
              a.session_id,
            )
          ).rowCount || 0;
        if (booked > a.capacity)
          throw new FeatureError(
            `Đã có ${booked} học sinh đăng ký; không thể giảm dưới số này.`,
          );
        if (!a.capacity)
          await c.run(
            'DELETE FROM makeup_slots WHERE session_id=?',
            a.session_id,
          );
        else
          await c.run(
            'INSERT INTO makeup_slots(session_id,capacity) VALUES(?,?) ON CONFLICT(session_id) DO UPDATE SET capacity=excluded.capacity',
            a.session_id,
            a.capacity,
          );
      } else {
        const leave = (
          await c.run(
            'SELECT * FROM leave_requests WHERE id=? FOR UPDATE',
            a.id,
          )
        ).rows[0];
        if (!leave) throw new FeatureError('Không tìm thấy yêu cầu nghỉ.');
        if (a.action === 'makeup_attendance') {
          if (leave.status !== 'approved' || !leave.makeup_session_id)
            throw new FeatureError('Chưa đăng ký buổi học bù.');
          const session = (
            await c.run(
              'SELECT date,status FROM sessions WHERE id=?',
              leave.makeup_session_id,
            )
          ).rows[0];
          if (
            !session ||
            session.status !== 'scheduled' ||
            session.date > localDay()
          )
            throw new FeatureError(
              'Chỉ điểm danh buổi học bù hôm nay hoặc đã diễn ra.',
            );
          await c.run(
            'UPDATE leave_requests SET makeup_status=? WHERE id=?',
            a.status,
            a.id,
          );
        } else if (a.action === 'makeup_release') {
          if (leave.makeup_status)
            throw new FeatureError('Buổi học bù đã điểm danh được giữ lại.');
          await c.run(
            'UPDATE leave_requests SET makeup_session_id=NULL WHERE id=?',
            a.id,
          );
        } else {
          if (leave.makeup_status)
            throw new FeatureError('Buổi học bù đã điểm danh được giữ lại.');
          const source = (
            await c.run(
              'SELECT status FROM sessions WHERE id=?',
              leave.session_id,
            )
          ).rows[0];
          if (a.status === 'approved' && source?.status !== 'scheduled')
            throw new FeatureError(
              'Buổi gốc đã hủy; không thể duyệt nghỉ hoặc học bù.',
            );
          const attendance = (
            await c.run(
              'SELECT status FROM attendance WHERE session_id=? AND student_id=?',
              leave.session_id,
              leave.student_id,
            )
          ).rows[0];
          if (
            a.status === 'approved' &&
            attendance &&
            ['present', 'late'].includes(attendance.status)
          )
            throw new FeatureError('Buổi này đã điểm danh có mặt.');
          await c.run(
            "UPDATE leave_requests SET status=?,response=?,makeup_session_id=CASE WHEN ?='approved' THEN makeup_session_id ELSE NULL END WHERE id=?",
            a.status,
            a.response,
            a.status,
            a.id,
          );
        }
      }
    });
  }
}

export async function parentData(parentId: number, selectedWeek = weekStart()) {
  const week = weekStart(daySchema.parse(selectedWeek));
  const end = shiftDay(week, 7);
  const children = await all(
    'SELECT s.id,s.name,s.class_id,c.name AS class_name FROM parent_children p JOIN students s ON s.id=p.student_id JOIN classes c ON c.id=s.class_id WHERE p.parent_id=? ORDER BY s.id',
    parentId,
  );
  const summaries = [];
  for (const child of children) {
    const [
      attendance,
      missing,
      submissions,
      note,
      sessions,
      leaves,
      slots,
      speech,
      previous,
    ] = await Promise.all([
      all(
        "SELECT a.status,a.focus,a.homework,s.date FROM attendance a JOIN sessions s ON s.id=a.session_id WHERE a.student_id=? AND s.date>=? AND s.date<? AND s.status<>'cancelled'",
        child.id,
        week,
        end,
      ),
      all(
        'SELECT a.id,a.title,a.deadline FROM assignments a LEFT JOIN submissions s ON s.assignment_id=a.id AND s.student_id=? WHERE a.class_id=? AND a.deadline>=? AND a.deadline<? AND s.id IS NULL ORDER BY a.deadline',
        child.id,
        child.class_id,
        week,
        end,
      ),
      all(
        'SELECT a.title,s.feedback,s.score,s.status FROM submissions s JOIN assignments a ON a.id=s.assignment_id WHERE s.student_id=? AND a.deadline>=? AND a.deadline<?',
        child.id,
        week,
        end,
      ),
      get(
        'SELECT note FROM weekly_notes WHERE student_id=? AND week=?',
        child.id,
        week,
      ),
      all(
        'SELECT id,date,time,topic,status,cancellation_reason FROM sessions WHERE class_id=? AND date>=? AND date<=? ORDER BY date,time',
        child.class_id,
        localDay(),
        shiftDay(localDay(), 90),
      ),
      all(
        'SELECT l.*,s.date,s.time,s.topic,m.date AS makeup_date,m.time AS makeup_time,c.name AS makeup_class FROM leave_requests l JOIN sessions s ON s.id=l.session_id LEFT JOIN sessions m ON m.id=l.makeup_session_id LEFT JOIN classes c ON c.id=m.class_id WHERE l.student_id=? ORDER BY l.id DESC',
        child.id,
      ),
      all(
        `SELECT s.id,s.date,s.time,s.topic,c.name AS class_name,ms.capacity-(SELECT COUNT(*)::int FROM leave_requests l WHERE l.makeup_session_id=s.id AND l.status='approved') AS available
       FROM makeup_slots ms JOIN sessions s ON s.id=ms.session_id JOIN classes c ON c.id=s.class_id
       WHERE c.level=(SELECT level FROM classes WHERE id=?) AND s.status='scheduled' AND s.date>=? AND s.class_id<>? ORDER BY s.date,s.time`,
        child.class_id,
        localDay(),
        child.class_id,
      ),
      all(
        'SELECT t.title,a.created_at,a.pronunciation,a.fluency,a.content,a.feedback FROM speaking_attempts a JOIN speaking_tasks t ON t.id=a.task_id WHERE a.student_id=? AND a.created_at::timestamptz>=?::timestamptz AND a.created_at::timestamptz<?::timestamptz ORDER BY a.id',
        child.id,
        `${week}T00:00:00+07:00`,
        `${end}T00:00:00+07:00`,
      ),
      all(
        "SELECT a.focus,a.homework FROM attendance a JOIN sessions s ON s.id=a.session_id WHERE a.student_id=? AND s.date>=? AND s.date<? AND s.status<>'cancelled' AND a.status IN ('present','late')",
        child.id,
        shiftDay(week, -7),
        week,
      ),
    ]);
    summaries.push({
      ...child,
      attendance,
      previous,
      missing,
      submissions,
      note: note?.note || '',
      sessions,
      leaves,
      slots: slots.filter((s) => s.available > 0),
      speech,
    });
  }
  return { week, children: summaries };
}
const parentActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('request_leave'),
    student_id: positiveId,
    session_id: positiveId,
    reason: z.string().trim().min(1).max(1000),
  }),
  z.object({
    action: z.literal('book_makeup'),
    student_id: positiveId,
    leave_id: positiveId,
    session_id: positiveId,
  }),
]);
export async function parentAction(parentId: number, body: unknown) {
  const a = parentActionSchema.parse(body);
  await transaction(async (c) => {
    await lockSchedule(c);
    const student = (
      await c.run(
        'SELECT s.* FROM students s JOIN parent_children p ON p.student_id=s.id WHERE p.parent_id=? AND s.id=?',
        parentId,
        a.student_id,
      )
    ).rows[0];
    if (!student)
      throw new FeatureError('Không có quyền truy cập học sinh này.', 403);
    const session = (
      await c.run(
        "SELECT * FROM sessions WHERE id=? AND status='scheduled'",
        a.session_id,
      )
    ).rows[0];
    if (
      !session ||
      new Date(`${session.date}T${session.time}:00+07:00`).getTime() <=
        Date.now()
    )
      throw new FeatureError('Chọn buổi chưa bắt đầu và chưa hủy.');
    if (a.action === 'request_leave') {
      if (session.class_id !== student.class_id)
        throw new FeatureError('Buổi học không thuộc lớp của con.');
      const recorded = (
        await c.run(
          'SELECT status FROM attendance WHERE session_id=? AND student_id=?',
          a.session_id,
          student.id,
        )
      ).rows[0];
      if (recorded)
        throw new FeatureError(
          'Buổi học đã điểm danh. Vui lòng trao đổi với cô.',
        );
      const exists = (
        await c.run(
          'SELECT id FROM leave_requests WHERE session_id=? AND student_id=?',
          a.session_id,
          student.id,
        )
      ).rows[0];
      if (exists) throw new FeatureError('Buổi này đã có yêu cầu nghỉ.');
      await c.run(
        'INSERT INTO leave_requests(student_id,session_id,reason,created_at) VALUES(?,?,?,?)',
        student.id,
        session.id,
        a.reason,
        new Date().toISOString(),
      );
    } else {
      const leave = (
        await c.run(
          "SELECT * FROM leave_requests WHERE id=? AND student_id=? AND status='approved' FOR UPDATE",
          a.leave_id,
          student.id,
        )
      ).rows[0];
      if (!leave || leave.makeup_status)
        throw new FeatureError(
          'Yêu cầu nghỉ cần được duyệt và chưa điểm danh học bù.',
        );
      if (leave.makeup_session_id === session.id) return;
      const slot = (
        await c.run(
          'SELECT * FROM makeup_slots WHERE session_id=? FOR UPDATE',
          session.id,
        )
      ).rows[0];
      const levels = (
        await c.run('SELECT id,level FROM classes WHERE id=ANY(?::int[])', [
          student.class_id,
          session.class_id,
        ])
      ).rows;
      if (
        !slot ||
        session.class_id === student.class_id ||
        levels.length !== 2 ||
        levels[0].level !== levels[1].level
      )
        throw new FeatureError('Chọn buổi học bù cùng trình độ ở lớp khác.');
      const booked =
        (
          await c.run(
            "SELECT id FROM leave_requests WHERE makeup_session_id=? AND status='approved'",
            session.id,
          )
        ).rowCount || 0;
      if (booked >= slot.capacity)
        throw new FeatureError(
          'Buổi học bù vừa hết chỗ. Vui lòng chọn buổi khác.',
          409,
        );
      const source = (
        await c.run(
          'SELECT date,status FROM sessions WHERE id=?',
          leave.session_id,
        )
      ).rows[0];
      if (
        !source ||
        source.status !== 'scheduled' ||
        session.date < source.date
      )
        throw new FeatureError('Chọn buổi bù từ ngày nghỉ trở đi.');
      await c.run(
        'UPDATE leave_requests SET makeup_session_id=? WHERE id=?',
        session.id,
        leave.id,
      );
    }
  });
}

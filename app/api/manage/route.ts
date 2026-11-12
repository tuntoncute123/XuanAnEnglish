import { randomBytes } from 'node:crypto';
import { isAdmin, sameOrigin } from '@/lib/auth';
import { all, findUniqueUsername, get, run, snapshot, transaction } from '@/lib/db';
import { cleanupUnreferencedFiles, parseAttachmentsJson } from '@/lib/files';
import { hashPassword, normalizeUsername } from '@/lib/password';
import { sendPushToStudents } from '@/lib/push';
import { actionSchema } from '@/lib/schemas';

export const runtime = 'nodejs';

function addDaysIso(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export async function GET() {
  if (!(await isAdmin())) {
    return Response.json({ error: 'Vui lòng đăng nhập.' }, { status: 401 });
  }
  return Response.json(await snapshot());
}

export async function POST(req: Request) {
  if (!sameOrigin(req) || !(await isAdmin())) {
    return Response.json({ error: 'Vui lòng đăng nhập lại.' }, { status: 401 });
  }

  try {
    const parsed = actionSchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json({ error: 'Dữ liệu chưa hợp lệ. Vui lòng kiểm tra lại.' }, { status: 400 });
    }
    const a = parsed.data;

    switch (a.action) {
      case 'class':
        await run(
          'INSERT INTO classes(name,level,fee,color) VALUES(?,?,?,?)',
          a.name,
          a.level,
          a.fee,
          a.color || 'green',
        );
        break;

      case 'update_class':
        await run(
          'UPDATE classes SET name=?, level=?, fee=?, color=COALESCE(?, color) WHERE id=?',
          a.name,
          a.level,
          a.fee,
          a.color || null,
          a.id,
        );
        break;

      case 'delete_class': {
        const studentCount = await get('SELECT COUNT(*)::int AS cnt FROM students WHERE class_id=?', a.id);
        if (Number(studentCount?.cnt || 0) > 0) {
          return Response.json(
            { error: 'Lớp vẫn đang có học viên. Vui lòng chuyển lớp hoặc xóa học viên trước.' },
            { status: 400 },
          );
        }
        const classAssignments = await all('SELECT id, file_id FROM assignments WHERE class_id=?', a.id);
        const assignmentIds = classAssignments.map(x => Number(x.id));
        const candidateFiles = classAssignments.map(x => x.file_id as string | null);
        if (assignmentIds.length) {
          const subs = await all(
            'SELECT file_id, attachments FROM submissions WHERE assignment_id = ANY(?::int[])',
            assignmentIds,
          );
          for (const s of subs) {
            if (s.file_id) candidateFiles.push(String(s.file_id));
            for (const att of parseAttachmentsJson(s.attachments)) candidateFiles.push(att.id);
          }
        }
        await transaction(async client => {
          await client.run('DELETE FROM attendance WHERE session_id IN (SELECT id FROM sessions WHERE class_id=?)', a.id);
          await client.run('DELETE FROM sessions WHERE class_id=?', a.id);
          if (assignmentIds.length) {
            await client.run('DELETE FROM submissions WHERE assignment_id = ANY(?::int[])', assignmentIds);
            await client.run('DELETE FROM assignments WHERE class_id=?', a.id);
          }
          await client.run('DELETE FROM classes WHERE id=?', a.id);
        });
        await cleanupUnreferencedFiles(candidateFiles);
        break;
      }

      case 'student': {
        let username: string;
        if (a.username && a.username.trim()) {
          const clean = normalizeUsername(a.username);
          if (clean.length < 3) {
            return Response.json(
              { error: 'Tên đăng nhập chỉ gồm chữ không dấu, số, dấu chấm hoặc gạch dưới (tối thiểu 3 ký tự).' },
              { status: 400 },
            );
          }
          const exists = await get('SELECT id FROM students WHERE LOWER(username)=?', clean);
          if (exists) {
            return Response.json({ error: 'Tên đăng nhập này đã được sử dụng.' }, { status: 400 });
          }
          username = clean;
        } else {
          username = await findUniqueUsername(a.name);
        }
        const passwordHash = a.password && a.password.length >= 6 ? await hashPassword(a.password) : null;
        await run(
          'INSERT INTO students(name,parent,phone,class_id,token,username,password_hash) VALUES(?,?,?,?,?,?,?)',
          a.name,
          a.parent,
          a.phone,
          a.class_id,
          randomBytes(24).toString('hex'),
          username,
          passwordHash,
        );
        break;
      }

      case 'update_student': {
        const cls = await get('SELECT id FROM classes WHERE id=?', a.class_id);
        if (!cls) {
          return Response.json({ error: 'Không tìm thấy lớp học.' }, { status: 400 });
        }
        await run(
          'UPDATE students SET name=?, parent=?, phone=?, class_id=? WHERE id=?',
          a.name,
          a.parent,
          a.phone,
          a.class_id,
          a.id,
        );
        break;
      }

      case 'delete_student': {
        const stu = await get('SELECT token FROM students WHERE id=?', a.id);
        if (!stu) {
          return Response.json({ error: 'Không tìm thấy học viên.' }, { status: 404 });
        }
        const subs = await all('SELECT file_id, attachments FROM submissions WHERE student_id=?', a.id);
        const ownedFiles = await all('SELECT id FROM files WHERE owner_token=?', String(stu.token));
        const candidateFiles: (string | null)[] = ownedFiles.map(f => String(f.id));
        for (const s of subs) {
          if (s.file_id) candidateFiles.push(String(s.file_id));
          for (const att of parseAttachmentsJson(s.attachments)) candidateFiles.push(att.id);
        }
        await transaction(async client => {
          await client.run('DELETE FROM attendance WHERE student_id=?', a.id);
          await client.run('DELETE FROM submissions WHERE student_id=?', a.id);
          await client.run('DELETE FROM payments WHERE student_id=?', a.id);
          await client.run('DELETE FROM push_subscriptions WHERE student_id=?', a.id);
          await client.run('DELETE FROM notifications WHERE student_id=?', a.id);
          await client.run('DELETE FROM students WHERE id=?', a.id);
        });
        await cleanupUnreferencedFiles(candidateFiles);
        break;
      }

      case 'student_account': {
        const clean = normalizeUsername(a.username);
        if (clean.length < 3) {
          return Response.json(
            { error: 'Tên đăng nhập chỉ gồm chữ không dấu, số, dấu chấm hoặc gạch dưới (tối thiểu 3 ký tự).' },
            { status: 400 },
          );
        }
        const existing = await get('SELECT id FROM students WHERE LOWER(username)=? AND id<>?', clean, a.student_id);
        if (existing) {
          return Response.json({ error: 'Tên đăng nhập này đã có học viên khác sử dụng.' }, { status: 400 });
        }
        const target = await get('SELECT id, password_version FROM students WHERE id=?', a.student_id);
        if (!target) {
          return Response.json({ error: 'Không tìm thấy học viên.' }, { status: 404 });
        }
        if (a.password && a.password.length >= 6) {
          const passwordHash = await hashPassword(a.password);
          const nextVer = Number(target.password_version || 1) + 1;
          await run(
            'UPDATE students SET username=?, password_hash=?, password_version=? WHERE id=?',
            clean,
            passwordHash,
            nextVer,
            a.student_id,
          );
        } else {
          await run('UPDATE students SET username=? WHERE id=?', clean, a.student_id);
        }
        break;
      }

      case 'session': {
        const repeat = a.repeat_weeks ?? 1;
        await transaction(async client => {
          for (let w = 0; w < repeat; w++) {
            await client.run(
              'INSERT INTO sessions(class_id,date,time,duration,topic) VALUES(?,?,?,?,?)',
              a.class_id,
              addDaysIso(a.date, w * 7),
              a.time,
              a.duration,
              a.topic,
            );
          }
        });
        break;
      }

      case 'update_session':
        await run(
          'UPDATE sessions SET class_id=?, date=?, time=?, duration=?, topic=? WHERE id=?',
          a.class_id,
          a.date,
          a.time,
          a.duration,
          a.topic,
          a.id,
        );
        break;

      case 'delete_session':
        await transaction(async client => {
          await client.run('DELETE FROM attendance WHERE session_id=?', a.id);
          await client.run('DELETE FROM sessions WHERE id=?', a.id);
        });
        break;

      case 'attendance': {
        const session = await get('SELECT class_id FROM sessions WHERE id=?', a.session_id);
        if (!session) throw Error('Không tìm thấy buổi học.');
        const expected = await all('SELECT id FROM students WHERE class_id=?', session.class_id!);
        if (
          a.records.length !== expected.length ||
          new Set(a.records.map(r => r.student_id)).size !== expected.length ||
          a.records.some(r => !expected.some(s => s.id === r.student_id))
        ) {
          throw Error('Danh sách học viên không khớp lớp.');
        }
        await transaction(async ({ run }) => {
          for (const r of a.records) {
            await run(
              'INSERT INTO attendance(session_id,student_id,status,focus,homework,note) VALUES(?,?,?,?,?,?) ON CONFLICT(session_id,student_id) DO UPDATE SET status=excluded.status,focus=excluded.focus,homework=excluded.homework,note=excluded.note',
              a.session_id,
              r.student_id,
              r.status,
              r.focus,
              r.homework,
              r.note,
            );
          }
        });
        break;
      }

      case 'assignment': {
        if (a.file_id && !(await get('SELECT id FROM files WHERE id=? AND owner_token IS NULL', a.file_id))) {
          throw Error('Tài liệu không hợp lệ.');
        }
        const inserted = await all(
          'INSERT INTO assignments(class_id,title,instructions,deadline,file_id,questions) VALUES(?,?,?,?,?,?) RETURNING id',
          a.class_id,
          a.title,
          a.instructions,
          a.deadline,
          a.file_id,
          JSON.stringify(a.questions || []),
        );
        const assignmentId = Number(inserted[0]?.id || 0);
        if (a.notify !== false && assignmentId > 0) {
          const classStudents = await all('SELECT id FROM students WHERE class_id=?', a.class_id);
          const studentIds = classStudents.map(s => Number(s.id));
          if (studentIds.length) {
            const formattedDeadline = a.deadline.split('-').reverse().join('/');
            await sendPushToStudents(studentIds, {
              type: 'assignment',
              title: `Bài tập mới: ${a.title}`,
              body: `Hạn nộp ${formattedDeadline} · Bấm để xem đề và nộp bài.`,
              url: `/student?tab=homework&assignment=${assignmentId}`,
              tag: `assignment-${assignmentId}`,
            });
          }
        }
        break;
      }

      case 'update_assignment': {
        const existing = await get('SELECT file_id FROM assignments WHERE id=?', a.id);
        if (!existing) {
          return Response.json({ error: 'Không tìm thấy bài tập.' }, { status: 404 });
        }
        if (a.file_id && a.file_id !== existing.file_id) {
          const fileRow = await get('SELECT id FROM files WHERE id=? AND owner_token IS NULL', a.file_id);
          if (!fileRow) throw Error('Tài liệu không hợp lệ.');
        }
        await run(
          'UPDATE assignments SET class_id=?, title=?, instructions=?, deadline=?, file_id=?, questions=? WHERE id=?',
          a.class_id,
          a.title,
          a.instructions,
          a.deadline,
          a.file_id,
          JSON.stringify(a.questions || []),
          a.id,
        );
        if (existing.file_id && existing.file_id !== a.file_id) {
          await cleanupUnreferencedFiles([String(existing.file_id)]);
        }
        break;
      }

      case 'delete_assignment': {
        const existing = await get('SELECT file_id FROM assignments WHERE id=?', a.id);
        if (!existing) {
          return Response.json({ error: 'Không tìm thấy bài tập.' }, { status: 404 });
        }
        const subs = await all('SELECT file_id, attachments FROM submissions WHERE assignment_id=?', a.id);
        const candidateFiles: (string | null)[] = [existing.file_id ? String(existing.file_id) : null];
        for (const s of subs) {
          if (s.file_id) candidateFiles.push(String(s.file_id));
          for (const att of parseAttachmentsJson(s.attachments)) candidateFiles.push(att.id);
        }
        await transaction(async client => {
          await client.run('DELETE FROM submissions WHERE assignment_id=?', a.id);
          await client.run('DELETE FROM assignments WHERE id=?', a.id);
        });
        await cleanupUnreferencedFiles(candidateFiles);
        break;
      }

      case 'payment':
        await run(
          'INSERT INTO payments(student_id,month,amount) VALUES(?,?,?) ON CONFLICT(student_id,month) DO UPDATE SET amount=excluded.amount',
          a.student_id,
          a.month,
          a.amount,
        );
        break;

      case 'feedback': {
        const nextStatus = a.status || 'reviewed';
        const updated = await all(
          'UPDATE submissions SET feedback=?, score=COALESCE(?, score), status=? WHERE id=? RETURNING student_id, assignment_id',
          a.feedback,
          a.score ?? null,
          nextStatus,
          a.id,
        );
        const sub = updated[0];
        if (sub && a.notify !== false && (a.feedback.trim() || a.score?.trim() || nextStatus === 'needs_revision')) {
          const assignment = await get('SELECT title FROM assignments WHERE id=?', Number(sub.assignment_id));
          const titlePrefix =
            nextStatus === 'needs_revision'
              ? 'Cô An nhờ con sửa lại bài'
              : 'Cô An đã chấm bài';
          const scorePart = a.score?.trim() ? `[${a.score.trim()}] ` : '';
          const preview = (scorePart + a.feedback.trim()).slice(0, 140) || 'Bấm để xem kết quả chi tiết.';
          await sendPushToStudents([Number(sub.student_id)], {
            type: 'feedback',
            title: `${titlePrefix}: ${assignment?.title || 'Bài tập'}`,
            body: preview,
            url: `/student?tab=homework&assignment=${Number(sub.assignment_id)}`,
            tag: `feedback-${Number(sub.assignment_id)}`,
          });
        }
        break;
      }

      case 'templates':
        await run(
          "INSERT INTO settings(key,value) VALUES('templates',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
          JSON.stringify(a.templates),
        );
        break;

      case 'bank':
        await run(
          "INSERT INTO settings(key,value) VALUES('bank',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
          JSON.stringify({ bankId: a.bankId, accountNo: a.accountNo, accountName: a.accountName }),
        );
        break;

      case 'notify': {
        let targetIds: number[] = [];
        let url = '/student?tab=notifications';
        let type = 'general';

        if (a.assignment_id) {
          type = 'reminder';
          url = `/student?tab=homework&assignment=${a.assignment_id}`;
          const assignment = await get('SELECT class_id FROM assignments WHERE id=?', a.assignment_id);
          if (!assignment) {
            return Response.json({ error: 'Không tìm thấy bài tập.' }, { status: 404 });
          }
          const rows = await all(
            `SELECT st.id
             FROM students st
             LEFT JOIN submissions sub ON sub.assignment_id = ? AND sub.student_id = st.id
             WHERE st.class_id = ? AND sub.id IS NULL`,
            a.assignment_id,
            Number(assignment.class_id),
          );
          targetIds = rows.map(r => Number(r.id));
          if (!targetIds.length) {
            return Response.json({ error: 'Tất cả học viên trong lớp đã nộp bài tập này rồi.' }, { status: 400 });
          }
        } else if (a.student_id) {
          targetIds = [a.student_id];
        } else if (a.class_id) {
          const rows = await all('SELECT id FROM students WHERE class_id=?', a.class_id);
          targetIds = rows.map(r => Number(r.id));
        } else {
          const rows = await all('SELECT id FROM students');
          targetIds = rows.map(r => Number(r.id));
        }

        if (!targetIds.length) {
          return Response.json({ error: 'Chưa có học viên nào để gửi thông báo.' }, { status: 400 });
        }

        const summary = await sendPushToStudents(targetIds, {
          type,
          title: a.title,
          body: a.body,
          url,
          tag: `notice-${Date.now()}`,
        });
        return Response.json({ ...(await snapshot()), notify_summary: summary });
      }
    }

    return Response.json(await snapshot());
  } catch {
    return Response.json({ error: 'Không lưu được dữ liệu. Kiểm tra thông tin và thử lại.' }, { status: 400 });
  }
}

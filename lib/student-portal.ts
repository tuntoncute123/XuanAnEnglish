import { all, get, parseJsonSafe, run } from './db';
import { cleanupUnreferencedFiles, parseAttachmentsJson } from './files';
import { getVapidConfig } from './push';
import { addDays } from './schedule';
import { validateQuestionAnswers } from './questions';
import type {
  BankConfig,
  ParentMonthlySummary,
  PushDeviceInfo,
  QuizQuestion,
  StudentAssignment,
  StudentPortalData,
  StudentQuizQuestion,
  Submission,
  SubmissionAttachment,
  SubmissionStatus,
} from './types';

export type StudentCore = {
  id: number;
  name: string;
  class_id: number;
  username?: string | null;
  has_password?: boolean;
};

export async function buildStudentPortalData(student: StudentCore): Promise<StudentPortalData> {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
  const currentMonth = today.slice(0, 7);
  const pastDateObj = new Date(today + 'T12:00:00+07:00');
  pastDateObj.setUTCDate(pastDateObj.getUTCDate() - 30);
  const pastLimit = pastDateObj.toISOString().slice(0, 10);

  const [
    classRow,
    assignmentsRaw,
    submissionsRaw,
    notifications,
    sessions,
    pushRows,
    vapid,
    monthSessions,
    monthAttendance,
    monthPayment,
    bankSetting,
    studentFiles,
  ] = await Promise.all([
    get('SELECT name, level, fee FROM classes WHERE id=?', student.class_id),
    all('SELECT * FROM assignments WHERE class_id=? ORDER BY deadline DESC, id DESC', student.class_id),
    all('SELECT * FROM submissions WHERE student_id=?', student.id),
    all(
      'SELECT id, student_id, type, title, body, url, is_read, created_at FROM notifications WHERE student_id=? ORDER BY id DESC LIMIT 50',
      student.id,
    ),
    all(
      `SELECT s.id, s.date, s.time, s.duration, s.topic, s.status AS session_status, s.cancellation_reason,
              a.status, a.focus, a.homework, a.note
       FROM sessions s
       LEFT JOIN attendance a ON a.session_id = s.id AND a.student_id = ?
       WHERE s.class_id = ? AND s.date >= ? AND s.date <= ?
       ORDER BY CASE WHEN s.date >= ? THEN 0 ELSE 1 END,
                CASE WHEN s.date >= ? THEN s.date END ASC,
                CASE WHEN s.date >= ? THEN s.time END ASC,
                s.date DESC, s.time DESC`,
      student.id,
      student.class_id,
      pastLimit,
      addDays(today, 90),
      today,
      today,
      today,
    ),
    all(
      'SELECT id, device_label, updated_at FROM push_subscriptions WHERE student_id=? ORDER BY updated_at DESC',
      student.id,
    ),
    getVapidConfig(),
    all("SELECT id FROM sessions WHERE class_id=? AND date LIKE ? AND status <> 'cancelled'", student.class_id, `${currentMonth}-%`),
    all(
      `SELECT a.status, a.focus, a.homework, a.note
       FROM attendance a
       JOIN sessions s ON s.id = a.session_id
       WHERE a.student_id = ? AND s.class_id = ? AND s.date LIKE ? AND s.status <> 'cancelled'`,
      student.id,
      student.class_id,
      `${currentMonth}-%`,
    ),
    get('SELECT amount FROM payments WHERE student_id=? AND month=?', student.id, currentMonth),
    get("SELECT value FROM settings WHERE key='bank'"),
    all(
      'SELECT f.id, f.name, f.type FROM files f JOIN students st ON f.owner_token = st.token WHERE st.id=?',
      student.id,
    ),
  ]);

  const fileMap = new Map<string, { name: string; type: string }>(
    studentFiles.map(f => [String(f.id), { name: String(f.name), type: String(f.type) }]),
  );

  const submissions: Submission[] = submissionsRaw.map(sub => {
    const parsedAtts = parseAttachmentsJson(sub.attachments);
    const attachments: SubmissionAttachment[] =
      parsedAtts.length > 0
        ? parsedAtts
        : sub.file_id
          ? [
              {
                id: String(sub.file_id),
                name: fileMap.get(String(sub.file_id))?.name || 'Tệp bài làm',
                type: fileMap.get(String(sub.file_id))?.type || '',
              },
            ]
          : [];
    return {
      id: Number(sub.id),
      assignment_id: Number(sub.assignment_id),
      student_id: Number(sub.student_id),
      answer: String(sub.answer || ''),
      file_id: sub.file_id ? String(sub.file_id) : null,
      attachments,
      quiz_answers: parseJsonSafe<Record<string, number>>(sub.quiz_answers, {}),
      text_answers: parseJsonSafe<Record<string, string>>(sub.text_answers, {}),
      submitted_at: String(sub.submitted_at),
      feedback: String(sub.feedback || ''),
      score: sub.score ? String(sub.score) : '',
      status: (sub.status ? String(sub.status) : 'submitted') as SubmissionStatus,
    };
  });

  const submittedIds = new Set(submissions.map(s => s.assignment_id));
  const assignments: StudentAssignment[] = assignmentsRaw.map(a => {
    const parsedQuestions = parseJsonSafe<QuizQuestion[]>(a.questions, []);
    const hasSubmitted = submittedIds.has(Number(a.id));
    const safeQuestions: StudentQuizQuestion[] = parsedQuestions.map(({ correctIndex, ...q }) =>
      hasSubmitted ? { ...q, correctIndex } : q,
    );
    return {
      id: Number(a.id),
      class_id: Number(a.class_id),
      title: String(a.title),
      instructions: String(a.instructions),
      deadline: String(a.deadline),
      file_id: a.file_id ? String(a.file_id) : null,
      questions: safeQuestions,
    };
  });

  const attended = monthAttendance.filter(a => a.status === 'present' || a.status === 'late');
  const fee = Number(classRow?.fee || 0);
  const due = attended.length * fee;
  const paid = Number(monthPayment?.amount || 0);
  const avg = (key: 'focus' | 'homework') =>
    attended.length ? (attended.reduce((sum, a) => sum + Number(a[key] || 0), 0) / attended.length).toFixed(1) : '—';

  const parsedBank = parseJsonSafe<BankConfig | null>(bankSetting?.value, null);
  const bankValid = parsedBank && parsedBank.bankId && parsedBank.accountNo ? parsedBank : null;

  const monthlySummary: ParentMonthlySummary = {
    month: currentMonth,
    sessions: monthSessions.length,
    recorded: monthAttendance.length,
    attended: attended.length,
    absent: monthAttendance.filter(r => r.status === 'absent' || r.status === 'excused').length,
    due,
    paid,
    balance: due - paid,
    focus: avg('focus'),
    homework: avg('homework'),
    notes: monthAttendance.map(r => String(r.note || '')).filter(Boolean),
    bank: bankValid,
  };

  const pushDevices: PushDeviceInfo[] = pushRows.map(p => ({
    id: Number(p.id),
    device_label: String(p.device_label || 'Thiết bị di động'),
    updated_at: String(p.updated_at),
  }));

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return {
    student: {
      id: student.id,
      name: student.name,
      class_id: student.class_id,
      class_name: classRow ? String(classRow.name) : undefined,
      class_level: classRow ? String(classRow.level) : undefined,
      username: student.username ?? null,
      has_password: student.has_password,
    },
    assignments,
    submissions,
    notifications: notifications.map(n => ({
      id: Number(n.id),
      student_id: Number(n.student_id),
      type: String(n.type),
      title: String(n.title),
      body: String(n.body),
      url: String(n.url),
      is_read: Boolean(n.is_read),
      created_at: String(n.created_at),
    })),
    unread_count: unreadCount,
    sessions: sessions.map(s => ({
      id: Number(s.id),
      date: String(s.date),
      time: String(s.time),
      duration: Number(s.duration),
      topic: String(s.topic || ''),
      session_status: s.session_status === 'cancelled' ? 'cancelled' : 'scheduled',
      cancellation_reason: String(s.cancellation_reason || ''),
      status: s.status ? String(s.status) : null,
      focus: s.focus !== null && s.focus !== undefined ? Number(s.focus) : null,
      homework: s.homework !== null && s.homework !== undefined ? Number(s.homework) : null,
      note: s.note !== null && s.note !== undefined ? String(s.note) : null,
    })),
    vapidPublicKey: vapid.publicKey,
    pushDevicesCount: pushDevices.length,
    pushDevices,
    monthlySummary,
  };
}

export async function submitStudentHomework(
  student: { id: number; class_id: number; token: string },
  input: {
    assignment_id: number;
    answer: string;
    file_id?: string | null;
    file_ids?: string[];
    quiz_answers?: Record<string, number>;
    text_answers?: Record<string, string>;
  },
) {
  const assignment = await get(
    'SELECT id, questions FROM assignments WHERE id=? AND class_id=?',
    input.assignment_id,
    student.class_id,
  );
  if (!assignment) {
    throw new Error('Assignment does not belong to student class');
  }

  const mergedIds = [
    ...new Set([...(input.file_ids || []), ...(input.file_id ? [input.file_id] : [])].filter(Boolean)),
  ].slice(0, 6);

  const attachments: SubmissionAttachment[] = [];
  if (mergedIds.length > 0) {
    const ownedFiles = await all(
      'SELECT id, name, type FROM files WHERE id = ANY(?::text[]) AND owner_token=?',
      mergedIds,
      student.token,
    );
    const ownedMap = new Map(ownedFiles.map(f => [String(f.id), f]));
    for (const fid of mergedIds) {
      const match = ownedMap.get(fid);
      if (!match) {
        throw new Error('File does not belong to student');
      }
      attachments.push({ id: fid, name: String(match.name), type: String(match.type || '') });
    }
  }

  const questions = parseJsonSafe<QuizQuestion[]>(assignment.questions, []);
  const quizAnswers = input.quiz_answers || {};
  const textAnswers = input.text_answers || {};
  const hasQuizAnswers = Object.keys(quizAnswers).length > 0;
  const autoScore = validateQuestionAnswers(questions, quizAnswers, textAnswers);

  if (!input.answer.trim() && attachments.length === 0 && !hasQuizAnswers && !Object.values(textAnswers).some(value => value.trim())) {
    throw new Error('Empty submission');
  }

  const existingSub = await get(
    'SELECT file_id, attachments FROM submissions WHERE assignment_id=? AND student_id=?',
    input.assignment_id,
    student.id,
  );
  const previousIds: string[] = [];
  if (existingSub?.file_id) previousIds.push(String(existingSub.file_id));
  for (const att of parseAttachmentsJson(existingSub?.attachments)) {
    if (att?.id) previousIds.push(String(att.id));
  }

  const primaryFileId = attachments[0]?.id || null;
  await run(
    `INSERT INTO submissions(assignment_id, student_id, answer, file_id, attachments, quiz_answers, text_answers, submitted_at, feedback, score, status)
     VALUES(?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(assignment_id, student_id) DO UPDATE SET
       answer=excluded.answer,
       file_id=excluded.file_id,
       attachments=excluded.attachments,
       quiz_answers=excluded.quiz_answers,
       text_answers=excluded.text_answers,
       submitted_at=excluded.submitted_at,
       feedback='',
       score=excluded.score,
       status='submitted'`,
    input.assignment_id,
    student.id,
    input.answer,
    primaryFileId,
    JSON.stringify(attachments),
    JSON.stringify(quizAnswers),
    JSON.stringify(textAnswers),
    new Date().toISOString(),
    '',
    autoScore,
    'submitted',
  );

  const removedIds = previousIds.filter(id => !mergedIds.includes(id));
  if (removedIds.length > 0) {
    await cleanupUnreferencedFiles(removedIds);
  }
}

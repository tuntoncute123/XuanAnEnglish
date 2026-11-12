import { all, run } from './db';
import { sendPushToStudents } from './push';

export async function sendDueHomeworkReminders() {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
  const tmrDate = new Date(today + 'T12:00:00+07:00');
  tmrDate.setUTCDate(tmrDate.getUTCDate() + 1);
  const tomorrow = tmrDate.toISOString().slice(0, 10);

  const dueAssignments = await all(
    `SELECT id, class_id, title, deadline
     FROM assignments
     WHERE deadline IN (?, ?)
       AND (last_reminded_date IS NULL OR last_reminded_date <> ?)`,
    today,
    tomorrow,
    today,
  );

  let studentsNotified = 0;
  let pushSent = 0;

  for (const a of dueAssignments) {
    const unsubmitted = await all(
      `SELECT st.id
       FROM students st
       LEFT JOIN submissions sub ON sub.assignment_id = ? AND sub.student_id = st.id
       WHERE st.class_id = ? AND sub.id IS NULL`,
      Number(a.id),
      Number(a.class_id),
    );
    const ids = unsubmitted.map(r => Number(r.id));
    if (ids.length > 0) {
      const isToday = String(a.deadline) === today;
      const res = await sendPushToStudents(ids, {
        type: 'reminder',
        title: isToday ? `Hạn nộp hôm nay: ${a.title}` : `Nhắc hạn ngày mai: ${a.title}`,
        body: isToday
          ? 'Bài tập đến hạn nộp hôm nay. Con nhớ hoàn thành và nộp cho cô An nhé!'
          : 'Ngày mai là hạn nộp bài tập này rồi. Con tranh thủ làm sớm nhé!',
        url: `/student?tab=homework&assignment=${Number(a.id)}`,
        tag: `reminder-${Number(a.id)}-${today}`,
      });
      studentsNotified += res.notifiedStudents;
      pushSent += res.sent;
    }
    await run('UPDATE assignments SET last_reminded_date=? WHERE id=?', today, Number(a.id));
  }

  return {
    assignmentsChecked: dueAssignments.length,
    studentsNotified,
    pushSent,
  };
}

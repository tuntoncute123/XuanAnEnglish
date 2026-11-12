import type { StudentAssignment, StudentSessionItem, Submission } from './types.ts';

export type HomeworkFilter = 'all' | 'pending' | 'overdue' | 'revision' | 'submitted' | 'reviewed';
export type HomeworkSort = 'priority' | 'newest';

export function homeworkState(assignment: StudentAssignment, submission: Submission | undefined, today: string) {
  const revision = submission?.status === 'needs_revision';
  const pending = !submission || revision;
  return {
    pending,
    revision,
    overdue: pending && assignment.deadline < today,
    dueToday: pending && assignment.deadline === today,
    submitted: !pending,
    reviewed: !pending && (submission?.status === 'reviewed' || Boolean(submission?.feedback)),
  };
}

export function homeworkStats(assignments: StudentAssignment[], submissions: Submission[], today: string) {
  const byAssignment = new Map(submissions.map(s => [s.assignment_id, s]));
  const stats = { total: assignments.length, pending: 0, submitted: 0, overdue: 0, revision: 0, reviewed: 0, dueToday: 0 };
  for (const assignment of assignments) {
    const state = homeworkState(assignment, byAssignment.get(assignment.id), today);
    for (const key of ['pending', 'submitted', 'overdue', 'revision', 'reviewed', 'dueToday'] as const) {
      if (state[key]) stats[key]++;
    }
  }
  return stats;
}

function searchText(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').toLowerCase().trim();
}

export function selectHomework(
  assignments: StudentAssignment[], submissions: Submission[], today: string,
  filter: HomeworkFilter, query = '', sort: HomeworkSort = 'priority',
) {
  const byAssignment = new Map(submissions.map(s => [s.assignment_id, s]));
  const words = searchText(query).split(/\s+/).filter(Boolean);
  return assignments.filter(assignment => {
    const submission = byAssignment.get(assignment.id);
    const state = homeworkState(assignment, submission, today);
    if (filter !== 'all' && !state[filter]) return false;
    const text = searchText(`${assignment.title} ${assignment.instructions} ${submission?.feedback || ''}`);
    return words.every(word => text.includes(word));
  }).sort((a, b) => {
    if (sort === 'newest') return b.id - a.id;
    const aPending = homeworkState(a, byAssignment.get(a.id), today).pending;
    const bPending = homeworkState(b, byAssignment.get(b.id), today).pending;
    if (aPending !== bPending) return aPending ? -1 : 1;
    if (aPending) return a.deadline.localeCompare(b.deadline) || b.id - a.id;
    return b.id - a.id;
  });
}

/** Class times are always in Vietnam/Thailand time, regardless of the browser timezone. */
export function nextStudentSession(sessions: StudentSessionItem[], now: Date) {
  return sessions.map(session => {
    const startsAt = new Date(`${session.date}T${session.time.slice(0, 5)}:00+07:00`).getTime();
    const endsAt = startsAt + session.duration * 60_000;
    return { session, startsAt, endsAt, ongoing: startsAt <= now.getTime() };
  }).filter(item => item.session.session_status !== 'cancelled' && item.endsAt > now.getTime())
    .sort((a, b) => a.startsAt - b.startsAt)[0] || null;
}

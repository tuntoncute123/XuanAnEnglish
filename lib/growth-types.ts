import type { QuizQuestion } from './types';
import type { Mistake } from './growth';
export type VocabCard = {
  id: number;
  class_id: number;
  unit: string;
  word: string;
  meaning: string;
  example: string;
  due?: string | null;
  interval_days?: number;
};
export type SpeakingTask = {
  id: number;
  class_id: number;
  title: string;
  prompt: string;
  sample: string;
  deadline: string;
};
export type SpeakingAttempt = {
  id: number;
  task_id: number;
  student_id: number;
  file_id: string;
  created_at: string;
  feedback: string;
  pronunciation: number | null;
  fluency: number | null;
  content: number | null;
};
export type ParentAccount = {
  id: number;
  name: string;
  username: string;
  student_ids: number[];
};
export type LeaveRequest = {
  id: number;
  student_id: number;
  session_id: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  response: string;
  makeup_session_id: number | null;
  makeup_status: string | null;
};
export type BankItem = {
  id: number;
  question: QuizQuestion;
  source_key: string;
  unit: string;
  topic: string;
  difficulty: string;
};
export type KnowledgeItem = {
  topic: string;
  total: number;
  correct: number;
  students: number[];
  questions: { prompt: string; wrong: number }[];
};
export type GrowthAdminData = {
  bank: BankItem[];
  knowledge: KnowledgeItem[];
  cards: VocabCard[];
  speakingTasks: SpeakingTask[];
  speakingAttempts: SpeakingAttempt[];
  parents: ParentAccount[];
  leaves: LeaveRequest[];
  slots: { session_id: number; capacity: number }[];
  notes: { student_id: number; week: string; note: string }[];
};
export type LearningData = {
  today: string;
  week: string;
  mistakes: Mistake[];
  cards: VocabCard[];
  avatar: string;
  rewards: { week: string; badge: string }[];
  missions: {
    id: string;
    label: string;
    target: number;
    avatar: string;
    progress: number;
    completed: boolean;
  }[];
  practice: {
    id: number;
    title: string;
    questions: QuizQuestion[];
    answers: Record<string, number> | null;
    completed_at: string | null;
  }[];
  speakingTasks: SpeakingTask[];
  speakingAttempts: SpeakingAttempt[];
};
export type SaveFeature = (body: unknown) => Promise<boolean>;
export type ChildSummary = {
  id: number;
  name: string;
  class_id: number;
  class_name: string;
  note: string;
  attendance: {
    status: string;
    focus: number;
    homework: number;
    date: string;
  }[];
  previous: { focus: number; homework: number }[];
  missing: { id: number; title: string; deadline: string }[];
  submissions: {
    title: string;
    feedback: string;
    score: string;
    status: string;
  }[];
  sessions: {
    id: number;
    date: string;
    time: string;
    topic: string;
    status: string;
    cancellation_reason: string;
  }[];
  leaves: (LeaveRequest & {
    date: string;
    time: string;
    topic: string;
    makeup_date: string | null;
    makeup_time: string | null;
    makeup_class: string | null;
  })[];
  slots: {
    id: number;
    date: string;
    time: string;
    topic: string;
    class_name: string;
    available: number;
  }[];
  speech: {
    title: string;
    created_at: string;
    pronunciation: number | null;
    fluency: number | null;
    content: number | null;
    feedback: string;
  }[];
};
export type ParentData = {
  parent: { name: string; username: string };
  week: string;
  children: ChildSummary[];
};

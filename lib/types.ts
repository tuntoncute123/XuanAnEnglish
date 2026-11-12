export type Class = { id: number; name: string; level: string; fee: number; color: string };
export type Student = {
  id: number;
  name: string;
  parent: string;
  phone: string;
  class_id: number;
  token: string;
  username?: string | null;
  has_password?: boolean;
  push_count?: number;
};
export type Session = { id: number; class_id: number; date: string; time: string; duration: number; topic: string };
export type Attendance = { session_id: number; student_id: number; status: string; focus: number; homework: number; note: string };
export type QuizQuestion = {
  id: string;
  prompt: string;
  options: string[];
  correctIndex: number;
};
export type StudentQuizQuestion = {
  id: string;
  prompt: string;
  options: string[];
  correctIndex?: number;
};
export type SubmissionAttachment = {
  id: string;
  name: string;
  type: string;
};
export type Assignment = {
  id: number;
  class_id: number;
  title: string;
  instructions: string;
  deadline: string;
  file_id: string | null;
  questions?: QuizQuestion[];
  last_reminded_date?: string | null;
};
export type StudentAssignment = Omit<Assignment, 'questions'> & {
  questions?: StudentQuizQuestion[];
};
export type SubmissionStatus = 'submitted' | 'reviewed' | 'needs_revision';
export type Submission = {
  id: number;
  assignment_id: number;
  student_id: number;
  answer: string;
  file_id: string | null;
  attachments?: SubmissionAttachment[];
  quiz_answers?: Record<string, number>;
  submitted_at: string;
  feedback: string;
  score?: string;
  status?: SubmissionStatus;
};
export type BankConfig = {
  bankId: string;
  accountNo: string;
  accountName: string;
};
export type PushDeviceInfo = {
  id: number;
  device_label: string;
  updated_at: string;
  is_current?: boolean;
};
export type ParentMonthlySummary = {
  month: string;
  sessions: number;
  recorded: number;
  attended: number;
  absent: number;
  due: number;
  paid: number;
  balance: number;
  focus: string;
  homework: string;
  notes: string[];
  bank: BankConfig | null;
};
export type StudentNotification = {
  id: number;
  student_id: number;
  type: string;
  title: string;
  body: string;
  url: string;
  is_read: boolean;
  created_at: string;
};
export type StudentSessionItem = {
  id: number;
  date: string;
  time: string;
  duration: number;
  topic: string;
  status: string | null;
  focus: number | null;
  homework: number | null;
  note: string | null;
};
export type StudentPortalData = {
  student: {
    id: number;
    name: string;
    class_id: number;
    class_name?: string;
    class_level?: string;
    username?: string | null;
    has_password?: boolean;
  };
  assignments: StudentAssignment[];
  submissions: Submission[];
  notifications: StudentNotification[];
  unread_count: number;
  sessions: StudentSessionItem[];
  vapidPublicKey: string;
  pushDevicesCount: number;
  pushDevices?: PushDeviceInfo[];
  monthlySummary?: ParentMonthlySummary;
};
export type Data = {
  classes: Class[];
  students: Student[];
  sessions: Session[];
  attendance: Attendance[];
  assignments: Assignment[];
  submissions: Submission[];
  payments: { student_id: number; month: string; amount: number }[];
  templates: string[];
  bank?: BankConfig;
};

'use client';

import { useEffect, useState } from 'react';
import {
  ArrowUpRight,
  Bell,
  BookOpen,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Copy,
  Download,
  KeyRound,
  LayoutDashboard,
  Leaf,
  LogOut,
  Menu,
  Paperclip,
  Pencil,
  Plus,
  QrCode,
  Search,
  Send,
  Settings,
  Trash2,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import type { Assignment, Attendance, Class, Data, QuizQuestion, Session, Student } from '@/lib/types';
import { monthlyReport } from '@/lib/report';

const money = (n: number) => new Intl.NumberFormat('vi-VN').format(n) + ' đ';
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
const dateLabel = (s: string) =>
  new Date(s + 'T12:00:00').toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'long' });

const nav = [
  ['overview', 'Tổng quan', LayoutDashboard],
  ['schedule', 'Thời khóa biểu', CalendarDays],
  ['classes', 'Lớp & học viên', Users],
  ['attendance', 'Điểm danh & nhận xét', ClipboardCheck],
  ['homework', 'Bài tập về nhà', BookOpen],
  ['fees', 'Học phí & báo cáo', Wallet],
] as const;

function randomPass(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 6; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function makeQuizQuestion(): QuizQuestion {
  return {
    id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    prompt: '',
    options: ['', '', '', ''],
    correctIndex: 0,
  };
}

export default function Dashboard({ initial }: { initial: Data }) {
  const [data, setData] = useState(initial);
  const [tab, setTab] = useState('overview');
  const [modal, setModal] = useState('');
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);
  const [mobile, setMobile] = useState(false);

  const [accountStudent, setAccountStudent] = useState<Student | null>(null);
  const [accountUsername, setAccountUsername] = useState('');
  const [accountPassword, setAccountPassword] = useState('');
  const [newStudentPassword, setNewStudentPassword] = useState('');

  const [editingClass, setEditingClass] = useState<Class | null>(null);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [editingSession, setEditingSession] = useState<Session | null>(null);
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null);
  const [keepAssignmentFile, setKeepAssignmentFile] = useState(true);
  const [quizDrafts, setQuizDrafts] = useState<QuizQuestion[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [notifyScope, setNotifyScope] = useState<'all' | 'class' | 'student'>('all');
  const [notifyClassId, setNotifyClassId] = useState<number>(initial.classes[0]?.id || 0);
  const [notifyStudentId, setNotifyStudentId] = useState<number>(initial.students[0]?.id || 0);

  useEffect(() => {
    if (!mobile) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobile(false);
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [mobile]);

  const [filter, setFilter] = useState(0);
  const [query, setQuery] = useState('');
  const [day, setDay] = useState(today());
  const [month, setMonth] = useState(today().slice(0, 7));
  const [selected, setSelected] = useState<Session | null>(null);
  const [records, setRecords] = useState<Attendance[]>([]);

  const currentClass = (id: number) => data.classes.find(c => c.id === id);
  const title = nav.find(n => n[0] === tab)?.[1] || 'Cài đặt & Mẫu nhận xét';

  function notify(t: string) {
    setToast(t);
    setTimeout(() => setToast(prev => (prev === t ? '' : prev)), 4500);
  }

  function closeModals() {
    setModal('');
    setAccountStudent(null);
    setEditingClass(null);
    setEditingStudent(null);
    setEditingSession(null);
    setEditingAssignment(null);
    setConfirmDelete(false);
    setQuizDrafts([]);
  }

  async function save(body: unknown, customToast?: string) {
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      const { notify_summary, ...snapshotData } = d;
      setData(snapshotData as Data);
      closeModals();
      if (notify_summary) {
        notify(
          `Đã gửi thông báo cho ${notify_summary.notifiedStudents} học viên (${notify_summary.sent} thiết bị nhận Web Push)`,
        );
      } else {
        notify(customToast || 'Đã lưu thay đổi');
      }
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function runAutoReminders() {
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/cron/reminders', { method: 'POST' });
      const d = await r.json();
      if (!r.ok) throw Error(d.error || 'Không gửi được nhắc hạn.');
      if (d.assignmentsChecked === 0) {
        notify('Hôm nay và ngày mai chưa có bài tập nào cần nhắc thêm.');
      } else {
        notify(`Đã nhắc ${d.studentsNotified} học viên cho ${d.assignmentsChecked} bài tập (${d.pushSent} thiết bị Push).`);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function openSession(s: Session) {
    setSelected(s);
    setRecords(
      data.students
        .filter(st => st.class_id === s.class_id)
        .map(
          st =>
            data.attendance.find(a => a.session_id === s.id && a.student_id === st.id) || {
              session_id: s.id,
              student_id: st.id,
              status: 'present',
              focus: 3,
              homework: 3,
              note: '',
            },
        ),
    );
    setTab('attendance');
  }

  function changeRecord(id: number, key: string, value: string | number) {
    setRecords(rs => rs.map(r => (r.student_id === id ? { ...r, [key]: value } : r)));
  }

  function openAccountModal(s: Student) {
    setError('');
    setAccountStudent(s);
    setAccountUsername(s.username || '');
    setAccountPassword('');
  }

  async function copyCredentials(username: string, password: string) {
    const loginUrl = `${location.origin}/student`;
    const lines = [
      'Cổng học tập Xuân An English:',
      `• Đường dẫn: ${loginUrl}`,
      `• Tên đăng nhập: ${username}`,
      password ? `• Mật khẩu: ${password}` : '• Mật khẩu: dùng mật khẩu hiện tại của con',
      'Mở trên điện thoại và chọn "Thêm vào màn hình chính" để nhận thông báo bài tập nhé!',
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      notify('Đã sao chép thông tin đăng nhập để gửi cho học viên');
    } catch {
      setError('Trình duyệt không cho phép sao chép tự động.');
    }
  }

  const todaySessions = data.sessions.filter(s => s.date === today());
  const sessions = data.sessions.filter(s => s.date === day && (!filter || s.class_id === filter));

  function renderClassSelect(defaultVal?: number) {
    return (
      <label>
        Lớp học
        <select name="class_id" defaultValue={defaultVal || data.classes[0]?.id} required>
          {data.classes.map(c => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
    );
  }

  function shiftDay(n: number) {
    const d = new Date(day + 'T12:00:00');
    d.setDate(d.getDate() + n);
    setDay(d.toLocaleDateString('en-CA'));
  }

  function exportReport() {
    const rows = [
      ['Học viên', 'Lớp', 'Buổi đã học', 'Buổi vắng', 'Tập trung', 'BTVN', 'Học phí', 'Đã đóng', 'Còn lại', 'Nhận xét'],
      ...data.students
        .filter(s => !filter || s.class_id === filter)
        .map(s => {
          const r = monthlyReport(data, s, month);
          return [
            s.name,
            currentClass(s.class_id)?.name,
            r.attended,
            r.absent,
            r.focus,
            r.homework,
            r.due,
            r.paid,
            r.balance,
            r.notes.join(' | '),
          ];
        }),
    ];
    const csv =
      '\uFEFF' +
      rows
        .map(row => row.map(v => '"' + String(v ?? '').replace(/"/g, '""').replace(/^[=+@-]/, "'") + '"').join(','))
        .join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `bao-cao-${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function cleanValidQuizzes(drafts: QuizQuestion[]): QuizQuestion[] {
    return drafts
      .map(q => {
        const cleanOpts = q.options.map(o => o.trim()).filter(Boolean);
        const safeCorrect = q.correctIndex < cleanOpts.length ? q.correctIndex : 0;
        return { ...q, prompt: q.prompt.trim(), options: cleanOpts, correctIndex: safeCorrect };
      })
      .filter(q => q.prompt.length > 0 && q.options.length >= 2);
  }

  return (
    <div className="app-shell">
      {mobile && <button className="sidebar-scrim" aria-label="Đóng menu" onClick={() => setMobile(false)} />}
      <aside id="teacher-sidebar" className={mobile ? 'sidebar open' : 'sidebar'}>
        <button className="sidebar-close" aria-label="Đóng menu" onClick={() => setMobile(false)}>
          <X size={22} />
        </button>
        <a className="brand" href="/">
          <span className="brand-mark">
            a<span>✦</span>
          </span>
          <div>
            xuân an<span>ENGLISH STUDIO</span>
          </div>
        </a>
        <p className="nav-label">KHÔNG GIAN GIÁO VIÊN</p>
        <nav>
          {nav.map(([id, label, Icon]) => (
            <button
              key={id}
              onClick={() => {
                setTab(id);
                setSelected(null);
                setMobile(false);
                setError('');
              }}
              className={tab === id ? 'active' : ''}
            >
              <Icon size={19} />
              {label}
              {id === 'homework' && <span className="nav-count">{data.assignments.length}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="grow-card">
            <Leaf size={24} />
            <strong>
              Từng chút một,
              <br />
              các con lớn lên.
            </strong>
            <p>An đang làm rất tốt 🌱</p>
          </div>
          <button
            className={tab === 'settings' ? 'active' : ''}
            onClick={() => {
              setTab('settings');
              setMobile(false);
            }}
          >
            <Settings size={18} />
            Cài đặt & Mẫu nhận xét
          </button>
          <div className="profile">
            <span className="avatar">A</span>
            <div>
              <strong>Cô Xuân An</strong>
              <small>Giáo viên tiếng Anh</small>
            </div>
            <button
              aria-label="Đăng xuất"
              onClick={async () => {
                await fetch('/api/logout', { method: 'POST' });
                location.reload();
              }}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>

      <main className="main">
        <header>
          <div className="breadcrumb">
            <button
              className="mobile-menu"
              onClick={() => setMobile(true)}
              aria-label="Mở menu"
              aria-expanded={mobile}
              aria-controls="teacher-sidebar"
            >
              <Menu />
            </button>
            Không gian của An <span>/</span>
            <strong>{title}</strong>
          </div>
          <div className="header-right">
            <span className="live-dot" /> Học một chút, tiến xa hơn <span className="avatar small">A</span>
          </div>
        </header>

        <div className="content">
          {error && (
            <div className="error banner" role="alert">
              {error}
              <button onClick={() => setError('')} aria-label="Đóng lỗi">
                <X size={16} />
              </button>
            </div>
          )}

          <div className="page-heading">
            <div>
              <p className="eyebrow">{tab === 'overview' ? 'LỚP HỌC CỦA AN' : 'XUÂN AN ENGLISH'}</p>
              <h1>
                {tab === 'overview' ? 'Một ngày thật tốt, An nhé' : title}
                {tab === 'overview' && <span className="sun">☀</span>}
              </h1>
              <p className="muted">
                {tab === 'overview'
                  ? 'Mọi điều nhỏ trong lớp học, đã có một nơi để chăm chút.'
                  : 'Sắp xếp gọn gàng, dành thêm thời gian cho các con.'}
              </p>
            </div>
            <div className="inline">
              <button
                className="secondary"
                onClick={() => {
                  setError('');
                  setNotifyScope('all');
                  setNotifyClassId(data.classes[0]?.id || 0);
                  setNotifyStudentId(data.students[0]?.id || 0);
                  setModal('notify');
                }}
              >
                <Bell size={16} />
                Gửi thông báo
              </button>
              <button
                className="primary"
                onClick={() => {
                  setError('');
                  setNewStudentPassword('');
                  setQuizDrafts([]);
                  setModal(tab === 'classes' ? 'student' : tab === 'homework' ? 'assignment' : 'session');
                }}
              >
                <Plus size={18} />
                {tab === 'classes' ? 'Thêm học viên' : tab === 'homework' ? 'Giao bài tập' : 'Thêm buổi học'}
              </button>
            </div>
          </div>

          {tab === 'overview' && (
            <>
              <section className="welcome-strip">
                <div>
                  <span className="pill">MỖI NGÀY MỘT CHÚT TIẾN BỘ</span>
                  <h2>
                    Những lớp học nhỏ.
                    <br />
                    <em>Những ước mơ lớn.</em>
                  </h2>
                  <p>Cùng các con viết tiếp hành trình học tiếng Anh.</p>
                  <button onClick={() => setTab('schedule')}>
                    Xem lịch giảng dạy <ArrowUpRight size={16} />
                  </button>
                </div>
                <div className="hero-art" aria-hidden="true">
                  <div className="orbit" />
                  <span className="art-star">✦</span>
                  <div className="book book-back" />
                  <div className="book">
                    <span>ABC</span>
                    <i>✦</i>
                    <small>
                      little steps,
                      <br />
                      big futures.
                    </small>
                  </div>
                  <span className="art-flower">✿</span>
                  <span className="art-dot" />
                </div>
              </section>

              <div className="stats-grid">
                {[
                  [Users, 'Học viên đang học', data.students.length, 'Trong ' + data.classes.length + ' lớp học', 'green'],
                  [CalendarDays, 'Buổi học hôm nay', todaySessions.length, 'Sẵn sàng cho một ngày mới', 'orange'],
                  [
                    ClipboardCheck,
                    'Đã điểm danh hôm nay',
                    todaySessions.filter(s => data.attendance.some(a => a.session_id === s.id)).length,
                    'Cập nhật sau mỗi buổi học',
                    'purple',
                  ],
                  [BookOpen, 'Bài tập đã giao', data.assignments.length, data.submissions.length + ' bài nộp từ học viên', 'blue'],
                ].map(([Icon, label, value, sub, color], i) => {
                  const I = Icon as typeof Users;
                  return (
                    <div className="stat-card" key={i}>
                      <span className={'icon-box ' + color}>
                        <I size={21} />
                      </span>
                      <p>{String(label)}</p>
                      <strong>{String(value).padStart(2, '0')}</strong>
                      <small>{String(sub)}</small>
                    </div>
                  );
                })}
              </div>

              <div className="overview-grid">
                <section className="panel">
                  <div className="section-heading">
                    <div>
                      <h2>
                        Lịch dạy hôm nay <span className="count">{todaySessions.length}</span>
                      </h2>
                      <p>{dateLabel(today())}</p>
                    </div>
                    <button className="text-button" onClick={() => setTab('schedule')}>
                      Xem tất cả <ArrowUpRight size={15} />
                    </button>
                  </div>
                  {todaySessions.length ? (
                    todaySessions.map(s => (
                      <div className="session-row" key={s.id}>
                        <div className="time">
                          <strong>{s.time}</strong>
                          <small>{s.duration} phút</small>
                        </div>
                        <div className={'session-line ' + currentClass(s.class_id)?.color} />
                        <div className="session-info">
                          <strong>{currentClass(s.class_id)?.name}</strong>
                          <p>{s.topic || 'Buổi học tiếng Anh'}</p>
                          <small>
                            <Users size={13} /> {data.students.filter(st => st.class_id === s.class_id).length} học viên
                          </small>
                        </div>
                        <button className="soft-button" onClick={() => openSession(s)}>
                          {data.attendance.some(a => a.session_id === s.id) ? 'Xem nhận xét' : 'Vào điểm danh'}{' '}
                          <ArrowUpRight size={14} />
                        </button>
                      </div>
                    ))
                  ) : (
                    <Empty text="Hôm nay chưa có lịch học. An có thể thêm buổi học mới." />
                  )}
                  <div className="panel-footer">
                    <span className="live-dot" /> Một buổi học tốt bắt đầu từ những chuẩn bị nhỏ.
                  </div>
                </section>

                <section className="panel quick-panel">
                  <div className="section-heading">
                    <h2>Góc làm việc</h2>
                    <span>✧</span>
                  </div>
                  {[
                    ['attendance', 'Điểm danh & nhận xét', 'Ghi lại tiến bộ sau mỗi buổi', ClipboardCheck],
                    ['homework', 'Giao bài tập về nhà', 'Thêm chút thực hành cho các con', BookOpen],
                    ['fees', 'Tổng hợp cuối tháng', 'Học phí và hành trình tiến bộ', Wallet],
                  ].map(([id, t, sub, Icon]) => {
                    const I = Icon as typeof Users;
                    return (
                      <button key={String(id)} className="quick-link" onClick={() => setTab(String(id))}>
                        <span className="icon-box green">
                          <I size={20} />
                        </span>
                        <span>
                          <strong>{String(t)}</strong>
                          <small>{String(sub)}</small>
                        </span>
                        <ArrowUpRight size={17} />
                      </button>
                    );
                  })}
                  <div className="note">
                    <span>✎</span>
                    <p>
                      “Every child learns at their own pace.
                      <br />
                      Every little step counts.”
                    </p>
                  </div>
                </section>
              </div>

              <section className="panel">
                <div className="section-heading">
                  <div>
                    <h2>Những lớp học của An</h2>
                    <p>Mỗi lớp là một khu vườn nhỏ.</p>
                  </div>
                  <button className="text-button" onClick={() => setTab('classes')}>
                    Quản lý lớp <ArrowUpRight size={15} />
                  </button>
                </div>
                <div className="class-grid">
                  {data.classes.map(c => (
                    <button
                      className="class-card"
                      key={c.id}
                      onClick={() => {
                        setFilter(c.id);
                        setTab('classes');
                      }}
                    >
                      <span className={'class-symbol ' + c.color}>
                        {c.name[0]}
                        <span>✦</span>
                      </span>
                      <div>
                        <h3>{c.name}</h3>
                        <p>{c.level}</p>
                        <small>
                          {data.students.filter(s => s.class_id === c.id).length} học viên <span>·</span> {money(c.fee)}/buổi
                        </small>
                      </div>
                      <ArrowUpRight size={18} />
                    </button>
                  ))}
                </div>
              </section>
            </>
          )}

          {tab !== 'overview' && tab !== 'settings' && (
            <div className="toolbar">
              <div className="tabs">
                <button className={!filter ? 'selected' : ''} onClick={() => setFilter(0)}>
                  Tất cả lớp
                </button>
                {data.classes.map(c => (
                  <button className={filter === c.id ? 'selected' : ''} key={c.id} onClick={() => setFilter(c.id)}>
                    {c.name}
                  </button>
                ))}
              </div>
              {tab === 'classes' && (
                <div className="inline">
                  {filter > 0 && currentClass(filter) && (
                    <button
                      className="secondary"
                      onClick={() => {
                        setError('');
                        setConfirmDelete(false);
                        setEditingClass(currentClass(filter)!);
                      }}
                    >
                      <Pencil size={15} />
                      Sửa lớp
                    </button>
                  )}
                  <button className="secondary" onClick={() => setModal('class')}>
                    <Plus size={16} />
                    Tạo lớp
                  </button>
                </div>
              )}
            </div>
          )}

          {tab === 'schedule' && (
            <section className="panel">
              <div className="section-heading">
                <div>
                  <h2>Lịch giảng dạy</h2>
                  <p>{dateLabel(day)}</p>
                </div>
                <div className="inline">
                  <button className="icon-button" aria-label="Ngày trước" onClick={() => shiftDay(-1)}>
                    <ChevronLeft size={18} />
                  </button>
                  <input aria-label="Chọn ngày" type="date" value={day} onChange={e => setDay(e.target.value || today())} />
                  <button className="icon-button" aria-label="Ngày sau" onClick={() => shiftDay(1)}>
                    <ChevronRight size={18} />
                  </button>
                  <button className="secondary" onClick={() => setDay(today())}>
                    Hôm nay
                  </button>
                </div>
              </div>
              {sessions.length ? (
                sessions.map(s => (
                  <div className="session-row" key={s.id}>
                    <div className="time">
                      <strong>{s.time}</strong>
                      <small>{s.duration} phút</small>
                    </div>
                    <div className={'session-line ' + currentClass(s.class_id)?.color} />
                    <div className="session-info">
                      <strong>{currentClass(s.class_id)?.name}</strong>
                      <p>{s.topic}</p>
                    </div>
                    <div className="inline">
                      <button
                        className="icon-button"
                        aria-label="Sửa buổi học"
                        onClick={() => {
                          setError('');
                          setConfirmDelete(false);
                          setEditingSession(s);
                        }}
                      >
                        <Pencil size={15} />
                      </button>
                      <button className="soft-button" onClick={() => openSession(s)}>
                        Điểm danh <ArrowUpRight size={16} />
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <Empty text="Ngày này chưa có buổi học. Thêm buổi học để bắt đầu." />
              )}
            </section>
          )}

          {tab === 'classes' && (
            <>
              <section className="panel" style={{ marginBottom: 18 }}>
                <div className="section-heading">
                  <div>
                    <h2>Quản lý các lớp học</h2>
                    <p>Bấm biểu tượng bút để đổi tên lớp, chỉnh học phí hoặc xóa lớp trống.</p>
                  </div>
                </div>
                <div className="class-grid">
                  {data.classes.map(c => (
                    <div className="class-card" key={c.id} style={{ justifyContent: 'space-between' }}>
                      <div className="inline" style={{ minWidth: 0 }}>
                        <span className={'class-symbol ' + c.color}>
                          {c.name[0]}
                          <span>✦</span>
                        </span>
                        <div>
                          <h3>{c.name}</h3>
                          <p>{c.level}</p>
                          <small>
                            {data.students.filter(s => s.class_id === c.id).length} học viên <span>·</span> {money(c.fee)}/buổi
                          </small>
                        </div>
                      </div>
                      <button
                        className="icon-button"
                        aria-label={`Sửa lớp ${c.name}`}
                        onClick={() => {
                          setError('');
                          setConfirmDelete(false);
                          setEditingClass(c);
                        }}
                      >
                        <Pencil size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              </section>

              <section className="panel">
                <div className="section-heading">
                  <div>
                    <h2>Danh sách học viên</h2>
                    <p>
                      Học viên đăng nhập tại <strong>/student</strong> bằng tên đăng nhập & mật khẩu trên mọi thiết bị.
                    </p>
                  </div>
                  <div className="search">
                    <Search size={16} />
                    <input
                      placeholder="Tìm tên, tài khoản, phụ huynh, SĐT…"
                      value={query}
                      onChange={e => setQuery(e.target.value)}
                    />
                  </div>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Học viên</th>
                        <th>Lớp học</th>
                        <th>Tài khoản & Thông báo</th>
                        <th>Phụ huynh / SĐT</th>
                        <th>Thao tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.students
                        .filter(
                          s =>
                            (!filter || s.class_id === filter) &&
                            `${s.name} ${s.username || ''} ${s.parent} ${s.phone}`
                              .toLocaleLowerCase('vi')
                              .includes(query.toLocaleLowerCase('vi')),
                        )
                        .map(s => (
                          <tr key={s.id}>
                            <td>
                              <div className="person">
                                <span className="avatar pastel">{s.name.split(' ').at(-1)?.[0]}</span>
                                <strong>{s.name}</strong>
                              </div>
                            </td>
                            <td>
                              <span className="badge">{currentClass(s.class_id)?.name}</span>
                            </td>
                            <td>
                              <div className="account-cell">
                                <strong>@{s.username || 'chua-co'}</strong>
                                <small className="block">
                                  {s.has_password ? 'Đã cấp mật khẩu' : 'Chưa đặt mật khẩu'}
                                  {' · '}
                                  {s.push_count && s.push_count > 0
                                    ? `🔔 ${s.push_count} thiết bị`
                                    : 'Chưa bật Push'}
                                </small>
                              </div>
                            </td>
                            <td>
                              {s.parent || '—'}
                              {s.phone ? <small className="block">{s.phone}</small> : null}
                            </td>
                            <td>
                              <button
                                className="text-button"
                                onClick={() => {
                                  setError('');
                                  setConfirmDelete(false);
                                  setEditingStudent(s);
                                }}
                              >
                                <Pencil size={13} /> Sửa
                              </button>
                              <button className="text-button" onClick={() => openAccountModal(s)}>
                                <KeyRound size={13} /> Tài khoản
                              </button>
                              <button
                                className="text-button"
                                onClick={async () => {
                                  try {
                                    await navigator.clipboard.writeText(location.origin + '/student/' + s.token);
                                    notify('Đã sao chép liên kết riêng của học viên');
                                  } catch {
                                    setError('Trình duyệt không cho phép sao chép. Mở cổng bài tập để lấy liên kết.');
                                  }
                                }}
                              >
                                Sao chép link
                              </button>
                              <a className="text-button" href={'/student/' + s.token} target="_blank" rel="noreferrer">
                                Mở <ArrowUpRight size={13} />
                              </a>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}

          {tab === 'attendance' &&
            (selected ? (
              <section className="panel">
                <div className="section-heading">
                  <div>
                    <h2>
                      {currentClass(selected.class_id)?.name} · {selected.time}
                    </h2>
                    <p>
                      {dateLabel(selected.date)} · {selected.topic}
                    </p>
                  </div>
                  <button className="secondary" onClick={() => setSelected(null)}>
                    Chọn buổi khác
                  </button>
                </div>
                <p className="helper">
                  Chọn mức 1 (cần hỗ trợ) đến 5 (rất tốt). Chỉ học viên có mặt hoặc đi trễ được tính học phí.
                </p>
                {records.length ? (
                  records.map(r => (
                    <div className="review-row" key={r.student_id}>
                      <div className="review-top">
                        <strong>{data.students.find(s => s.id === r.student_id)?.name}</strong>
                        <select
                          aria-label="Trạng thái điểm danh"
                          value={r.status}
                          onChange={e => changeRecord(r.student_id, 'status', e.target.value)}
                        >
                          <option value="present">✓ Có mặt</option>
                          <option value="late">Đi trễ</option>
                          <option value="excused">Vắng có phép</option>
                          <option value="absent">Vắng</option>
                        </select>
                      </div>
                      <div className="ratings">
                        {[
                          ['focus', 'Mức độ tập trung'],
                          ['homework', 'Hoàn thành BTVN'],
                        ].map(([key, label]) => (
                          <div key={key}>
                            <label>{label}</label>
                            <div className="rating">
                              {[1, 2, 3, 4, 5].map(n => (
                                <button
                                  key={n}
                                  className={r[key as 'focus' | 'homework'] === n ? 'chosen' : ''}
                                  onClick={() => changeRecord(r.student_id, key, n)}
                                >
                                  {n}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                      <textarea
                        placeholder="Nhận xét riêng cho buổi học…"
                        value={r.note}
                        onChange={e => changeRecord(r.student_id, 'note', e.target.value)}
                      />
                      <select
                        aria-label="Thêm mẫu nhận xét"
                        value=""
                        onChange={e =>
                          changeRecord(
                            r.student_id,
                            'note',
                            [r.note, e.target.value].filter(Boolean).join(' '),
                          )
                        }
                      >
                        <option value="">+ Chọn nhận xét có sẵn</option>
                        {data.templates.map(t => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))
                ) : (
                  <Empty text="Lớp chưa có học viên. Thêm học viên trước khi điểm danh." />
                )}
                <div className="form-footer">
                  <button
                    className="primary"
                    disabled={busy || !records.length}
                    onClick={() => save({ action: 'attendance', session_id: selected.id, records })}
                  >
                    <Check size={17} />
                    {busy ? 'Đang lưu…' : 'Lưu điểm danh & nhận xét'}
                  </button>
                </div>
              </section>
            ) : (
              <section className="panel">
                <div className="section-heading">
                  <h2>Chọn buổi học để điểm danh</h2>
                </div>
                {data.sessions
                  .filter(s => !filter || s.class_id === filter)
                  .slice()
                  .reverse()
                  .map(s => (
                    <button className="session-picker" key={s.id} onClick={() => openSession(s)}>
                      <span>
                        <strong>{currentClass(s.class_id)?.name}</strong>
                        <small>
                          {dateLabel(s.date)} · {s.time}
                        </small>
                      </span>
                      <span className="badge">
                        {data.attendance.some(a => a.session_id === s.id) ? 'Đã lưu' : 'Chưa điểm danh'}
                      </span>
                      <ArrowUpRight size={18} />
                    </button>
                  ))}
                {!data.sessions.length && <Empty text="Thêm buổi học để bắt đầu điểm danh." />}
              </section>
            ))}

          {tab === 'homework' && (
            <div className="inline between" style={{ marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
              <p className="helper homework-help" style={{ margin: 0, flex: 1 }}>
                Học viên làm bài tại <strong>/student</strong> hoặc liên kết riêng. Có thể đính kèm nhiều ảnh, ghi âm giọng nói và làm trắc nghiệm tự chấm.
              </p>
              <button className="secondary" disabled={busy} onClick={runAutoReminders}>
                <Bell size={15} /> Nhắc hạn hôm nay / ngày mai
              </button>
            </div>
          )}

          {tab === 'homework' && (
            <div className="assignment-grid">
              {data.assignments
                .filter(a => !filter || a.class_id === filter)
                .map(a => {
                  const classStudentsCount = data.students.filter(s => s.class_id === a.class_id).length;
                  const subs = data.submissions.filter(s => s.assignment_id === a.id);
                  const unsubmittedCount = Math.max(0, classStudentsCount - subs.length);
                  const quizCount = a.questions?.length || 0;
                  return (
                    <section className="panel assignment" key={a.id}>
                      <div className="inline between">
                        <div className="inline" style={{ gap: 6, flexWrap: 'wrap' }}>
                          <span className="badge">{currentClass(a.class_id)?.name}</span>
                          {quizCount > 0 && <span className="badge">{quizCount} câu trắc nghiệm</span>}
                        </div>
                        <div className="inline">
                          <small>Hạn nộp: {a.deadline.split('-').reverse().join('/')}</small>
                          <button
                            className="icon-button"
                            aria-label="Sửa bài tập"
                            onClick={() => {
                              setError('');
                              setConfirmDelete(false);
                              setEditingAssignment(a);
                              setKeepAssignmentFile(Boolean(a.file_id));
                              setQuizDrafts(a.questions ? a.questions.map(q => ({ ...q, options: [...q.options] })) : []);
                            }}
                          >
                            <Pencil size={14} />
                          </button>
                        </div>
                      </div>
                      <h2>{a.title}</h2>
                      <p className="pre-wrap">{a.instructions}</p>
                      <div className="inline between" style={{ flexWrap: 'wrap', gap: 10 }}>
                        {a.file_id ? (
                          <a className="text-button" href={'/api/download/' + a.file_id}>
                            <Download size={15} />
                            Tải đề bài
                          </a>
                        ) : (
                          <span />
                        )}
                        {unsubmittedCount > 0 && (
                          <button
                            className="soft-button"
                            disabled={busy}
                            onClick={() =>
                              save({
                                action: 'notify',
                                assignment_id: a.id,
                                title: `Nhắc làm bài: ${a.title}`,
                                body: `Hạn nộp ${a.deadline.split('-').reverse().join('/')} · Con nhớ hoàn thành và nộp bài cho cô An nhé!`,
                              })
                            }
                          >
                            <Bell size={14} /> Nhắc {unsubmittedCount} bạn chưa nộp
                          </button>
                        )}
                      </div>

                      <div className="submission-count">
                        <BookOpen size={17} />
                        {subs.length}/{classStudentsCount} học viên đã nộp
                      </div>
                      {subs.map(s => {
                        const atts = s.attachments && s.attachments.length > 0 ? s.attachments : s.file_id ? [{ id: s.file_id, name: 'Tệp đính kèm', type: '' }] : [];
                        return (
                          <details key={s.id}>
                            <summary>
                              {data.students.find(st => st.id === s.student_id)?.name}
                              <span>
                                {s.score ? `${s.score} · ` : ''}
                                {s.status === 'needs_revision'
                                  ? 'Cần sửa lại'
                                  : s.feedback || s.status === 'reviewed'
                                    ? 'Đã chấm'
                                    : 'Chờ chấm'}
                              </span>
                            </summary>
                            {s.answer && <p className="pre-wrap">{s.answer}</p>}

                            {quizCount > 0 && s.quiz_answers && Object.keys(s.quiz_answers).length > 0 && (
                              <div className="teacher-quiz-summary">
                                {(a.questions || []).map((q, qi) => {
                                  const picked = s.quiz_answers?.[q.id];
                                  const ok = picked === q.correctIndex;
                                  return (
                                    <div key={q.id} className="teacher-quiz-line">
                                      <span>
                                        Câu {qi + 1}: {picked !== undefined ? String.fromCharCode(65 + picked) : '—'}
                                      </span>
                                      <strong style={{ color: ok ? '#346d50' : '#a64439' }}>
                                        {ok ? '✓ Đúng' : `✗ Đáp án ${String.fromCharCode(65 + q.correctIndex)}`}
                                      </strong>
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            {atts.map(att => (
                              <div key={att.id} style={{ marginTop: 8 }}>
                                <a className="text-button" href={`/api/download/${att.id}`}>
                                  <Paperclip size={13} /> {att.name} ↓
                                </a>
                                {att.type.startsWith('audio/') && (
                                  <audio controls preload="metadata" className="audio-preview" src={`/api/download/${att.id}?inline=1`} />
                                )}
                                {att.type.startsWith('image/') && (
                                  <img src={`/api/download/${att.id}?inline=1`} alt={att.name} className="attachment-thumb" loading="lazy" />
                                )}
                              </div>
                            ))}

                            <form
                              onSubmit={e => {
                                e.preventDefault();
                                const fd = new FormData(e.currentTarget);
                                save({
                                  action: 'feedback',
                                  id: s.id,
                                  score: String(fd.get('score') || ''),
                                  status: String(fd.get('status') || 'reviewed'),
                                  feedback: String(fd.get('feedback') || ''),
                                  notify: true,
                                });
                              }}
                            >
                              <div className="form-grid">
                                <label>
                                  Điểm / Xếp loại
                                  <input name="score" defaultValue={s.score || ''} maxLength={40} placeholder="Ví dụ: 9/10 hoặc A+" />
                                </label>
                                <label>
                                  Trạng thái
                                  <select name="status" defaultValue={s.status === 'needs_revision' ? 'needs_revision' : 'reviewed'}>
                                    <option value="reviewed">✓ Đã chấm xong</option>
                                    <option value="needs_revision">↻ Nhờ con sửa lại</option>
                                  </select>
                                </label>
                              </div>
                              <textarea
                                aria-label="Phản hồi bài tập"
                                name="feedback"
                                defaultValue={s.feedback}
                                placeholder="Gửi nhận xét cho con (tự động gửi thông báo Push)…"
                              />
                              <button disabled={busy} className="secondary">
                                Lưu chấm bài & Thông báo
                              </button>
                            </form>
                          </details>
                        );
                      })}
                    </section>
                  );
                })}
              {!data.assignments.some(a => !filter || a.class_id === filter) && (
                <Empty
                  text={
                    filter
                      ? 'Lớp này chưa có bài tập. An hãy giao bài đầu tiên nhé.'
                      : 'Chưa có bài tập. An hãy giao bài đầu tiên nhé.'
                  }
                />
              )}
            </div>
          )}

          {tab === 'fees' && (
            <>
              <div className="report-toolbar">
                <label>
                  Tháng báo cáo
                  <input type="month" value={month} onChange={e => setMonth(e.target.value || today().slice(0, 7))} />
                </label>
                <button className="secondary" onClick={exportReport}>
                  <Download size={17} />
                  Xuất báo cáo CSV
                </button>
              </div>
              <p className="helper">
                Học phí = số buổi có mặt hoặc đi trễ × đơn giá hiện tại của lớp. Buổi chưa điểm danh chưa được tính. Số
                đã đóng là tổng tiền của tháng. Phụ huynh có thể xem tổng kết và mã QR đóng học phí ngay trên cổng học viên.
              </p>
              <div className="stats-grid three">
                {[
                  [
                    'Học phí trong tháng',
                    data.students
                      .filter(s => !filter || s.class_id === filter)
                      .reduce((n, s) => n + monthlyReport(data, s, month).due, 0),
                  ],
                  [
                    'Đã thu',
                    data.students
                      .filter(s => !filter || s.class_id === filter)
                      .reduce((n, s) => n + monthlyReport(data, s, month).paid, 0),
                  ],
                  [
                    'Còn cần thu',
                    data.students
                      .filter(s => !filter || s.class_id === filter)
                      .reduce((n, s) => n + Math.max(monthlyReport(data, s, month).balance, 0), 0),
                  ],
                ].map(([label, value]) => (
                  <div className="stat-card" key={String(label)}>
                    <p>{label}</p>
                    <strong className="money">{money(Number(value))}</strong>
                  </div>
                ))}
              </div>
              <section className="panel">
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Học viên / nhận xét tháng</th>
                        <th>Buổi học</th>
                        <th>Tập trung / BTVN</th>
                        <th>Học phí</th>
                        <th>Đã đóng</th>
                        <th>Còn lại</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.students
                        .filter(s => !filter || s.class_id === filter)
                        .map(s => {
                          const r = monthlyReport(data, s, month);
                          return (
                            <tr key={s.id}>
                              <td>
                                <strong>{s.name}</strong>
                                <small className="block">{currentClass(s.class_id)?.name}</small>
                                <details>
                                  <summary>Xem nhận xét tháng</summary>
                                  <p>
                                    Đã học {r.attended} buổi · Vắng {r.absent} buổi · {r.sessions - r.recorded} buổi
                                    chưa điểm danh.
                                  </p>
                                  {r.notes.length ? (
                                    r.notes.map((n, i) => <p key={i}>{n}</p>)
                                  ) : (
                                    <p>Chưa có nhận xét trong tháng.</p>
                                  )}
                                </details>
                              </td>
                              <td>
                                {r.attended}/{r.sessions}
                              </td>
                              <td>
                                {r.focus} / {r.homework}
                              </td>
                              <td>{money(r.due)}</td>
                              <td>
                                <form
                                  className="payment-form"
                                  onSubmit={e => {
                                    e.preventDefault();
                                    save({
                                      action: 'payment',
                                      student_id: s.id,
                                      month,
                                      amount: Number(new FormData(e.currentTarget).get('amount')),
                                    });
                                  }}
                                >
                                  <input
                                    key={month + '-' + r.paid}
                                    aria-label={'Số tiền đã đóng của ' + s.name}
                                    name="amount"
                                    type="number"
                                    min="0"
                                    max="100000000"
                                    defaultValue={r.paid}
                                    required
                                  />
                                  <button className="icon-button" disabled={busy} aria-label="Lưu tiền đã đóng">
                                    <Check size={16} />
                                  </button>
                                </form>
                              </td>
                              <td>
                                <span className={r.balance > 0 ? 'due' : 'paid'}>
                                  {r.balance < 0 ? 'Dư ' + money(-r.balance) : money(r.balance)}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}

          {tab === 'settings' && (
            <div className="settings-stack">
              <section className="panel settings-panel">
                <h2>Mẫu nhận xét của An</h2>
                <p className="muted">Mỗi dòng là một mẫu. Các mẫu này sẽ xuất hiện trong phần nhận xét từng buổi.</p>
                <form
                  onSubmit={e => {
                    e.preventDefault();
                    save({
                      action: 'templates',
                      templates: String(new FormData(e.currentTarget).get('templates'))
                        .split('\n')
                        .map(s => s.trim())
                        .filter(Boolean),
                    });
                  }}
                >
                  <textarea name="templates" defaultValue={data.templates.join('\n')} rows={8} required />
                  <button className="primary" disabled={busy}>
                    Lưu mẫu nhận xét
                  </button>
                </form>
              </section>

              <section className="panel settings-panel">
                <h2 className="inline" style={{ gap: 8 }}>
                  <QrCode size={18} /> Tài khoản nhận học phí (VietQR)
                </h2>
                <p className="muted">
                  Khi cấu hình thông tin này, phụ huynh xem cổng học viên sẽ thấy mã QR chuyển khoản đúng số học phí còn thiếu của tháng.
                </p>
                <form
                  onSubmit={e => {
                    e.preventDefault();
                    const fd = new FormData(e.currentTarget);
                    save({
                      action: 'bank',
                      bankId: String(fd.get('bankId') || '').trim(),
                      accountNo: String(fd.get('accountNo') || '').trim(),
                      accountName: String(fd.get('accountName') || '').trim(),
                    });
                  }}
                >
                  <div className="form-grid">
                    <label>
                      Mã ngân hàng (VD: VCB, TCB, MB, ACB, BIDV)
                      <input name="bankId" defaultValue={data.bank?.bankId || ''} maxLength={30} placeholder="VCB" />
                    </label>
                    <label>
                      Số tài khoản
                      <input name="accountNo" defaultValue={data.bank?.accountNo || ''} maxLength={40} placeholder="0123456789" />
                    </label>
                  </div>
                  <label>
                    Tên chủ tài khoản
                    <input
                      name="accountName"
                      defaultValue={data.bank?.accountName || ''}
                      maxLength={100}
                      placeholder="NGUYEN XUAN AN"
                    />
                  </label>
                  <button className="primary" disabled={busy}>
                    Lưu thông tin chuyển khoản
                  </button>
                </form>
              </section>
            </div>
          )}

          <footer>
            Được chăm chút cho những lớp học của An <span>✦</span> Xuân An English
          </footer>
        </div>
      </main>

      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
        </div>
      )}

      {/* Create / Notify Modal */}
      {modal && (
        <div className="modal-backdrop">
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
            <div className="section-heading">
              <h2 id="modal-title">
                {
                  {
                    class: 'Tạo lớp học',
                    student: 'Thêm học viên',
                    session: 'Thêm buổi học',
                    assignment: 'Giao bài tập',
                    notify: 'Gửi thông báo Web Push',
                  }[modal]
                }
              </h2>
              <button className="icon-button" onClick={closeModals} aria-label="Đóng">
                <X size={20} />
              </button>
            </div>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <form
              onSubmit={async e => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                const values = Object.fromEntries(form);
                let file_id = null;

                if (modal === 'notify') {
                  const payload: Record<string, unknown> = {
                    action: 'notify',
                    title: String(values.title || ''),
                    body: String(values.body || ''),
                  };
                  if (notifyScope === 'class' && notifyClassId) payload.class_id = notifyClassId;
                  if (notifyScope === 'student' && notifyStudentId) payload.student_id = notifyStudentId;
                  await save(payload);
                  return;
                }

                if (modal === 'assignment' && (form.get('file') as File)?.size) {
                  setBusy(true);
                  try {
                    const f = new FormData();
                    f.set('file', form.get('file')!);
                    const res = await fetch('/api/files', { method: 'POST', body: f });
                    const file = await res.json();
                    if (!res.ok) throw Error(file.error);
                    file_id = file.id;
                  } catch (err) {
                    setError((err as Error).message);
                    setBusy(false);
                    return;
                  }
                }

                const body: Record<string, unknown> = {
                  ...values,
                  action: modal,
                  ...(values.class_id ? { class_id: Number(values.class_id) } : {}),
                  ...(modal === 'class' ? { fee: Number(values.fee) } : {}),
                  ...(modal === 'session'
                    ? { duration: Number(values.duration), repeat_weeks: Number(values.repeat_weeks || 1) }
                    : {}),
                  ...(modal === 'assignment'
                    ? {
                        file_id,
                        questions: cleanValidQuizzes(quizDrafts),
                        notify: form.get('notify') === 'on',
                      }
                    : {}),
                };
                delete body.file;
                await save(body);
              }}
            >
              {modal === 'class' && (
                <>
                  <label>
                    Tên lớp
                    <input name="name" required maxLength={200} placeholder="Ví dụ: Starters A2" />
                  </label>
                  <label>
                    Trình độ
                    <input name="level" required placeholder="Cambridge Starters" />
                  </label>
                  <div className="form-grid">
                    <label>
                      Học phí mỗi buổi (đồng)
                      <input name="fee" type="number" min="0" max="10000000" defaultValue={150000} required />
                    </label>
                    <label>
                      Màu nhận diện
                      <select name="color" defaultValue="green">
                        <option value="green">Xanh lá</option>
                        <option value="purple">Tím pastel</option>
                        <option value="orange">Vàng cam</option>
                      </select>
                    </label>
                  </div>
                </>
              )}

              {modal === 'student' && (
                <>
                  <label>
                    Họ và tên
                    <input name="name" required maxLength={200} />
                  </label>
                  {renderClassSelect(filter || undefined)}
                  <div className="form-grid">
                    <label>
                      Tên phụ huynh
                      <input name="parent" maxLength={200} />
                    </label>
                    <label>
                      Số điện thoại
                      <input name="phone" type="tel" maxLength={30} />
                    </label>
                  </div>
                  <label>
                    Tên đăng nhập (để trống tự tạo)
                    <input name="username" maxLength={50} placeholder="Ví dụ: minhanh1" />
                  </label>
                  <label>
                    Mật khẩu tài khoản (tùy chọn, ≥ 6 ký tự)
                    <div className="inline">
                      <input
                        name="password"
                        type="text"
                        maxLength={100}
                        placeholder="Ví dụ: xa1234"
                        value={newStudentPassword}
                        onChange={e => setNewStudentPassword(e.target.value)}
                        style={{ flex: 1 }}
                      />
                      <button
                        type="button"
                        className="soft-button"
                        onClick={() => setNewStudentPassword(randomPass())}
                      >
                        Tạo nhanh
                      </button>
                    </div>
                  </label>
                </>
              )}

              {modal === 'session' && (
                <>
                  {renderClassSelect(filter || undefined)}
                  <div className="form-grid">
                    <label>
                      Ngày học
                      <input name="date" type="date" defaultValue={day} required />
                    </label>
                    <label>
                      Giờ bắt đầu
                      <input name="time" type="time" defaultValue="17:00" required />
                    </label>
                  </div>
                  <div className="form-grid">
                    <label>
                      Thời lượng (phút)
                      <input name="duration" type="number" min="15" max="480" defaultValue={90} required />
                    </label>
                    <label>
                      Lặp lại hàng tuần
                      <select name="repeat_weeks" defaultValue="1">
                        <option value="1">Không lặp (1 buổi)</option>
                        <option value="4">Lặp 4 tuần</option>
                        <option value="8">Lặp 8 tuần</option>
                        <option value="12">Lặp 12 tuần</option>
                      </select>
                    </label>
                  </div>
                  <label>
                    Nội dung buổi học
                    <input name="topic" maxLength={300} placeholder="Unit 5 · Our world" />
                  </label>
                </>
              )}

              {modal === 'assignment' && (
                <>
                  {renderClassSelect(filter || undefined)}
                  <label>
                    Tên bài tập
                    <input name="title" required maxLength={200} />
                  </label>
                  <label>
                    Hướng dẫn
                    <textarea name="instructions" rows={3} required maxLength={10000} />
                  </label>
                  <div className="form-grid">
                    <label>
                      Hạn nộp
                      <input name="deadline" type="date" defaultValue={today()} required />
                    </label>
                    <label>
                      Tệp đề bài (tối đa 10 MB)
                      <input name="file" type="file" accept=".pdf,.docx,.jpg,.jpeg,.png,.webp,.mp3,.wav,.txt" />
                    </label>
                  </div>

                  <QuizBuilder drafts={quizDrafts} onChange={setQuizDrafts} />

                  <label className="checkbox-row">
                    <input name="notify" type="checkbox" defaultChecked />
                    <span>Tự động gửi thông báo Web Push & trong app cho học viên của lớp</span>
                  </label>
                </>
              )}

              {modal === 'notify' && (
                <>
                  <label>
                    Đối tượng nhận thông báo
                    <select
                      value={notifyScope}
                      onChange={e => setNotifyScope(e.target.value as 'all' | 'class' | 'student')}
                    >
                      <option value="all">Tất cả học viên ({data.students.length} bạn)</option>
                      <option value="class">Theo lớp học</option>
                      <option value="student">Một học viên cụ thể</option>
                    </select>
                  </label>
                  {notifyScope === 'class' && (
                    <label>
                      Chọn lớp
                      <select value={notifyClassId} onChange={e => setNotifyClassId(Number(e.target.value))}>
                        {data.classes.map(c => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {notifyScope === 'student' && (
                    <label>
                      Chọn học viên
                      <select value={notifyStudentId} onChange={e => setNotifyStudentId(Number(e.target.value))}>
                        {data.students.map(s => (
                          <option key={s.id} value={s.id}>
                            {s.name} ({currentClass(s.class_id)?.name})
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <label>
                    Tiêu đề thông báo
                    <input name="title" required maxLength={120} placeholder="Ví dụ: Nhắc lịch học tối nay" />
                  </label>
                  <label>
                    Nội dung thông báo
                    <textarea
                      name="body"
                      rows={4}
                      required
                      maxLength={500}
                      placeholder="Ví dụ: Hôm nay lớp học lúc 18:00, các con nhớ mang theo sách và làm xong bài tập nhé!"
                    />
                  </label>
                </>
              )}

              <div className="form-footer">
                <button className="secondary" type="button" onClick={closeModals}>
                  Hủy
                </button>
                <button className="primary" disabled={busy}>
                  {modal === 'notify' ? <Send size={15} /> : null}
                  {busy ? 'Đang gửi…' : modal === 'notify' ? 'Gửi thông báo' : 'Lưu thông tin'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* Edit Class Modal */}
      {editingClass && (
        <div className="modal-backdrop">
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="edit-class-title">
            <div className="section-heading">
              <h2 id="edit-class-title">Sửa lớp · {editingClass.name}</h2>
              <button className="icon-button" onClick={closeModals} aria-label="Đóng">
                <X size={20} />
              </button>
            </div>
            {error && <p className="error" role="alert">{error}</p>}
            <form
              onSubmit={e => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                save({
                  action: 'update_class',
                  id: editingClass.id,
                  name: String(fd.get('name') || ''),
                  level: String(fd.get('level') || ''),
                  fee: Number(fd.get('fee')),
                  color: String(fd.get('color') || 'green'),
                });
              }}
            >
              <label>
                Tên lớp
                <input name="name" defaultValue={editingClass.name} required maxLength={200} />
              </label>
              <label>
                Trình độ
                <input name="level" defaultValue={editingClass.level} required maxLength={200} />
              </label>
              <div className="form-grid">
                <label>
                  Học phí mỗi buổi (đồng)
                  <input name="fee" type="number" min="0" max="10000000" defaultValue={editingClass.fee} required />
                </label>
                <label>
                  Màu nhận diện
                  <select name="color" defaultValue={editingClass.color}>
                    <option value="green">Xanh lá</option>
                    <option value="purple">Tím pastel</option>
                    <option value="orange">Vàng cam</option>
                  </select>
                </label>
              </div>

              <DeleteConfirmRow
                label="Xóa lớp học này"
                confirming={confirmDelete}
                busy={busy}
                onAsk={() => setConfirmDelete(true)}
                onCancel={() => setConfirmDelete(false)}
                onConfirm={() => save({ action: 'delete_class', id: editingClass.id }, 'Đã xóa lớp học')}
              />

              <div className="form-footer">
                <button className="secondary" type="button" onClick={closeModals}>Hủy</button>
                <button className="primary" disabled={busy}>{busy ? 'Đang lưu…' : 'Cập nhật lớp'}</button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* Edit Student Modal */}
      {editingStudent && (
        <div className="modal-backdrop">
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="edit-student-title">
            <div className="section-heading">
              <h2 id="edit-student-title">Sửa học viên · {editingStudent.name}</h2>
              <button className="icon-button" onClick={closeModals} aria-label="Đóng">
                <X size={20} />
              </button>
            </div>
            {error && <p className="error" role="alert">{error}</p>}
            <form
              onSubmit={e => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                save({
                  action: 'update_student',
                  id: editingStudent.id,
                  name: String(fd.get('name') || ''),
                  class_id: Number(fd.get('class_id')),
                  parent: String(fd.get('parent') || ''),
                  phone: String(fd.get('phone') || ''),
                });
              }}
            >
              <label>
                Họ và tên
                <input name="name" defaultValue={editingStudent.name} required maxLength={200} />
              </label>
              {renderClassSelect(editingStudent.class_id)}
              <div className="form-grid">
                <label>
                  Tên phụ huynh
                  <input name="parent" defaultValue={editingStudent.parent} maxLength={200} />
                </label>
                <label>
                  Số điện thoại
                  <input name="phone" type="tel" defaultValue={editingStudent.phone} maxLength={30} />
                </label>
              </div>

              <DeleteConfirmRow
                label="Xóa học viên này (xóa cả bài nộp & điểm danh)"
                confirming={confirmDelete}
                busy={busy}
                onAsk={() => setConfirmDelete(true)}
                onCancel={() => setConfirmDelete(false)}
                onConfirm={() => save({ action: 'delete_student', id: editingStudent.id }, 'Đã xóa học viên')}
              />

              <div className="form-footer">
                <button className="secondary" type="button" onClick={closeModals}>Hủy</button>
                <button className="primary" disabled={busy}>{busy ? 'Đang lưu…' : 'Cập nhật học viên'}</button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* Edit Session Modal */}
      {editingSession && (
        <div className="modal-backdrop">
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="edit-session-title">
            <div className="section-heading">
              <h2 id="edit-session-title">Sửa buổi học</h2>
              <button className="icon-button" onClick={closeModals} aria-label="Đóng">
                <X size={20} />
              </button>
            </div>
            {error && <p className="error" role="alert">{error}</p>}
            <form
              onSubmit={e => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                save({
                  action: 'update_session',
                  id: editingSession.id,
                  class_id: Number(fd.get('class_id')),
                  date: String(fd.get('date') || ''),
                  time: String(fd.get('time') || ''),
                  duration: Number(fd.get('duration')),
                  topic: String(fd.get('topic') || ''),
                });
              }}
            >
              {renderClassSelect(editingSession.class_id)}
              <div className="form-grid">
                <label>
                  Ngày học
                  <input name="date" type="date" defaultValue={editingSession.date} required />
                </label>
                <label>
                  Giờ bắt đầu
                  <input name="time" type="time" defaultValue={editingSession.time} required />
                </label>
              </div>
              <label>
                Thời lượng (phút)
                <input name="duration" type="number" min="15" max="480" defaultValue={editingSession.duration} required />
              </label>
              <label>
                Nội dung buổi học
                <input name="topic" defaultValue={editingSession.topic} maxLength={300} />
              </label>

              <DeleteConfirmRow
                label="Xóa buổi học này"
                confirming={confirmDelete}
                busy={busy}
                onAsk={() => setConfirmDelete(true)}
                onCancel={() => setConfirmDelete(false)}
                onConfirm={() => save({ action: 'delete_session', id: editingSession.id }, 'Đã xóa buổi học')}
              />

              <div className="form-footer">
                <button className="secondary" type="button" onClick={closeModals}>Hủy</button>
                <button className="primary" disabled={busy}>{busy ? 'Đang lưu…' : 'Cập nhật buổi học'}</button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* Edit Assignment Modal */}
      {editingAssignment && (
        <div className="modal-backdrop">
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="edit-assignment-title">
            <div className="section-heading">
              <h2 id="edit-assignment-title">Sửa bài tập</h2>
              <button className="icon-button" onClick={closeModals} aria-label="Đóng">
                <X size={20} />
              </button>
            </div>
            {error && <p className="error" role="alert">{error}</p>}
            <form
              onSubmit={async e => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                let file_id = keepAssignmentFile ? editingAssignment.file_id : null;
                const newFile = fd.get('file') as File | null;
                if (newFile && newFile.size > 0) {
                  setBusy(true);
                  try {
                    const f = new FormData();
                    f.set('file', newFile);
                    const res = await fetch('/api/files', { method: 'POST', body: f });
                    const file = await res.json();
                    if (!res.ok) throw Error(file.error);
                    file_id = file.id;
                  } catch (err) {
                    setError((err as Error).message);
                    setBusy(false);
                    return;
                  }
                }
                await save({
                  action: 'update_assignment',
                  id: editingAssignment.id,
                  class_id: Number(fd.get('class_id')),
                  title: String(fd.get('title') || ''),
                  instructions: String(fd.get('instructions') || ''),
                  deadline: String(fd.get('deadline') || ''),
                  file_id,
                  questions: cleanValidQuizzes(quizDrafts),
                });
              }}
            >
              {renderClassSelect(editingAssignment.class_id)}
              <label>
                Tên bài tập
                <input name="title" defaultValue={editingAssignment.title} required maxLength={200} />
              </label>
              <label>
                Hướng dẫn
                <textarea name="instructions" defaultValue={editingAssignment.instructions} rows={3} required maxLength={10000} />
              </label>
              <label>
                Hạn nộp
                <input name="deadline" type="date" defaultValue={editingAssignment.deadline} required />
              </label>
              {editingAssignment.file_id && keepAssignmentFile && (
                <div className="inline between">
                  <a className="text-button" href={`/api/download/${editingAssignment.file_id}`}>
                    <Paperclip size={13} /> Đề bài hiện tại
                  </a>
                  <button type="button" className="text-button" onClick={() => setKeepAssignmentFile(false)}>
                    Gỡ tệp cũ
                  </button>
                </div>
              )}
              <label>
                Thay tệp đề bài (tùy chọn, tối đa 10 MB)
                <input name="file" type="file" accept=".pdf,.docx,.jpg,.jpeg,.png,.webp,.mp3,.wav,.txt" />
              </label>

              <QuizBuilder drafts={quizDrafts} onChange={setQuizDrafts} />

              <DeleteConfirmRow
                label="Xóa bài tập này (xóa cả bài nộp liên quan)"
                confirming={confirmDelete}
                busy={busy}
                onAsk={() => setConfirmDelete(true)}
                onCancel={() => setConfirmDelete(false)}
                onConfirm={() => save({ action: 'delete_assignment', id: editingAssignment.id }, 'Đã xóa bài tập')}
              />

              <div className="form-footer">
                <button className="secondary" type="button" onClick={closeModals}>Hủy</button>
                <button className="primary" disabled={busy}>{busy ? 'Đang lưu…' : 'Cập nhật bài tập'}</button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* Student Account Modal */}
      {accountStudent && (
        <div className="modal-backdrop">
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="account-modal-title">
            <div className="section-heading">
              <div>
                <h2 id="account-modal-title">Tài khoản · {accountStudent.name}</h2>
                <p>
                  {currentClass(accountStudent.class_id)?.name} ·{' '}
                  {accountStudent.push_count ? `Đang bật Push trên ${accountStudent.push_count} thiết bị` : 'Chưa bật Web Push'}
                </p>
              </div>
              <button className="icon-button" onClick={closeModals} aria-label="Đóng">
                <X size={20} />
              </button>
            </div>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <form
              onSubmit={async e => {
                e.preventDefault();
                await save(
                  {
                    action: 'student_account',
                    student_id: accountStudent.id,
                    username: accountUsername,
                    password: accountPassword || undefined,
                  },
                  'Đã cập nhật tài khoản học viên',
                );
              }}
            >
              <label>
                Tên đăng nhập (không dấu, tối thiểu 3 ký tự)
                <input
                  required
                  minLength={3}
                  maxLength={50}
                  value={accountUsername}
                  onChange={e => setAccountUsername(e.target.value)}
                />
              </label>

              <label>
                {accountStudent.has_password ? 'Đặt mật khẩu mới (để trống nếu giữ nguyên)' : 'Đặt mật khẩu (tối thiểu 6 ký tự)'}
                <div className="inline">
                  <input
                    type="text"
                    maxLength={100}
                    required={!accountStudent.has_password}
                    minLength={accountPassword ? 6 : undefined}
                    placeholder={accountStudent.has_password ? 'Nhập mật khẩu mới nếu muốn đổi' : 'Ví dụ: xa4829'}
                    value={accountPassword}
                    onChange={e => setAccountPassword(e.target.value)}
                    style={{ flex: 1 }}
                  />
                  <button type="button" className="soft-button" onClick={() => setAccountPassword(randomPass())}>
                    Tạo nhanh
                  </button>
                </div>
              </label>

              <button
                type="button"
                className="secondary"
                onClick={() => copyCredentials(accountUsername || accountStudent.username || '', accountPassword)}
              >
                <Copy size={15} /> Sao chép thông tin đăng nhập (/student)
              </button>

              <div className="form-footer">
                <button className="secondary" type="button" onClick={closeModals}>
                  Đóng
                </button>
                <button className="primary" disabled={busy}>
                  {busy ? 'Đang lưu…' : 'Lưu tài khoản'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

function QuizBuilder({
  drafts,
  onChange,
}: {
  drafts: QuizQuestion[];
  onChange: (next: QuizQuestion[]) => void;
}) {
  return (
    <div className="quiz-builder">
      <div className="inline between">
        <strong style={{ fontSize: 12 }}>Câu hỏi trắc nghiệm tự chấm ({drafts.length})</strong>
        <button
          type="button"
          className="soft-button"
          onClick={() => onChange([...drafts, makeQuizQuestion()])}
        >
          <Plus size={14} /> Thêm câu hỏi
        </button>
      </div>

      {drafts.map((q, qIdx) => (
        <div key={q.id} className="quiz-builder-item">
          <div className="inline between">
            <small>Câu {qIdx + 1}</small>
            <button
              type="button"
              className="text-button"
              onClick={() => onChange(drafts.filter((_, i) => i !== qIdx))}
            >
              Xóa câu
            </button>
          </div>
          <input
            placeholder="Nội dung câu hỏi (VD: Choose the correct animal)"
            value={q.prompt}
            maxLength={500}
            onChange={e =>
              onChange(drafts.map((item, i) => (i === qIdx ? { ...item, prompt: e.target.value } : item)))
            }
          />
          <div className="quiz-builder-options">
            {q.options.map((opt, optIdx) => (
              <div key={optIdx} className="inline">
                <input
                  type="radio"
                  name={`correct-${q.id}`}
                  checked={q.correctIndex === optIdx}
                  onChange={() =>
                    onChange(drafts.map((item, i) => (i === qIdx ? { ...item, correctIndex: optIdx } : item)))
                  }
                  aria-label={`Đáp án đúng câu ${qIdx + 1} lựa chọn ${optIdx + 1}`}
                />
                <input
                  placeholder={`Đáp án ${String.fromCharCode(65 + optIdx)}${optIdx >= 2 ? ' (tùy chọn)' : ''}`}
                  value={opt}
                  maxLength={200}
                  style={{ flex: 1 }}
                  onChange={e =>
                    onChange(
                      drafts.map((item, i) =>
                        i === qIdx
                          ? { ...item, options: item.options.map((o, oi) => (oi === optIdx ? e.target.value : o)) }
                          : item,
                      ),
                    )
                  }
                />
              </div>
            ))}
          </div>
          <small className="muted" style={{ margin: 0 }}>
            Chọn nút tròn bên trái để đánh dấu đáp án đúng.
          </small>
        </div>
      ))}
    </div>
  );
}

function DeleteConfirmRow({
  label,
  confirming,
  busy,
  onAsk,
  onCancel,
  onConfirm,
}: {
  label: string;
  confirming: boolean;
  busy: boolean;
  onAsk: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!confirming) {
    return (
      <button type="button" className="danger-outline-btn" onClick={onAsk}>
        <Trash2 size={14} /> {label}
      </button>
    );
  }
  return (
    <div className="delete-confirm-box">
      <span>Xác nhận xóa? Hành động này không thể hoàn tác.</span>
      <div className="inline">
        <button type="button" className="secondary" onClick={onCancel}>
          Giữ lại
        </button>
        <button type="button" className="danger-solid-btn" disabled={busy} onClick={onConfirm}>
          {busy ? 'Đang xóa…' : 'Xác nhận xóa'}
        </button>
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="empty">
      <Leaf size={28} />
      <p>{text}</p>
    </div>
  );
}

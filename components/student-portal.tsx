'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bell,
  BellOff,
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  EyeOff,
  KeyRound,
  LogOut,
  MessageSquareHeart,
  QrCode,
  RefreshCw,
  Smartphone,
  Sparkles,
  Trash2,
  User,
  Wallet,
  X,
} from 'lucide-react';
import type { StudentPortalData } from '@/lib/types';
import { homeworkStats, selectHomework, type HomeworkFilter, type HomeworkSort } from '@/lib/student-learning';
import StudentPractice from './student-practice';
import AssignmentCard from './student-assignment-card';
import StudentLearningOverview from './student-learning-overview';
import { PwaGuideModal, PwaInstallBanner, usePwaAndPush } from './student-pwa';

type StudentTab = 'practice' | 'homework' | 'notifications' | 'schedule' | 'account';

const money = (n: number) => new Intl.NumberFormat('vi-VN').format(n) + ' đ';

function formatDateVi(isoDate: string): string {
  if (!isoDate) return '';
  return isoDate.split('-').reverse().join('/');
}

function formatDateTimeVi(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('vi-VN', {
      timeZone: 'Asia/Bangkok',
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
    });
  } catch {
    return iso;
  }
}

const statusLabelMap: Record<string, string> = {
  present: 'Có mặt',
  late: 'Đi trễ',
  excused: 'Vắng có phép',
  absent: 'Vắng',
};

export default function StudentPortal({ token }: { token?: string }) {
  const isTokenMode = Boolean(token);

  const [authState, setAuthState] = useState<'loading' | 'login' | 'ready' | 'error'>('loading');
  const [data, setData] = useState<StudentPortalData | null>(null);
  const [tab, setTab] = useState<StudentTab>('homework');
  const [hwFilter, setHwFilter] = useState<HomeworkFilter>('all');
  const [homeworkQuery, setHomeworkQuery] = useState('');
  const [homeworkSort, setHomeworkSort] = useState<HomeworkSort>('priority');
  const [now, setNow] = useState(() => new Date());
  const [highlightAssignmentId, setHighlightAssignmentId] = useState<number | null>(null);

  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);

  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  const [dismissInstallBanner, setDismissInstallBanner] = useState(false);
  const [dismissPushBanner, setDismissPushBanner] = useState(false);

  const notify = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(prev => (prev === msg ? '' : prev)), 4000);
  }, []);

  const reportError = useCallback((msg: string) => {
    setError(msg);
  }, []);

  const load = useCallback(async () => {
    const endpoint = isTokenMode ? `/api/student/${token}` : '/api/student/me';
    const res = await fetch(endpoint, { cache: 'no-store' });
    if (res.status === 401 && !isTokenMode) {
      setData(null);
      setAuthState('login');
      return;
    }
    const json = await res.json();
    if (!res.ok) {
      throw new Error(json.error || 'Không tải được dữ liệu góc học tập.');
    }
    setData(json as StudentPortalData);
    setAuthState('ready');
  }, [isTokenMode, token]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const qTab = params.get('tab');
    const qAssignment = Number(params.get('assignment'));
    if (qTab === 'practice' || qTab === 'notifications' || qTab === 'schedule' || qTab === 'account' || qTab === 'homework') {
      setTab(qTab);
    }
    if (Number.isInteger(qAssignment) && qAssignment > 0) {
      setHighlightAssignmentId(qAssignment);
      setTab('homework');
    }
  }, []);

  useEffect(() => {
    load().catch((e: Error) => {
      setError(e.message);
      setAuthState('error');
    });
  }, [load]);

  useEffect(() => {
    const tick = () => setNow(new Date());
    const timer = window.setInterval(tick, 60_000);
    window.addEventListener('focus', tick);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', tick); };
  }, []);

  const pwa = usePwaAndPush({
    vapidPublicKey: data?.vapidPublicKey,
    studentToken: token,
    canPush: authState === 'ready',
    onNotify: notify,
    onError: reportError,
    onDevicesChange: () => {
      load().catch(() => undefined);
    },
  });

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/student/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUsername, password: loginPassword }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Đăng nhập chưa thành công.');
      setLoginPassword('');
      await load();
      notify('Chào mừng con đã quay lại góc học tập!');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    setBusy(true);
    try {
      const endpoint = await pwa.cleanupBeforeLogout();
      const res = await fetch('/api/student/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(endpoint ? { endpoint } : {}),
      });
      if (!res.ok) throw new Error('Chưa đăng xuất được. Con thử lại nhé.');
      setData(null);
      setAuthState('login');
      setTab('homework');
      setHwFilter('all');
      setHomeworkQuery('');
      setHighlightAssignmentId(null);
      setLoginUsername('');
      setShowLoginPassword(false);
      setError('');
      notify('Đã đăng xuất tài khoản.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function markNotificationsRead(ids?: number[]) {
    if (!data) return;
    const studentId = data.student.id;
    const url = isTokenMode ? `/api/student/${token}` : '/api/student/me';
    setError('');
    try {
      const res = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'read_notifications', ids }),
      });
      if (!res.ok) throw new Error('Notification update failed');
      setData(prev => {
        if (!prev || prev.student.id !== studentId) return prev;
        const nextList = prev.notifications.map(n => (!ids || ids.includes(n.id) ? { ...n, is_read: true } : n));
        return {
          ...prev,
          notifications: nextList,
          unread_count: nextList.filter(n => !n.is_read).length,
        };
      });
    } catch {
      setError('Chưa đánh dấu được thông báo đã đọc. Con kiểm tra kết nối và thử lại nhé.');
    }
  }

  async function removeDeviceById(deviceId: number) {
    setBusy(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['x-student-token'] = token;
      const res = await fetch('/api/student/push', {
        method: 'DELETE',
        headers,
        body: JSON.stringify({ deviceId }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Không gỡ được thiết bị.');
      }
      await load();
      notify('Đã gỡ thiết bị nhận thông báo.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
  const assignmentStats = useMemo(() => homeworkStats(data?.assignments || [], data?.submissions || [], todayStr), [data, todayStr]);
  const filteredAssignments = useMemo(() => selectHomework(
    data?.assignments || [], data?.submissions || [], todayStr, hwFilter, homeworkQuery, homeworkSort,
  ), [data, todayStr, hwFilter, homeworkQuery, homeworkSort]);

  function chooseHomeworkFilter(filter: HomeworkFilter) {
    setHwFilter(filter);
    setHighlightAssignmentId(null);
  }

  if (authState === 'loading') {
    return (
      <main className="student-login-shell">
        <section className="student-login-card">
          <div className="brand-mark">a<span>✦</span></div>
          <p className="eyebrow">XUÂN AN ENGLISH</p>
          <h1>Đang mở góc học tập…</h1>
          <p className="muted">Con chờ một chút nhé.</p>
        </section>
      </main>
    );
  }

  if (authState === 'error' && !data) {
    return (
      <main className="student-login-shell">
        <section className="student-login-card">
          <div className="brand-mark">a<span>✦</span></div>
          <p className="eyebrow">XUÂN AN ENGLISH</p>
          <h1>Chưa mở được góc học tập</h1>
          {error && <p className="error" role="alert">{error}</p>}
          <button
            type="button"
            className="primary"
            onClick={() => {
              setError('');
              setAuthState('loading');
              load().catch((e: Error) => {
                setError(e.message);
                setAuthState('error');
              });
            }}
          >
            Thử lại
          </button>
        </section>
      </main>
    );
  }

  if (authState === 'login') {
    return (
      <main className="student-login-shell">
        <section className="student-login-card">
          <div className="brand" style={{ padding: 0, marginBottom: 24 }}>
            <span className="brand-mark">a<span>✦</span></span>
            <div>xuân an<span>STUDENT PORTAL</span></div>
          </div>
          <p className="eyebrow">GÓC HỌC TẬP HỌC VIÊN</p>
          <h1>Chào con quay lại 🌱</h1>
          <p className="muted">
            Đăng nhập tài khoản để làm bài tập trên mọi thiết bị và nhận thông báo từ cô An.
          </p>

          <a href="/parent" className="text-button">Đăng nhập dành cho phụ huynh →</a>
          <form onSubmit={handleLogin}>
            <label>
              Tên đăng nhập
              <input
                name="username"
                type="text"
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="username"
                required
                placeholder="Ví dụ: minhanh1"
                value={loginUsername}
                onChange={(e) => setLoginUsername(e.target.value)}
              />
            </label>

            <label>
              Mật khẩu
              <div className="password-field">
                <input
                  name="password"
                  type={showLoginPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  placeholder="Nhập mật khẩu của con"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowLoginPassword(v => !v)}
                  aria-label={showLoginPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                >
                  {showLoginPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>

            {error && <p className="error" role="alert">{error}</p>}

            <button className="primary student-submit-btn" disabled={busy}>
              {busy ? 'Đang đăng nhập…' : 'Vào góc học tập →'}
            </button>
          </form>

          <p className="student-login-hint">
            Chưa có tên đăng nhập hoặc quên mật khẩu? Nhờ cô An cấp lại tài khoản trong lớp nhé.
          </p>
          <details className="student-login-help">
            <summary>Lấy tài khoản ở đâu? Đăng nhập thế nào?</summary>
            <ol>
              <li>Nhờ cô An gửi <strong>tên đăng nhập và mật khẩu riêng</strong> của con. Tài khoản do cô cấp, chưa có mục tự đăng ký.</li>
              <li>Nhập tên đăng nhập vào ô đầu, nhập đúng mật khẩu vào ô bên dưới rồi bấm <strong>Vào góc học tập</strong>.</li>
              <li>Sau khi vào được, mở <strong>Tài khoản → Đổi mật khẩu tài khoản</strong> để đặt mật khẩu của con (ít nhất 6 ký tự).</li>
            </ol>
            <p>Quên mật khẩu? Nhờ cô An đặt lại tại <strong>Lớp & học viên → Tài khoản</strong>. Không có mật khẩu dùng chung cho cả lớp.</p>
          </details>
        </section>

        <div className="student-login-pwa">
          <PwaInstallBanner
            env={pwa.env}
            hasNativeInstallPrompt={pwa.hasNativeInstallPrompt}
            onTriggerInstall={pwa.triggerInstall}
            onShowGuide={() => pwa.setShowGuideModal(true)}
          />
        </div>

        <PwaGuideModal open={pwa.showGuideModal} env={pwa.env} onClose={() => pwa.setShowGuideModal(false)} />
        {toast && <div className="toast" role="status"><Check size={17} />{toast}</div>}
      </main>
    );
  }

  if (!data) return null;

  const monthly = data.monthlySummary;
  const bank = monthly?.bank;
  const vietQrUrl =
    monthly && monthly.balance > 0 && bank?.bankId && bank?.accountNo
      ? `https://img.vietqr.io/image/${encodeURIComponent(bank.bankId)}-${encodeURIComponent(bank.accountNo)}-compact2.png?amount=${monthly.balance}&addInfo=${encodeURIComponent(`Hoc phi ${data.student.name} ${monthly.month}`)}&accountName=${encodeURIComponent(bank.accountName || '')}`
      : null;

  return (
    <div className="student-app-shell">
      <header className="student-topbar">
        <div className="student-topbar-inner">
          <div className="student-brand-compact">
            <span className="brand-mark small">a<span>✦</span></span>
            <div>
              <strong>{data.student.name}</strong>
              <small>{data.student.class_name || 'Học viên Xuân An'}</small>
            </div>
          </div>

          <div className="student-topbar-actions">
            <button type="button" className="student-bell-btn" aria-label="Cập nhật dữ liệu" title="Cập nhật bài tập và nhận xét" disabled={busy} onClick={async () => {
              setBusy(true); setError('');
              try { await load(); setNow(new Date()); } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
            }}><RefreshCw size={18} /></button>
            {!pwa.env.isStandalone && (pwa.env.platform === 'android' || pwa.env.platform === 'ios' || pwa.hasNativeInstallPrompt) && (
              <button
                type="button"
                className="soft-button student-install-chip"
                onClick={pwa.triggerInstall}
              >
                <Download size={14} />
                <span>{pwa.env.platform === 'ios' ? 'Thêm MH chính' : 'Cài app'}</span>
              </button>
            )}

            <button
              type="button"
              className="student-bell-btn"
              onClick={() => setTab('notifications')}
              aria-label={`Thông báo${data.unread_count > 0 ? ` (${data.unread_count} chưa đọc)` : ''}`}
            >
              <Bell size={20} />
              {data.unread_count > 0 && <span className="bell-badge">{data.unread_count > 9 ? '9+' : data.unread_count}</span>}
            </button>
          </div>
        </div>
      </header>

      <main className="student-main">
        {error && (
          <div className="error banner" role="alert">
            <span>{error}</span>
            <button type="button" onClick={() => setError('')} aria-label="Đóng lỗi">✕</button>
          </div>
        )}

        {!dismissInstallBanner && !pwa.env.isStandalone && (pwa.env.platform !== 'desktop' || pwa.hasNativeInstallPrompt) && (
          <div className="student-banner-wrap">
            <button
              type="button"
              className="banner-dismiss"
              aria-label="Ẩn hướng dẫn cài đặt"
              onClick={() => setDismissInstallBanner(true)}
            >
              ✕
            </button>
            <PwaInstallBanner
              env={pwa.env}
              hasNativeInstallPrompt={pwa.hasNativeInstallPrompt}
              onTriggerInstall={pwa.triggerInstall}
              onShowGuide={() => pwa.setShowGuideModal(true)}
            />
          </div>
        )}

        {!dismissPushBanner && !pwa.isSubscribed && tab !== 'notifications' && (
          <section className="pwa-card push-prompt-card">
            <button
              type="button"
              className="banner-dismiss"
              aria-label="Ẩn gợi ý bật thông báo"
              onClick={() => setDismissPushBanner(true)}
            >
              ✕
            </button>
            <div className="pwa-card-head">
              <span className="icon-box orange"><Bell size={20} /></span>
              <div>
                <strong>Nhận thông báo khi cô An giao bài</strong>
                <p>
                  {pwa.env.platform === 'ios' && !pwa.env.isStandalone
                    ? 'Sau khi thêm vào Màn hình chính và mở lại app, con bấm bật thông báo nhé.'
                    : 'Bật Web Push để nhận nhắc nhở bài tập mới và lời nhận xét ngay trên điện thoại.'}
                </p>
              </div>
            </div>
            {!(pwa.env.platform === 'ios' && !pwa.env.isStandalone) && (
              <button
                type="button"
                className="primary pwa-install-btn"
                disabled={pwa.pushBusy}
                onClick={pwa.subscribePush}
              >
                <Bell size={16} />
                {pwa.pushBusy ? 'Đang kích hoạt…' : 'Bật thông báo trên thiết bị này'}
              </button>
            )}
          </section>
        )}

        <div className="student-desktop-tabs" role="tablist" aria-label="Mục học tập">
          <button type="button" role="tab" aria-selected={tab === 'practice'} className={tab === 'practice' ? 'active' : ''} onClick={() => setTab('practice')}><Sparkles size={16}/> Luyện tập</button>
          <button type="button" role="tab" aria-selected={tab === 'homework'} className={tab === 'homework' ? 'active' : ''} onClick={() => setTab('homework')}>
            <BookOpen size={16} /> Bài tập ({assignmentStats.pending > 0 ? `${assignmentStats.pending} cần làm` : assignmentStats.total})
          </button>
          <button type="button" role="tab" aria-selected={tab === 'notifications'} className={tab === 'notifications' ? 'active' : ''} onClick={() => setTab('notifications')}>
            <Bell size={16} /> Thông báo {data.unread_count > 0 && <span className="nav-count">{data.unread_count}</span>}
          </button>
          <button type="button" role="tab" aria-selected={tab === 'schedule'} className={tab === 'schedule' ? 'active' : ''} onClick={() => setTab('schedule')}>
            <CalendarDays size={16} /> Lịch học & Nhận xét
          </button>
          <button type="button" role="tab" aria-selected={tab === 'account'} className={tab === 'account' ? 'active' : ''} onClick={() => setTab('account')}>
            <User size={16} /> Tài khoản
          </button>
        </div>

        {tab === 'practice' && <StudentPractice key={data.student.id} token={token}/>}
        {/* TAB 1: HOMEWORK */}
        {tab === 'homework' && (
          <section className="student-section">
            <div className="student-hero-mini">
              <div>
                <p className="eyebrow">BÀI TẬP VỀ NHÀ</p>
                <h1>Xin chào, {data.student.name} 🌱</h1>
                <p className="muted">
                  Đã hoàn thành <strong>{assignmentStats.submitted}/{assignmentStats.total}</strong> bài tập
                  {data.student.class_name ? ` · Lớp ${data.student.class_name}` : ''}.
                </p>
              </div>
            </div>

            <StudentLearningOverview stats={assignmentStats} sessions={data.sessions} now={now}
              onFilter={filter => { chooseHomeworkFilter(filter); setHomeworkQuery(''); }} onSchedule={() => setTab('schedule')} />

            {isTokenMode && (
              <p className="helper student-inline-helper">
                Đây là liên kết riêng của con. Con cũng có thể đăng nhập bằng tài khoản tại <a className="text-button" href="/student">/student</a> trên mọi thiết bị.
              </p>
            )}

            <div className="homework-toolbar">
              <label>Tìm bài tập
                <input type="search" placeholder="Tên bài, nội dung hoặc nhận xét…" value={homeworkQuery} maxLength={200}
                  onChange={e => { setHomeworkQuery(e.target.value); setHighlightAssignmentId(null); }} />
              </label>
              <label>Sắp xếp
                <select value={homeworkSort} onChange={e => setHomeworkSort(e.target.value as HomeworkSort)}>
                  <option value="priority">Cần làm trước</option><option value="newest">Bài mới nhất</option>
                </select>
              </label>
            </div>
            <div className="tabs student-filter-tabs" role="group" aria-label="Lọc bài tập">
              {([
                ['all', 'Tất cả', assignmentStats.total], ['pending', 'Cần làm', assignmentStats.pending],
                ['overdue', 'Quá hạn', assignmentStats.overdue], ['revision', 'Cần sửa', assignmentStats.revision],
                ['submitted', 'Đã nộp', assignmentStats.submitted], ['reviewed', 'Đã nhận xét', assignmentStats.reviewed],
              ] as const).map(([filter, label, count]) => <button type="button" key={filter} aria-pressed={hwFilter === filter}
                className={hwFilter === filter ? 'selected' : ''} onClick={() => chooseHomeworkFilter(filter)}>{label} ({count})</button>)}
            </div>
            <p className="homework-result-count" role="status">Hiển thị {filteredAssignments.length}/{assignmentStats.total} bài tập</p>

            {filteredAssignments.length === 0 ? (
              <div className="panel empty">
                <Sparkles size={28} />
                <p>
                  {homeworkQuery.trim() ? 'Không tìm thấy bài phù hợp. Con thử tìm bằng từ khác hoặc xóa bộ lọc nhé.' : hwFilter === 'pending'
                    ? 'Tuyệt vời! Con đã hoàn thành hết các bài tập hiện có.'
                    : 'Chưa có bài tập nào trong mục này. Con quay lại sau nhé!'}
                </p>
                {(homeworkQuery || hwFilter !== 'all') && <button className="secondary" type="button" onClick={() => { setHomeworkQuery(''); chooseHomeworkFilter('all'); }}>Xem tất cả bài tập</button>}
              </div>
            ) : (
              filteredAssignments.map(a => {
                const sub = data.submissions.find(s => s.assignment_id === a.id);
                return (
                  <AssignmentCard
                    key={`${data.student.id}-${a.id}-${sub?.submitted_at || 'new'}-${sub?.status || 'none'}-${sub?.score || ''}`}
                    studentId={data.student.id}
                    assignment={a}
                    submission={sub}
                    todayStr={todayStr}
                    highlighted={highlightAssignmentId === a.id}
                    token={token}
                    busy={busy}
                    onBusy={setBusy}
                    onError={setError}
                    onSubmitted={async () => {
                      await load();
                      notify('Cô An đã nhận được bài của con rồi nhé!');
                    }}
                  />
                );
              })
            )}
          </section>
        )}

        {/* TAB 2: NOTIFICATIONS & WEB PUSH */}
        {tab === 'notifications' && (
          <section className="student-section">
            <div className="panel push-settings-panel">
              <div className="pwa-card-head">
                <span className={`icon-box ${pwa.isSubscribed ? 'green' : 'orange'}`}>
                  {pwa.isSubscribed ? <Bell size={20} /> : <BellOff size={20} />}
                </span>
                <div>
                  <h2>Thông báo trên điện thoại (Web Push)</h2>
                  <p className="muted">
                    {pwa.isSubscribed
                      ? `Thiết bị này đang bật thông báo. Tài khoản hiện kết nối ${data.pushDevicesCount} thiết bị.`
                      : pwa.env.platform === 'ios' && !pwa.env.isStandalone
                        ? 'Trên iPhone/iPad, hãy thêm app vào Màn hình chính rồi mở từ biểu tượng ngoài màn hình để bật thông báo.'
                        : 'Bật thông báo để biết ngay khi cô An giao bài tập mới hoặc chấm bài.'}
                  </p>
                </div>
              </div>

              <div className="push-actions-row">
                {!pwa.isSubscribed ? (
                  <button
                    type="button"
                    className="primary"
                    disabled={pwa.pushBusy}
                    onClick={pwa.subscribePush}
                  >
                    <Bell size={16} />
                    {pwa.pushBusy ? 'Đang kích hoạt…' : 'Bật thông báo trên thiết bị này'}
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      className="secondary"
                      disabled={pwa.pushBusy}
                      onClick={pwa.sendTestNotification}
                    >
                      <Sparkles size={16} /> Gửi thử thông báo
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      disabled={pwa.pushBusy}
                      onClick={pwa.unsubscribePush}
                    >
                      <BellOff size={16} /> Tắt trên máy này
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="notifications-header">
              <h2>Hộp thư thông báo</h2>
              {data.unread_count > 0 && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => markNotificationsRead()}
                >
                  <Check size={14} /> Đánh dấu đã đọc tất cả
                </button>
              )}
            </div>

            {data.notifications.length === 0 ? (
              <div className="panel empty">
                <Bell size={28} />
                <p>Chưa có thông báo nào. Khi cô An giao bài hoặc gửi nhận xét, thông báo sẽ hiện ở đây.</p>
              </div>
            ) : (
              <div className="notification-list">
                {data.notifications.map((n) => (
                  <button
                    type="button"
                    key={n.id}
                    className={`panel notification-item ${n.is_read ? '' : 'unread'}`}
                    onClick={() => {
                      if (!n.is_read) markNotificationsRead([n.id]);
                      if (n.url.includes('tab=homework')) {
                        const urlObj = new URL(n.url, window.location.origin);
                        const aid = Number(urlObj.searchParams.get('assignment'));
                        if (Number.isInteger(aid) && aid > 0) setHighlightAssignmentId(aid);
                        setHwFilter('all');
                        setHomeworkQuery('');
                        setTab('homework');
                      }
                    }}
                  >
                    <span className={`icon-box ${n.type === 'feedback' ? 'purple' : n.type === 'assignment' ? 'green' : 'blue'}`}>
                      {n.type === 'feedback' ? <MessageSquareHeart size={18} /> : n.type === 'assignment' ? <BookOpen size={18} /> : <Bell size={18} />}
                    </span>
                    <div className="notification-content">
                      <div className="inline between">
                        <strong>{n.title}</strong>
                        {!n.is_read && <span className="unread-dot" aria-label="Chưa đọc" />}
                      </div>
                      <p>{n.body}</p>
                      <small>{formatDateTimeVi(n.created_at)}</small>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        {/* TAB 3: SCHEDULE & CLASS FEEDBACK */}
        {tab === 'schedule' && (
          <section className="student-section">
            <div className="notifications-header">
              <h2>Lịch học & Nhận xét từ cô An</h2>
              <span className="badge">{data.student.class_name || 'Lớp học'}</span>
            </div>

            {data.sessions.length === 0 ? (
              <div className="panel empty">
                <CalendarDays size={28} />
                <p>Chưa có lịch buổi học nào gần đây.</p>
              </div>
            ) : (
              <div className="schedule-card-list">
                <p className="muted">Lịch 90 ngày tới và 30 ngày gần đây. Buổi sắp tới được xếp trước; buổi đã hủy không tính học phí.</p>
                {data.sessions.map((s) => {
                  const cancelled = s.session_status === 'cancelled';
                  const isUpcoming = !cancelled && s.date >= todayStr && !s.status;
                  return (
                    <article key={s.id} className={`panel student-session-card ${cancelled ? 'is-cancelled' : ''}`}>
                      <div className="inline between">
                        <strong>{formatDateVi(s.date)} · {s.time}</strong>
                        <span className={`badge ${isUpcoming ? 'badge-new' : 'badge-done'}`}>
                          {cancelled ? 'Đã hủy' : s.status ? (statusLabelMap[s.status] || s.status) : `${s.duration} phút`}
                        </span>
                      </div>
                      <p className="session-topic">{s.topic || 'Buổi học tiếng Anh'}</p>
                      {cancelled && <p className="schedule-notice">Lý do nghỉ: {s.cancellation_reason || 'Đã hủy buổi học'}</p>}
                      {!cancelled && s.status && (s.status === 'present' || s.status === 'late') && (
                        <div className="session-ratings">
                          <span>Tập trung: <strong>{s.focus ?? '—'}/5</strong></span>
                          <span>BTVN: <strong>{s.homework ?? '—'}/5</strong></span>
                        </div>
                      )}
                      {s.note && (
                        <div className="feedback compact">
                          <strong>Nhận xét buổi học</strong>
                          <p className="pre-wrap">{s.note}</p>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* TAB 4: ACCOUNT, DEVICES & PARENT TUITION */}
        {tab === 'account' && (
          <section className="student-section">
            <article className="panel account-card">
              <div className="pwa-card-head">
                <span className="avatar">{data.student.name.split(' ').at(-1)?.[0] || 'H'}</span>
                <div>
                  <h2>{data.student.name}</h2>
                  <p className="muted">
                    {data.student.class_name || 'Lớp học'}
                    {data.student.username ? ` · Tài khoản: @${data.student.username}` : ''}
                  </p>
                </div>
              </div>

              <div className="multi-device-note">
                <Smartphone size={18} />
                <p>
                  Con có thể đăng nhập bằng tài khoản <strong>{data.student.username ? `@${data.student.username}` : 'học viên'}</strong> trên
                  điện thoại, iPad hoặc máy tính. Bài đã nộp và thông báo đồng bộ trên các thiết bị; bản nháp chỉ lưu trên trình duyệt đang dùng.
                </p>
              </div>
            </article>

            {monthly && (
              <article className="panel account-card parent-summary-card">
                <div className="inline between">
                  <h3><Wallet size={16} /> Tổng kết tháng {monthly.month.split('-').reverse().join('/')}</h3>
                  <span className="badge">{monthly.attended}/{monthly.sessions} buổi học</span>
                </div>

                <div className="parent-metrics-grid">
                  <div>
                    <small>Tập trung TB</small>
                    <strong>{monthly.focus}/5</strong>
                  </div>
                  <div>
                    <small>BTVN TB</small>
                    <strong>{monthly.homework}/5</strong>
                  </div>
                  <div>
                    <small>Học phí tháng</small>
                    <strong>{money(monthly.due)}</strong>
                  </div>
                  <div>
                    <small>Đã đóng</small>
                    <strong>{money(monthly.paid)}</strong>
                  </div>
                </div>

                <div className={`tuition-balance-bar ${monthly.balance > 0 ? 'due' : 'paid'}`}>
                  <span>{monthly.balance > 0 ? 'Còn cần đóng' : monthly.balance < 0 ? 'Số dư chuyển kỳ sau' : 'Đã hoàn thành học phí'}</span>
                  <strong>{monthly.balance < 0 ? money(-monthly.balance) : money(monthly.balance)}</strong>
                </div>

                {monthly.balance > 0 && bank && (
                  <div className="vietqr-box">
                    <div className="inline" style={{ gap: 6 }}>
                      <QrCode size={16} />
                      <strong>Thông tin chuyển khoản</strong>
                    </div>
                    <p className="muted" style={{ margin: '4px 0 8px' }}>
                      Ngân hàng: <strong>{bank.bankId}</strong> · STK: <strong>{bank.accountNo}</strong>
                      {bank.accountName ? ` · ${bank.accountName}` : ''}
                      <br />
                      Nội dung: <strong>Hoc phi {data.student.name} {monthly.month}</strong>
                    </p>
                    {vietQrUrl && (
                      <img
                        src={vietQrUrl}
                        alt="Mã QR chuyển khoản học phí"
                        className="vietqr-img"
                        loading="lazy"
                      />
                    )}
                  </div>
                )}
              </article>
            )}

            <article className="panel account-card">
              <div className="inline between">
                <h3><Bell size={16} /> Thiết bị nhận thông báo ({data.pushDevicesCount})</h3>
              </div>
              {data.pushDevices && data.pushDevices.length > 0 ? (
                <div className="device-list">
                  {data.pushDevices.map(dev => (
                    <div key={dev.id} className="device-row">
                      <div>
                        <strong>{dev.device_label}</strong>
                        <small className="block">Cập nhật: {formatDateTimeVi(dev.updated_at)}</small>
                      </div>
                      <button
                        type="button"
                        className="soft-button"
                        disabled={busy}
                        onClick={() => removeDeviceById(dev.id)}
                      >
                        <Trash2 size={14} /> Gỡ
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted" style={{ margin: 0 }}>
                  Chưa có thiết bị nào bật thông báo Web Push. Hãy vào mục <strong>Thông báo</strong> để kích hoạt.
                </p>
              )}
            </article>

            <PwaInstallBanner
              env={pwa.env}
              hasNativeInstallPrompt={pwa.hasNativeInstallPrompt}
              onTriggerInstall={pwa.triggerInstall}
              onShowGuide={() => pwa.setShowGuideModal(true)}
              compact
            />

            {!isTokenMode ? (
              <ChangePasswordCard
                onSuccess={(msg) => notify(msg)}
                onError={(msg) => setError(msg)}
              />
            ) : (
              <article className="panel account-card">
                <h3>Đăng nhập trên thiết bị khác</h3>
                <p className="muted">
                  Để làm bài và nhận thông báo trên điện thoại khác hoặc máy tính bảng, con dùng trang đăng nhập tài khoản học viên.
                </p>
                <a className="primary student-submit-btn" href="/student">
                  Mở trang đăng nhập tài khoản →
                </a>
              </article>
            )}

            {!isTokenMode && (
              <button
                type="button"
                className="secondary logout-btn"
                disabled={busy}
                onClick={handleLogout}
              >
                <LogOut size={16} /> Đăng xuất khỏi thiết bị này
              </button>
            )}
          </section>
        )}
      </main>

      <nav className="student-bottom-nav" aria-label="Điều hướng học viên">
        <button type="button" className={tab === 'practice' ? 'active' : ''} onClick={() => setTab('practice')}><Sparkles size={20}/><span>Luyện tập</span></button>
        <button
          type="button"
          className={tab === 'homework' ? 'active' : ''}
          onClick={() => setTab('homework')}
        >
          <BookOpen size={20} />
          <span>Bài tập</span>
          {assignmentStats.pending > 0 && <em className="tab-dot">{assignmentStats.pending}</em>}
        </button>
        <button
          type="button"
          className={tab === 'notifications' ? 'active' : ''}
          onClick={() => setTab('notifications')}
        >
          <Bell size={20} />
          <span>Thông báo</span>
          {data.unread_count > 0 && <em className="tab-dot">{data.unread_count}</em>}
        </button>
        <button
          type="button"
          className={tab === 'schedule' ? 'active' : ''}
          onClick={() => setTab('schedule')}
        >
          <CalendarDays size={20} />
          <span>Lịch học</span>
        </button>
        <button
          type="button"
          className={tab === 'account' ? 'active' : ''}
          onClick={() => setTab('account')}
        >
          <User size={20} />
          <span>Tài khoản</span>
        </button>
      </nav>

      <PwaGuideModal open={pwa.showGuideModal} env={pwa.env} onClose={() => pwa.setShowGuideModal(false)} />

      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={17} />
          <span>{toast}</span>
        </div>
      )}
    </div>
  );
}

function ChangePasswordCard({
  onSuccess,
  onError,
}: {
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);

  return (
    <article className="panel account-card">
      <h3><KeyRound size={16} /> Đổi mật khẩu tài khoản</h3>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          onError('');
          if (newPassword !== confirmPassword) {
            onError('Mật khẩu mới nhập lại chưa khớp.');
            return;
          }
          setSaving(true);
          try {
            const res = await fetch('/api/student/me', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'change_password',
                current_password: currentPassword,
                new_password: newPassword,
              }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'Không đổi được mật khẩu.');
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
            onSuccess('Đã đổi mật khẩu thành công!');
          } catch (err) {
            onError((err as Error).message);
          } finally {
            setSaving(false);
          }
        }}
      >
        <label>
          Mật khẩu hiện tại
          <input
            type="password"
            autoComplete="current-password"
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
        </label>
        <label>
          Mật khẩu mới (tối thiểu 6 ký tự)
          <input
            type="password"
            autoComplete="new-password"
            minLength={6}
            required
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
        </label>
        <label>
          Nhập lại mật khẩu mới
          <input
            type="password"
            autoComplete="new-password"
            minLength={6}
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </label>
        <button className="secondary" disabled={saving}>
          {saving ? 'Đang cập nhật…' : 'Cập nhật mật khẩu'}
        </button>
      </form>
    </article>
  );
}

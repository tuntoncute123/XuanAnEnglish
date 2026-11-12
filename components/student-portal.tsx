'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
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
  Paperclip,
  QrCode,
  Send,
  Smartphone,
  Sparkles,
  Trash2,
  User,
  Wallet,
  X,
} from 'lucide-react';
import type { StudentAssignment, StudentPortalData, Submission, SubmissionAttachment } from '@/lib/types';
import AudioRecorder from './audio-recorder';
import { PwaGuideModal, PwaInstallBanner, usePwaAndPush } from './student-pwa';

type StudentTab = 'homework' | 'notifications' | 'schedule' | 'account';
type HomeworkFilter = 'pending' | 'submitted' | 'all';

const todayBangkok = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
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
    if (qTab === 'notifications' || qTab === 'schedule' || qTab === 'account' || qTab === 'homework') {
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
      await fetch('/api/student/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(endpoint ? { endpoint } : {}),
      });
      setData(null);
      setAuthState('login');
      setTab('homework');
      notify('Đã đăng xuất tài khoản.');
    } finally {
      setBusy(false);
    }
  }

  async function markNotificationsRead(ids?: number[]) {
    if (!data) return;
    const url = isTokenMode ? `/api/student/${token}` : '/api/student/me';
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'read_notifications', ids }),
    });
    if (res.ok) {
      setData(prev => {
        if (!prev) return prev;
        const nextList = prev.notifications.map(n => (!ids || ids.includes(n.id) ? { ...n, is_read: true } : n));
        return {
          ...prev,
          notifications: nextList,
          unread_count: nextList.filter(n => !n.is_read).length,
        };
      });
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

  const assignmentStats = useMemo(() => {
    if (!data) return { total: 0, submitted: 0, pending: 0 };
    const total = data.assignments.length;
    const doneIds = new Set(
      data.submissions.filter(s => s.status !== 'needs_revision').map(s => s.assignment_id),
    );
    const submitted = data.assignments.filter(a => doneIds.has(a.id)).length;
    return { total, submitted, pending: total - submitted };
  }, [data]);

  const filteredAssignments = useMemo(() => {
    if (!data) return [];
    const subMap = new Map(data.submissions.map(s => [s.assignment_id, s]));
    if (hwFilter === 'pending') {
      return data.assignments.filter(a => {
        const s = subMap.get(a.id);
        return !s || s.status === 'needs_revision';
      });
    }
    if (hwFilter === 'submitted') {
      return data.assignments.filter(a => {
        const s = subMap.get(a.id);
        return Boolean(s && s.status !== 'needs_revision');
      });
    }
    return data.assignments;
  }, [data, hwFilter]);

  const todayStr = todayBangkok();

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

            {isTokenMode && (
              <p className="helper student-inline-helper">
                Đây là liên kết riêng của con. Con cũng có thể đăng nhập bằng tài khoản tại <a className="text-button" href="/student">/student</a> trên mọi thiết bị.
              </p>
            )}

            <div className="tabs student-filter-tabs">
              <button type="button" className={hwFilter === 'all' ? 'selected' : ''} onClick={() => setHwFilter('all')}>
                Tất cả ({assignmentStats.total})
              </button>
              <button type="button" className={hwFilter === 'pending' ? 'selected' : ''} onClick={() => setHwFilter('pending')}>
                Cần làm ({assignmentStats.pending})
              </button>
              <button type="button" className={hwFilter === 'submitted' ? 'selected' : ''} onClick={() => setHwFilter('submitted')}>
                Đã nộp ({assignmentStats.submitted})
              </button>
            </div>

            {filteredAssignments.length === 0 ? (
              <div className="panel empty">
                <Sparkles size={28} />
                <p>
                  {hwFilter === 'pending'
                    ? 'Tuyệt vời! Con đã hoàn thành hết các bài tập hiện có.'
                    : 'Chưa có bài tập nào trong mục này. Con quay lại sau nhé!'}
                </p>
              </div>
            ) : (
              filteredAssignments.map(a => {
                const sub = data.submissions.find(s => s.assignment_id === a.id);
                return (
                  <AssignmentCard
                    key={`${a.id}-${sub?.submitted_at || 'new'}-${sub?.status || 'none'}-${sub?.score || ''}`}
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
                {data.sessions.map((s) => {
                  const isUpcoming = s.date >= todayStr && !s.status;
                  return (
                    <article key={s.id} className="panel student-session-card">
                      <div className="inline between">
                        <strong>{formatDateVi(s.date)} · {s.time}</strong>
                        <span className={`badge ${isUpcoming ? 'badge-new' : 'badge-done'}`}>
                          {s.status ? (statusLabelMap[s.status] || s.status) : `${s.duration} phút`}
                        </span>
                      </div>
                      <p className="session-topic">{s.topic || 'Buổi học tiếng Anh'}</p>
                      {s.status && (s.status === 'present' || s.status === 'late') && (
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
                  điện thoại, iPad hoặc máy tính — mọi bài tập và thông báo đều đồng bộ trên tất cả thiết bị.
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

function AssignmentCard({
  assignment: a,
  submission: sub,
  todayStr,
  highlighted,
  token,
  busy,
  onBusy,
  onError,
  onSubmitted,
}: {
  assignment: StudentAssignment;
  submission?: Submission;
  todayStr: string;
  highlighted: boolean;
  token?: string;
  busy: boolean;
  onBusy: (b: boolean) => void;
  onError: (e: string) => void;
  onSubmitted: () => Promise<void>;
}) {
  const isTokenMode = Boolean(token);
  const downloadSuffix = isTokenMode ? `?token=${encodeURIComponent(token || '')}` : '';
  const inlineSuffix = isTokenMode ? `?inline=1&token=${encodeURIComponent(token || '')}` : '?inline=1';

  const [answer, setAnswer] = useState(sub?.answer || '');
  const [keptAttachments, setKeptAttachments] = useState<SubmissionAttachment[]>(sub?.attachments || []);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [recordedAudio, setRecordedAudio] = useState<File | null>(null);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, number>>(sub?.quiz_answers || {});

  const overdue = !sub && a.deadline < todayStr;
  const needsRevision = sub?.status === 'needs_revision';
  const questions = a.questions || [];

  async function uploadSingleFile(file: File): Promise<string> {
    const uploadForm = new FormData();
    uploadForm.set('file', file);
    const uploadHeaders: Record<string, string> = isTokenMode
      ? { 'x-student-token': token || '' }
      : { 'x-student-session': '1' };
    const uploadRes = await fetch('/api/files', {
      method: 'POST',
      headers: uploadHeaders,
      body: uploadForm,
    });
    const uploaded = await uploadRes.json();
    if (!uploadRes.ok) throw new Error(uploaded.error || 'Không tải được tệp.');
    return String(uploaded.id);
  }

  return (
    <article className={`panel student-assignment ${highlighted ? 'highlighted-assignment' : ''}`}>
      <div className="inline between assignment-meta-row">
        <div className="inline" style={{ gap: 6, flexWrap: 'wrap' }}>
          <span
            className={`badge ${
              needsRevision
                ? 'badge-overdue'
                : sub?.feedback || sub?.status === 'reviewed'
                  ? 'badge-graded'
                  : sub
                    ? 'badge-done'
                    : overdue
                      ? 'badge-overdue'
                      : 'badge-new'
            }`}
          >
            {needsRevision
              ? 'Cô nhắn sửa lại'
              : sub?.feedback || sub?.status === 'reviewed'
                ? '✓ Đã chấm bài'
                : sub
                  ? '✓ Đã nộp bài'
                  : overdue
                    ? 'Quá hạn nộp'
                    : 'Chưa làm'}
          </span>
          {sub?.score && <span className="badge badge-score">Điểm: {sub.score}</span>}
        </div>
        <small className="deadline-pill">
          <Clock size={12} /> Hạn: {formatDateVi(a.deadline)}
        </small>
      </div>

      <h2>{a.title}</h2>
      <p className="pre-wrap assignment-instructions">{a.instructions}</p>

      {a.file_id && (
        <a
          className="soft-button assignment-download-btn"
          href={`/api/download/${a.file_id}${downloadSuffix}`}
        >
          <Download size={15} /> Tải tệp đề bài
        </a>
      )}

      {sub?.feedback && (
        <div className={`feedback ${needsRevision ? 'feedback-revision' : ''}`}>
          <strong>
            {needsRevision ? <AlertCircle size={15} /> : <MessageSquareHeart size={15} />}
            {needsRevision ? 'Nhắc sửa bài từ cô An' : 'Lời nhắn từ cô An'}
          </strong>
          <p className="pre-wrap">{sub.feedback}</p>
        </div>
      )}

      <form
        onSubmit={async (e) => {
          e.preventDefault();
          onBusy(true);
          onError('');
          try {
            const totalCount = keptAttachments.length + pendingFiles.length + (recordedAudio ? 1 : 0);
            if (totalCount > 6) {
              throw new Error('Mỗi bài nộp đính kèm tối đa 6 tệp/ảnh.');
            }
            const uploadedIds: string[] = [];
            for (const f of pendingFiles) {
              uploadedIds.push(await uploadSingleFile(f));
            }
            if (recordedAudio) {
              uploadedIds.push(await uploadSingleFile(recordedAudio));
            }
            const file_ids = [...keptAttachments.map(att => att.id), ...uploadedIds];

            const submitUrl = isTokenMode ? `/api/student/${token}` : '/api/student/me';
            const submitRes = await fetch(submitUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                assignment_id: a.id,
                answer,
                file_id: file_ids[0] || null,
                file_ids,
                quiz_answers: questions.length > 0 ? quizAnswers : undefined,
              }),
            });
            const submitJson = await submitRes.json();
            if (!submitRes.ok) throw new Error(submitJson.error || 'Không nộp được bài.');

            setPendingFiles([]);
            setRecordedAudio(null);
            await onSubmitted();
          } catch (err) {
            onError((err as Error).message);
          } finally {
            onBusy(false);
          }
        }}
      >
        {questions.length > 0 && (
          <div className="quiz-block">
            <strong className="quiz-heading">Câu hỏi trắc nghiệm ({questions.length} câu)</strong>
            {questions.map((q, qIdx) => {
              const chosen = quizAnswers[q.id];
              const hasKey = typeof q.correctIndex === 'number';
              return (
                <div key={q.id} className="quiz-question-card">
                  <p className="quiz-prompt">
                    <strong>Câu {qIdx + 1}:</strong> {q.prompt}
                  </p>
                  <div className="quiz-options">
                    {q.options.map((opt, optIdx) => {
                      const isChosen = chosen === optIdx;
                      const isCorrect = hasKey && q.correctIndex === optIdx;
                      const isWrongChosen = hasKey && isChosen && q.correctIndex !== optIdx;
                      return (
                        <button
                          type="button"
                          key={optIdx}
                          className={`quiz-option ${isChosen ? 'selected' : ''} ${isCorrect ? 'correct' : ''} ${isWrongChosen ? 'wrong' : ''}`}
                          onClick={() => setQuizAnswers(prev => ({ ...prev, [q.id]: optIdx }))}
                        >
                          <span className="quiz-letter">{String.fromCharCode(65 + optIdx)}</span>
                          <span>{opt}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <label>
          Bài làm của con
          <textarea
            name="answer"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            rows={4}
            maxLength={10000}
            placeholder="Viết câu trả lời ở đây, hoặc ghi âm / chụp nhiều ảnh vở bên dưới…"
          />
        </label>

        {keptAttachments.length > 0 && (
          <div className="attachments-list">
            <small className="attachments-label">Tệp đã đính kèm ({keptAttachments.length})</small>
            {keptAttachments.map(att => {
              const isAudio = att.type.startsWith('audio/');
              const isImage = att.type.startsWith('image/');
              return (
                <div key={att.id} className="attachment-item">
                  <div className="inline between" style={{ width: '100%' }}>
                    <a
                      className="text-button"
                      href={`/api/download/${att.id}${downloadSuffix}`}
                    >
                      <Paperclip size={14} /> {att.name}
                    </a>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Bỏ tệp ${att.name}`}
                      onClick={() => setKeptAttachments(prev => prev.filter(item => item.id !== att.id))}
                    >
                      <X size={14} />
                    </button>
                  </div>
                  {isAudio && (
                    <audio controls preload="metadata" className="audio-preview" src={`/api/download/${att.id}${inlineSuffix}`} />
                  )}
                  {isImage && (
                    <img
                      src={`/api/download/${att.id}${inlineSuffix}`}
                      alt={att.name}
                      className="attachment-thumb"
                      loading="lazy"
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="media-upload-stack">
          <AudioRecorder recordedFile={recordedAudio} onChange={setRecordedAudio} />

          <label className="file-picker-label">
            <span>Chọn nhiều ảnh chụp vở hoặc tệp bài làm (tối đa 6 tệp, 10 MB/tệp)</span>
            <input
              type="file"
              multiple
              accept=".pdf,.docx,.jpg,.jpeg,.png,.webp,.mp3,.wav,.m4a,.webm,.ogg,.txt,image/*,audio/*"
              onChange={(e) => {
                const picked = Array.from(e.target.files || []);
                if (picked.length) {
                  setPendingFiles(prev => [...prev, ...picked].slice(0, 6));
                }
                e.currentTarget.value = '';
              }}
            />
          </label>

          {pendingFiles.length > 0 && (
            <div className="pending-files-list">
              {pendingFiles.map((f, idx) => (
                <div key={`${f.name}-${idx}`} className="pending-file-chip">
                  <span>{f.name}</span>
                  <button
                    type="button"
                    aria-label={`Xóa ${f.name}`}
                    onClick={() => setPendingFiles(prev => prev.filter((_, i) => i !== idx))}
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="submission-actions">
          {sub?.submitted_at && (
            <small className="submitted-time">Đã nộp lúc {formatDateTimeVi(sub.submitted_at)}</small>
          )}
          <button className="primary student-submit-btn" disabled={busy}>
            <Send size={15} />
            {busy ? 'Đang gửi…' : sub ? 'Cập nhật bài làm' : 'Nộp bài cho cô An'}
          </button>
        </div>
      </form>
    </article>
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

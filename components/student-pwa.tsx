'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Bell,
  Check,
  Copy,
  Download,
  ExternalLink,
  HelpCircle,
  PlusSquare,
  Share,
  Smartphone,
  X,
} from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

export type PlatformKind = 'android' | 'ios' | 'desktop';

export type DeviceEnv = {
  platform: PlatformKind;
  isStandalone: boolean;
  isInAppBrowser: boolean;
  isIosNonSafari: boolean;
  deviceLabel: string;
};

function detectDeviceEnv(): DeviceEnv {
  if (typeof window === 'undefined') {
    return {
      platform: 'desktop',
      isStandalone: false,
      isInAppBrowser: false,
      isIosNonSafari: false,
      deviceLabel: 'Thiết bị web',
    };
  }
  const ua = navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    Boolean((window.navigator as { standalone?: boolean }).standalone);
  const isInAppBrowser = /(Zalo|FBAN|FBAV|Messenger|Line\/|Instagram)/i.test(ua);
  const isIosNonSafari = isIOS && /(CriOS|FxiOS|EdgiOS|OPiOS|YaBrowser)/i.test(ua);

  const platform: PlatformKind = isIOS ? 'ios' : isAndroid ? 'android' : 'desktop';
  let deviceLabel = 'Máy tính';
  if (isIOS) {
    deviceLabel = /iPad/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ? 'iPad' : 'iPhone';
  } else if (isAndroid) {
    deviceLabel = 'Điện thoại Android';
  }
  return { platform, isStandalone, isInAppBrowser, isIosNonSafari, deviceLabel };
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function usePwaAndPush(options: {
  vapidPublicKey?: string;
  studentToken?: string;
  canPush: boolean;
  onNotify?: (msg: string) => void;
  onError?: (err: string) => void;
  onDevicesChange?: (count: number) => void;
}) {
  const { vapidPublicKey, studentToken, canPush, onNotify, onError, onDevicesChange } = options;

  const [env, setEnv] = useState<DeviceEnv>(() => ({
    platform: 'desktop',
    isStandalone: false,
    isInAppBrowser: false,
    isIosNonSafari: false,
    deviceLabel: 'Thiết bị web',
  }));
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [pushSupported, setPushSupported] = useState(false);
  const [pushPermission, setPushPermission] = useState<NotificationPermission | 'unsupported'>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [currentEndpoint, setCurrentEndpoint] = useState<string | null>(null);
  const [pushBusy, setPushBusy] = useState(false);

  useEffect(() => {
    setEnv(detectDeviceEnv());

    const media = window.matchMedia('(display-mode: standalone)');
    const onDisplayChange = () => setEnv(detectDeviceEnv());
    media.addEventListener?.('change', onDisplayChange);

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setDeferredPrompt(null);
      setEnv(detectDeviceEnv());
      onNotify?.('Đã thêm Xuân An Học tập vào màn hình chính!');
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);

    const supported =
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window;
    setPushSupported(supported);
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPushPermission(Notification.permission);
    } else {
      setPushPermission('unsupported');
    }

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then(async (reg) => {
          if (!supported) return;
          const existing = await reg.pushManager.getSubscription();
          if (existing) {
            setIsSubscribed(true);
            setCurrentEndpoint(existing.endpoint);
          }
        })
        .catch(() => undefined);
    }

    return () => {
      media.removeEventListener?.('change', onDisplayChange);
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, [onNotify]);

  const triggerInstall = useCallback(async () => {
    if (env.platform === 'ios') {
      setShowGuideModal(true);
      return;
    }
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === 'accepted') {
          setDeferredPrompt(null);
        }
      } catch {
        setShowGuideModal(true);
      }
      return;
    }
    setShowGuideModal(true);
  }, [deferredPrompt, env.platform]);

  const subscribePush = useCallback(async () => {
    if (!canPush) return;
    if (!pushSupported) {
      if (env.platform === 'ios' && !env.isStandalone) {
        setShowGuideModal(true);
        onError?.('Trên iPhone/iPad, cần thêm ứng dụng vào Màn hình chính trước rồi mở từ màn hình chính để bật thông báo.');
      } else {
        onError?.('Trình duyệt trên thiết bị này chưa hỗ trợ thông báo Web Push.');
      }
      return;
    }

    setPushBusy(true);
    try {
      const permission = await Notification.requestPermission();
      setPushPermission(permission);
      if (permission !== 'granted') {
        onError?.(
          permission === 'denied'
            ? 'Thông báo đã bị chặn. Con hãy vào Cài đặt trình duyệt / điện thoại để cho phép thông báo nhé.'
            : 'Chưa cấp quyền nhận thông báo.',
        );
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      let publicKey = vapidPublicKey;
      if (!publicKey) {
        const res = await fetch('/api/student/push');
        const json = await res.json();
        publicKey = json.publicKey;
      }
      if (!publicKey) throw new Error('Chưa cấu hình khóa thông báo.');

      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }

      const jsonSub = sub.toJSON();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (studentToken) headers['x-student-token'] = studentToken;

      const saveRes = await fetch('/api/student/push', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          endpoint: sub.endpoint,
          keys: {
            p256dh: jsonSub.keys?.p256dh || '',
            auth: jsonSub.keys?.auth || '',
          },
          deviceLabel: env.deviceLabel,
        }),
      });
      const saved = await saveRes.json();
      if (!saveRes.ok) throw new Error(saved.error || 'Không lưu được đăng ký thông báo.');

      setIsSubscribed(true);
      setCurrentEndpoint(sub.endpoint);
      if (typeof saved.devices === 'number') onDevicesChange?.(saved.devices);
      onNotify?.('Đã bật thông báo bài tập trên thiết bị này!');
    } catch (e) {
      onError?.((e as Error).message || 'Không bật được thông báo.');
    } finally {
      setPushBusy(false);
    }
  }, [canPush, env.deviceLabel, env.isStandalone, env.platform, onDevicesChange, onError, onNotify, pushSupported, studentToken, vapidPublicKey]);

  const unsubscribePush = useCallback(async () => {
    if (!pushSupported) return;
    setPushBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      const endpoint = sub?.endpoint || currentEndpoint;
      if (endpoint) {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (studentToken) headers['x-student-token'] = studentToken;
        const res = await fetch('/api/student/push', {
          method: 'DELETE',
          headers,
          body: JSON.stringify({ endpoint }),
        });
        const data = await res.json().catch(() => ({}));
        if (typeof data.devices === 'number') onDevicesChange?.(data.devices);
      }
      if (sub) await sub.unsubscribe();
      setIsSubscribed(false);
      setCurrentEndpoint(null);
      onNotify?.('Đã tắt thông báo trên thiết bị này.');
    } catch (e) {
      onError?.((e as Error).message || 'Không tắt được thông báo.');
    } finally {
      setPushBusy(false);
    }
  }, [currentEndpoint, onDevicesChange, onError, onNotify, pushSupported, studentToken]);

  const sendTestNotification = useCallback(async () => {
    setPushBusy(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (studentToken) headers['x-student-token'] = studentToken;
      const res = await fetch('/api/student/push/test', {
        method: 'POST',
        headers,
        body: JSON.stringify(currentEndpoint ? { endpoint: currentEndpoint } : {}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Không gửi được thông báo thử.');
      onNotify?.('Đã gửi thông báo thử! Kiểm tra thanh thông báo của điện thoại nhé.');
    } catch (e) {
      onError?.((e as Error).message || 'Không gửi được thông báo thử.');
    } finally {
      setPushBusy(false);
    }
  }, [currentEndpoint, onError, onNotify, studentToken]);

  const cleanupBeforeLogout = useCallback(async () => {
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
      const reg = await navigator.serviceWorker.getRegistration('/');
      const sub = await reg?.pushManager.getSubscription();
      const endpoint = sub?.endpoint || currentEndpoint || null;
      if (sub) await sub.unsubscribe().catch(() => undefined);
      setIsSubscribed(false);
      setCurrentEndpoint(null);
      return endpoint;
    } catch {
      return null;
    }
  }, [currentEndpoint]);

  return {
    env,
    hasNativeInstallPrompt: Boolean(deferredPrompt),
    showGuideModal,
    setShowGuideModal,
    triggerInstall,
    pushSupported,
    pushPermission,
    isSubscribed,
    currentEndpoint,
    pushBusy,
    subscribePush,
    unsubscribePush,
    sendTestNotification,
    cleanupBeforeLogout,
  };
}

export function PwaInstallBanner({
  env,
  hasNativeInstallPrompt,
  onTriggerInstall,
  onShowGuide,
  compact,
}: {
  env: DeviceEnv;
  hasNativeInstallPrompt: boolean;
  onTriggerInstall: () => void;
  onShowGuide: () => void;
  compact?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  if (env.isStandalone) {
    if (!compact) return null;
    return (
      <div className="pwa-installed-pill">
        <Check size={15} />
        <span>Đang chạy dưới dạng ứng dụng trên màn hình chính</span>
      </div>
    );
  }

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback ignored
    }
  }

  if (env.platform === 'ios') {
    return (
      <section className="pwa-card ios-guide-card">
        <div className="pwa-card-head">
          <span className="icon-box green">
            <Smartphone size={20} />
          </span>
          <div>
            <strong>Thêm vào Màn hình chính (iPhone / iPad)</strong>
            <p>Cài như ứng dụng để mở nhanh và bật được thông báo bài tập trên iOS.</p>
          </div>
        </div>

        {(env.isInAppBrowser || env.isIosNonSafari) && (
          <div className="pwa-warn">
            <ExternalLink size={16} />
            <div>
              <p>
                Bạn đang mở trang trong {env.isInAppBrowser ? 'trình duyệt của ứng dụng (Zalo/Facebook)' : 'trình duyệt khác Safari'}.
                Trên iPhone/iPad, hãy mở đường dẫn này bằng <strong>Safari</strong> trước nhé!
              </p>
              <button type="button" className="soft-button" onClick={copyUrl}>
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? 'Đã sao chép link' : 'Sao chép link để mở Safari'}
              </button>
            </div>
          </div>
        )}

        <ol className="ios-steps">
          <li>
            <span className="step-icon"><Share size={16} /></span>
            <span>Nhấn nút <strong>Chia sẻ (Share)</strong> ở thanh công cụ Safari.</span>
          </li>
          <li>
            <span className="step-icon"><PlusSquare size={16} /></span>
            <span>Chọn <strong>Thêm vào Màn hình chính (Add to Home Screen)</strong>.</span>
          </li>
          <li>
            <span className="step-icon"><Bell size={16} /></span>
            <span>Nhấn <strong>Thêm</strong>, rồi mở biểu tượng ngoài màn hình chính để bật thông báo.</span>
          </li>
        </ol>

        <button type="button" className="secondary pwa-guide-btn" onClick={onShowGuide}>
          <HelpCircle size={16} /> Xem hướng dẫn chi tiết
        </button>
      </section>
    );
  }

  if (env.platform === 'android' || hasNativeInstallPrompt) {
    return (
      <section className="pwa-card android-install-card">
        <div className="pwa-card-head">
          <span className="icon-box green">
            <Download size={20} />
          </span>
          <div>
            <strong>Cài đặt ứng dụng lên điện thoại</strong>
            <p>
              {env.platform === 'android'
                ? 'Thêm Xuân An Học tập vào màn hình chính để làm bài nhanh và nhận thông báo ngay.'
                : 'Cài đặt ứng dụng để mở nhanh và nhận thông báo bài tập từ cô An.'}
            </p>
          </div>
        </div>

        {env.isInAppBrowser && (
          <div className="pwa-warn">
            <ExternalLink size={16} />
            <div>
              <p>Đang mở trong Zalo/Facebook? Hãy nhấn <strong>⋮ → Mở bằng trình duyệt (Chrome)</strong> để cài đặt nhanh hơn.</p>
            </div>
          </div>
        )}

        <button type="button" className="primary pwa-install-btn" onClick={onTriggerInstall}>
          <Download size={17} /> Thêm vào màn hình chính
        </button>
      </section>
    );
  }

  return null;
}

export function PwaGuideModal({
  open,
  env,
  onClose,
}: {
  open: boolean;
  env: DeviceEnv;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  if (!open) return null;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // ignore
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className="modal pwa-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pwa-guide-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="section-heading">
          <h2 id="pwa-guide-title">
            {env.platform === 'ios'
              ? 'Hướng dẫn thêm vào Màn hình chính (iOS)'
              : 'Cách thêm vào Màn hình chính (Android)'}
          </h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Đóng">
            <X size={20} />
          </button>
        </div>

        <div className="pwa-modal-body">
          {env.platform === 'ios' ? (
            <>
              <p className="muted">
                iPhone và iPad cần thêm web vào Màn hình chính qua trình duyệt <strong>Safari</strong> (iOS 16.4 trở lên)
                để dùng như ứng dụng và bật thông báo đẩy (Web Push).
              </p>
              {(env.isInAppBrowser || env.isIosNonSafari) && (
                <div className="pwa-warn">
                  <ExternalLink size={16} />
                  <div>
                    <p>Hãy sao chép đường dẫn này và dán vào trình duyệt <strong>Safari</strong>:</p>
                    <button type="button" className="soft-button" onClick={copyLink}>
                      {copied ? <Check size={14} /> : <Copy size={14} />}
                      {copied ? 'Đã sao chép đường dẫn' : 'Sao chép đường dẫn'}
                    </button>
                  </div>
                </div>
              )}
              <ol className="ios-steps detailed">
                <li>
                  <span className="step-num">1</span>
                  <div>
                    <strong>Mở menu Chia sẻ (Share)</strong>
                    <p>Trong Safari, chạm biểu tượng <Share size={14} style={{ verticalAlign: 'middle' }} /> (hình vuông có mũi tên hướng lên) ở thanh dưới cùng.</p>
                  </div>
                </li>
                <li>
                  <span className="step-num">2</span>
                  <div>
                    <strong>Chọn “Thêm vào Màn hình chính”</strong>
                    <p>Cuộn xuống danh sách tùy chọn, chạm vào mục <strong>Thêm vào Màn hình chính</strong> (Add to Home Screen <PlusSquare size={14} style={{ verticalAlign: 'middle' }} />).</p>
                  </div>
                </li>
                <li>
                  <span className="step-num">3</span>
                  <div>
                    <strong>Xác nhận & mở từ Màn hình chính</strong>
                    <p>Nhấn <strong>Thêm (Add)</strong> ở góc trên phải. Sau đó mở biểu tượng <strong>Xuân An Học tập</strong> ngoài màn hình chính và bấm <strong>Bật thông báo</strong>.</p>
                  </div>
                </li>
              </ol>
            </>
          ) : (
            <>
              <p className="muted">
                Nếu hộp thoại cài đặt tự động không hiện ra (do mở từ Zalo/Messenger hoặc đã đóng trước đó), con hãy làm theo 2 bước:
              </p>
              <ol className="ios-steps detailed">
                <li>
                  <span className="step-num">1</span>
                  <div>
                    <strong>Mở bằng Google Chrome</strong>
                    <p>Nếu đang mở trong Zalo hoặc Facebook, bấm dấu <strong>⋮</strong> (hoặc biểu tượng 3 chấm) chọn <strong>Mở bằng trình duyệt / Chrome</strong>.</p>
                  </div>
                </li>
                <li>
                  <span className="step-num">2</span>
                  <div>
                    <strong>Chọn “Thêm vào màn hình chính”</strong>
                    <p>Trong Chrome, bấm dấu <strong>⋮</strong> ở góc trên bên phải → chọn <strong>Thêm vào màn hình chính</strong> (hoặc <strong>Cài đặt ứng dụng</strong>) → nhấn <strong>Cài đặt</strong>.</p>
                  </div>
                </li>
              </ol>
            </>
          )}

          <div className="form-footer" style={{ paddingBottom: 0 }}>
            <button type="button" className="primary" onClick={onClose}>
              Đã hiểu
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

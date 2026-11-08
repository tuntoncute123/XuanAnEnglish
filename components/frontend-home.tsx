'use client';

import { useEffect, useState } from 'react';
import Dashboard from './dashboard';
import Login from './login';
import type { Data } from '@/lib/types';

export default function FrontendHome() {
  const [state, setState] = useState<'loading' | 'login' | 'ready' | 'error'>('loading');
  const [data, setData] = useState<Data | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/manage', { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        if (response.status === 401) { setState('login'); return; }
        if (!response.ok) throw new Error('Không kết nối được máy chủ.');
        setData(await response.json());
        setState('ready');
      })
      .catch(error => { if (error.name !== 'AbortError') setState('error'); });
    return () => controller.abort();
  }, []);

  if (state === 'login') return <Login />;
  if (state === 'ready' && data) return <Dashboard initial={data} />;
  return <main className="login-page"><section className="login-card">
    <div className="brand-mark">a<span>✦</span></div>
    <p className="eyebrow">XUÂN AN ENGLISH</p>
    <h1>{state === 'error' ? 'Chưa kết nối được.' : 'Đang mở lớp học…'}</h1>
    {state === 'error' && <button className="primary" onClick={() => location.reload()}>Thử lại</button>}
  </section></main>;
}

'use client';

import { useState } from 'react';

export default function Login() {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="brand-mark">
          a<span>✦</span>
        </div>
        <p className="eyebrow">XUÂN AN ENGLISH</p>
        <h1>
          Mỗi buổi học,
          <br />
          một bước tiến.
        </h1>
        <p className="muted">Không gian nhỏ để An quản lý lớp học và đồng hành cùng các con.</p>
        <form
          onSubmit={async e => {
            e.preventDefault();
            setBusy(true);
            try {
              const r = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: new FormData(e.currentTarget).get('password') }),
              });
              const d = await r.json();
              if (!r.ok) throw Error(d.error);
              location.reload();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Mật khẩu giáo viên
            <input name="password" type="password" autoComplete="current-password" required placeholder="Nhập mật khẩu của An" />
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="primary" disabled={busy}>
            {busy ? 'Đang đăng nhập…' : 'Vào lớp học →'}
          </button>
        </form>
        <small>
          Đăng nhập bằng mật khẩu giáo viên. ·{' '}
          <a className="text-button" href="/student">
            Bạn là học viên? Vào góc học tập →
          </a>
        </small>
      </section>
      <div className="login-art">
        <span>
          hello,
          <br />
          bright minds.
        </span>
        <p>Learn a little. Grow a lot. 🌱</p>
      </div>
    </main>
  );
}

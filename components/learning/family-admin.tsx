'use client';
import { useState } from 'react';
import type { Data } from '@/lib/types';
import type {
  GrowthAdminData,
  ParentAccount,
  SaveFeature,
} from '@/lib/growth-types';
import { localDay, weekStart } from '@/lib/growth';
export default function FamilyAdmin({
  data,
  feature,
  classId,
  save,
}: {
  data: Data;
  feature: GrowthAdminData;
  classId: number;
  save: SaveFeature;
}) {
  const [editing, setEditing] = useState<ParentAccount | null>(null);
  const [week, setWeek] = useState(weekStart());
  const [child, setChild] = useState(data.students[0]?.id || 0);
  const sessionLabel = (id: number | null) => {
    const s = data.sessions.find((s) => s.id === id);
    return s
      ? `${s.date} · ${s.time} · ${data.classes.find((c) => c.id === s.class_id)?.name}`
      : 'Chưa đăng ký';
  };
  return (
    <div className="growth-stack">
      <section className="growth-card">
        <h3>Tài khoản phụ huynh</h3>
        <p>
          Phụ huynh đăng nhập tại{' '}
          <a href="/parent" target="_blank" rel="noreferrer">
            /parent
          </a>
          . Một tài khoản có thể theo dõi nhiều con. Thay đổi liên kết hoặc mật
          khẩu sẽ yêu cầu đăng nhập lại.
        </p>
        <form
          key={editing?.id || 'new'}
          className="growth-stack"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const fd = new FormData(form);
            if (
              await save({
                action: 'parent_save',
                id: editing?.id,
                name: fd.get('name'),
                username: fd.get('username'),
                password: fd.get('password') || undefined,
                student_ids: fd.getAll('children').map(Number),
              })
            ) {
              setEditing(null);
              form.reset();
            }
          }}
        >
          <div className="growth-fields">
            <label>
              Tên phụ huynh
              <input
                name="name"
                required
                maxLength={200}
                defaultValue={editing?.name}
              />
            </label>
            <label>
              Tên đăng nhập
              <input
                name="username"
                required
                minLength={3}
                maxLength={50}
                defaultValue={editing?.username}
              />
            </label>
            <label>
              {editing ? 'Mật khẩu mới (để trống để giữ)' : 'Mật khẩu'}
              <input
                name="password"
                type="password"
                autoComplete="new-password"
                required={!editing}
                minLength={8}
                maxLength={100}
              />
            </label>
          </div>
          <fieldset>
            <legend>Các con được phép xem</legend>
            <div className="growth-checks">
              {data.students.map((s) => (
                <label key={s.id}>
                  <input
                    name="children"
                    type="checkbox"
                    value={s.id}
                    defaultChecked={editing?.student_ids.includes(s.id)}
                  />
                  {s.name} ·{' '}
                  {data.classes.find((c) => c.id === s.class_id)?.name}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="growth-toolbar">
            <button className="primary">
              {editing ? 'Lưu tài khoản' : 'Tạo tài khoản'}
            </button>
            {editing && (
              <button
                className="secondary"
                type="button"
                onClick={() => setEditing(null)}
              >
                Hủy sửa
              </button>
            )}
          </div>
        </form>
        {feature.parents.map((p) => (
          <div className="growth-item" key={p.id}>
            <strong>{p.name}</strong> · {p.username}
            <p>
              {p.student_ids
                .map((id) => data.students.find((s) => s.id === id)?.name)
                .join(', ')}
            </p>
            <div className="growth-toolbar">
              <button className="secondary" onClick={() => setEditing(p)}>
                Sửa / đặt lại mật khẩu
              </button>
              <button
                className="text-button"
                onClick={() => {
                  if (confirm('Xóa tài khoản phụ huynh này?'))
                    void save({ action: 'parent_delete', id: p.id });
                }}
              >
                Xóa tài khoản
              </button>
            </div>
          </div>
        ))}
      </section>
      <section className="growth-card">
        <h3>Lời nhắn trong bản tin tuần</h3>
        <form
          className="growth-stack"
          onSubmit={(e) => {
            e.preventDefault();
            void save({
              action: 'weekly_note',
              student_id: child,
              week,
              note: new FormData(e.currentTarget).get('note'),
            });
          }}
        >
          <div className="growth-fields">
            <label>
              Học sinh
              <select
                value={child}
                onChange={(e) => setChild(Number(e.target.value))}
              >
                {data.students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Tuần bắt đầu từ thứ Hai
              <input
                type="date"
                required
                value={week}
                onChange={(e) => {
                  if (e.target.value) setWeek(weekStart(e.target.value));
                }}
              />
            </label>
          </div>
          <label>
            Lời nhắn
            <textarea
              key={`${child}-${week}-${feature.notes.find((n) => n.student_id === child && n.week === week)?.note}`}
              name="note"
              maxLength={3000}
              defaultValue={
                feature.notes.find(
                  (n) => n.student_id === child && n.week === week,
                )?.note || ''
              }
            />
          </label>
          <button className="primary" disabled={!child}>
            Lưu lời nhắn
          </button>
        </form>
      </section>
      <section className="growth-card">
        <h3>Mở chỗ học bù</h3>
        <p>
          Số chỗ là số học sinh học bù có thể nhận thêm. Phụ huynh chỉ đăng ký
          lớp khác cùng trình độ, từ ngày nghỉ trở đi. Học bù được điểm danh
          riêng và không cộng học phí.
        </p>
        <form
          className="growth-toolbar"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            void save({
              action: 'makeup_slot',
              session_id: Number(fd.get('session')),
              capacity: Number(fd.get('capacity')),
            });
          }}
        >
          <label>
            Buổi nhận học bù
            <select name="session" required>
              <option value="">Chọn buổi của lớp đang xem</option>
              {data.sessions
                .filter(
                  (s) =>
                    s.class_id === classId &&
                    s.date >= localDay() &&
                    s.status !== 'cancelled',
                )
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {sessionLabel(s.id)}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Số chỗ nhận thêm
            <input
              name="capacity"
              type="number"
              required
              min={0}
              max={100}
              defaultValue={2}
            />
          </label>
          <button className="primary">Lưu số chỗ</button>
        </form>
        {feature.slots.map((s) => (
          <p key={s.session_id}>
            {sessionLabel(s.session_id)} ·{' '}
            <strong>
              {
                feature.leaves.filter(
                  (l) => l.makeup_session_id === s.session_id,
                ).length
              }
              /{s.capacity} chỗ đã đăng ký
            </strong>
          </p>
        ))}
      </section>
      <section className="growth-card">
        <h3>Yêu cầu nghỉ & lịch học bù</h3>
        {!feature.leaves.length && (
          <p className="growth-empty">Chưa có yêu cầu nghỉ.</p>
        )}
        {feature.leaves.map((l) => (
          <article className="growth-item" key={l.id}>
            <strong>
              {data.students.find((s) => s.id === l.student_id)?.name} ·{' '}
              {
                {
                  pending: 'Chờ duyệt',
                  approved: 'Đã duyệt',
                  rejected: 'Từ chối',
                }[l.status]
              }
            </strong>
            <p>Buổi nghỉ: {sessionLabel(l.session_id)}</p>
            <p>Lý do: {l.reason}</p>
            <p>Buổi bù: {sessionLabel(l.makeup_session_id)}</p>
            <form
              className="growth-toolbar"
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                void save({
                  action: 'leave_decide',
                  id: l.id,
                  status: fd.get('status'),
                  response: fd.get('response'),
                });
              }}
            >
              <label>
                Phản hồi / đề xuất buổi bù
                <input
                  name="response"
                  defaultValue={l.response}
                  maxLength={1000}
                />
              </label>
              <label>
                Quyết định
                <select
                  name="status"
                  defaultValue={
                    l.status === 'rejected' ? 'rejected' : 'approved'
                  }
                >
                  <option value="approved">Duyệt nghỉ</option>
                  <option value="rejected">Từ chối</option>
                </select>
              </label>
              <button className="secondary" disabled={Boolean(l.makeup_status)}>
                Lưu quyết định
              </button>
            </form>
            {l.makeup_session_id && (
              <div className="growth-toolbar">
                <span>
                  Điểm danh bù:{' '}
                  {l.makeup_status === 'present'
                    ? 'Có mặt'
                    : l.makeup_status === 'absent'
                      ? 'Vắng'
                      : 'Chưa điểm danh'}
                </span>
                <button
                  className="secondary"
                  onClick={() =>
                    save({
                      action: 'makeup_attendance',
                      id: l.id,
                      status: 'present',
                    })
                  }
                >
                  Có mặt
                </button>
                <button
                  className="secondary"
                  onClick={() =>
                    save({
                      action: 'makeup_attendance',
                      id: l.id,
                      status: 'absent',
                    })
                  }
                >
                  Vắng
                </button>
                {!l.makeup_status && (
                  <button
                    className="text-button"
                    onClick={() => save({ action: 'makeup_release', id: l.id })}
                  >
                    Gỡ lịch bù để chọn lại
                  </button>
                )}
              </div>
            )}
          </article>
        ))}
      </section>
    </div>
  );
}

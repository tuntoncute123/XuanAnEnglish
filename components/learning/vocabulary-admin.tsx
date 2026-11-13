'use client';
import { useState } from 'react';
import type {
  GrowthAdminData,
  SaveFeature,
  VocabCard,
} from '@/lib/growth-types';
export default function VocabularyAdmin({
  feature,
  classId,
  save,
}: {
  feature: GrowthAdminData;
  classId: number;
  save: SaveFeature;
}) {
  const [editing, setEditing] = useState<VocabCard | null>(null);
  return (
    <div className="growth-stack">
      <section className="growth-card">
        <h3>{editing ? 'Sửa từ vựng' : 'Thêm thẻ từ vựng'}</h3>
        <p>
          Thẻ được giao cho lớp đang chọn. Học sinh nghe phát âm bằng giọng
          tiếng Anh trên thiết bị.
        </p>
        <form
          key={`${editing?.id || 'new'}-${classId}`}
          className="growth-stack"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const fd = new FormData(form);
            if (
              await save({
                action: 'vocab_save',
                id: editing?.id,
                class_id: classId,
                unit: fd.get('unit'),
                word: fd.get('word'),
                meaning: fd.get('meaning'),
                example: fd.get('example'),
              })
            ) {
              setEditing(null);
              form.reset();
            }
          }}
        >
          <div className="growth-fields">
            <label>
              Unit
              <input
                name="unit"
                defaultValue={editing?.unit}
                required
                maxLength={200}
              />
            </label>
            <label>
              Từ tiếng Anh
              <input
                name="word"
                defaultValue={editing?.word}
                required
                maxLength={200}
              />
            </label>
            <label>
              Nghĩa tiếng Việt
              <input
                name="meaning"
                defaultValue={editing?.meaning}
                required
                maxLength={500}
              />
            </label>
          </div>
          <label>
            Câu ví dụ
            <textarea
              name="example"
              defaultValue={editing?.example}
              maxLength={1000}
            />
          </label>
          <div className="growth-toolbar">
            <button className="primary" disabled={!classId}>
              Lưu thẻ
            </button>
            {editing && (
              <button
                type="button"
                className="secondary"
                onClick={() => setEditing(null)}
              >
                Hủy sửa
              </button>
            )}
          </div>
        </form>
      </section>
      <div className="growth-grid">
        {feature.cards
          .filter((c) => c.class_id === classId)
          .map((c) => (
            <article className="growth-card" key={c.id}>
              <small>{c.unit}</small>
              <h3>{c.word}</h3>
              <p>{c.meaning}</p>
              <p>
                <i>{c.example}</i>
              </p>
              <div className="growth-toolbar">
                <button className="secondary" onClick={() => setEditing(c)}>
                  Sửa
                </button>
                <button
                  className="text-button"
                  onClick={() => {
                    if (confirm('Xóa thẻ từ vựng này?'))
                      void save({ action: 'vocab_delete', id: c.id });
                  }}
                >
                  Xóa
                </button>
              </div>
            </article>
          ))}
      </div>
      {!feature.cards.some((c) => c.class_id === classId) && (
        <p className="growth-empty">
          Lớp chưa có bộ từ. Thêm các thẻ cùng Unit để tạo bộ ôn tập.
        </p>
      )}
    </div>
  );
}

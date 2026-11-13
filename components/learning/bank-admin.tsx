'use client';
import { useState } from 'react';
import type { Data, QuizQuestion } from '@/lib/types';
import type { GrowthAdminData, SaveFeature } from '@/lib/growth-types';
import { localDay } from '@/lib/growth';
import { prepareQuestions } from '@/lib/questions';
import QuizBuilder from '../quiz-builder';
import DocxImporter from '../docx-importer';
import QuestionText from '../question-text';

export default function BankAdmin({
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
  const [drafts, setDrafts] = useState<QuizQuestion[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [importBusy, setImportBusy] = useState(false);
  const [selected, setSelected] = useState<Record<string, number[]>>({});
  async function saveDraft() {
    try {
      setError('');
      const qs = prepareQuestions(drafts);
      if (!qs.length) throw Error('Thêm câu hỏi trước khi lưu.');
      const ok = await save(
        editing
          ? { action: 'bank_update', id: editing, question: qs[0] }
          : { action: 'bank_import', questions: qs },
      );
      if (ok) {
        setDrafts([]);
        setEditing(null);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const filtered = feature.bank.filter((b) =>
    `${b.question.prompt} ${b.unit} ${b.topic}`
      .toLocaleLowerCase()
      .includes(query.toLocaleLowerCase()),
  );
  return (
    <div className="growth-stack">
      <section className="growth-card">
        <h3>Bản đồ kiến thức của lớp</h3>
        <p>
          Tỷ lệ đúng từ lần nộp gần nhất của mỗi bài. Câu chưa có đáp án và tự
          luận chưa được tính.
        </p>
        {!feature.knowledge.length && (
          <p className="growth-empty">
            Chưa có bài trắc nghiệm đã nộp để phân tích.
          </p>
        )}
        {feature.knowledge.map((row) => (
          <details className="growth-item" key={row.topic}>
            <summary>
              {row.topic} · {Math.round((row.correct / row.total) * 100)}% đúng
              ({row.correct}/{row.total})
            </summary>
            <progress max={row.total} value={row.correct} />
            {row.questions.slice(0, 5).map((q, i) => (
              <p key={i}>
                <QuestionText text={q.prompt} /> ·{' '}
                <strong>{q.wrong} em sai</strong>
              </p>
            ))}
            {row.students.length > 0 && (
              <>
                <p>Chọn học sinh cần củng cố:</p>
                <div className="growth-checks">
                  {row.students.map((id) => (
                    <label key={id}>
                      <input
                        type="checkbox"
                        checked={(selected[row.topic] || row.students).includes(
                          id,
                        )}
                        onChange={(e) => {
                          const ids = selected[row.topic] || row.students;
                          setSelected({
                            ...selected,
                            [row.topic]: e.target.checked
                              ? [...ids, id]
                              : ids.filter((v) => v !== id),
                          });
                        }}
                      />
                      {data.students.find((s) => s.id === id)?.name || id}
                    </label>
                  ))}
                </div>
                <button
                  className="primary"
                  disabled={!(selected[row.topic] || row.students).length}
                  onClick={() =>
                    save({
                      action: 'remedial',
                      class_id: classId,
                      topic: row.topic,
                      student_ids: selected[row.topic] || row.students,
                    })
                  }
                >
                  Giao tối đa 10 câu củng cố từ kho
                </button>
              </>
            )}
          </details>
        ))}
      </section>
      <section className="growth-card">
        <h3>Thêm câu hỏi vào kho</h3>
        <form
          className="growth-toolbar"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            void save({
              action: 'bank_import',
              assignment_id: Number(fd.get('assignment')),
            });
          }}
        >
          <label>
            Từ bài tập đã lưu
            <select name="assignment" required>
              <option value="">Chọn bài tập</option>
              {data.assignments
                .filter((a) => a.questions?.length)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.title}
                  </option>
                ))}
            </select>
          </label>
          <button className="secondary">Nhập vào kho</button>
        </form>
        {!editing && (
          <DocxImporter
            existingCount={drafts.length}
            onApply={setDrafts}
            onBusy={setImportBusy}
            busy={importBusy}
          />
        )}
        <QuizBuilder
          drafts={drafts}
          onChange={setDrafts}
          maxQuestions={editing ? 1 : 100}
        />
        {error && (
          <p role="alert" className="growth-error">
            {error}
          </p>
        )}
        {drafts.length > 0 && (
          <div className="growth-toolbar">
            <button className="primary" type="button" onClick={saveDraft}>
              {editing ? 'Lưu câu đã sửa' : 'Lưu vào kho'}
            </button>
            <button
              className="secondary"
              onClick={() => {
                setDrafts([]);
                setEditing(null);
              }}
            >
              Hủy soạn
            </button>
          </div>
        )}
      </section>
      <section className="growth-card">
        <h3>Tạo đề từ kho</h3>
        <p>
          Các mã đề dùng cùng bộ câu hỏi, đảo thứ tự lựa chọn và giữ đúng đáp
          án. Đề được lưu vào Bài tập về nhà để cô kiểm tra trước khi nhắc học
          sinh.
        </p>
        <form
          className="growth-stack"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            void save({
              action: 'generate_exam',
              class_id: classId,
              title: fd.get('title'),
              deadline: fd.get('deadline'),
              unit: fd.get('unit'),
              topic: fd.get('topic'),
              difficulty: fd.get('difficulty'),
              kind: fd.get('kind'),
              count: Number(fd.get('count')),
              variants: Number(fd.get('variants')),
            });
          }}
        >
          <div className="growth-fields">
            <label>
              Tên đề
              <input name="title" maxLength={180} required />
            </label>
            <label>
              Hạn nộp
              <input
                name="deadline"
                type="date"
                defaultValue={localDay()}
                required
              />
            </label>
          </div>
          <div className="growth-fields">
            <label>
              Unit
              <select name="unit">
                <option value="">Tất cả</option>
                {[
                  ...new Set(feature.bank.map((b) => b.unit).filter(Boolean)),
                ].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label>
              Chủ đề
              <select name="topic">
                <option value="">Tất cả</option>
                {[
                  ...new Set(feature.bank.map((b) => b.topic).filter(Boolean)),
                ].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label>
              Độ khó
              <select name="difficulty">
                <option value="">Tất cả</option>
                <option value="easy">Dễ</option>
                <option value="medium">Vừa</option>
                <option value="hard">Khó</option>
              </select>
            </label>
            <label>
              Dạng bài
              <select name="kind">
                <option value="">Tất cả</option>
                <option value="choice">Trắc nghiệm</option>
                <option value="text">Tự luận</option>
              </select>
            </label>
            <label>
              Số câu
              <input
                name="count"
                type="number"
                min={1}
                max={100}
                defaultValue={10}
                required
              />
            </label>
            <label>
              Số mã đề
              <input
                name="variants"
                type="number"
                min={1}
                max={5}
                defaultValue={1}
                required
              />
            </label>
          </div>
          <button
            className="primary"
            disabled={!classId || !feature.bank.length}
          >
            Tạo và lưu đề
          </button>
        </form>
      </section>
      <section className="growth-card">
        <h3>Kho câu hỏi ({feature.bank.length})</h3>
        <label>
          Tìm theo câu hỏi, Unit, chủ đề
          <input value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        {!filtered.length && (
          <p className="growth-empty">Chưa có câu hỏi phù hợp.</p>
        )}
        {filtered.map((b) => (
          <details key={b.id} className="growth-item">
            <summary>
              {b.unit || 'Chưa gắn Unit'} · {b.topic || 'Chưa gắn chủ đề'} ·{' '}
              <QuestionText text={b.question.prompt.slice(0, 130)} />
            </summary>
            <QuestionText text={b.question.context || ''} />
            <p>
              <QuestionText text={b.question.prompt} />
            </p>
            {b.question.options.map((o, i) => (
              <p key={i}>
                {String.fromCharCode(65 + i)}. {o}{' '}
                {b.question.correctIndex === i ? '✓' : ''}
              </p>
            ))}
            <p>{b.question.explanation}</p>
            <div className="growth-toolbar">
              <button
                className="secondary"
                onClick={() => {
                  setEditing(b.id);
                  setDrafts([b.question]);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              >
                Sửa câu hỏi & giải thích
              </button>
              <button
                className="text-button"
                onClick={() => {
                  if (
                    confirm('Xóa câu khỏi kho? Các đề đã tạo được giữ nguyên.')
                  )
                    void save({ action: 'bank_delete', id: b.id });
                }}
              >
                Xóa khỏi kho
              </button>
            </div>
          </details>
        ))}
      </section>
    </div>
  );
}

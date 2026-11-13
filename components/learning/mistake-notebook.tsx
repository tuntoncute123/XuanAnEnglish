'use client';
import { useState } from 'react';
import type { LearningData, SaveFeature } from '@/lib/growth-types';
import QuestionText from '../question-text';
export default function MistakeNotebook({
  data,
  save,
}: {
  data: LearningData;
  save: SaveFeature;
}) {
  const [topic, setTopic] = useState('');
  const [showMastered, setShowMastered] = useState(false);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [reveal, setReveal] = useState<Record<string, boolean>>({});
  const [practice, setPractice] = useState<
    Record<number, Record<string, number>>
  >({});
  const mistakes = data.mistakes.filter(
    (m) =>
      (!topic ||
        (m.question.topic || m.question.section || 'Chưa gắn chủ đề') ===
          topic) &&
      (showMastered || !m.mastered),
  );
  return (
    <div className="growth-stack">
      {data.practice.map((task) => (
        <section key={task.id} className="growth-card">
          <h3>{task.title}</h3>
          <p>
            {task.completed_at
              ? 'Đã nộp · xem lại kết quả'
              : 'Cô chọn bài này để con củng cố kiến thức.'}
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save({
                action: 'practice',
                id: task.id,
                answers: practice[task.id] || {},
              });
            }}
          >
            {task.questions.map((q, i) => (
              <fieldset
                className="growth-item"
                key={q.id}
                disabled={!!task.completed_at}
              >
                <legend>Câu {i + 1}</legend>
                <QuestionText text={q.context || ''} />
                <p>
                  <QuestionText text={q.prompt} />
                </p>
                {q.options.map((option, index) => (
                  <label className="growth-choice" key={index}>
                    <input
                      type="radio"
                      required
                      name={`${task.id}-${q.id}`}
                      checked={
                        (task.completed_at
                          ? task.answers?.[q.id]
                          : practice[task.id]?.[q.id]) === index
                      }
                      onChange={() =>
                        setPractice({
                          ...practice,
                          [task.id]: { ...practice[task.id], [q.id]: index },
                        })
                      }
                    />
                    {option}
                    {task.completed_at && q.correctIndex === index ? ' ✓' : ''}
                  </label>
                ))}
                {task.completed_at && (
                  <p>
                    {task.answers?.[q.id] === q.correctIndex
                      ? 'Đúng rồi!'
                      : 'Con xem lại đáp án có dấu ✓ nhé.'}{' '}
                    {q.explanation}
                  </p>
                )}
              </fieldset>
            ))}
            {!task.completed_at && (
              <button className="primary">Nộp bài củng cố</button>
            )}
          </form>
        </section>
      ))}
      <section className="growth-card">
        <h3>Ôn lại lỗi của em</h3>
        <p>
          Các câu sai được giữ từ những bài con đã nộp và đã có đáp án. Ôn đúng
          để đánh dấu đã nhớ.
        </p>
        <div className="growth-toolbar">
          <label>
            Chủ đề
            <select value={topic} onChange={(e) => setTopic(e.target.value)}>
              <option value="">Tất cả chủ đề</option>
              {[
                ...new Set(
                  data.mistakes.map(
                    (m) =>
                      m.question.topic ||
                      m.question.section ||
                      'Chưa gắn chủ đề',
                  ),
                ),
              ].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label className="growth-choice">
            <input
              type="checkbox"
              checked={showMastered}
              onChange={(e) => setShowMastered(e.target.checked)}
            />
            Hiện cả câu đã nhớ
          </label>
          <span>
            {data.mistakes.filter((m) => m.mastered).length}/
            {data.mistakes.length} câu đã nhớ
          </span>
        </div>
        {!mistakes.length && (
          <p className="growth-empty">
            Không có câu cần ôn trong mục này. Con tiếp tục làm bài cô giao nhé!
          </p>
        )}
        {mistakes.map((m, i) => (
          <article className="growth-item" key={m.key}>
            <small>
              {m.question.topic || m.question.section || 'Ôn tập'} ·{' '}
              {m.mastered ? 'Đã nhớ' : 'Cần ôn'}
            </small>
            <QuestionText text={m.question.context || ''} />
            <p>
              <strong>Câu {i + 1}.</strong>{' '}
              <QuestionText text={m.question.prompt} />
            </p>
            <p>
              Lần làm trước:{' '}
              {m.selected === null
                ? 'Chưa trả lời'
                : m.question.options[m.selected]}
            </p>
            {m.question.options.map((option, j) => (
              <label className="growth-choice" key={j}>
                <input
                  type="radio"
                  name={`mistake-${i}`}
                  checked={answers[m.key] === j}
                  onChange={() => {
                    setAnswers({ ...answers, [m.key]: j });
                    setReveal({ ...reveal, [m.key]: false });
                  }}
                />
                {option}
              </label>
            ))}
            <button
              className="primary"
              disabled={answers[m.key] === undefined}
              onClick={async () => {
                if (
                  await save({
                    action: 'review_mistake',
                    key: m.key,
                    choice: answers[m.key],
                  })
                )
                  setReveal({ ...reveal, [m.key]: true });
              }}
            >
              Kiểm tra câu trả lời
            </button>
            {reveal[m.key] && (
              <div className="growth-answer">
                <strong>
                  {answers[m.key] === m.question.correctIndex
                    ? 'Đúng rồi!'
                    : 'Thử ôn lại nhé.'}
                </strong>
                <p>Đáp án: {m.question.options[m.question.correctIndex!]}</p>
                <p>
                  {m.question.explanation ||
                    'Con có thể hỏi cô để được giải thích thêm.'}
                </p>
              </div>
            )}
            <details>
              <summary>Xem giải thích</summary>
              <p>Đáp án: {m.question.options[m.question.correctIndex!]}</p>
              <p>
                {m.question.explanation ||
                  'Cô chưa bổ sung giải thích cho câu này.'}
              </p>
            </details>
          </article>
        ))}
      </section>
    </div>
  );
}

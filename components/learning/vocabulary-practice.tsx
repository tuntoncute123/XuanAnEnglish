'use client';
import { useState } from 'react';
import type { LearningData, SaveFeature } from '@/lib/growth-types';
import SpeakButton from './speak-button';
export default function VocabularyPractice({
  data,
  save,
}: {
  data: LearningData;
  save: SaveFeature;
}) {
  const [unit, setUnit] = useState('');
  const [flipped, setFlipped] = useState(false);
  const [count, setCount] = useState(0);
  const cards = data.cards.filter((c) => !unit || c.unit === unit);
  const due = cards.filter((c) => !c.due || c.due <= data.today);
  const card = due[0];
  async function review(remembered: boolean) {
    if (
      card &&
      (await save({ action: 'review_vocab', card_id: card.id, remembered }))
    ) {
      setFlipped(false);
      setCount((c) => c + 1);
    }
  }
  return (
    <section className="growth-card">
      <div className="growth-toolbar">
        <div>
          <h3>Ôn từ vựng mỗi ngày</h3>
          <p>Từ chưa nhớ sẽ quay lại sớm hơn. Mỗi lượt tối đa 10 thẻ.</p>
        </div>
        <label>
          Bộ từ
          <select
            value={unit}
            onChange={(e) => {
              setUnit(e.target.value);
              setFlipped(false);
              setCount(0);
            }}
          >
            <option value="">Tất cả Unit</option>
            {[...new Set(data.cards.map((c) => c.unit))].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
      </div>
      <p>
        {due.length} từ đến lượt ôn · Đã ôn {count} từ trong lượt này
      </p>
      <progress max={10} value={count} />
      {card && count < 10 ? (
        <article className="growth-flashcard" key={card.id}>
          <small>{card.unit}</small>
          <h3 lang="en">{card.word}</h3>
          <SpeakButton text={card.word} />
          {flipped ? (
            <>
              <p className="growth-meaning">{card.meaning}</p>
              <p lang="en">{card.example}</p>
              {card.example && <SpeakButton text={card.example} />}
              <div className="growth-toolbar">
                <button className="secondary" onClick={() => review(false)}>
                  Cần ôn thêm
                </button>
                <button className="primary" onClick={() => review(true)}>
                  Con đã nhớ
                </button>
              </div>
            </>
          ) : (
            <button className="primary" onClick={() => setFlipped(true)}>
              Lật thẻ xem nghĩa
            </button>
          )}
        </article>
      ) : (
        <div className="growth-empty">
          <h3>
            {data.cards.length
              ? 'Hoàn thành lượt ôn!'
              : 'Cô chưa giao bộ từ vựng.'}
          </h3>
          <p>
            {data.cards.length
              ? 'Tiến độ đã lưu. Con quay lại khi có từ đến hạn nhé.'
              : 'Các bộ từ sẽ xuất hiện tại đây khi cô thêm thẻ.'}
          </p>
          {due.length > 0 && (
            <button className="secondary" onClick={() => setCount(0)}>
              Ôn thêm một lượt
            </button>
          )}
        </div>
      )}
      <details>
        <summary>Xem bộ từ ({cards.length})</summary>
        {cards.map((c) => (
          <p key={c.id}>
            <strong>{c.word}</strong> — {c.meaning} ·{' '}
            {c.due ? `Ôn lại ${c.due}` : 'Chưa ôn'}
          </p>
        ))}
      </details>
    </section>
  );
}

'use client';
import { useEffect, useState } from 'react';
export default function SpeakButton({ text }: { text: string }) {
  const [error, setError] = useState('');
  useEffect(
    () => () => {
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    },
    [],
  );
  return (
    <>
      <button
        type="button"
        className="secondary"
        onClick={() => {
          setError('');
          if (!('speechSynthesis' in window)) {
            setError('Thiết bị này chưa hỗ trợ giọng đọc.');
            return;
          }
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(text);
          utterance.lang = 'en-US';
          utterance.rate = 0.85;
          utterance.onerror = (e) => {
            if (!['canceled', 'interrupted'].includes(e.error))
              setError(
                'Chưa phát được âm thanh. Kiểm tra giọng tiếng Anh trên thiết bị.',
              );
          };
          window.speechSynthesis.speak(utterance);
        }}
      >
        🔊 Nghe tiếng Anh
      </button>
      {error && <small role="status">{error}</small>}
    </>
  );
}

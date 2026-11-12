'use client';

import { useEffect, useRef, useState } from 'react';
import { Mic, Square, Trash2 } from 'lucide-react';

function pickSupportedMime(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = [
    'audio/mp4',
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/ogg',
  ];
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return '';
}

function extForMime(mime: string): string {
  const base = mime.split(';')[0].trim().toLowerCase();
  if (base === 'audio/mp4') return 'm4a';
  if (base === 'audio/ogg') return 'ogg';
  if (base === 'audio/wav') return 'wav';
  return 'webm';
}

function formatTimer(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function AudioRecorder({
  recordedFile,
  onChange,
}: {
  recordedFile: File | null;
  onChange: (file: File | null) => void;
}) {
  const [supported, setSupported] = useState(false);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [recError, setRecError] = useState('');

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setSupported(
      typeof window !== 'undefined' &&
        Boolean(navigator.mediaDevices?.getUserMedia) &&
        typeof MediaRecorder !== 'undefined',
    );
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        recorderRef.current.stop();
      }
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  useEffect(() => {
    if (!recordedFile) {
      setPreviewUrl(prev => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    }
  }, [recordedFile]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  async function startRecording() {
    setRecError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickSupportedMime();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e: BlobEvent) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        stream.getTracks().forEach(t => t.stop());
        streamRef.current = null;

        const actualType = recorder.mimeType || mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: actualType });
        if (blob.size > 0) {
          const ext = extForMime(actualType);
          const file = new File([blob], `ghi-am-${Date.now()}.${ext}`, { type: actualType.split(';')[0] });
          const nextUrl = URL.createObjectURL(blob);
          setPreviewUrl(prev => {
            if (prev) URL.revokeObjectURL(prev);
            return nextUrl;
          });
          onChange(file);
        }
        setRecording(false);
      };

      setSeconds(0);
      recorder.start();
      setRecording(true);
      timerRef.current = setInterval(() => {
        setSeconds(s => {
          if (s >= 179) {
            recorder.stop();
            return 180;
          }
          return s + 1;
        });
      }, 1000);
    } catch {
      setRecError('Không truy cập được micro. Hãy cấp quyền micro cho trình duyệt rồi thử lại nhé.');
      setRecording(false);
    }
  }

  function stopRecording() {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
  }

  function clearRecording() {
    onChange(null);
    setSeconds(0);
  }

  if (!supported) return null;

  return (
    <div className="audio-recorder-box">
      <div className="audio-recorder-row">
        {!recording ? (
          <button type="button" className="soft-button recorder-btn" onClick={startRecording}>
            <Mic size={16} />
            <span>{recordedFile ? 'Ghi âm lại' : 'Ghi âm giọng nói'}</span>
          </button>
        ) : (
          <button type="button" className="recorder-stop-btn" onClick={stopRecording}>
            <Square size={14} />
            <span>Dừng ghi âm · {formatTimer(seconds)}</span>
          </button>
        )}

        {recordedFile && !recording && (
          <button
            type="button"
            className="icon-button"
            aria-label="Xóa bản ghi âm"
            onClick={clearRecording}
          >
            <Trash2 size={15} />
          </button>
        )}
      </div>

      {previewUrl && !recording && (
        <audio className="audio-preview" controls src={previewUrl} preload="metadata" />
      )}

      {recError && <small className="recorder-error">{recError}</small>}
    </div>
  );
}

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { StudentAssignment, Submission } from '@/lib/types';
import { homeworkDraftKey, questionVersion, readHomeworkDraft, sameHomeworkContent, validQuizAnswers, type HomeworkContent, type HomeworkDraft } from '@/lib/homework-draft';

export function useHomeworkDraft(studentId: number, assignment: StudentAssignment, submission?: Submission) {
  const key = homeworkDraftKey(studentId, assignment.id);
  const submissionVersion = submission?.submitted_at || null;
  const questions = assignment.questions || [];
  const signature = questionVersion(questions);
  const originalAnswers = JSON.stringify(submission?.quiz_answers || {});
  const baseline = useMemo<HomeworkContent>(() => ({
    answer: submission?.answer || '',
    quizAnswers: validQuizAnswers(JSON.parse(originalAnswers), JSON.parse(signature)),
  }), [submission?.answer, originalAnswers, signature]);
  const [content, setContent] = useState(baseline);
  const current = useRef(content);
  const [status, setStatus] = useState<'idle' | 'saved' | 'restored' | 'unavailable'>('idle');
  const [hasDraft, setHasDraft] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let restored = baseline;
    try {
      const raw = localStorage.getItem(key);
      const draft = readHomeworkDraft(raw, submissionVersion, JSON.parse(signature));
      if (draft && !sameHomeworkContent(draft, baseline)) {
        restored = { answer: draft.answer, quizAnswers: draft.quizAnswers };
        setStatus('restored');
        setHasDraft(true);
      } else {
        if (raw) localStorage.removeItem(key);
        setStatus('idle');
        setHasDraft(false);
      }
    } catch {
      setStatus('unavailable');
    }
    current.current = restored;
    setContent(restored);
    setReady(true);
  }, [key, submissionVersion, signature, baseline]);

  function update(next: HomeworkContent) {
    current.current = next;
    setContent(next);
    const dirty = !sameHomeworkContent(next, baseline);
    setHasDraft(dirty);
    try {
      if (dirty) {
        const draft: HomeworkDraft = { ...next, version: 1, submissionVersion, questionVersion: signature, savedAt: Date.now() };
        // Write at the input event, so switching tabs or reloading immediately cannot lose the last keystroke.
        localStorage.setItem(key, JSON.stringify(draft));
      } else {
        localStorage.removeItem(key);
      }
      setStatus(dirty ? 'saved' : 'idle');
    } catch {
      setStatus('unavailable');
    }
  }

  function clearSavedDraft() {
    try {
      localStorage.removeItem(key);
      setHasDraft(false);
      setStatus('idle');
    } catch {
      setStatus('unavailable');
    }
  }

  return {
    ...content, status, hasDraft, ready,
    setAnswer: (answer: string) => update({ ...current.current, answer }),
    setQuizChoice: (id: string, choice: number) => update({ ...current.current, quizAnswers: { ...current.current.quizAnswers, [id]: choice } }),
    discard: () => update(baseline),
    clearSavedDraft,
  };
}

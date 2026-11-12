import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { zipSync, strToU8 } from 'fflate';
import { importDocx, parseExamParagraphs } from '../lib/docx-import.ts';
import { prepareQuestions, validateQuestionAnswers } from '../lib/questions.ts';
import { actionSchema, quizQuestionSchema, studentSubmissionSchema } from '../lib/schemas.ts';
import { questionVersion, readHomeworkDraft, sameHomeworkContent } from '../lib/homework-draft.ts';

const original = readFileSync(new URL('./fixtures/unit-1-exam.docx', import.meta.url));
const exam = importDocx(original);

test('real Unit 1 DOCX imports all 47 questions with 35 choices, 12 written and no invented key', () => {
  assert.equal(exam.questions.length, 47);
  assert.equal(exam.questions.filter(q => q.kind === 'choice').length, 35);
  assert.equal(exam.questions.filter(q => q.kind === 'text').length, 12);
  assert.deepEqual(exam.questions.map(q => q.number), Array.from({ length: 47 }, (_, i) => i + 1));
  assert.ok(exam.questions.every(q => q.correctIndex === undefined));
  assert.equal(exam.questions[0].options[0], 'wash<u>ed</u>');
  assert.match(exam.questions[12].prompt, /a\. As a result/);
  assert.match(exam.questions[12].prompt, /e\. I have also begun/);
  assert.equal(exam.questions[12].options.length, 4);
  assert.match(exam.questions[17].context!, /habits \(18\)/);
  assert.equal(exam.questions[17].context, exam.questions[22].context);
  assert.match(exam.questions[23].context!, /daily \(24\)/);
  assert.match(exam.questions[29].context!, /During sleep, the body/);
  assert.equal(exam.questions[29].context, exam.questions[34].context);
  assert.match(exam.questions[46].prompt, /→ You should not/);
  assert.equal(new Set(exam.questions.map(q => q.section)).size, 8);
  assert.ok(!JSON.stringify(exam.questions).includes('Số báo danh'));
  assert.deepEqual(importDocx(original), exam);
  assert.ok(actionSchema.safeParse({ action: 'assignment', class_id: 1, title: exam.title, instructions: exam.instructions, deadline: '2026-12-01', file_id: null, questions: exam.questions }).success);
});

test('line rules handle inline options, question continuations and separate answer-key sections', () => {
  const result = parseExamParagraphs(['PART I. TEST', 'Choose the correct answer.', 'Question 1. Choose', 'A. One B. Two C. Three D. Four', 'Question 2. Rewrite this.', '→ New sentence ____', 'ANSWER KEY', '1. A']);
  assert.equal(result.questions.length, 2);
  assert.deepEqual(result.questions[0].options, ['One', 'Two', 'Three', 'Four']);
  assert.equal(result.questions[1].kind, 'text');
  assert.match(result.questions[1].prompt, /New sentence/);
  assert.ok(result.warnings.some(w => w.includes('Phần đáp án')));
  assert.throws(() => parseExamParagraphs(['Câu 1. Test', 'A. One', 'C. Three']), /thứ tự/);
  assert.throws(() => parseExamParagraphs(['Câu 1. First', 'Câu 1. Again']), /trùng/);
  assert.throws(() => parseExamParagraphs(['Câu 1. Test', 'A. Alone']), /đầy đủ/);
});

test('invalid archives, XML entities and oversized expanded XML fail instead of producing incomplete questions', () => {
  assert.throws(() => importDocx(strToU8('not a docx')), /Không đọc được/);
  assert.throws(() => importDocx(zipSync({ 'other.xml': strToU8('<x/>') })), /Không đọc được/);
  assert.throws(() => importDocx(zipSync({ 'word/document.xml': strToU8('<!DOCTYPE x [<!ENTITY e SYSTEM "file:///tmp/secret">]><x>&e;</x>') })), /không hợp lệ/);
  assert.throws(() => importDocx(zipSync({ 'word/document.xml': new Uint8Array(8 * 1024 * 1024 + 1) })), /Không đọc được/);
  assert.throws(() => parseExamParagraphs(['Nothing numbered']), /Chưa nhận diện/);
});

test('missing keys and written questions never become wrong answers or a zero total score', () => {
  assert.equal(validateQuestionAnswers(exam.questions, { docx_1: 2 }, { docx_36: 'fitness' }), '');
  const mixed = [{ ...exam.questions[0], correctIndex: 2 }, exam.questions[35]];
  assert.match(validateQuestionAnswers(mixed, { docx_1: 2 }, { docx_36: 'fitness' }), /^1\/1.*1 câu chờ/);
  assert.equal(validateQuestionAnswers([mixed[0]], { docx_1: 2 }, {}), '1/1 (10đ)');
  assert.throws(() => validateQuestionAnswers(exam.questions, { docx_1: 4 }, {}));
  assert.throws(() => validateQuestionAnswers(exam.questions, { unknown: 0 }, {}));
  assert.throws(() => validateQuestionAnswers(exam.questions, {}, { docx_1: 'not a text question' }));
  const cleaned = prepareQuestions([{ id: 'q', prompt: 'Question', options: ['One', '', 'Three'], correctIndex: 2 }]);
  assert.equal(cleaned[0].correctIndex, 1);
  assert.equal(prepareQuestions(exam.questions).length, 47);
  assert.throws(() => prepareQuestions([{ id: 'q', prompt: '', options: [] }]));
  assert.equal(quizQuestionSchema.safeParse({ id: 'q', kind: 'text', prompt: 'Test', options: [], correctIndex: 0 }).success, false);
  assert.ok(studentSubmissionSchema.safeParse({ assignment_id: 1, answer: '', text_answers: { docx_36: 'fitness' } }).success);
});

test('written answers restore from drafts, reject stale versions and participate in dirty-state checks', () => {
  const draft = { version: 1, submissionVersion: null, savedAt: 1, questionVersion: questionVersion(exam.questions), answer: '', quizAnswers: { docx_1: 2 }, textAnswers: { docx_36: 'fitness', docx_47: 'skip breakfast', unknown: 'discard' } };
  const restored = readHomeworkDraft(JSON.stringify(draft), null, exam.questions)!;
  assert.deepEqual(restored.textAnswers, { docx_36: 'fitness', docx_47: 'skip breakfast' });
  assert.equal(readHomeworkDraft(JSON.stringify(draft), 'new-submission', exam.questions), null);
  assert.equal(sameHomeworkContent({ answer: '', quizAnswers: {} }, { answer: '', quizAnswers: {}, textAnswers: { docx_36: 'fitness' } }), false);
  const changed = exam.questions.map((q, i) => i === 35 ? { ...q, prompt: 'Changed question' } : q);
  assert.deepEqual(readHomeworkDraft(JSON.stringify(draft), null, changed)?.textAnswers, {});
});

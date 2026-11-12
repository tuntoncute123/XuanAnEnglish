import { unzipSync, strFromU8 } from 'fflate';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { quizQuestionSchema } from './schemas.ts';
import type { QuizQuestion } from './types.ts';

export type DocxImport = { title: string; instructions: string; questions: QuizQuestion[]; warnings: string[] };
type XmlNode = Record<string, any>;
const MAX_XML = 8 * 1024 * 1024;

/** Read only the document body, in paragraph/table order. Never execute DOCX relationships or embedded content. */
export function readDocxParagraphs(buffer: Uint8Array) {
  if (!buffer.length || buffer.length > 10 * 1024 * 1024) throw new Error('Tệp DOCX phải từ 1 byte đến 10 MB.');
  let xml: string;
  try {
    const files = unzipSync(buffer, { filter: entry => {
      if (entry.name !== 'word/document.xml') return false;
      if (entry.originalSize > MAX_XML) throw new Error('oversize');
      return true;
    } });
    if (!files['word/document.xml'] || files['word/document.xml'].length > MAX_XML) throw new Error('missing document');
    xml = strFromU8(files['word/document.xml']);
  } catch {
    throw new Error('Không đọc được DOCX. Tệp có thể bị hỏng, được bảo vệ hoặc quá lớn sau giải nén.');
  }
  if (/<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) throw new Error('Nội dung DOCX không hợp lệ.');
  const tree = new XMLParser({ preserveOrder: true, ignoreAttributes: false, trimValues: false, parseTagValue: false }).parse(xml) as XmlNode[];
  const paragraphs: string[] = [];
  let unsupported = false;
  function text(nodes: XmlNode[]): string {
    return nodes.map(node => {
      if (node['#text'] !== undefined) return String(node['#text']);
      if (node['w:tab']) return '\t';
      if (node['w:br'] || node['w:cr']) return '\n';
      if (node['w:drawing'] || node['w:pict'] || node['m:oMath']) { unsupported = true; return ''; }
      if (node['w:del'] || node['w:instrText']) return '';
      if (node['w:r']) {
        const run = node['w:r'] as XmlNode[];
        const props = run.find(p => p['w:rPr'])?.['w:rPr'] as XmlNode[] | undefined;
        const underline = props?.find(p => p['w:u']);
        const value = text(run.filter(p => !p['w:rPr']));
        return underline && !['none', '0', 'false'].includes(underline[':@']?.['@_w:val']) && value.trim() ? `<u>${value}</u>` : value;
      }
      return Object.entries(node).filter(([key, value]) => key !== ':@' && key !== 'w:pPr' && Array.isArray(value))
        .map(([, value]) => text(value)).join('');
    }).join('');
  }
  function walk(nodes: XmlNode[], depth = 0) {
    if (depth > 100) throw new Error('Cấu trúc DOCX quá phức tạp.');
    for (const node of nodes) {
      if (node['w:p']) {
        const value = text(node['w:p']).replace(/\u00a0/g, ' ').trim();
        if (value) paragraphs.push(...value.split(/\r?\n/).map(line => line.trim()).filter(Boolean));
      } else {
        for (const [key, value] of Object.entries(node)) if (key !== ':@' && Array.isArray(value)) walk(value, depth + 1);
      }
    }
  }
  walk(tree);
  if (paragraphs.join('\n').length > 200_000) throw new Error('Đề quá dài. Hãy chia thành các tệp nhỏ hơn.');
  return { paragraphs, unsupported };
}

/** Deterministic boundaries: section/instruction, numbered question, uppercase A–F options. */
export function parseExamParagraphs(paragraphs: string[]): DocxImport {
  const questions: QuizQuestion[] = [];
  const header: string[] = [];
  const warnings: string[] = [];
  let section = '';
  let context: string[] = [];
  let current: QuizQuestion | undefined;
  let optionIndex = -1;
  function flush() {
    if (!current) return;
    current.kind = current.options.length ? 'choice' : 'text';
    current.prompt = current.prompt.trim() || 'Chọn đáp án phù hợp.';
    const parsed = quizQuestionSchema.safeParse(current);
    if (!parsed.success) throw new Error(`Câu ${current.number} chưa tách được đầy đủ. Kiểm tra nội dung và các lựa chọn A, B, C, D trong tệp.`);
    questions.push(parsed.data);
    current = undefined;
    optionIndex = -1;
  }
  for (const raw of paragraphs) {
    const line = raw.trim();
    if (/^(?:[-–—\s]*HẾT[-–—\s]*|Họ và tên thí sinh\s*:|Số báo danh\s*:)/i.test(line)) { flush(); break; }
    if (/^(?:ĐÁP ÁN|ANSWER KEY|HƯỚNG DẪN CHẤM)(?:\s|:|$)/i.test(line)) {
      flush(); warnings.push('Phần đáp án cuối tệp không nhập vào đề học sinh. Giáo viên chọn đáp án đúng trong phần chỉnh sửa.'); break;
    }
    if (/^(?:PART|SECTION|PHẦN)\s+(?:[IVXLC]+|\d+)\b/i.test(line)) {
      flush(); section = line; context = []; continue;
    }
    if (/^(?:Mark the|Read the|Give the|Rewrite |Choose the|Complete the|Chọn |Đọc |Viết lại |Điền )/i.test(line)) {
      flush(); context = [line]; continue;
    }
    const start = line.match(/^(?:(?:Câu|Question)\s+)?(\d{1,3})[.):]\s*(.*)$/i);
    if (start) {
      flush();
      const number = Number(start[1]);
      if (questions.some(q => q.number === number)) throw new Error(`Số câu ${number} bị trùng. Hãy đánh số câu liên tục trước khi nhập.`);
      current = { id: `docx_${number}`, number, prompt: start[2], options: [], section, context: context.join('\n\n') };
      continue;
    }
    if (!current) {
      if (section || context.length) context.push(line); else header.push(line);
      continue;
    }
    // Lowercase a./b. belong to sentence-arrangement prompts, never to answer choices.
    if (/^[A-F][.)]\s+/.test(line)) {
      const matches = [...line.matchAll(/(?:^|\s+)([A-F])[.)]\s+/g)];
      for (let i = 0; i < matches.length; i++) {
        const match = matches[i];
        const index = match[1].charCodeAt(0) - 65;
        if (index !== current.options.length) throw new Error(`Câu ${current.number}: thứ tự lựa chọn phải là A, B, C, D (không trùng hoặc thiếu).`);
        current.options.push(line.slice(match.index! + match[0].length, matches[i + 1]?.index ?? line.length).trim());
        optionIndex = index;
      }
    } else if (optionIndex >= 0) {
      current.options[optionIndex] += `\n${line}`;
    } else {
      current.prompt += `${current.prompt ? '\n' : ''}${line}`;
    }
  }
  flush();
  if (!questions.length) throw new Error('Chưa nhận diện được câu hỏi. Dùng dạng “Câu 1.” hoặc “Question 1.” và lựa chọn “A.”, “B.”, “C.”, “D.”.');
  if (questions.length > 100) throw new Error('Mỗi bài hỗ trợ tối đa 100 câu. Hãy chia đề thành nhiều bài.');
  if (questions.some((q, i) => q.number !== i + 1)) warnings.push('Số câu không liên tục từ 1. Hãy đối chiếu số câu với tệp gốc.');
  warnings.push('Chưa có đáp án đúng được xác nhận. Giáo viên có thể chọn đáp án trắc nghiệm để tự chấm; các câu còn lại chờ giáo viên chấm.');
  return {
    title: (header.find(line => /^Phạm vi:/i.test(line))?.replace(/^Phạm vi:\s*/i, '') || header.find(line => /ĐỀ KIỂM TRA/i.test(line)) || 'Đề bài nhập từ DOCX').slice(0, 200),
    instructions: header.join('\n').slice(0, 10000) || 'Làm các câu hỏi bên dưới. Đọc kỹ hướng dẫn của từng phần.',
    questions, warnings,
  };
}

export function importDocx(buffer: Uint8Array): DocxImport {
  const { paragraphs, unsupported } = readDocxParagraphs(buffer);
  const result = parseExamParagraphs(paragraphs);
  if (unsupported) result.warnings.unshift('Tệp có ảnh hoặc công thức không chuyển thành văn bản. Hãy đối chiếu bản gốc và bổ sung nội dung trước khi giao.');
  return result;
}

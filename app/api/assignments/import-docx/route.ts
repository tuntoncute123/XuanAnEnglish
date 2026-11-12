import { isAdmin, sameOrigin } from '@/lib/auth';
import { importDocx } from '@/lib/docx-import';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  if (!sameOrigin(req)) return Response.json({ error: 'Yêu cầu không hợp lệ.' }, { status: 403 });
  if (!(await isAdmin())) return Response.json({ error: 'Chỉ giáo viên được nhập đề.' }, { status: 401 });
  if (Number(req.headers.get('content-length') || 0) > 11 * 1024 * 1024) return Response.json({ error: 'Tệp tối đa 10 MB.' }, { status: 413 });
  try {
    const file = (await req.formData()).get('file');
    if (!(file instanceof File) || !/\.docx$/i.test(file.name) || !file.size || file.size > 10 * 1024 * 1024) {
      return Response.json({ error: 'Chọn tệp .docx từ 1 byte đến 10 MB.' }, { status: 400 });
    }
    return Response.json(importDocx(new Uint8Array(await file.arrayBuffer())));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Không đọc được đề DOCX.' }, { status: 400 });
  }
}

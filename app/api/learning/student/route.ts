import { sameOrigin } from '@/lib/auth';
import { featureStudent } from '@/lib/parent-auth';
import { learningData, learnerActionHandler } from '@/lib/learning-service';
import { submitSpeaking } from '@/lib/speaking-service';
import { featureBody, featureError } from '@/lib/growth-validation';
export const runtime = 'nodejs';
export async function GET(req: Request) {
  const student = await featureStudent(req);
  if (!student)
    return Response.json({ error: 'Vui lòng đăng nhập.' }, { status: 401 });
  try {
    return Response.json(await learningData(student));
  } catch (e) {
    return featureError(e);
  }
}
export async function POST(req: Request) {
  if (!sameOrigin(req))
    return Response.json({ error: 'Yêu cầu không hợp lệ.' }, { status: 403 });
  const student = await featureStudent(req);
  if (!student)
    return Response.json({ error: 'Vui lòng đăng nhập.' }, { status: 401 });
  try {
    const body = await featureBody(req);
    if (body && typeof body === 'object' && 'action' in body && body.action === 'speaking_submit') await submitSpeaking(student, body);
    else await learnerActionHandler(student, body);
    return Response.json({ ok: true });
  } catch (e) {
    return featureError(e);
  }
}

import { isAdmin, sameOrigin } from '@/lib/auth';
import { bankAction, bankData } from '@/lib/bank-service';
import { familyAdminAction, familyAdminData } from '@/lib/family-service';
import { speakingAdminAction, speakingAdminData } from '@/lib/speaking-service';
import { vocabAction, vocabData } from '@/lib/vocab-service';
import { FeatureError, featureBody, featureError } from '@/lib/growth-validation';
export const runtime = 'nodejs';
export async function GET(req: Request) {
  if (!(await isAdmin()))
    return Response.json({ error: 'Vui lòng đăng nhập.' }, { status: 401 });
  try {
    const classId =
      Number(new URL(req.url).searchParams.get('class_id')) || undefined;
    const [bank, family, speaking, cards] = await Promise.all([
      bankData(classId),
      familyAdminData(),
      speakingAdminData(),
      vocabData(),
    ]);
    return Response.json({ ...bank, ...family, ...speaking, cards });
  } catch (e) {
    return featureError(e);
  }
}
export async function POST(req: Request) {
  if (!sameOrigin(req))
    return Response.json({ error: 'Yêu cầu không hợp lệ.' }, { status: 403 });
  if (!(await isAdmin()))
    return Response.json({ error: 'Vui lòng đăng nhập.' }, { status: 401 });
  try {
    const body = await featureBody(req);
    const action = String(body && typeof body === 'object' && 'action' in body ? body.action : '');
    if (
      action.startsWith('bank_') ||
      ['generate_exam', 'remedial'].includes(action)
    )
      await bankAction(body);
    else if (action.startsWith('vocab_')) await vocabAction(body);
    else if (action.startsWith('speaking_')) await speakingAdminAction(body);
    else if (/^(parent_|weekly_note|makeup_|leave_decide)/.test(action))
      await familyAdminAction(body);
    else throw new FeatureError('Thao tác chưa được hỗ trợ.');
    return Response.json({ ok: true });
  } catch (e) {
    return featureError(e);
  }
}

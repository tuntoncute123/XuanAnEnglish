import { cookies } from 'next/headers';
import { sameOrigin } from '@/lib/auth';
import { PARENT_COOKIE, sessionParent } from '@/lib/parent-auth';
import { parentAction, parentData } from '@/lib/family-service';
import { featureBody, featureError } from '@/lib/growth-validation';
export const runtime = 'nodejs';
export async function GET(req: Request) {
  const parent = await sessionParent();
  if (!parent)
    return Response.json(
      { error: 'Vui lòng đăng nhập phụ huynh.' },
      { status: 401 },
    );
  try {
    return Response.json({
      parent: { name: parent.name, username: parent.username },
      ...(await parentData(
        parent.id,
        new URL(req.url).searchParams.get('week') || undefined,
      )),
    });
  } catch (e) {
    return featureError(e);
  }
}
export async function POST(req: Request) {
  if (!sameOrigin(req))
    return Response.json({ error: 'Yêu cầu không hợp lệ.' }, { status: 403 });
  const parent = await sessionParent();
  if (!parent)
    return Response.json(
      { error: 'Vui lòng đăng nhập phụ huynh.' },
      { status: 401 },
    );
  try {
    const body = await featureBody(req);
    if (body && typeof body === 'object' && 'action' in body && body.action === 'logout') (await cookies()).delete(PARENT_COOKIE);
    else await parentAction(parent.id, body);
    return Response.json({ ok: true });
  } catch (e) {
    return featureError(e);
  }
}

import { generateVAPIDKeys, sendNotification, WebPushError } from 'web-push';
import { all, get, run, transaction } from './db';

export type VapidConfig = {
  publicKey: string;
  privateKey: string;
  subject: string;
};

export type PushMessage = {
  type?: string;
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

type SubRow = {
  id: number;
  student_id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
};

let cachedVapid: VapidConfig | null = null;

export async function getVapidConfig(): Promise<VapidConfig> {
  const subject = process.env.VAPID_SUBJECT || 'mailto:xuanan@english.local';
  const envPub = process.env.VAPID_PUBLIC_KEY?.trim();
  const envPriv = process.env.VAPID_PRIVATE_KEY?.trim();
  if (envPub && envPriv) {
    return { publicKey: envPub, privateKey: envPriv, subject };
  }
  if (cachedVapid) return cachedVapid;

  const [pubRow, privRow] = await Promise.all([
    get("SELECT value FROM settings WHERE key='vapid_public_key'"),
    get("SELECT value FROM settings WHERE key='vapid_private_key'"),
  ]);
  if (pubRow?.value && privRow?.value) {
    cachedVapid = {
      publicKey: String(pubRow.value),
      privateKey: String(privRow.value),
      subject,
    };
    return cachedVapid;
  }

  const generated = generateVAPIDKeys();
  await transaction(async client => {
    await client.run('SELECT pg_advisory_xact_lock(823761427)');
    await client.run(
      "INSERT INTO settings(key, value) VALUES('vapid_public_key', ?) ON CONFLICT(key) DO NOTHING",
      generated.publicKey,
    );
    await client.run(
      "INSERT INTO settings(key, value) VALUES('vapid_private_key', ?) ON CONFLICT(key) DO NOTHING",
      generated.privateKey,
    );
  });

  const [finalPub, finalPriv] = await Promise.all([
    get("SELECT value FROM settings WHERE key='vapid_public_key'"),
    get("SELECT value FROM settings WHERE key='vapid_private_key'"),
  ]);
  cachedVapid = {
    publicKey: String(finalPub?.value || generated.publicKey),
    privateKey: String(finalPriv?.value || generated.privateKey),
    subject,
  };
  return cachedVapid;
}

async function deliverToSubscriptions(subs: SubRow[], message: PushMessage) {
  if (!subs.length) return { sent: 0, failed: 0, removed: 0 };
  const vapid = await getVapidConfig();
  const payload = JSON.stringify({
    title: message.title,
    body: message.body,
    url: message.url || '/student',
    tag: message.tag || `xa-${message.type || 'notice'}`,
  });

  const staleEndpoints: string[] = [];
  let sent = 0;
  let failed = 0;

  const results = await Promise.allSettled(
    subs.map(sub =>
      sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        payload,
        {
          vapidDetails: {
            subject: vapid.subject,
            publicKey: vapid.publicKey,
            privateKey: vapid.privateKey,
          },
          TTL: 86400,
          urgency: 'high',
          timeout: 6000,
        },
      ),
    ),
  );

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      sent++;
      return;
    }
    const err = result.reason;
    const statusCode = err instanceof WebPushError ? err.statusCode : (err as { statusCode?: number })?.statusCode;
    if (statusCode === 404 || statusCode === 410) {
      staleEndpoints.push(subs[index].endpoint);
    } else {
      failed++;
      console.error('Web Push delivery error:', err instanceof Error ? err.message : String(err));
    }
  });

  for (const endpoint of staleEndpoints) {
    await run('DELETE FROM push_subscriptions WHERE endpoint=?', endpoint);
  }

  return { sent, failed, removed: staleEndpoints.length };
}

export async function sendPushToStudents(
  studentIds: number[],
  message: PushMessage,
  options?: { saveNotification?: boolean; sendWebPush?: boolean },
) {
  const uniqueIds = [...new Set(studentIds.filter(id => Number.isInteger(id) && id > 0))];
  if (!uniqueIds.length) return { notifiedStudents: 0, sent: 0, failed: 0, removed: 0 };

  const now = new Date().toISOString();
  const url = message.url || '/student';
  const type = message.type || 'general';

  if (options?.saveNotification !== false) {
    await transaction(async client => {
      for (const sid of uniqueIds) {
        await client.run(
          'INSERT INTO notifications(student_id, type, title, body, url, is_read, created_at) VALUES(?,?,?,?,?,?,?)',
          sid,
          type,
          message.title,
          message.body,
          url,
          false,
          now,
        );
      }
    });
  }

  if (options?.sendWebPush === false) {
    return { notifiedStudents: uniqueIds.length, sent: 0, failed: 0, removed: 0 };
  }

  const subs = (await all(
    'SELECT id, student_id, endpoint, p256dh, auth FROM push_subscriptions WHERE student_id = ANY(?::int[])',
    uniqueIds,
  )) as SubRow[];
  const delivery = await deliverToSubscriptions(subs, message);
  return { notifiedStudents: uniqueIds.length, ...delivery };
}

export async function sendTestPush(studentId: number, endpoint?: string) {
  const subs = (
    endpoint
      ? await all(
          'SELECT id, student_id, endpoint, p256dh, auth FROM push_subscriptions WHERE student_id=? AND endpoint=?',
          studentId,
          endpoint,
        )
      : await all(
          'SELECT id, student_id, endpoint, p256dh, auth FROM push_subscriptions WHERE student_id=?',
          studentId,
        )
  ) as SubRow[];

  if (!subs.length) {
    return { totalDevices: 0, sent: 0, failed: 0, removed: 0 };
  }

  const delivery = await deliverToSubscriptions(subs, {
    type: 'test',
    title: 'Thông báo thử · Xuân An English',
    body: 'Tuyệt vời! Thiết bị này đã sẵn sàng nhận thông báo bài tập và nhận xét từ cô An.',
    url: '/student?tab=notifications',
    tag: 'xuanan-test-push',
  });

  return { totalDevices: subs.length, ...delivery };
}

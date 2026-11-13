// Read-only: no authentication, mutations, credentials or student data.
import { MANAGEMENT_API_VERSION } from '../lib/manage-api.ts';
const targets = process.argv.slice(2);
if (!targets.length) {
  console.error('Usage: npm run check:backend -- https://backend.example https://frontend.example');
  process.exit(1);
}

let failed = false;
for (const target of targets) {
  const base = new URL(target);
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password) {
    throw Error('Use an HTTP(S) origin without credentials.');
  }
  console.log(base.origin);
  for (const path of ['/api/manage', '/api/learning/admin', '/api/parent', '/api/student/me']) {
    try {
      const response = await fetch(new URL(path, base.origin), {
        cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(15000),
      });
      const version = response.headers.get('X-XuanAn-API-Version');
      const json = response.headers.get('Content-Type')?.includes('application/json');
      const compatible = path !== '/api/manage' || (version !== null && /^\d+$/.test(version) && Number(version) >= Number(MANAGEMENT_API_VERSION));
      // These private endpoints must exist and require a session.
      const ok = response.status === 401 && json && compatible;
      failed ||= !ok;
      console.log(`  ${ok ? 'PASS' : 'FAIL'} ${path}: HTTP ${response.status}${path === '/api/manage' ? `, API ${version || 'missing'} (requires >=${MANAGEMENT_API_VERSION})` : ''}`);
      await response.body?.cancel();
    } catch (error) {
      failed = true;
      console.log(`  FAIL ${path}: ${error instanceof Error ? error.message : 'Connection failed'}`);
    }
  }
}
if (failed) {
  console.error('Backend check failed. Check backend deployment and /api routing; do not remove schedule version protection.');
  process.exitCode = 1;
}

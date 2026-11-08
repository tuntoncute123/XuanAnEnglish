import Dashboard from '@/components/dashboard';
import Login from '@/components/login';
import FrontendHome from '@/components/frontend-home';

export const dynamic = 'force-dynamic';

export default async function Home() {
  if (process.env.VERCEL === '1') return <FrontendHome />;
  const [{ isAdmin }, { snapshot }] = await Promise.all([
    import('@/lib/auth'),
    import('@/lib/db'),
  ]);
  return await isAdmin() ? <Dashboard initial={await snapshot() as never} /> : <Login />;
}

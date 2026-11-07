import {isAdmin} from '@/lib/auth';
import {snapshot} from '@/lib/db';
import Dashboard from '@/components/dashboard';
import Login from '@/components/login';
export const dynamic='force-dynamic';
export default async function Home(){return await isAdmin()?<Dashboard initial={snapshot() as never}/>:<Login/>;}

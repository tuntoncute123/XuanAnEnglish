import {cookies} from 'next/headers';
import {sameOrigin} from '@/lib/auth';
export async function POST(req:Request){if(!sameOrigin(req))return new Response(null,{status:403});(await cookies()).delete('an_session');return Response.json({ok:true});}

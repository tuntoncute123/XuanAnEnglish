import { cookies } from 'next/headers';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { sessionSecret } from './db';
export function sign(value:string) { return createHmac('sha256',sessionSecret).update(value).digest('hex'); }
export function validSession(token:string|undefined) { if(!token) return false; const [expiry,sig]=token.split('.'); if(!expiry||!sig||Number(expiry)<Date.now())return false;const expected=sign(expiry);return sig.length===expected.length && timingSafeEqual(Buffer.from(sig),Buffer.from(expected)); }
export async function isAdmin(){ return validSession((await cookies()).get('an_session')?.value); }
export function sameOrigin(request:Request) { const origin=request.headers.get('origin'); if(!origin)return false;try { const parsed=new URL(origin);return ['http:','https:'].includes(parsed.protocol)&&parsed.origin===`${parsed.protocol}//${request.headers.get('host')}`; } catch { return false; } }

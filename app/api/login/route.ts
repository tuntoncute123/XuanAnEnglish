import { cookies } from 'next/headers';
import { timingSafeEqual } from 'node:crypto';
import { sign,sameOrigin } from '@/lib/auth';
export const runtime='nodejs';
const attempts=new Map<string,{count:number,until:number}>();
export async function POST(req:Request){
 if(!sameOrigin(req))return Response.json({error:'Yêu cầu không hợp lệ.'},{status:403});
 const password=process.env.ADMIN_PASSWORD;
 if(!password||password.length<10)return Response.json({error:'Hãy cấu hình ADMIN_PASSWORD (ít nhất 10 ký tự) rồi khởi động lại.'},{status:503});
 const key='login',current=attempts.get(key);
 if(current&&current.until>Date.now()&&current.count>=10)return Response.json({error:'Thử lại sau 5 phút.'},{status:429});
 let body;try{body=await req.json()}catch{return Response.json({error:'Dữ liệu không hợp lệ.'},{status:400})}
 const input=String(body.password||'');
 if(input.length!==password.length||!timingSafeEqual(Buffer.from(sign(input)),Buffer.from(sign(password)))){ const a=current&&current.until>Date.now()?current:{count:0,until:Date.now()+300000};a.count++;attempts.set(key,a);return Response.json({error:'Mật khẩu chưa đúng.'},{status:401}); }
 attempts.delete(key);const expiry=String(Date.now()+86400000);
 (await cookies()).set('an_session',`${expiry}.${sign(expiry)}`,{httpOnly:true,sameSite:'strict',secure:new URL(req.url).protocol==='https:',path:'/',maxAge:86400});
 return Response.json({ok:true});
}

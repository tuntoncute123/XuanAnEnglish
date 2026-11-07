import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {db,dataDir} from '@/lib/db';
import {isAdmin} from '@/lib/auth';
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;const f=db.prepare('SELECT * FROM files WHERE id=?').get(id);if(!f)return new Response('Không tìm thấy tệp',{status:404});
 if(!await isAdmin()){
 const token=new URL(req.url).searchParams.get('token')||'';const s=db.prepare('SELECT * FROM students WHERE token=?').get(token);
 if(!s)return new Response('Không có quyền',{status:403});
 const allowed=f.owner_token===token||db.prepare('SELECT id FROM assignments WHERE file_id=? AND class_id=?').get(id,s.class_id!);
 if(!allowed)return new Response('Không có quyền',{status:403});
 }
 try{return new Response(await readFile(join(dataDir,'uploads',id)),{headers:{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(String(f.name))}`,'X-Content-Type-Options':'nosniff','Cache-Control':'private, no-store'}})}catch{return new Response('Không tìm thấy tệp',{status:404})}
}

import {randomBytes} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {isAdmin,sameOrigin} from '@/lib/auth';
import {db,run,dataDir} from '@/lib/db';
export async function POST(req:Request){
 if(!sameOrigin(req))return Response.json({error:'Yêu cầu không hợp lệ.'},{status:403});
 const token=req.headers.get('x-student-token');const admin=await isAdmin();
 if(!admin&&(!token||!db.prepare('SELECT id FROM students WHERE token=?').get(token)))return Response.json({error:'Không có quyền truy cập.'},{status:401});
 if(Number(req.headers.get('content-length')||0)>11*1024*1024)return Response.json({error:'Tệp tối đa 10 MB.'},{status:413});
 try{const form=await req.formData();const file=form.get('file');if(!(file instanceof File)||file.size>10*1024*1024||file.size===0)return Response.json({error:'Chọn tệp từ 1 byte đến 10 MB.'},{status:400});
 const allowed=['application/pdf','image/jpeg','image/png','image/webp','audio/mpeg','audio/wav','text/plain','application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
 if(!allowed.includes(file.type))return Response.json({error:'Hỗ trợ PDF, DOCX, ảnh JPG/PNG/WebP, MP3/WAV và TXT.'},{status:400});
 const id=randomBytes(24).toString('hex');await mkdir(join(dataDir,'uploads'),{recursive:true});await writeFile(join(dataDir,'uploads',id),Buffer.from(await file.arrayBuffer()));run('INSERT INTO files(id,name,type,size,owner_token) VALUES(?,?,?,?,?)',id,file.name.slice(0,200),file.type,file.size,admin?null:token);return Response.json({id,name:file.name});
 }catch{return Response.json({error:'Không tải được tệp.'},{status:400});}
}

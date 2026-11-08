import { randomBytes } from 'node:crypto';
import { isAdmin,sameOrigin } from '@/lib/auth';
import {get,all,run,snapshot,transaction} from '@/lib/db';
import {actionSchema} from '@/lib/schemas';
export const runtime='nodejs';
export async function GET(){if(!await isAdmin())return Response.json({error:'Vui lòng đăng nhập.'},{status:401});return Response.json(await snapshot());}
export async function POST(req:Request){
 if(!sameOrigin(req)||!await isAdmin())return Response.json({error:'Vui lòng đăng nhập lại.'},{status:401});
 try{
 const parsed=actionSchema.safeParse(await req.json());if(!parsed.success)return Response.json({error:'Dữ liệu chưa hợp lệ. Vui lòng kiểm tra lại.'},{status:400});const a=parsed.data;
 switch(a.action){
 case 'class':await run('INSERT INTO classes(name,level,fee) VALUES(?,?,?)',a.name,a.level,a.fee);break;
 case 'student':await run('INSERT INTO students(name,parent,phone,class_id,token) VALUES(?,?,?,?,?)',a.name,a.parent,a.phone,a.class_id,randomBytes(24).toString('hex'));break;
 case 'session':await run('INSERT INTO sessions(class_id,date,time,duration,topic) VALUES(?,?,?,?,?)',a.class_id,a.date,a.time,a.duration,a.topic);break;
 case 'attendance':{
 const session=await get('SELECT class_id FROM sessions WHERE id=?',a.session_id);if(!session)throw Error('Không tìm thấy buổi học.');
 const expected=await all('SELECT id FROM students WHERE class_id=?',session.class_id!);if(a.records.length!==expected.length||new Set(a.records.map(r=>r.student_id)).size!==expected.length||a.records.some(r=>!expected.some(s=>s.id===r.student_id)))throw Error('Danh sách học viên không khớp lớp.');
 await transaction(async ({run})=>{for(const r of a.records)await run('INSERT INTO attendance(session_id,student_id,status,focus,homework,note) VALUES(?,?,?,?,?,?) ON CONFLICT(session_id,student_id) DO UPDATE SET status=excluded.status,focus=excluded.focus,homework=excluded.homework,note=excluded.note',a.session_id,r.student_id,r.status,r.focus,r.homework,r.note);});break;}
 case 'assignment':if(a.file_id&&!await get('SELECT id FROM files WHERE id=? AND owner_token IS NULL',a.file_id))throw Error('Tài liệu không hợp lệ.');await run('INSERT INTO assignments(class_id,title,instructions,deadline,file_id) VALUES(?,?,?,?,?)',a.class_id,a.title,a.instructions,a.deadline,a.file_id);break;
 case 'payment':await run('INSERT INTO payments(student_id,month,amount) VALUES(?,?,?) ON CONFLICT(student_id,month) DO UPDATE SET amount=excluded.amount',a.student_id,a.month,a.amount);break;
 case 'feedback':await run('UPDATE submissions SET feedback=? WHERE id=?',a.feedback,a.id);break;
 case 'templates':await run("INSERT INTO settings(key,value) VALUES('templates',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",JSON.stringify(a.templates));break;
 }return Response.json(await snapshot());
 }catch{return Response.json({error:'Không lưu được dữ liệu. Kiểm tra thông tin và thử lại.'},{status:400});}
}

import {z} from 'zod';
import {get,all,run} from '@/lib/db';
import {sameOrigin} from '@/lib/auth';
export async function GET(req:Request,{params}:{params:Promise<{token:string}>}){
 const {token}=await params;const student=await get('SELECT id,name,class_id FROM students WHERE token=?',token);if(!student)return Response.json({error:'Liên kết không hợp lệ.'},{status:404});
 return Response.json({student,assignments:await all('SELECT * FROM assignments WHERE class_id=? ORDER BY deadline DESC',Number(student.class_id)),submissions:await all('SELECT * FROM submissions WHERE student_id=?',Number(student.id))});
}
export async function POST(req:Request,{params}:{params:Promise<{token:string}>}){
 if(!sameOrigin(req))return Response.json({error:'Yêu cầu không hợp lệ.'},{status:403});
 const {token}=await params;const s=await get('SELECT * FROM students WHERE token=?',token);if(!s)return Response.json({error:'Liên kết không hợp lệ.'},{status:404});
 try{const a=z.object({assignment_id:z.number().int().positive(),answer:z.string().trim().max(10000),file_id:z.string().nullable()}).parse(await req.json());
 if(!a.answer&&!a.file_id)throw Error();
 if(!await get('SELECT id FROM assignments WHERE id=? AND class_id=?',a.assignment_id,s.class_id!))throw Error();
 if(a.file_id&&!await get('SELECT id FROM files WHERE id=? AND owner_token=?',a.file_id,token))throw Error();
 await run('INSERT INTO submissions(assignment_id,student_id,answer,file_id,submitted_at) VALUES(?,?,?,?,?) ON CONFLICT(assignment_id,student_id) DO UPDATE SET answer=excluded.answer,file_id=excluded.file_id,submitted_at=excluded.submitted_at,feedback=\'\'',a.assignment_id,Number(s.id),a.answer,a.file_id,new Date().toISOString());return Response.json({ok:true});
 }catch{return Response.json({error:'Không nộp được bài. Kiểm tra nội dung và tệp đính kèm.'},{status:400});}
}

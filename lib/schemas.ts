import { z } from 'zod';
const id=z.number().int().positive();
const text=z.string().trim().min(1).max(200);
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>!Number.isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v,'Ngày không hợp lệ');
export const actionSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('class'),name:text,level:text,fee:z.number().int().min(0).max(10000000)}),
 z.object({action:z.literal('student'),name:text,parent:z.string().max(200),phone:z.string().max(30),class_id:id}),
 z.object({action:z.literal('session'),class_id:id,date,time:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),duration:z.number().int().min(15).max(480),topic:z.string().max(300)}),
 z.object({action:z.literal('attendance'),session_id:id,records:z.array(z.object({student_id:id,status:z.enum(['present','absent','excused','late']),focus:z.number().int().min(1).max(5),homework:z.number().int().min(1).max(5),note:z.string().max(3000)})).max(200)}),
 z.object({action:z.literal('assignment'),class_id:id,title:text,instructions:z.string().trim().min(1).max(10000),deadline:date,file_id:z.string().nullable()}),
 z.object({action:z.literal('payment'),student_id:id,month:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),amount:z.number().int().min(0).max(100000000)}),
 z.object({action:z.literal('feedback'),id,feedback:z.string().max(5000)}),
 z.object({action:z.literal('templates'),templates:z.array(z.string().trim().min(1).max(1000)).min(1).max(30)})
]);

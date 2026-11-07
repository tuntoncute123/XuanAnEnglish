import type {Data,Student} from './types';
export function monthlyReport(data:Data,student:Student,month:string){
 const sessions=data.sessions.filter(s=>s.class_id===student.class_id&&s.date.startsWith(month));
 const records=data.attendance.filter(a=>a.student_id===student.id&&sessions.some(s=>s.id===a.session_id));
 const attended=records.filter(a=>a.status==='present'||a.status==='late');
 const fee=data.classes.find(c=>c.id===student.class_id)?.fee||0;
 const due=attended.length*fee;const paid=data.payments.find(p=>p.student_id===student.id&&p.month===month)?.amount||0;
 const avg=(key:'focus'|'homework')=>attended.length?(attended.reduce((sum,a)=>sum+a[key],0)/attended.length).toFixed(1):'—';
 return {sessions:sessions.length,recorded:records.length,attended:attended.length,absent:records.filter(r=>r.status==='absent'||r.status==='excused').length,due,paid,balance:due-paid,focus:avg('focus'),homework:avg('homework'),notes:records.map(r=>r.note).filter(Boolean)};
}

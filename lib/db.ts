import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
export const dataDir = process.env.DATA_DIR || join(process.cwd(), 'data');
mkdirSync(dataDir, { recursive: true });
export const db = new DatabaseSync(join(dataDir, 'school.sqlite'));
db.exec('PRAGMA busy_timeout=10000');
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS classes(id INTEGER PRIMARY KEY, name TEXT NOT NULL, level TEXT NOT NULL, fee INTEGER NOT NULL CHECK(fee>=0), color TEXT NOT NULL DEFAULT 'green');
CREATE TABLE IF NOT EXISTS students(id INTEGER PRIMARY KEY,name TEXT NOT NULL,parent TEXT NOT NULL DEFAULT '',phone TEXT NOT NULL DEFAULT '',class_id INTEGER NOT NULL REFERENCES classes(id),token TEXT UNIQUE NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(id INTEGER PRIMARY KEY,class_id INTEGER NOT NULL REFERENCES classes(id),date TEXT NOT NULL,time TEXT NOT NULL,duration INTEGER NOT NULL DEFAULT 90,topic TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS attendance(session_id INTEGER REFERENCES sessions(id),student_id INTEGER REFERENCES students(id),status TEXT NOT NULL,focus INTEGER NOT NULL DEFAULT 3,homework INTEGER NOT NULL DEFAULT 3,note TEXT NOT NULL DEFAULT '',PRIMARY KEY(session_id,student_id));
CREATE TABLE IF NOT EXISTS assignments(id INTEGER PRIMARY KEY,class_id INTEGER NOT NULL REFERENCES classes(id),title TEXT NOT NULL,instructions TEXT NOT NULL,deadline TEXT NOT NULL,file_id TEXT);
CREATE TABLE IF NOT EXISTS submissions(id INTEGER PRIMARY KEY,assignment_id INTEGER NOT NULL REFERENCES assignments(id),student_id INTEGER NOT NULL REFERENCES students(id),answer TEXT NOT NULL,file_id TEXT,submitted_at TEXT NOT NULL,feedback TEXT NOT NULL DEFAULT '',UNIQUE(assignment_id,student_id));
CREATE TABLE IF NOT EXISTS payments(id INTEGER PRIMARY KEY,student_id INTEGER NOT NULL REFERENCES students(id),month TEXT NOT NULL,amount INTEGER NOT NULL CHECK(amount>=0),UNIQUE(student_id,month));
CREATE TABLE IF NOT EXISTS files(id TEXT PRIMARY KEY,name TEXT NOT NULL,type TEXT NOT NULL,size INTEGER NOT NULL,owner_token TEXT);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);`);
const secretPath = join(dataDir, '.session-secret');
try { writeFileSync(secretPath, randomBytes(48).toString('hex'), { mode: 0o600, flag: 'wx' }); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
export const sessionSecret = readFileSync(secretPath, 'utf8');
export function all(sql: string, ...params: (string|number)[]) {
 // node:sqlite rows have a null prototype; React Server Components require plain objects.
 return db.prepare(sql).all(...params).map(row => ({ ...row }));
}
export function run(sql: string, ...params: (string|number|null)[]) { return db.prepare(sql).run(...params); }
export function snapshot() { return { classes: all('SELECT * FROM classes'), students: all('SELECT * FROM students'), sessions: all('SELECT * FROM sessions ORDER BY date,time'), attendance: all('SELECT * FROM attendance'), assignments: all('SELECT * FROM assignments ORDER BY deadline DESC'), submissions: all('SELECT * FROM submissions'), payments: all('SELECT * FROM payments'), templates: JSON.parse(String(db.prepare("SELECT value FROM settings WHERE key='templates'").get()?.value || '["Con tập trung tốt và tích cực phát biểu.","Con cần ôn lại từ vựng và hoàn thành bài tập trước buổi học.","Con có nhiều tiến bộ, hãy tiếp tục phát huy nhé!"]')) }; }
db.exec('BEGIN IMMEDIATE');
try {
if (!db.prepare('SELECT id FROM classes LIMIT 1').get()) {
 run('INSERT INTO classes(name,level,fee,color) VALUES(?,?,?,?)','Starters A1','Cambridge Starters',150000,'green');
 run('INSERT INTO classes(name,level,fee,color) VALUES(?,?,?,?)','Movers B1','Cambridge Movers',180000,'purple');
 run('INSERT INTO classes(name,level,fee,color) VALUES(?,?,?,?)','Flyers A2','Cambridge Flyers',200000,'orange');
 ['Nguyễn Minh Anh','Trần Gia Hân','Lê Bảo Ngọc','Phạm Đức Anh','Hoàng Nhật Minh','Võ Khánh Linh','Đặng Tuấn Kiệt','Bùi Phương Anh','Ngô Hải Đăng'].forEach((n,i)=>run('INSERT INTO students(name,parent,phone,class_id,token) VALUES(?,?,?,?,?)',n,'Phụ huynh '+n.split(' ').slice(-2).join(' '),'',Math.floor(i/3)+1,randomBytes(24).toString('hex')));
 const today = new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Bangkok'});
 for(let d=0;d<7;d++) { const date = new Date(today+'T12:00:00+07:00'); date.setUTCDate(date.getUTCDate()+d); const day=date.toISOString().slice(0,10); run('INSERT INTO sessions(class_id,date,time,duration,topic) VALUES(?,?,?,?,?)',d%3+1,day,d%2?'18:00':'17:00',90,['My family & friends','Let’s talk about animals','A day at school'][d%3]); }
 run('INSERT INTO assignments(class_id,title,instructions,deadline) VALUES(?,?,?,?)',1,'Unit 4 · My family','Viết 5 câu giới thiệu các thành viên trong gia đình bằng tiếng Anh.',today);
}
 db.exec('COMMIT');
} catch(e) { db.exec('ROLLBACK'); throw e; }


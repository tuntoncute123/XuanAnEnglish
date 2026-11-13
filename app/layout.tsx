import './docx-import.css';
import type {Metadata} from 'next';
import './globals.css';
import './schedule.css';
import './student-learning.css';
import './growth.css';
export const metadata:Metadata={title:'Xuân An English · Lớp học của An',description:'Quản lý lớp học, điểm danh và đồng hành cùng học viên.'};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="vi"><body>{children}</body></html>}

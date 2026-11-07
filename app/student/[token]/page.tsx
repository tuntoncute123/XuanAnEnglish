import StudentPortal from '@/components/student-portal';
export const metadata={title:'Góc học tập · Xuân An English',robots:{index:false,follow:false},referrer:'no-referrer' as const};
export default async function Page({params}:{params:Promise<{token:string}>}){return <StudentPortal token={(await params).token}/>}

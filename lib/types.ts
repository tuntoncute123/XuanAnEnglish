export type Class={id:number;name:string;level:string;fee:number;color:string};
export type Student={id:number;name:string;parent:string;phone:string;class_id:number;token:string};
export type Session={id:number;class_id:number;date:string;time:string;duration:number;topic:string};
export type Attendance={session_id:number;student_id:number;status:string;focus:number;homework:number;note:string};
export type Assignment={id:number;class_id:number;title:string;instructions:string;deadline:string;file_id:string|null};
export type Submission={id:number;assignment_id:number;student_id:number;answer:string;file_id:string|null;submitted_at:string;feedback:string};
export type Data={classes:Class[];students:Student[];sessions:Session[];attendance:Attendance[];assignments:Assignment[];submissions:Submission[];payments:{student_id:number;month:string;amount:number}[];templates:string[]};

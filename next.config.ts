import type { NextConfig } from 'next';
const config:NextConfig={
 async rewrites(){return process.env.VERCEL === '1' ? {beforeFiles:[{source:'/api/:path*',destination:'https://api-xuanan.163.61.72.199.nip.io/api/:path*'}],afterFiles:[],fallback:[]} : []},
 async headers(){return [{source:'/:path*',headers:[{key:'X-Content-Type-Options',value:'nosniff'},{key:'Referrer-Policy',value:'no-referrer'},{key:'X-Frame-Options',value:'DENY'}]},{source:'/api/:path*',headers:[{key:'Cache-Control',value:'private, no-store'}]}]}
};
export default config;

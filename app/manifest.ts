import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/student',
    name: 'Xuân An English · Góc học tập',
    short_name: 'Xuân An Học tập',
    description: 'Làm bài tập tiếng Anh, xem nhận xét của cô An và nhận thông báo trên mọi thiết bị.',
    start_url: '/student',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#f8f9f6',
    theme_color: '#397759',
    lang: 'vi',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}

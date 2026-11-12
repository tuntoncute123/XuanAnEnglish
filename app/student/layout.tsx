import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'Góc học tập · Xuân An English',
  description: 'Cổng học sinh làm bài tập tiếng Anh, xem nhận xét và nhận thông báo trên mọi thiết bị.',
  manifest: '/manifest.webmanifest',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Xuân An Học tập',
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  other: {
    'apple-mobile-web-app-capable': 'yes',
  },
};

export const viewport: Viewport = {
  themeColor: '#397759',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  return children;
}

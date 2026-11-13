import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'Góc phụ huynh · Xuân An English',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};
export default function ParentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}

import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Pocket Drummer',
  description: 'Mobile-first drum sequencer that shares grooves through URLs',
  metadataBase: new URL('https://example.com')
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="min-h-screen bg-surface text-slate-100">
        {children}
      </body>
    </html>
  );
}

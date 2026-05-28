// app/layout.tsx
import type { Metadata, Viewport } from 'next';
import './globals.css';
import BottomNav from './components/BottomNav';
import AuthButton from './components/AuthButton';

export const metadata: Metadata = {
  title: 'Scorekeeper Pro',
  description: 'Scores Kept. Scores Settled.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover'
};

<AuthButton />

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-slate-50 dark:bg-slate-950 transition-colors antialiased">
        {children}
        <BottomNav />
      </body>
    </html>
  );
}
// app/layout.tsx
import './globals.css';
import BottomNav from './components/BottomNav';

export const metadata = {
  title: 'Game Scorekeeper',
  description: 'Pro-level tabletop game tracker.',
};

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
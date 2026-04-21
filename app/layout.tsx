// app/layout.tsx
import './globals.css'
import Link from 'next/link'

export const metadata = {
  title: 'Scorekeeper Pro',
  description: 'Multi-game score tracking platform',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="bg-slate-50 text-slate-900 pb-20">
        
        {/* The current active page will render here */}
        {children}

        {/* GLOBAL BOTTOM NAVIGATION */}
        <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex justify-around items-center pb-safe pt-2 px-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-50">
          <Link href="/" className="flex flex-col items-center p-2 text-slate-500 active:text-blue-600 focus:text-blue-600">
            <span className="text-2xl mb-1">🏠</span>
            <span className="text-[10px] font-bold uppercase tracking-wider">Home</span>
          </Link>
          <Link href="/history" className="flex flex-col items-center p-2 text-slate-500 active:text-blue-600 focus:text-blue-600">
            <span className="text-2xl mb-1">📊</span>
            <span className="text-[10px] font-bold uppercase tracking-wider">History</span>
          </Link>
          <Link href="/roster" className="flex flex-col items-center p-2 text-slate-500 active:text-blue-600 focus:text-blue-600">
            <span className="text-2xl mb-1">👥</span>
            <span className="text-[10px] font-bold uppercase tracking-wider">Roster</span>
          </Link>
        </nav>
        
      </body>
    </html>
  )
}
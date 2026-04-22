// app/layout.tsx
import './globals.css'
import Link from 'next/link'

export const metadata = {
  title: 'Scorekeeper Pro',
  description: 'Professional scoring for every match.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="bg-slate-50 text-slate-900 antialiased">
        
        {/* Main Content Container */}
        <div className="max-w-md mx-auto min-h-screen bg-white shadow-xl relative pb-24">
          {children}

          {/* GLOBAL BOTTOM NAVIGATION */}
          <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white/80 backdrop-blur-lg border-t border-slate-100 flex justify-around items-center pb-8 pt-3 px-4 z-50">
            <Link href="/" className="flex flex-col items-center gap-1 transition-all active:scale-90 text-slate-400 hover:text-blue-600">
              <span className="text-2xl">🏠</span>
              <span className="text-[10px] font-black uppercase tracking-widest">Home</span>
            </Link>
            
            {/* Added Game Link */}
            <Link href="/custom" className="flex flex-col items-center gap-1 transition-all active:scale-90 text-slate-400 hover:text-blue-600">
              <span className="text-2xl">🧮</span>
              <span className="text-[10px] font-black uppercase tracking-widest">Game</span>
            </Link>

            <Link href="/history" className="flex flex-col items-center gap-1 transition-all active:scale-90 text-slate-400 hover:text-blue-600">
              <span className="text-2xl">📊</span>
              <span className="text-[10px] font-black uppercase tracking-widest">History</span>
            </Link>

            {/* Renamed to Players */}
            <Link href="/roster" className="flex flex-col items-center gap-1 transition-all active:scale-90 text-slate-400 hover:text-blue-600">
              <span className="text-2xl">👥</span>
              <span className="text-[10px] font-black uppercase tracking-widest">Players</span>
            </Link>
          </nav>
        </div>
        
      </body>
    </html>
  )
}
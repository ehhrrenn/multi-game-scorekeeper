// app/components/BottomNav.tsx
'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useActiveSession } from '../../hooks/useActiveSession';

export default function BottomNav() {
  const router = useRouter();
  const pathname = usePathname();
  
  // Bring in our new global session hook
  const { activeSession } = useActiveSession();

  // Determine where the "Resume" button should go based on the global session
  const resumeUrl = activeSession?.gameType ? `/${activeSession.gameType}` : '#';
  const hasActiveSession = !!activeSession;

  return (
    <div className="newsprint-nav fixed bottom-0 left-0 right-0 z-50 w-full pointer-events-none flex justify-center">
      
      {/* 💊 THE PILL - Evenly Spaced */}
      <div className="flex items-center justify-between w-full max-w-screen-md bg-[#f8f8f5] px-6 py-2.5 pointer-events-auto border-t border-black/25 transition-all duration-300">
        
        <button 
          onClick={() => router.push('/')}
          className={`flex flex-col items-center justify-center transition-transform active:scale-95 ${pathname === '/' ? 'text-black' : 'text-black/55 hover:text-black'}`}
        >
          <span className="text-xl mb-0.5 leading-none">⌂</span>
          <span className={`text-[10px] uppercase tracking-wider ${pathname === '/' ? 'font-bold' : 'font-medium'}`}>Home</span>
        </button>

        <button 
          onClick={() => router.push('/roster')}
          className={`flex flex-col items-center justify-center transition-transform active:scale-95 ${pathname.includes('/roster') ? 'text-black' : 'text-black/55 hover:text-black'}`}
        >
          <span className="text-xl mb-0.5 leading-none">❖</span>
          <span className={`text-[10px] uppercase tracking-wider ${pathname.includes('/roster') ? 'font-bold' : 'font-medium'}`}>Players</span>
        </button>

        <button 
          onClick={() => router.push('/history')}
          className={`flex flex-col items-center justify-center transition-transform active:scale-95 ${pathname.includes('/history') ? 'text-black' : 'text-black/55 hover:text-black'}`}
        >
          <span className="text-xl mb-0.5 leading-none">✧</span>
          <span className={`text-[10px] uppercase tracking-wider ${pathname.includes('/history') ? 'font-bold' : 'font-medium'}`}>History</span>
        </button>

        {/* Resume Button */}
        {hasActiveSession && (
          <div className="pl-4 sm:pl-6 border-l border-black/25 flex items-center animate-in slide-in-from-right-4 fade-in duration-300">
            <button 
              onClick={() => router.push(resumeUrl)}
              className="flex items-center gap-2 text-sm font-bold text-white bg-black hover:bg-black/90 px-5 py-2.5 rounded-full transition-all active:scale-95"
            >
              Resume <span className="text-xl leading-none">▸</span>
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
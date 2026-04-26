// app/components/BottomNav.tsx
'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useGameState } from '../../hooks/useGameState';

export default function BottomNav() {
  const router = useRouter();
  const pathname = usePathname();

  // Check if a custom game is currently in progress
  const [rounds] = useGameState<any[]>('scorekeeper_rounds', []);
  const isGameStarted = rounds.length > 1 || Object.values(rounds[0]?.scores || {}).some(score => score !== undefined && score !== null);

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-screen-md px-4 pointer-events-none flex justify-center">
      
      {/* 💊 THE PILL - Evenly Spaced */}
      <div className="flex items-center justify-between w-full bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl rounded-full px-8 py-2.5 shadow-[0_8px_30px_rgb(0,0,0,0.12)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.5)] pointer-events-auto border border-slate-200 dark:border-slate-800 transition-all duration-300">
        
        <button 
          onClick={() => router.push('/')}
          className={`flex flex-col items-center justify-center transition-transform active:scale-95 ${pathname === '/' ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'}`}
        >
          <span className="text-xl mb-0.5">🏠</span>
          <span className={`text-[10px] uppercase tracking-wider ${pathname === '/' ? 'font-bold' : 'font-medium'}`}>Home</span>
        </button>

        <button 
          onClick={() => router.push('/roster')}
          className={`flex flex-col items-center justify-center transition-transform active:scale-95 ${pathname.includes('/roster') ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'}`}
        >
          <span className="text-xl mb-0.5">👥</span>
          <span className={`text-[10px] uppercase tracking-wider ${pathname.includes('/roster') ? 'font-bold' : 'font-medium'}`}>Roster</span>
        </button>

        <button 
          onClick={() => router.push('/history')}
          className={`flex flex-col items-center justify-center transition-transform active:scale-95 ${pathname.includes('/history') ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'}`}
        >
          <span className="text-xl mb-0.5">📊</span>
          <span className={`text-[10px] uppercase tracking-wider ${pathname.includes('/history') ? 'font-bold' : 'font-medium'}`}>History</span>
        </button>

        {/* Dynamic Resume Button (Evenly spaced on the right) */}
        {isGameStarted && (
          <div className="pl-4 sm:pl-6 border-l border-slate-200 dark:border-slate-700 flex items-center animate-in slide-in-from-right-4 fade-in duration-300">
            <button 
              onClick={() => router.push('/custom')}
              className="flex items-center gap-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 px-5 py-2.5 rounded-full transition-all active:scale-95 shadow-md shadow-blue-500/30"
            >
              Resume <span className="text-xs">▶</span>
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
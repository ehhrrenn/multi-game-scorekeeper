// app/components/BottomNav.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useGameState } from '../../hooks/useGameState';

type Player = { id: string; name: string; emoji: string };

export default function BottomNav() {
  const pathname = usePathname();
  const [players] = useGameState<Player[]>('scorekeeper_players', []);
  
  const isGameActive = players.length > 0;

  const baseNavItems = [
    { name: 'Home', path: '/', icon: '🏠', isResume: false },
    { name: 'History', path: '/history', icon: '📚', isResume: false },
    { name: 'Players', path: '/roster', icon: '👥', isResume: false },
  ];

  const navItems = [...baseNavItems];
  if (isGameActive) {
    navItems.splice(1, 0, { name: 'Resume', path: '/custom', icon: '▶️', isResume: true });
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 pb-safe">
      <div className="max-w-screen-md mx-auto flex justify-around items-center h-16 sm:h-20 px-2 sm:px-6">
        {navItems.map((item) => {
          const isActive = pathname === item.path || (item.path !== '/' && pathname?.startsWith(item.path));
          
          if (item.isResume) {
            return (
              <Link 
                key={item.name} 
                href={item.path}
                className="flex flex-col items-center justify-center space-y-0.5 active:scale-95 transition-transform bg-blue-600 text-white px-5 py-2 rounded-2xl shadow-md shadow-blue-200 dark:shadow-none"
              >
                <span className="text-xl drop-shadow-sm">{item.icon}</span>
                <span className="text-[10px] font-black tracking-wide">{item.name}</span>
              </Link>
            );
          }

          return (
            <Link 
              key={item.name} 
              href={item.path}
              className={`flex flex-col items-center justify-center w-full h-full space-y-1 active:scale-95 transition-transform ${
                isActive 
                  ? 'text-blue-600 dark:text-blue-400' 
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              <span className={`text-xl sm:text-2xl drop-shadow-sm transition-all duration-200 ${isActive ? 'scale-110' : ''}`}>
                {item.icon}
              </span>
              <span className="text-[10px] font-bold tracking-wide">
                {item.name}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
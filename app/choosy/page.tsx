'use client';

import React, { useState, useRef } from 'react';

// Mocking your global avatar/color list
const AVATARS = [
  { emoji: '🐸', color: '#22c55e', name: 'Frog' },      // Green
  { emoji: '🦊', color: '#f97316', name: 'Fox' },       // Orange
  { emoji: '🦋', color: '#3b82f6', name: 'Butterfly' }, // Blue
  { emoji: '🦄', color: '#d946ef', name: 'Unicorn' },   // Fuchsia
  { emoji: '🐙', color: '#ef4444', name: 'Octopus' },   // Red
  { emoji: '🐼', color: '#14b8a6', name: 'Panda' },     // Teal
  { emoji: '🐯', color: '#eab308', name: 'Tiger' },     // Yellow
  { emoji: '👻', color: '#8b5cf6', name: 'Ghost' },     // Violet
];

export default function ChoosyPage() {
  const [mode, setMode] = useState<'individual' | 'team'>('individual');
  const [teamCount, setTeamCount] = useState<number>(2);
  
  const [touches, setTouches] = useState<any[]>([]);
  const [winners, setWinners] = useState<any[]>([]);
  const [isDeciding, setIsDeciding] = useState(false);
  
  // Use refs to keep track of state for the animation frame and timers
  const touchesRef = useRef<any[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const requestRef = useRef<number | null>(null);

  const updateTouches = (newTouches: any[]) => {
    touchesRef.current = newTouches;
    setTouches(newTouches);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    // 1. THE NEW CLEAR LOGIC: If a winner is shown, tapping anywhere resets the game
    if (winners.length > 0) {
      resetChoosy();
      return; 
    }

    const currentTouches = Array.from(e.touches).map((t) => {
      const existing = touchesRef.current.find(prev => prev.id === t.identifier);
      
      let assignedAvatar = existing?.avatar;
      if (!assignedAvatar) {
        const usedEmojis = touchesRef.current.map(t => t.avatar.emoji);
        const availableAvatars = AVATARS.filter(a => !usedEmojis.includes(a.emoji));
        assignedAvatar = availableAvatars.length > 0 
          ? availableAvatars[Math.floor(Math.random() * availableAvatars.length)] 
          : AVATARS[Math.floor(Math.random() * AVATARS.length)];
      }

      return {
        id: t.identifier,
        x: t.clientX,
        y: t.clientY,
        avatar: assignedAvatar
      };
    });

    updateTouches(currentTouches);

    if (currentTouches.length >= 2) {
      setIsDeciding(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      
      timerRef.current = setTimeout(() => {
        makeSelection(touchesRef.current);
      }, 1500); 
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (winners.length > 0) return;

    const safeTouches = Array.from(e.touches).map(t => ({
      id: t.identifier,
      clientX: t.clientX,
      clientY: t.clientY
    }));

    if (requestRef.current) cancelAnimationFrame(requestRef.current);
    
    requestRef.current = requestAnimationFrame(() => {
      const currentTouches = safeTouches.map((t) => {
        const existing = touchesRef.current.find(prev => prev.id === t.id);
        return {
          id: t.id,
          x: t.clientX,
          y: t.clientY,
          avatar: existing ? existing.avatar : AVATARS[0] 
        };
      });

      updateTouches(currentTouches);
    });
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (winners.length > 0) return; 

    const remainingTouches = Array.from(e.touches).map((t) => {
      const existing = touchesRef.current.find(prev => prev.id === t.identifier);
      return {
        id: t.identifier,
        x: t.clientX,
        y: t.clientY,
        avatar: existing ? existing.avatar : AVATARS[0]
      };
    });

    updateTouches(remainingTouches);

    if (remainingTouches.length < 2) {
      setIsDeciding(false);
      if (timerRef.current) clearTimeout(timerRef.current);
    }
  };

  const resetChoosy = () => {
    setWinners([]);
    updateTouches([]);
    setIsDeciding(false);
    if (timerRef.current) clearTimeout(timerRef.current);
  };

  const makeSelection = (activeTouches: any[]) => {
    setIsDeciding(false);
    
    if (mode === 'individual') {
      const winnerIndex = Math.floor(Math.random() * activeTouches.length);
      setWinners([activeTouches[winnerIndex]]);
    } else {
      const shuffledTouches = [...activeTouches].sort(() => 0.5 - Math.random());
      
      const randomTeamAvatars = [...AVATARS]
        .sort(() => 0.5 - Math.random())
        .slice(0, teamCount);

      const teams: any[] = [];
      
      shuffledTouches.forEach((touch, index) => {
        const teamIndex = index % teamCount;
        teams.push({
          ...touch,
          teamAvatar: randomTeamAvatars[teamIndex]
        });
      });
      setWinners(teams);
    }
  };

  return (
    <div 
      className="relative w-full h-screen bg-slate-900 overflow-hidden touch-none select-none"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      {/* Settings Header */}
      <div className={`absolute top-0 w-full p-6 transition-opacity duration-300 z-10 ${touches.length > 0 ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
        <div 
          className="max-w-md mx-auto bg-slate-800/80 backdrop-blur-md p-4 rounded-2xl border border-slate-700 shadow-xl"
          onTouchStart={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <h1 className="text-2xl font-black text-white text-center mb-4 flex items-center justify-center gap-2">
            <span>👆</span> Choosy
          </h1>
          
          <div className="flex bg-slate-900 p-1 rounded-xl mb-4">
            <button 
              onClick={(e) => { e.stopPropagation(); setMode('individual'); }}
              className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors ${mode === 'individual' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Winner
            </button>
            <button 
              onClick={(e) => { e.stopPropagation(); setMode('team'); }}
              className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors ${mode === 'team' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Teams
            </button>
          </div>

          {mode === 'team' && (
            <div className="flex items-center justify-between px-2">
              <span className="text-slate-300 font-medium">Number of Teams:</span>
              <div className="flex gap-2">
                {[2, 3, 4].map(num => (
                  <button
                    key={num}
                    onClick={(e) => { e.stopPropagation(); setTeamCount(num); }}
                    className={`w-10 h-10 rounded-full font-bold transition-all ${teamCount === num ? 'bg-indigo-500 text-white ring-2 ring-indigo-300' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
                  >
                    {num}
                  </button>
                ))}
              </div>
            </div>
          )}
          <p className="text-center text-slate-500 text-sm mt-4 font-medium">Place fingers on screen to choose</p>
        </div>
      </div>

      {/* 2. THE NEW TAP TO CLEAR TEXT */}
      {winners.length > 0 && (
        <div className="absolute top-12 w-full text-center z-50 animate-in fade-in duration-700 pointer-events-none">
          <p className="text-slate-400/80 text-sm font-bold tracking-[0.2em] uppercase">Tap anywhere to clear</p>
        </div>
      )}

      {/* Render Finger Touch Points */}
      {touches.map(touch => {
        const isWinner = winners.length > 0 && winners.some(w => w.id === touch.id);
        const isLoser = winners.length > 0 && !isWinner;
        
        const teamData = winners.find(w => w.id === touch.id);
        const displayData = (mode === 'team' && teamData) ? teamData.teamAvatar : touch.avatar;

        return (
          <div
            key={touch.id}
            className={`absolute rounded-full transform -translate-x-1/2 -translate-y-1/2 transition duration-300 ease-out flex items-center justify-center text-4xl shadow-2xl
              ${isDeciding ? 'animate-pulse scale-125' : 'scale-100'}
              ${isLoser ? 'opacity-20 scale-50 grayscale' : ''}
              ${isWinner && mode === 'individual' ? 'scale-[2.0] ring-8 ring-white z-40' : ''}
              ${isWinner && mode === 'team' ? 'scale-150 ring-4 ring-white z-40' : ''}
            `}
            style={{
              left: touch.x,
              top: touch.y,
              width: '90px',
              height: '90px',
              backgroundColor: displayData.color,
            }}
          >
            {/* Inner circle with emoji */}
            <div className="w-full h-full rounded-full border-4 border-white/30 flex items-center justify-center drop-shadow-md">
               {displayData.emoji}
            </div>
          </div>
        );
      })}
    </div>
  );
}

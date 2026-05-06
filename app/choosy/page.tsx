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
  
  // Use a ref to keep track of the latest touches for the timer callback
  const touchesRef = useRef<any[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Sync state and ref
  const updateTouches = (newTouches: any[]) => {
    touchesRef.current = newTouches;
    setTouches(newTouches);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (winners.length > 0) return; // Ignore new touches if game is over

    const currentTouches = Array.from(e.touches).map((t) => {
      const existing = touchesRef.current.find(prev => prev.id === t.identifier);
      
      // Assign a random, unused avatar to new fingers
      let assignedAvatar = existing?.avatar;
      if (!assignedAvatar) {
        const usedEmojis = touchesRef.current.map(t => t.avatar.emoji);
        const availableAvatars = AVATARS.filter(a => !usedEmojis.includes(a.emoji));
        assignedAvatar = availableAvatars.length > 0 
          ? availableAvatars[Math.floor(Math.random() * availableAvatars.length)] 
          : AVATARS[Math.floor(Math.random() * AVATARS.length)]; // Fallback if > 8 fingers
      }

      return {
        id: t.identifier,
        x: t.clientX,
        y: t.clientY,
        avatar: assignedAvatar
      };
    });

    updateTouches(currentTouches);

    // If we have 2 or more fingers, start the 1.5s countdown
    if (currentTouches.length >= 2) {
      setIsDeciding(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      
      timerRef.current = setTimeout(() => {
        makeSelection(touchesRef.current);
      }, 1500); 
    }
  };

  // We need a ref to hold the animation frame ID so we can cancel it if needed
  const requestRef = useRef<number | null>(null);

  const handleTouchMove = (e: React.TouchEvent) => {
      if (winners.length > 0) return;
  
      // 1. SYNCHRONOUSLY capture the exact coordinates before React can wipe the event object
      const safeTouches = Array.from(e.touches).map(t => ({
        id: t.identifier,
        clientX: t.clientX,
        clientY: t.clientY
      }));
  
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      
      // 2. Use our safely saved coordinates inside the animation frame
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
    if (winners.length > 0) return; // Do not clear if a winner exists

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

    // If someone lifts a finger and we drop below 2, cancel the timer
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
      // Teams Logic
      const shuffledTouches = [...activeTouches].sort(() => 0.5 - Math.random());
      
      // Shuffle the avatars so teams get random emojis/colors every round
      const randomTeamAvatars = [...AVATARS]
        .sort(() => 0.5 - Math.random())
        .slice(0, teamCount);

      const teams: any[] = [];
      
      // Divide into requested number of teams, assigning the random Team Avatar
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
      {/* Settings Header - Hides when fingers are on the screen */}
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

      {/* Top Right Clear Button */}
      {winners.length > 0 && (
        <button
          onClick={(e) => { e.stopPropagation(); resetChoosy(); }}
          onTouchStart={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          className="absolute top-6 right-6 z-50 w-14 h-14 bg-red-500 text-white rounded-full shadow-2xl flex items-center justify-center text-2xl font-black hover:bg-red-400 active:scale-90 transition-all border border-red-400 animate-in fade-in zoom-in duration-300"
          aria-label="Clear Results"
        >
          ✕
        </button>
      )}

      {/* Render Finger Touch Points */}
      {touches.map(touch => {
        const isWinner = winners.length > 0 && winners.some(w => w.id === touch.id);
        const isLoser = winners.length > 0 && !isWinner;
        
        // If deciding teams, grab the new team avatar from the winners array
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

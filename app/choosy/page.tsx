'use client';

import React, { useState, useEffect, useRef } from 'react';

// A palette for assigning random colors to initial touches and specific colors for teams
const COLORS = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];

export default function ChoosyPage() {
  const [mode, setMode] = useState<'individual' | 'team'>('individual');
  const [teamCount, setTeamCount] = useState<number>(2);
  
  const [touches, setTouches] = useState<any[]>([]);
  const [winners, setWinners] = useState<any[]>([]);
  const [isDeciding, setIsDeciding] = useState(false);
  
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Handle Fingers touching the screen
  const handleTouch = (e: React.TouchEvent) => {
    // If a decision has already been made, wait until everyone lifts their fingers
    if (winners.length > 0) {
      if (e.touches.length === 0) resetChoosy();
      return;
    }

    const currentTouches = Array.from(e.touches).map((t, i) => {
      // Keep existing color if touch is already registered
      const existing = touches.find(prev => prev.id === t.identifier);
      return {
        id: t.identifier,
        x: t.clientX,
        y: t.clientY,
        color: existing ? existing.color : COLORS[i % COLORS.length]
      };
    });

    setTouches(currentTouches);

    // Trigger selection if 2 or more fingers are held down
    if (currentTouches.length >= 2) {
      setIsDeciding(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      
      timerRef.current = setTimeout(() => {
        makeSelection(currentTouches);
      }, 2500); // Hold for 2.5 seconds to trigger
    } else {
      // Cancel timer if someone lifts a finger prematurely
      setIsDeciding(false);
      if (timerRef.current) clearTimeout(timerRef.current);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (winners.length > 0 && e.touches.length === 0) {
      resetChoosy();
      return;
    }
    handleTouch(e);
  };

  const resetChoosy = () => {
    setWinners([]);
    setTouches([]);
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
      const shuffled = [...activeTouches].sort(() => 0.5 - Math.random());
      const teams: any[] = [];
      
      // Divide into requested number of teams
      shuffled.forEach((touch, index) => {
        const teamIndex = index % teamCount;
        teams.push({
          ...touch,
          color: COLORS[teamIndex] // Assign everyone on the same team the same color
        });
      });
      setWinners(teams);
    }
  };

  return (
    <div 
      className="relative w-full h-screen bg-slate-900 overflow-hidden touch-none select-none"
      onTouchStart={handleTouch}
      onTouchMove={handleTouch}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      {/* Settings Header - Hides when fingers are on the screen */}
      <div className={`absolute top-0 w-full p-6 transition-opacity duration-300 z-10 ${touches.length > 0 ? 'opacity-0' : 'opacity-100'}`}>
        <div className="max-w-md mx-auto bg-slate-800/80 backdrop-blur-md p-4 rounded-2xl border border-slate-700 shadow-xl">
          <h1 className="text-2xl font-bold text-white text-center mb-4">Choosy</h1>
          
          <div className="flex bg-slate-900 p-1 rounded-xl mb-4">
            <button 
              onClick={(e) => { e.stopPropagation(); setMode('individual'); }}
              className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors ${mode === 'individual' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}
            >
              Winner
            </button>
            <button 
              onClick={(e) => { e.stopPropagation(); setMode('team'); }}
              className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors ${mode === 'team' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}
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
                    className={`w-10 h-10 rounded-full font-bold transition-all ${teamCount === num ? 'bg-indigo-500 text-white ring-2 ring-indigo-300' : 'bg-slate-700 text-slate-300'}`}
                  >
                    {num}
                  </button>
                ))}
              </div>
            </div>
          )}
          <p className="text-center text-slate-500 text-sm mt-4">Place fingers on screen to choose</p>
        </div>
      </div>

      {/* Render Finger Touch Points */}
      {touches.map(touch => {
        const isWinner = winners.length > 0 && winners.some(w => w.id === touch.id);
        const isLoser = winners.length > 0 && !isWinner;
        
        // If deciding teams, grab the new team color from the winners array
        const teamData = winners.find(w => w.id === touch.id);
        const displayColor = teamData ? teamData.color : touch.color;

        return (
          <div
            key={touch.id}
            className={`absolute rounded-full transform -translate-x-1/2 -translate-y-1/2 transition-all duration-300 ease-out
              ${isDeciding ? 'animate-pulse scale-125' : ''}
              ${isLoser ? 'opacity-20 scale-50' : 'scale-100 shadow-2xl'}
              ${isWinner && mode === 'individual' ? 'scale-[2.5] ring-8 ring-white/50' : ''}
              ${isWinner && mode === 'team' ? 'scale-150 ring-4 ring-white/30' : ''}
            `}
            style={{
              left: touch.x,
              top: touch.y,
              width: '80px',
              height: '80px',
              backgroundColor: displayColor,
            }}
          >
            {/* Inner glow effect */}
            <div className="w-full h-full rounded-full border-4 border-white/20"></div>
          </div>
        );
      })}
    </div>
  );
}
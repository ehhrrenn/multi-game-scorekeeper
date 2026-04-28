// app/yahtzee/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import BottomNav from '../components/BottomNav';

type PlayerSnapshot = { id: string; name: string; emoji: string; photoURL?: string; isCloudUser?: boolean; useCustomEmoji?: boolean };

export default function YahtzeePage() {
  const router = useRouter();
  
  // --- State ---
  const [phase, setPhase] = useState<'SETUP' | 'PLAYING'>('SETUP');
  const [allPlayers, setAllPlayers] = useState<PlayerSnapshot[]>([]);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const [isTripleYahtzee, setIsTripleYahtzee] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // --- Fetch Global Roster ---
  useEffect(() => {
    const fetchRoster = async () => {
      try {
        const usersSnap = await getDocs(collection(db, 'users'));
        const roster: PlayerSnapshot[] = [];
        usersSnap.forEach(doc => {
          const d = doc.data();
          roster.push({
            id: doc.id,
            name: d.name || 'Unknown',
            emoji: d.emoji || '👤',
            photoURL: d.photoURL,
            isCloudUser: !!d.email,
            useCustomEmoji: d.useCustomEmoji || false
          });
        });
        // Sort: Cloud users first, then alphabetically
        roster.sort((a, b) => {
          if (a.isCloudUser === b.isCloudUser) return a.name.localeCompare(b.name);
          return a.isCloudUser ? -1 : 1;
        });
        setAllPlayers(roster);
      } catch (err) {
        console.error("Error fetching roster:", err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchRoster();
  }, []);

  // --- Actions ---
  const togglePlayerSelection = (id: string) => {
    setSelectedPlayerIds(prev => 
      prev.includes(id) ? prev.filter(pId => pId !== id) : [...prev, id]
    );
  };

  const startGame = () => {
    if (selectedPlayerIds.length === 0) return;
    
    // Set global active game flag so the BottomNav knows we are playing!
    const newGameId = `yahtzee_${Date.now()}`;
    window.localStorage.setItem('scorekeeper_active_game_id', newGameId);
    
    // In the next step, we will generate the empty Yahtzee score map here.
    
    setPhase('PLAYING');
  };


  // ==========================================
  // RENDER: PLAYING PHASE (The Grid Shell)
  // ==========================================
  if (phase === 'PLAYING') {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-32 font-sans text-slate-800 dark:text-slate-200">
        
        {/* Sticky Header with Gear Icon */}
        <div className="sticky top-0 z-20 bg-slate-50/80 dark:bg-slate-950/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="max-w-screen-md mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setPhase('SETUP')} 
                className="w-10 h-10 flex items-center justify-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-full text-xl hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-95 transition-all shadow-sm"
              >
                ⚙️
              </button>
              <div>
                <h1 className="text-lg font-black leading-tight">Yahtzee</h1>
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                  {isTripleYahtzee ? 'Triple Variant' : 'Standard Variant'}
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              {/* Future Edit Grid and Save buttons will go here */}
            </div>
          </div>
        </div>

        <main className="max-w-screen-md mx-auto p-4 flex flex-col items-center justify-center mt-20">
           <div className="text-6xl mb-4 animate-bounce">🎲</div>
           <h2 className="text-2xl font-black text-slate-300 dark:text-slate-700 text-center">Score Grid Coming Next!</h2>
        </main>
        
        <BottomNav />
      </div>
    );
  }

  // ==========================================
  // RENDER: SETUP PHASE
  // ==========================================
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-24 font-sans text-slate-800 dark:text-slate-200 animate-in fade-in duration-300">
      <div className="max-w-screen-md mx-auto p-4 space-y-6">
        
        {/* Setup Header */}
        <div className="flex items-center justify-between mb-2">
          <button onClick={() => router.push('/')} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition">
            <span className="text-xl">←</span> Back
          </button>
          <div className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest bg-slate-200/50 dark:bg-slate-800 px-3 py-1 rounded-full">
            Game Setup
          </div>
        </div>

        <h1 className="text-4xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
          <span>🎲</span> Yahtzee
        </h1>

        {/* Variant Toggle */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
          <h2 className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">Game Rules</h2>
          <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
            <button
              onClick={() => setIsTripleYahtzee(false)}
              className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all ${!isTripleYahtzee ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}
            >
              Standard (1 Column)
            </button>
            <button
              onClick={() => setIsTripleYahtzee(true)}
              className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all ${isTripleYahtzee ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}
            >
              Triple (3 Columns)
            </button>
          </div>
        </div>

        {/* Player Roster */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-6 shadow-sm">
          <h2 className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4">Select Players</h2>
          
          {isLoading ? (
            <div className="text-center p-8 text-slate-400 font-medium animate-pulse">Loading Roster...</div>
          ) : allPlayers.length === 0 ? (
            <div className="text-center p-8 text-slate-500 font-medium bg-slate-50 dark:bg-slate-800 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
              No players found. Create a player in the Roster first!
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {allPlayers.map((player) => {
                const isSelected = selectedPlayerIds.includes(player.id);
                return (
                  <button
                    key={player.id}
                    onClick={() => togglePlayerSelection(player.id)}
                    className={`relative flex flex-col items-center justify-center p-3 rounded-2xl border-2 transition-all active:scale-95 ${
                      isSelected 
                        ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-500 shadow-sm' 
                        : 'bg-slate-50 dark:bg-slate-800/50 border-transparent hover:border-slate-200 dark:hover:border-slate-700 opacity-70 hover:opacity-100'
                    }`}
                  >
                    {isSelected && (
                      <div className="absolute -top-2 -right-2 w-6 h-6 bg-blue-500 text-white text-xs flex items-center justify-center rounded-full shadow-md border-2 border-white dark:border-slate-900 animate-in zoom-in">
                        ✓
                      </div>
                    )}
                    <div className="w-12 h-12 mb-2 rounded-full flex items-center justify-center text-3xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-800">
                      {player.isCloudUser && player.photoURL && !player.useCustomEmoji ? (
                        <img src={player.photoURL} alt={player.name} className="w-full h-full object-cover" />
                      ) : (
                        <span>{player.emoji || '👤'}</span>
                      )}
                    </div>
                    <span className={`text-xs font-bold text-center w-full truncate ${isSelected ? 'text-blue-700 dark:text-blue-400' : 'text-slate-600 dark:text-slate-400'}`}>
                      {player.name.split(' ')[0]}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Start Game Action */}
        <button
          onClick={startGame}
          disabled={selectedPlayerIds.length === 0}
          className={`w-full py-4 rounded-2xl font-black text-lg transition-all active:scale-[0.98] shadow-lg flex items-center justify-center gap-2
            ${selectedPlayerIds.length > 0 
              ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/30 cursor-pointer' 
              : 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed shadow-none'
            }`}
        >
          {selectedPlayerIds.length > 0 ? (
            <>Start Game <span className="text-2xl leading-none">▶️</span></>
          ) : (
            'Select Players to Start'
          )}
        </button>

      </div>
      <BottomNav />
    </div>
  );
}
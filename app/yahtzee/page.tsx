// app/yahtzee/page.tsx
'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { collection, getDocs, doc, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useGameState } from '../../hooks/useGameState'; 
import BottomNav from '../components/BottomNav';

// --- Types ---
type Player = { id: string; name: string; emoji: string; photoURL?: string; isCloudUser?: boolean; useCustomEmoji?: boolean };
type PlayerSnapshot = { id: string; name: string; emoji: string };

// --- Constants ---
const EMOJIS = ['🦊', '⚡️', '🦖', '🤠', '👾', '🍕', '🚀', '🐙', '🦄', '🥑', '🔥', '💎', '👻', '👑', '😎', '🤖', '👽', '🐶', '🐱', '🐼'];
const EMOJI_COLORS: Record<string, string> = {
  '🦊': '#f97316', '⚡️': '#eab308', '🦖': '#22c55e', '🤠': '#8b5cf6', 
  '👾': '#a855f7', '🍕': '#ef4444', '🚀': '#3b82f6', '🐙': '#ec4899', 
  '🦄': '#d946ef', '🥑': '#84cc16', '🔥': '#dc2626', '💎': '#06b6d4', 
  '👻': '#94a3b8', '👑': '#fbbf24', '😎': '#38bdf8', '🤖': '#64748b',
  '👽': '#10b981', '🐶': '#d97706', '🐱': '#f59e0b', '🐼': '#1e293b'
};

const getRandomEmoji = () => EMOJIS[Math.floor(Math.random() * EMOJIS.length)];

type GameRecord = {
  gameId: string;
  date: string;
  gameName: string;
  finalScores: Record<string, number>;
  activePlayerIds: string[];
  playerSnapshots: PlayerSnapshot[];
};
export default function YahtzeePage() {
  const router = useRouter();

  // --- Core Game State (Using Local Storage Hook) ---
  const [phase, setPhase] = useState<'SETUP' | 'PLAYING'>('SETUP');
  const [players, setPlayers] = useGameState<Player[]>('yahtzee_players', []);
  const [rounds, setRounds] = useGameState<any[]>('yahtzee_rounds', []); 
  const [isTripleYahtzee, setIsTripleYahtzee] = useGameState<boolean>('yahtzee_is_triple', false);
  const [gameHistory, setGameHistory] = useGameState<GameRecord[]>('scorekeeper_history', []);

  // --- Roster & UI State ---
  //const [allAvailablePlayers, setAllAvailablePlayers] = useState<Player[]>([]); // Make sure setAllAvailablePlayers is here!
  const [isLoading, setIsLoading] = useState(true);
  const [isCreatingPlayer, setIsCreatingPlayer] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState('');
  const [activeEmojiPicker, setActiveEmojiPicker] = useState<string | null>(null);
  const [globalRoster, setGlobalRoster] = useState<Player[]>([]);
  const [cloudPlayers, setCloudPlayers] = useState<Player[]>([]);

  useEffect(() => {
    async function fetchCloudRoster() {
      try {
        const querySnapshot = await getDocs(collection(db, 'Users'));
        const users = querySnapshot.docs.map(doc => {
          const data = doc.data();
          return { 
             id: doc.id, // Guarantee a strict ID
             name: data.name || 'Unknown User', // Fallback to prevent crash
             emoji: data.emoji || '👤',
             ...data, 
             isCloudUser: true 
          } as Player;
        });
        setCloudPlayers(users);
      } catch (error) {
        console.error("Error fetching cloud users:", error);
      }
    }
    fetchCloudRoster();
  }, []);

const allAvailablePlayers = useMemo(() => {
    // 1. We combine the local saved roster and cloud roster. 
    // MAKE SURE your local storage variable here is actually named 'globalRoster' 
    // (or whatever variable your 'scorekeeper_global_roster' useGameState uses!)
    const combined = [...(globalRoster || []), ...cloudPlayers].filter(p => p && p.id);
    
    // 2. Safely deduplicate by ID so you don't get doubles
    return Array.from(new Map(combined.map(p => [p.id, p])).values())
      .sort((a, b) => {
        const nameA = a.name || '';
        const nameB = b.name || '';
        return nameA.localeCompare(nameB);
      });
  }, [globalRoster, cloudPlayers]); // <-- Dependencies must be globalRoster and cloudPlayers
  
  // --- Setup Actions ---
  const startGame = () => {
    if (players.length === 0) return;
    
    // Set global active game flag so the BottomNav knows we are playing!
    const newGameId = `yahtzee_${Date.now()}`;
    window.localStorage.setItem('scorekeeper_active_game_id', newGameId);
    
    // Placeholder to bypass the resume logic for now
    if (rounds.length === 0) {
      setRounds([{ roundId: 1, scores: {} }]);
    }
    
    setPhase('PLAYING');
  };

    const clearSetup = () => {
    setPlayers([]);
  };

  const addPlayer = () => {
    const trimmedName = newPlayerName.trim();
    if (!trimmedName) { setIsCreatingPlayer(false); return; }

    const existingGlobal = globalRoster.find(p => p.name.toLowerCase() === trimmedName.toLowerCase());
    if (existingGlobal) {
      if (!players.find(p => p.id === existingGlobal.id)) setPlayers([...players, existingGlobal]);
    } else {
      const newPlayer = { id: Date.now().toString(), name: trimmedName, emoji: getRandomEmoji() };
      setGlobalRoster([...globalRoster, newPlayer]);
      setPlayers([...players, newPlayer]);
    }
    setNewPlayerName('');
    setIsCreatingPlayer(false);
  };

  const selectFromGlobal = (player: Player) => {
    if (!players.find(p => p.id === player.id)) setPlayers([...players, player]);
  };

  const removePlayer = (playerId: string) => setPlayers(players.filter(p => p && p.id !== playerId));

  const movePlayer = (index: number, direction: 'UP' | 'DOWN') => {
    const newPlayers = [...players];
    if (direction === 'UP' && index > 0) {
      [newPlayers[index - 1], newPlayers[index]] = [newPlayers[index], newPlayers[index - 1]];
    } else if (direction === 'DOWN' && index < newPlayers.length - 1) {
      [newPlayers[index + 1], newPlayers[index]] = [newPlayers[index], newPlayers[index + 1]];
    }
    setPlayers(newPlayers);
  };

  const updateEmoji = (playerId: string, newEmoji: string) => {
    const updatedPlayers = players.map(p => p.id === playerId ? { ...p, emoji: newEmoji } : p);
    setPlayers(updatedPlayers);
    setGlobalRoster(globalRoster.map(p => p.id === playerId ? { ...p, emoji: newEmoji } : p));
    setGameHistory(gameHistory.map(game => ({
      ...game,
      playerSnapshots: game.playerSnapshots.map(p => p.id === playerId ? { ...p, emoji: newEmoji } : p)
    })));
  };

  // ==========================================
  // RENDER: PLAYING PHASE (The Grid Shell)
  // ==========================================
  if (phase === 'PLAYING') {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-32 font-sans text-slate-800 dark:text-slate-200">
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
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-24 font-sans text-slate-800 dark:text-slate-200 animate-in fade-in slide-in-from-bottom-2">
      <div className="fixed top-0 left-0 right-0 h-16 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md shadow-sm border-b border-slate-200 dark:border-slate-800 z-40 flex items-center justify-between px-4 max-w-screen-md mx-auto">
        <h1 className="text-2xl font-black text-slate-800 dark:text-white flex items-center gap-2">🎲 Yahtzee Setup</h1>
        <button 
          onClick={startGame} 
          disabled={players.length === 0}
          className={`disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 text-white px-5 h-10 rounded-full font-bold shadow-sm active:scale-95 transition-all flex items-center justify-center text-sm ${rounds?.length > 1 ? 'bg-blue-600' : 'bg-slate-900 dark:bg-slate-100 dark:text-slate-900'}`}
        >
          {rounds?.length > 1 ? '▶️ Resume Game' : '🚀 Start Game'}
        </button>
      </div>
      
      <div className="p-6 pt-[88px] max-w-screen-md mx-auto">

        {/* Game Rules Component */}
        <h2 className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 ml-1">Game Rules</h2>
        <div className="bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-2xl p-5 mb-8 shadow-sm">
          <div>
            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-3">Game Variant</label>
            <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
              <button 
                onClick={() => setIsTripleYahtzee(false)} 
                className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${!isTripleYahtzee ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}
              >
                Standard (1 Column)
              </button>
              <button 
                onClick={() => setIsTripleYahtzee(true)} 
                className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${isTripleYahtzee ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}
              >
                Triple (3 Columns)
              </button>
            </div>
          </div>
        </div>
        
        {/* Saved Roster Horizontal Scroll */}
        <div className="flex justify-between items-end mb-2 ml-1 mt-6">
          <h2 className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Saved Roster</h2>
        </div>
        
        <div className="flex gap-2 overflow-x-auto pb-4 mb-2 scrollbar-hide">
          {allAvailablePlayers
            .filter(gp => gp && gp.id && !players.some(p => p && p.id === gp.id))
            .map(gp => (
            <button 
              key={gp.id} 
              // Kept the safe direct-state update to prevent ghosts!
              onClick={() => setPlayers([...players.filter(p => p && p.id), gp])} 
              className="whitespace-nowrap px-4 py-2.5 rounded-full text-sm font-bold bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-700 shadow-sm transition-all flex items-center gap-2 active:scale-95"
            >
              <span className="w-5 h-5 flex items-center justify-center flex-shrink-0">{gp.isCloudUser && gp.photoURL && !gp.useCustomEmoji ? (
                  <img src={gp.photoURL} alt={gp.name} className="w-full h-full object-cover rounded-full" />
                ) : (
                  <span>{gp.emoji || '👤'}</span>
                )}
                </span> {gp.name || 'Unknown'}
              {/* Small cloud indicator for Firebase users */}
              {gp.isCloudUser && <span className="text-blue-500 ml-1 text-xs">☁️</span>}
            </button>
          ))}
          
          <button 
            onClick={() => setIsCreatingPlayer(true)} 
            className="whitespace-nowrap px-4 py-2.5 rounded-full text-sm font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-100 dark:border-emerald-800 transition-all"
          >
            + New Player
          </button>
        </div>

        {/* Create New Player Form */}
        {isCreatingPlayer && (
          <div className="flex gap-2 mb-6 animate-in slide-in-from-top-2">
            <input type="text" value={newPlayerName} onChange={e => setNewPlayerName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addPlayer()} placeholder="Player Name..." className="border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 rounded-xl flex-grow focus:outline-none focus:border-emerald-500 font-bold dark:text-white" autoFocus />
            <button onClick={addPlayer} className="bg-emerald-600 text-white px-5 rounded-xl font-bold">Add</button>
            <button onClick={() => setIsCreatingPlayer(false)} className="bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-4 rounded-xl font-bold">✕</button>
          </div>
        )}

        {/* Current Active Players List */}
        <h2 className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 ml-1 mt-6">Current Active Players</h2>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden mb-8">
          {players.length === 0 ? <div className="p-6 text-center text-slate-400 font-medium">No players added to the game yet. Select from the roster above.</div> : players.filter(p => p && p.id).map((p, i) => (
            <div key={p.id} className={`flex items-stretch justify-between ${i !== players.length - 1 ? 'border-b border-slate-100 dark:border-slate-800' : ''}`}>
              <div className="flex items-center gap-3 p-4">
                <button onClick={() => setActiveEmojiPicker(p.id)} className="w-12 h-12 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50 rounded-full text-2xl flex items-center justify-center active:scale-95 transition shadow-sm dark:shadow-none">
                  {p.isCloudUser && p.photoURL && !p.useCustomEmoji ? (
                    <img src={p.photoURL} alt={p.name} className="w-full h-full object-cover rounded-full" />
                  ) : (
                    <span>{p.emoji || '👤'}</span>
                  )}
                </button>
                <span className="font-bold text-lg text-slate-700 dark:text-slate-200">{p.name}{p.isCloudUser && <span className="ml-2 text-sm">☁️</span>}</span>
              </div>
              <div className="flex items-stretch">
                <button onClick={() => setPlayers(players.filter(activeP => activeP && activeP.id !== p.id))} className="px-4 text-slate-300 dark:text-slate-600 hover:text-red-500 transition-colors border-l border-slate-100 dark:border-slate-800">✕</button>
                <div className="flex flex-col border-l border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30 w-12">
                  <button disabled={i === 0} onClick={() => movePlayer(i, 'UP')} className="flex-1 flex items-center justify-center text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-20 transition-colors pb-1">▲</button>
                  <button disabled={i === players.length - 1} onClick={() => movePlayer(i, 'DOWN')} className="flex-1 flex items-center justify-center text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-20 transition-colors pt-1">▼</button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {(players.length > 0) && (
          <div className="flex justify-center mt-12 pb-12">
            <button onClick={clearSetup} className="text-red-500 font-bold px-6 py-3 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 active:scale-95 transition-all text-xs uppercase tracking-widest">
              Clear Active Setup
            </button>
          </div>
        )}
      </div>

      {/* Emoji Picker Modal */}
      {activeEmojiPicker && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
          <div className="bg-white dark:bg-slate-900 border dark:border-slate-800 rounded-[2rem] p-6 shadow-2xl w-full max-w-sm animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-black text-slate-800 dark:text-white">Choose Emoji</h3>
              <button onClick={() => setActiveEmojiPicker(null)} className="w-8 h-8 flex items-center justify-center bg-slate-100 dark:bg-slate-800 rounded-full text-slate-500 hover:text-slate-700 dark:hover:text-white active:scale-95 transition-all">✕</button>
            </div>
            <div className="grid grid-cols-5 gap-3">
              {EMOJIS.map(emoji => (
                <button 
                  key={emoji} 
                  onClick={() => { updateEmoji(activeEmojiPicker, emoji); setActiveEmojiPicker(null); }}
                  className="text-3xl aspect-square flex items-center justify-center bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-2xl active:scale-90 transition-all shadow-sm dark:shadow-none"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
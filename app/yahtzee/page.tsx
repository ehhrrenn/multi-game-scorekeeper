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
type PlayerSnapshot = { id: string; name: string; emoji: string; photoURL?: string; isCloudUser?: boolean; useCustomEmoji?: boolean };

// For Yahtzee, scores are mapped: playerId -> categoryId -> array of scores (length 1 for standard, 3 for triple)
type YahtzeeScoreMap = Record<string, Record<string, (number | null)[]>>;
type ActiveCell = { playerId: string; category: string; colIndex: number } | null;

// --- Constants ---
const EMOJIS = ['🦊', '⚡️', '🦖', '🤠', '👾', '🍕', '🚀', '🐙', '🦄', '🥑', '🔥', '💎', '👻', '👑', '😎', '🤖', '👽', '🐶', '🐱', '🐼'];

const UPPER_CATEGORIES = [
  { id: 'ones', name: 'Ones' }, { id: 'twos', name: 'Twos' },
  { id: 'threes', name: 'Threes' }, { id: 'fours', name: 'Fours' },
  { id: 'fives', name: 'Fives' }, { id: 'sixes', name: 'Sixes' }
];

const LOWER_CATEGORIES = [
  { id: '3kind', name: '3 of a Kind' }, { id: '4kind', name: '4 of a Kind' },
  { id: 'fullHouse', name: 'Full House (25)' }, { id: 'smStraight', name: 'Sm. Straight (30)' },
  { id: 'lgStraight', name: 'Lg. Straight (40)' }, { id: 'yahtzee', name: 'YAHTZEE (50)' },
  { id: 'chance', name: 'Chance' }, { id: 'bonus', name: 'Yahtzee Bonus' }
];

export default function YahtzeePage() {
  const router = useRouter();

  // --- Core Game State ---
  const [phase, setPhase] = useState<'SETUP' | 'PLAYING'>('SETUP');
  const [players, setPlayers] = useGameState<Player[]>('yahtzee_players', []);
  const [isTripleYahtzee, setIsTripleYahtzee] = useGameState<boolean>('yahtzee_is_triple', false);
  const [scores, setScores] = useGameState<YahtzeeScoreMap>('yahtzee_scores_v2', {});

  // --- Roster & UI State ---
  const [allAvailablePlayers, setAllAvailablePlayers] = useState<PlayerSnapshot[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreatingPlayer, setIsCreatingPlayer] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState('');
  const [activeEmojiPicker, setActiveEmojiPicker] = useState<string | null>(null);
  
  // --- Grid Interaction State ---
  const [activeCell, setActiveCell] = useState<ActiveCell>(null);
  const [inputValue, setInputValue] = useState('');
  const columnsPerPlayer = isTripleYahtzee ? 3 : 1;

  // --- Fetch Global Roster ---
  useEffect(() => {
    const fetchRoster = async () => {
      try {
        // 1. Fetch Cloud Roster
        const usersSnap = await getDocs(collection(db, 'users'));
        const mergedRoster: PlayerSnapshot[] = [];
        
        usersSnap.forEach(doc => {
          const d = doc.data();
          mergedRoster.push({
            id: doc.id,
            name: d.name || 'Unknown',
            emoji: d.emoji || '👤',
            photoURL: d.photoURL,
            // Check: If they are NOT explicitly saved as a guest (false), treat them as a Cloud User
            isCloudUser: d.isCloudUser !== false, 
            useCustomEmoji: d.useCustomEmoji || false
          });
        });

        // 2. Fetch Local MVP Roster (Merge legacy players not yet synced to the cloud)
        try {
          const localRaw = window.localStorage.getItem('scorekeeper_global_roster');
          if (localRaw) {
            const localPlayers: PlayerSnapshot[] = JSON.parse(localRaw);
            localPlayers.forEach(lp => {
              if (!mergedRoster.some(cp => cp.id === lp.id)) {
                mergedRoster.push({ ...lp, isCloudUser: false });
              }
            });
          }
        } catch (e) {
          console.error("Local roster parse error:", e);
        }

        // 3. Sort: Cloud users first, then alphabetically
        mergedRoster.sort((a, b) => {
          if (a.isCloudUser === b.isCloudUser) return a.name.localeCompare(b.name);
          return a.isCloudUser ? -1 : 1;
        });

        setAllAvailablePlayers(mergedRoster);
      } catch (err) {
        console.error("Error fetching roster:", err);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchRoster();
  }, []);

  // --- Setup Actions ---
  const startGame = () => {
    if (players.length === 0) return;
    
    // Initialize score map if starting fresh
    if (Object.keys(scores).length === 0) {
      const initialScores: YahtzeeScoreMap = {};
      players.forEach(p => {
        initialScores[p.id] = {};
        [...UPPER_CATEGORIES, ...LOWER_CATEGORIES].forEach(cat => {
          initialScores[p.id][cat.id] = Array(columnsPerPlayer).fill(null);
        });
      });
      setScores(initialScores);
    }
    
    window.localStorage.setItem('scorekeeper_active_game_id', `yahtzee_${Date.now()}`);
    setPhase('PLAYING');
  };

  const addPlayer = async () => {
    if (!newPlayerName.trim()) return;
    const newId = `guest_${Date.now()}`;
    const newPlayer: Player = { id: newId, name: newPlayerName.trim(), emoji: EMOJIS[Math.floor(Math.random() * EMOJIS.length)], isCloudUser: false };
    setPlayers([...players.filter(p => p && p.id), newPlayer]);
    setAllAvailablePlayers(prev => [...prev, newPlayer]);
    setNewPlayerName('');
    setIsCreatingPlayer(false);
    try { await setDoc(doc(db, 'users', newId), { name: newPlayer.name, emoji: newPlayer.emoji, isCloudUser: false, createdAt: new Date().toISOString() }); } catch (err) {}
  };

  const movePlayer = (index: number, direction: 'UP' | 'DOWN') => {
    const newPlayers = [...players];
    if (direction === 'UP' && index > 0) [newPlayers[index - 1], newPlayers[index]] = [newPlayers[index], newPlayers[index - 1]];
    else if (direction === 'DOWN' && index < newPlayers.length - 1) [newPlayers[index + 1], newPlayers[index]] = [newPlayers[index], newPlayers[index + 1]];
    setPlayers(newPlayers);
  };

  const updateEmoji = async (playerId: string, newEmoji: string) => {
    setPlayers(players.map(p => p.id === playerId ? { ...p, emoji: newEmoji } : p));
    setAllAvailablePlayers(prev => prev.map(p => p.id === playerId ? { ...p, emoji: newEmoji } : p));
    const playerToUpdate = players.find(p => p.id === playerId) || allAvailablePlayers.find(p => p.id === playerId);
    if (playerToUpdate && !playerToUpdate.isCloudUser) {
      try { await setDoc(doc(db, 'users', playerId), { emoji: newEmoji }, { merge: true }); } catch (err) {}
    }
  };

  const clearSetup = () => {
    if (confirm('Are you sure you want to clear the setup? This will remove all selected players.')) {
      setPlayers([]);
      setScores({});
      window.localStorage.removeItem('scorekeeper_active_game_id');
    }
  };

  // --- Playing Actions & Calculations ---
  const handleCellClick = (playerId: string, category: string, colIndex: number) => {
    setActiveCell({ playerId, category, colIndex });
    const currentVal = scores[playerId]?.[category]?.[colIndex];
    setInputValue(currentVal !== null && currentVal !== undefined ? currentVal.toString() : '');
  };

  const saveScore = () => {
    if (!activeCell) return;
    const { playerId, category, colIndex } = activeCell;
    const numericValue = inputValue === '' ? null : parseInt(inputValue, 10);
    
    setScores(prev => {
      const playerScores = prev[playerId] || {};
      const catScores = playerScores[category] ? [...playerScores[category]] : Array(columnsPerPlayer).fill(null);
      catScores[colIndex] = numericValue;
      return { ...prev, [playerId]: { ...playerScores, [category]: catScores } };
    });
    
    setActiveCell(null);
    setInputValue('');
  };

  const calcUpperTotal = (playerId: string, colIndex: number) => UPPER_CATEGORIES.reduce((sum, cat) => sum + (scores[playerId]?.[cat.id]?.[colIndex] || 0), 0);
  const calcUpperBonus = (upperTotal: number) => upperTotal >= 63 ? 35 : 0;
  const calcLowerTotal = (playerId: string, colIndex: number) => LOWER_CATEGORIES.reduce((sum, cat) => sum + (scores[playerId]?.[cat.id]?.[colIndex] || 0), 0);

  // Helper to generate the correct keypad options based on the active category
  const getScoringOptions = (categoryId: string) => {
    switch (categoryId) {
      // Upper Section (Multiples of the dice value - max 5 dice)
      case 'ones': return [0, 1, 2, 3, 4, 5];
      case 'twos': return [0, 2, 4, 6, 8, 10];
      case 'threes': return [0, 3, 6, 9, 12, 15];
      case 'fours': return [0, 4, 8, 12, 16, 20];
      case 'fives': return [0, 5, 10, 15, 20, 25];
      case 'sixes': return [0, 6, 12, 18, 24, 30];
      // Fixed Lower Section
      case 'fullHouse': return [0, 25];
      case 'smStraight': return [0, 30];
      case 'lgStraight': return [0, 40];
      case 'yahtzee': return [0, 50];
      // Variable Lower Section (Fallback to standard numpad)
      case '3kind':
      case '4kind':
      case 'chance':
      case 'bonus':
      default: 
        return 'NUMPAD'; 
    }
  };
  
  // ==========================================
  // RENDER: PLAYING PHASE (Premium Grid)
  // ==========================================
  if (phase === 'PLAYING') {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-[300px] font-sans text-slate-800 dark:text-slate-200">
        
        {/* Sticky Global Header */}
        <div className="sticky top-0 z-30 bg-slate-50/80 dark:bg-slate-950/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 shadow-sm pt-2">
          <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={() => setPhase('SETUP')} className="w-10 h-10 flex items-center justify-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-full text-xl hover:bg-slate-100 active:scale-95 transition-all shadow-sm">
                ⚙️
              </button>
              <div>
                <h1 className="text-lg font-black leading-tight">Yahtzee</h1>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{isTripleYahtzee ? 'Triple Variant' : 'Standard'}</p>
              </div>
            </div>
          </div>

          {/* Sticky Player Column Headers */}
          <div className="flex max-w-screen-xl mx-auto overflow-hidden pl-28 pr-4 pb-2 mt-2 gap-2">
            {players.map((p) => (
              <div key={p.id} className="flex-1 min-w-[80px] text-center flex flex-col items-center">
                 <div className="w-10 h-10 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full flex items-center justify-center text-lg mb-1 shadow-sm overflow-hidden">
                   {p.isCloudUser && p.photoURL && !p.useCustomEmoji ? <img src={p.photoURL} alt={p.name} referrerPolicy="no-referrer" className="w-full h-full object-cover" /> : <span>{p.emoji}</span>}
                 </div>
                 <div className="text-[10px] font-bold uppercase truncate w-full px-1">{p.name}</div>
                 {isTripleYahtzee && (
                   <div className="flex w-full mt-1 text-[9px] font-black text-slate-400">
                     <span className="flex-1 border-r border-slate-200 dark:border-slate-700">X1</span>
                     <span className="flex-1 border-r border-slate-200 dark:border-slate-700">X2</span>
                     <span className="flex-1">X3</span>
                   </div>
                 )}
              </div>
            ))}
          </div>
        </div>

        {/* The Grid Body */}
        <main className="max-w-screen-xl mx-auto px-4 pt-4 overflow-x-auto">
          <div className="min-w-max pb-8">
            
            {/* UPPER SECTION */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden mb-6">
              <div className="bg-slate-100 dark:bg-slate-800/50 px-4 py-2 text-xs font-black uppercase tracking-widest text-slate-500 border-b border-slate-200 dark:border-slate-800">Upper Section</div>
              {UPPER_CATEGORIES.map(cat => (
                <div key={cat.id} className="flex border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                  <div className="w-24 flex-shrink-0 p-3 font-bold text-sm text-slate-700 dark:text-slate-300 border-r border-slate-100 dark:border-slate-800">{cat.name}</div>
                  {players.map(p => (
                    <div key={`${p.id}-${cat.id}`} className="flex flex-1 min-w-[80px] border-r border-slate-100 dark:border-slate-800/50 last:border-r-0">
                      {Array.from({ length: columnsPerPlayer }).map((_, colIdx) => {
                        const isTriple = isTripleYahtzee;
                        const val = scores[p.id]?.[cat.id]?.[colIdx];
                        return (
                          <button 
                            key={colIdx} onClick={() => handleCellClick(p.id, cat.id, colIdx)}
                            className={`flex-1 flex items-center justify-center font-black text-lg ${isTriple ? 'border-r last:border-r-0 border-slate-100 dark:border-slate-800/50 text-base' : ''} ${val !== null && val !== undefined ? 'text-blue-600 dark:text-blue-400' : 'text-slate-300 dark:text-slate-700'}`}
                          >
                            {val !== null && val !== undefined ? val : '-'}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              ))}
              {/* Upper Totals */}
              <div className="flex bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
                <div className="w-24 flex-shrink-0 p-3 font-black text-xs uppercase tracking-wider text-slate-500 border-r border-slate-200 dark:border-slate-800">Subtotal</div>
                {players.map(p => (
                  <div key={`${p.id}-sub`} className="flex flex-1 min-w-[80px] border-r border-slate-200 dark:border-slate-800 last:border-r-0">
                    {Array.from({ length: columnsPerPlayer }).map((_, colIdx) => (
                      <div key={colIdx} className={`flex-1 flex items-center justify-center font-bold text-sm text-slate-500 ${isTripleYahtzee ? 'border-r last:border-r-0 border-slate-200 dark:border-slate-800' : ''}`}>{calcUpperTotal(p.id, colIdx)}</div>
                    ))}
                  </div>
                ))}
              </div>
              <div className="flex bg-emerald-50 dark:bg-emerald-900/10">
                <div className="w-24 flex-shrink-0 p-3 font-black text-[10px] uppercase tracking-wider text-emerald-600 dark:text-emerald-500 border-r border-emerald-100 dark:border-emerald-800">Bonus (63+)</div>
                {players.map(p => (
                  <div key={`${p.id}-bonus`} className="flex flex-1 min-w-[80px] border-r border-emerald-100 dark:border-emerald-800 last:border-r-0">
                    {Array.from({ length: columnsPerPlayer }).map((_, colIdx) => {
                      const bonus = calcUpperBonus(calcUpperTotal(p.id, colIdx));
                      return <div key={colIdx} className={`flex-1 flex items-center justify-center font-black text-sm ${bonus > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-300 dark:text-slate-600'} ${isTripleYahtzee ? 'border-r last:border-r-0 border-emerald-100 dark:border-emerald-800' : ''}`}>{bonus > 0 ? '+35' : '-'}</div>
                    })}
                  </div>
                ))}
              </div>
            </div>

            {/* LOWER SECTION */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden mb-6">
              <div className="bg-slate-100 dark:bg-slate-800/50 px-4 py-2 text-xs font-black uppercase tracking-widest text-slate-500 border-b border-slate-200 dark:border-slate-800">Lower Section</div>
              {LOWER_CATEGORIES.map(cat => (
                <div key={cat.id} className="flex border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                  <div className="w-24 flex-shrink-0 p-3 font-bold text-xs text-slate-700 dark:text-slate-300 border-r border-slate-100 dark:border-slate-800 flex items-center leading-tight">{cat.name}</div>
                  {players.map(p => (
                    <div key={`${p.id}-${cat.id}`} className="flex flex-1 min-w-[80px] border-r border-slate-100 dark:border-slate-800/50 last:border-r-0">
                      {Array.from({ length: columnsPerPlayer }).map((_, colIdx) => {
                        const isTriple = isTripleYahtzee;
                        const val = scores[p.id]?.[cat.id]?.[colIdx];
                        return (
                          <button 
                            key={colIdx} onClick={() => handleCellClick(p.id, cat.id, colIdx)}
                            className={`flex-1 flex items-center justify-center font-black text-lg ${isTriple ? 'border-r last:border-r-0 border-slate-100 dark:border-slate-800/50 text-base' : ''} ${val !== null && val !== undefined ? 'text-blue-600 dark:text-blue-400' : 'text-slate-300 dark:text-slate-700'}`}
                          >
                            {val !== null && val !== undefined ? val : '-'}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              ))}
            </div>

            {/* GRAND TOTALS */}
            <div className="bg-slate-800 dark:bg-slate-200 rounded-2xl shadow-sm overflow-hidden flex border border-slate-900 dark:border-white">
              <div className="w-24 flex-shrink-0 p-4 font-black text-xs uppercase tracking-widest text-slate-100 dark:text-slate-900 border-r border-slate-700 dark:border-slate-300 flex items-center">Grand Total</div>
              {players.map(p => (
                <div key={`${p.id}-grand`} className="flex flex-1 min-w-[80px] border-r border-slate-700 dark:border-slate-300 last:border-r-0">
                  {Array.from({ length: columnsPerPlayer }).map((_, colIdx) => {
                    const upTotal = calcUpperTotal(p.id, colIdx);
                    const bonus = calcUpperBonus(upTotal);
                    const lowTotal = calcLowerTotal(p.id, colIdx);
                    const grand = upTotal + bonus + lowTotal;
                    const multiplier = isTripleYahtzee ? (colIdx + 1) : 1;
                    return (
                      <div key={colIdx} className={`flex-1 flex flex-col items-center justify-center p-2 ${isTripleYahtzee ? 'border-r last:border-r-0 border-slate-700 dark:border-slate-300' : ''}`}>
                         <span className="font-black text-xl text-white dark:text-black">{grand * multiplier}</span>
                         {isTripleYahtzee && <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500">({grand}x{multiplier})</span>}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

          </div>
        </main>

        {/* SCORE INPUT BOTTOM SHEET */}
{/* --- Score Input Modal --- */}
      {activeCell && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center pointer-events-auto">
          {/* Blur Overlay - Click to dismiss */}
          <div 
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => setActiveCell(null)}
          />
          
          {/* Modal Card - Elevated above blur, padded for bottom nav */}
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-t-[2rem] p-6 shadow-[0_-10px_40px_rgba(0,0,0,0.1)] relative z-10 pb-24 animate-in slide-in-from-bottom-full duration-300">
            
            {/* Header / Display */}
            <div className="text-center mb-6">
              <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-1">
                {players.find(p => p.id === activeCell.playerId)?.name}
              </p>
              <h3 className="text-2xl font-black text-slate-800 dark:text-white mb-4">
                {UPPER_CATEGORIES.find(c => c.id === activeCell.category)?.name || 
                 LOWER_CATEGORIES.find(c => c.id === activeCell.category)?.name}
              </h3>
              
              <div className="bg-slate-100 dark:bg-slate-800 rounded-2xl py-4 px-6 mb-2 flex items-center justify-center min-h-[5rem]">
                <span className={`text-5xl font-black tabular-nums ${inputValue ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-300 dark:text-slate-600'}`}>
                  {inputValue || '-'}
                </span>
              </div>
            </div>

            {/* Dynamic Keypad Area */}
            {(() => {
              const options = getScoringOptions(activeCell.category);
              
              if (options === 'NUMPAD') {
                return (
                  <div className="grid grid-cols-3 gap-3">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                      <button
                        key={num}
                        onClick={() => setInputValue(prev => prev.length < 3 ? prev + num : prev)}
                        className="h-16 rounded-2xl bg-slate-50 dark:bg-slate-800 text-2xl font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 active:scale-95 transition-all shadow-sm"
                      >
                        {num}
                      </button>
                    ))}
                    <button
                      onClick={() => setInputValue('')}
                      className="h-16 rounded-2xl bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 font-bold text-lg hover:bg-red-100 dark:hover:bg-red-900/40 active:scale-95 transition-all shadow-sm"
                    >
                      Clear
                    </button>
                    <button
                      onClick={() => setInputValue(prev => prev + '0')}
                      className="h-16 rounded-2xl bg-slate-50 dark:bg-slate-800 text-2xl font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 active:scale-95 transition-all shadow-sm"
                    >
                      0
                    </button>
                    <button
                      onClick={() => handleSaveScore(Number(inputValue))}
                      className="h-16 rounded-2xl bg-indigo-600 text-white font-black text-xl hover:bg-indigo-700 active:scale-95 transition-all shadow-md shadow-indigo-200 dark:shadow-none flex items-center justify-center"
                    >
                      ✓
                    </button>
                  </div>
                );
              }

              // Pre-configured Options Array Layout (e.g. [0, 2, 4, 6, 8, 10])
              return (
                <div className="grid grid-cols-2 gap-3">
                  {options.map((scoreOpt) => (
                    <button
                      key={scoreOpt}
                      onClick={() => {
                        setInputValue(scoreOpt.toString());
                        // Optional: Auto-save when an exact option is tapped!
                        // handleSaveScore(scoreOpt); 
                      }}
                      className={`h-16 rounded-2xl text-2xl font-bold active:scale-95 transition-all shadow-sm flex items-center justify-center ${
                        inputValue === scoreOpt.toString() 
                          ? 'bg-indigo-600 text-white shadow-md' 
                          : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
                      }`}
                    >
                      {scoreOpt}
                    </button>
                  ))}
                  
                  {/* Save Button spanning full width beneath the options */}
                  <div className="col-span-2 pt-2">
                    <button
                      onClick={() => handleSaveScore(Number(inputValue))}
                      disabled={!inputValue}
                      className="w-full h-16 rounded-2xl bg-indigo-600 disabled:bg-slate-300 dark:disabled:bg-slate-800 disabled:text-slate-500 text-white font-black text-xl hover:bg-indigo-700 active:scale-95 transition-all shadow-md flex items-center justify-center"
                    >
                      Save Score
                    </button>
                  </div>
                </div>
              );
            })()}

          </div>
        </div>
      )}

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
          className={`disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 text-white px-5 h-10 rounded-full font-bold shadow-sm active:scale-95 transition-all flex items-center justify-center text-sm ${Object.keys(scores).length > 0 ? 'bg-blue-600' : 'bg-slate-900 dark:bg-slate-100 dark:text-slate-900'}`}
        >
          {Object.keys(scores).length > 0 ? '▶️ Resume Game' : '🚀 Start Game'}
        </button>
      </div>
      
      <div className="p-6 pt-[88px] max-w-screen-md mx-auto">

        {/* Game Rules */}
        <h2 className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 ml-1">Game Rules</h2>
        <div className="bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-2xl p-5 mb-8 shadow-sm">
          <div>
            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-3">Game Variant</label>
            <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
              <button onClick={() => setIsTripleYahtzee(false)} className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${!isTripleYahtzee ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}>Standard (1 Column)</button>
              <button onClick={() => setIsTripleYahtzee(true)} className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${isTripleYahtzee ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}>Triple (3 Columns)</button>
            </div>
          </div>
        </div>
        
        {/* Saved Roster */}
        <div className="flex justify-between items-end mb-2 ml-1 mt-6">
          <h2 className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Saved Roster</h2>
        </div>
        
        <div className="flex gap-2 overflow-x-auto pb-4 mb-2 scrollbar-hide">
          {isLoading ? (
             <span className="text-slate-400 text-sm font-medium px-2 py-2">Loading cloud roster...</span>
          ) : allAvailablePlayers
            .filter(gp => gp && gp.id && !players.some(p => p && p.id === gp.id))
            .map(gp => (
            <button 
              key={gp.id} onClick={() => setPlayers([...players.filter(p => p && p.id), gp])} 
              className="whitespace-nowrap px-4 py-2.5 rounded-full text-sm font-bold bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-700 shadow-sm transition-all flex items-center gap-2 active:scale-95"
            >
              <span className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                {gp.isCloudUser && gp.photoURL && !gp.useCustomEmoji ? <img src={gp.photoURL} alt={gp.name} referrerPolicy="no-referrer" className="w-full h-full object-cover rounded-full" /> : <span>{gp.emoji || '👤'}</span>}
              </span> 
              {gp.name || 'Unknown'}
              {gp.isCloudUser && <span className="text-blue-500 ml-1 text-xs">☁️</span>}
            </button>
          ))}
          
          <button onClick={() => setIsCreatingPlayer(true)} className="whitespace-nowrap px-4 py-2.5 rounded-full text-sm font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-100 dark:border-emerald-800 transition-all">+ New Player</button>
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
                  {p.isCloudUser && p.photoURL && !p.useCustomEmoji ? <img src={p.photoURL} alt={p.name} referrerPolicy="no-referrer" className="w-full h-full object-cover rounded-full" /> : <span>{p.emoji || '👤'}</span>}
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

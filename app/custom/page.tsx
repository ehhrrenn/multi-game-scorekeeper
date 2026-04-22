// app/custom/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useGameState } from '../../hooks/useGameState';

// --- Types ---
type Player = { id: string; name: string; emoji: string };
type Round = { roundId: number; scores: Record<string, number> };
type ActiveCell = { roundId: number; playerId: string } | null;
type PlayerSnapshot = { id: string; name: string; emoji: string };

type GameSettings = { mode: 'UP' | 'DOWN'; target: number };

type MatchRecord = {
  matchId: string;
  date: string;
  gameName: string;
  winnerId: string | null;
  finalScores: Record<string, number>;
  activePlayerIds: string[];
  savedRounds: Round[];
  playerSnapshots: PlayerSnapshot[];
  settings?: GameSettings;
};

// --- Helpers ---
const EMOJIS = ['🦊', '⚡️', '🦖', '🤠', '👾', '🍕', '🚀', '🐙', '🦄', '🥑', '🔥', '💎', '👻', '👑', '😎', '🤖', '👽', '🐶', '🐱', '🐼'];

const EMOJI_COLORS: Record<string, string> = {
  '🦊': '#f97316', '⚡️': '#eab308', '🦖': '#22c55e', '🤠': '#8b5cf6', 
  '👾': '#a855f7', '🍕': '#ef4444', '🚀': '#3b82f6', '🐙': '#ec4899', 
  '🦄': '#d946ef', '🥑': '#84cc16', '🔥': '#dc2626', '💎': '#06b6d4', 
  '👻': '#94a3b8', '👑': '#fbbf24', '😎': '#38bdf8', '🤖': '#64748b',
  '👽': '#10b981', '🐶': '#d97706', '🐱': '#f59e0b', '🐼': '#1e293b'
};

const getRandomEmoji = () => EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
const getPlayerColor = (emoji: string) => EMOJI_COLORS[emoji] || '#3b82f6';

export default function CustomTracker() {
  // --- Persisted State ---
  const [players, setPlayers] = useGameState<Player[]>('scorekeeper_players', []);
  const [globalRoster, setGlobalRoster] = useGameState<Player[]>('scorekeeper_global_roster', []);
  const [rounds, setRounds] = useGameState<Round[]>('scorekeeper_rounds', [{ roundId: 1, scores: {} }]);
  const [matchHistory, setMatchHistory] = useGameState<MatchRecord[]>('scorekeeper_history', []);
  const [gameName, setGameName] = useGameState<string>('scorekeeper_gameName', 'Custom Game');
  const [savedGameNames, setSavedGameNames] = useGameState<string[]>('scorekeeper_game_names', ['Custom Game']);
  const [settings, setSettings] = useGameState<GameSettings>('scorekeeper_settings', { mode: 'UP', target: 0 });

  // --- UI State ---
  const [newPlayerName, setNewPlayerName] = useState('');
  const [activeCell, setActiveCell] = useState<ActiveCell>(null);
  const [inputValue, setInputValue] = useState('0');
  const [isSaved, setIsSaved] = useState(false);
  const [viewMode, setViewMode] = useState<'SETUP' | 'GRID' | 'GRAPH'>('GRID');
  
  // NEW: Emoji Picker State
  const [activeEmojiPicker, setActiveEmojiPicker] = useState<string | null>(null);

  const router = useRouter();

  // --- 1. RESUME LOGIC ---
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedPlayers = window.localStorage.getItem('scorekeeper_players');
      const parsedPlayers = storedPlayers ? JSON.parse(storedPlayers) : [];
      if (parsedPlayers.length === 0) setViewMode('SETUP');
      else setViewMode('GRID');
    }
  }, []);

  // --- 2. AUTO-ADD ROW LOGIC ---
  useEffect(() => {
    if (players.length === 0 || rounds.length === 0) return;
    const latestRound = rounds[rounds.length - 1];
    const isRoundComplete = players.every(p => 
      latestRound.scores[p.id] !== undefined && latestRound.scores[p.id] !== null
    );

    if (isRoundComplete) {
      const timeout = setTimeout(() => {
        setRounds(prev => {
          const last = prev[prev.length - 1];
          if (players.every(p => last.scores[p.id] !== undefined)) {
            return [...prev, { roundId: last.roundId + 1, scores: {} }];
          }
          return prev;
        });
      }, 300);
      return () => clearTimeout(timeout);
    }
  }, [rounds, players, setRounds]);

  const isGameStarted = rounds.length > 1 || Object.keys(rounds[0]?.scores || {}).length > 0;

  // --- Setup Actions ---
  const handleStartGame = () => {
    if (players.length === 0) return;
    const trimmedName = gameName.trim() || 'Custom Game';
    setGameName(trimmedName);
    
    if (!savedGameNames.find(n => n.toLowerCase() === trimmedName.toLowerCase())) {
      setSavedGameNames([trimmedName, ...savedGameNames]);
    }
    setViewMode('GRID');
  };

  const clearSetup = () => {
    setPlayers([]);
    setRounds([{ roundId: 1, scores: {} }]);
    setGameName('Custom Game');
    setSettings({ mode: 'UP', target: 0 });
    setActiveCell(null);
    setInputValue('0');
  };

  // --- Roster Management ---
  const addPlayer = () => {
    const trimmedName = newPlayerName.trim();
    if (!trimmedName) return;

    const existingGlobal = globalRoster.find(p => p.name.toLowerCase() === trimmedName.toLowerCase());
    if (existingGlobal) {
      if (!players.find(p => p.id === existingGlobal.id)) setPlayers([...players, existingGlobal]);
    } else {
      // Auto-assigns random emoji on creation
      const newPlayer = { id: Date.now().toString(), name: trimmedName, emoji: getRandomEmoji() };
      setGlobalRoster([...globalRoster, newPlayer]);
      setPlayers([...players, newPlayer]);
    }
    setNewPlayerName('');
  };

  const selectFromGlobal = (player: Player) => {
    if (!players.find(p => p.id === player.id)) setPlayers([...players, player]);
  };

  const removePlayer = (playerId: string) => setPlayers(players.filter(p => p.id !== playerId));

  const movePlayer = (index: number, direction: 'UP' | 'DOWN') => {
    const newPlayers = [...players];
    if (direction === 'UP' && index > 0) {
      [newPlayers[index - 1], newPlayers[index]] = [newPlayers[index], newPlayers[index - 1]];
    } else if (direction === 'DOWN' && index < newPlayers.length - 1) {
      [newPlayers[index + 1], newPlayers[index]] = [newPlayers[index], newPlayers[index + 1]];
    }
    setPlayers(newPlayers);
  };

  // Specific Emoji Update (Replaces randomize logic)
  const updateEmoji = (playerId: string, newEmoji: string) => {
    const updatedPlayers = players.map(p => p.id === playerId ? { ...p, emoji: newEmoji } : p);
    setPlayers(updatedPlayers);
    setGlobalRoster(globalRoster.map(p => p.id === playerId ? { ...p, emoji: newEmoji } : p));
    setMatchHistory(matchHistory.map(match => ({
      ...match,
      playerSnapshots: match.playerSnapshots.map(p => p.id === playerId ? { ...p, emoji: newEmoji } : p)
    })));
  };

  // --- Grid & Math Logic ---
  const calculateTotal = (pId: string) => {
    const sum = rounds.reduce((total, r) => total + (r.scores[pId] || 0), 0);
    return settings.mode === 'DOWN' ? settings.target - sum : sum;
  };

  const addRound = () => {
    const nextId = rounds.length > 0 ? rounds[rounds.length - 1].roundId + 1 : 1;
    setRounds([...rounds, { roundId: nextId, scores: {} }]);
  };

  const removeRound = (id: number) => {
    setActiveCell(null);
    if (rounds.length === 1) { setRounds([{ roundId: 1, scores: {} }]); return; }
    setRounds(rounds.filter(r => r.roundId !== id).map((r, i) => ({ ...r, roundId: i + 1 })));
  };

  const saveGame = () => {
    if (players.length === 0 || rounds.length === 0) return;
    
    const finalScores: Record<string, number> = {};
    players.forEach(p => { finalScores[p.id] = calculateTotal(p.id); });
    
    let winnerId = players[0]?.id || null;
    if (settings.mode === 'UP') {
      let high = -Infinity;
      Object.entries(finalScores).forEach(([id, s]) => { if (s > high) { high = s; winnerId = id; } });
    } else {
      let closestToZero = Infinity;
      Object.entries(finalScores).forEach(([id, s]) => { 
        if (Math.abs(s) < Math.abs(closestToZero)) { closestToZero = s; winnerId = id; } 
      });
    }

    const trimmedName = gameName.trim() || 'Custom Game';
    
    const newMatch: MatchRecord = {
      matchId: Date.now().toString(),
      date: new Date().toLocaleDateString(),
      gameName: trimmedName,
      winnerId,
      finalScores,
      activePlayerIds: players.map(p => p.id),
      savedRounds: JSON.parse(JSON.stringify(rounds)),
      playerSnapshots: players.map(p => ({ id: p.id, name: p.name, emoji: p.emoji })),
      settings: { ...settings }
    };
    
    setMatchHistory([newMatch, ...matchHistory]);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  // Safe definition of handleCellTap
  const handleCellTap = (roundId: number, playerId: string) => {
    setActiveCell({ roundId, playerId });
    const existingScore = rounds.find(r => r.roundId === roundId)?.scores[playerId];
    setInputValue(existingScore !== undefined && existingScore !== null ? existingScore.toString() : '0');
  };

  const submitScore = () => {
    if (!activeCell) return;
    const val = parseInt(inputValue, 10) || 0;
    setRounds(rounds.map(r => r.roundId === activeCell.roundId ? { ...r, scores: { ...r.scores, [activeCell.playerId]: val } } : r));
    setActiveCell(null);
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 pb-32">
      
      {/* --- SETUP VIEW --- */}
      {viewMode === 'SETUP' && (
        <div className="animate-in fade-in slide-in-from-bottom-2">
          
          {/* UPDATED HEADER: Left aligned title, Top Right Start/Resume Button */}
          <div className="fixed top-0 left-0 right-0 p-4 bg-white shadow-sm border-b z-40 flex items-center justify-between">
            <h1 className="text-2xl font-black text-slate-800">Game Setup</h1>
            <button 
              onClick={handleStartGame} 
              disabled={players.length === 0}
              className="bg-blue-600 disabled:bg-slate-200 disabled:text-slate-400 text-white px-5 h-10 rounded-full font-bold shadow-sm active:scale-95 transition-all flex items-center justify-center text-sm"
            >
              {isGameStarted ? '▶ Resume' : '🚀 Start'}
            </button>
          </div>
          
          <div className="p-6 pt-[88px]">
            {/* Game Title */}
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">Game Title</h2>
            <input type="text" value={gameName} onChange={e => setGameName(e.target.value)} className="text-2xl font-black text-slate-800 border-2 border-slate-200 rounded-xl w-full p-4 bg-white mb-3 focus:outline-none focus:border-blue-500" placeholder="What are we playing?" />
            
            {savedGameNames.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-4 mb-4 scrollbar-hide">
                {savedGameNames.map(name => (
                  <button key={name} onClick={() => setGameName(name)} className={`whitespace-nowrap px-4 py-2 rounded-full text-sm font-bold transition-all border ${gameName === name ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}>
                    {name}
                  </button>
                ))}
              </div>
            )}

            {/* Rules Engine */}
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1 mt-6">Game Rules</h2>
            <div className="bg-white border-2 border-slate-200 rounded-2xl p-4 mb-8 shadow-sm">
              <div className="flex bg-slate-100 p-1 rounded-xl mb-4">
                <button onClick={() => setSettings({ ...settings, mode: 'UP' })} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${settings.mode === 'UP' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>📈 Count Up</button>
                <button onClick={() => setSettings({ ...settings, mode: 'DOWN' })} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${settings.mode === 'DOWN' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>📉 Count Down</button>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-2">
                  {settings.mode === 'UP' ? 'Target Score (Optional)' : 'Starting Score'}
                </label>
                <input 
                  type="number" 
                  value={settings.target || ''} 
                  onChange={e => setSettings({ ...settings, target: parseInt(e.target.value) || 0 })} 
                  placeholder={settings.mode === 'UP' ? 'e.g. 10000' : 'e.g. 501'}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-bold text-slate-800 outline-none focus:border-blue-500"
                />
              </div>
            </div>
            
            {/* Roster Management */}
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">Current Match</h2>
            <div className="flex gap-2 mb-4">
              <input type="text" placeholder="Type name to add..." className="border-2 border-slate-200 p-3 rounded-xl flex-grow focus:border-blue-500 outline-none font-medium" value={newPlayerName} onChange={e => setNewPlayerName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addPlayer()} />
              <button onClick={addPlayer} className="bg-slate-800 text-white px-5 py-3 rounded-xl font-bold active:scale-95 transition">+ Add</button>
            </div>
            
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden mb-8">
              {players.length === 0 ? <div className="p-6 text-center text-slate-400 font-medium">No players added yet.</div> : players.map((p, i) => (
                <div key={p.id} className={`flex items-stretch justify-between ${i !== players.length - 1 ? 'border-b border-slate-100' : ''}`}>
                  
                  {/* Player Info (Emoji triggers picker module) */}
                  <div className="flex items-center gap-3 p-4">
                    <button onClick={() => setActiveEmojiPicker(p.id)} className="w-12 h-12 bg-slate-50 border border-slate-100 rounded-full text-2xl flex items-center justify-center active:scale-95 transition">{p.emoji}</button>
                    <span className="font-bold text-lg text-slate-700">{p.name}</span>
                  </div>

                  {/* Actions & Turn Order Handles */}
                  <div className="flex items-stretch">
                    <button onClick={() => removePlayer(p.id)} className="px-4 text-slate-300 hover:text-red-500 transition-colors border-l border-slate-100">✕</button>
                    <div className="flex flex-col border-l border-slate-100 bg-slate-50 w-12">
                      <button disabled={i === 0} onClick={() => movePlayer(i, 'UP')} className="flex-1 flex items-center justify-center text-slate-400 hover:bg-slate-200 disabled:opacity-20 transition-colors pb-1">▲</button>
                      <button disabled={i === players.length - 1} onClick={() => movePlayer(i, 'DOWN')} className="flex-1 flex items-center justify-center text-slate-400 hover:bg-slate-200 disabled:opacity-20 transition-colors pt-1">▼</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Quick Add Global */}
            {globalRoster.filter(gp => !players.find(p => p.id === gp.id)).length > 0 && (
              <>
                <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">Available Players</h2>
                <div className="flex flex-wrap gap-2 mb-8">
                  {globalRoster.filter(gp => !players.find(p => p.id === gp.id)).map(gp => (
                    <button key={gp.id} onClick={() => selectFromGlobal(gp)} className="bg-white border border-slate-200 px-4 py-2 rounded-full flex items-center gap-2 shadow-sm active:scale-95 transition hover:border-blue-300">
                      <span>{gp.emoji}</span><span className="font-bold text-slate-700">{gp.name}</span><span className="text-blue-500 text-lg font-black">+</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* Clear Setup */}
            {(players.length > 0 || rounds.length > 1 || gameName !== 'Custom Game') && (
              <div className="flex justify-center mt-8 pb-12">
                <button onClick={clearSetup} className="text-red-500 font-bold px-6 py-3 rounded-xl hover:bg-red-50 active:scale-95 transition-all text-xs uppercase tracking-widest">
                  Clear Setup
                </button>
              </div>
            )}
          </div>

          {/* EMOJI PICKER MODAL */}
          {activeEmojiPicker && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
              <div className="bg-white rounded-[2rem] p-6 shadow-2xl w-full max-w-sm animate-in zoom-in-95 duration-200">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xl font-black text-slate-800">Choose Emoji</h3>
                  <button onClick={() => setActiveEmojiPicker(null)} className="w-8 h-8 flex items-center justify-center bg-slate-100 rounded-full text-slate-500 hover:text-slate-700 active:scale-95 transition-all">✕</button>
                </div>
                <div className="grid grid-cols-5 gap-3">
                  {EMOJIS.map(emoji => (
                    <button 
                      key={emoji} 
                      onClick={() => {
                        updateEmoji(activeEmojiPicker, emoji);
                        setActiveEmojiPicker(null);
                      }}
                      className="text-3xl aspect-square flex items-center justify-center bg-slate-50 border border-slate-100 hover:bg-slate-100 rounded-2xl active:scale-90 transition-all shadow-sm"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* --- ACTIVE GAME VIEWS (GRID & GRAPH) --- */}
      {viewMode !== 'SETUP' && (
        <>
          <div className="fixed top-0 left-0 right-0 p-4 bg-white shadow-sm border-b z-40">
            <div className="flex justify-between items-center mb-4 h-10">
              <h1 className="text-2xl font-black text-slate-800 truncate pr-4">{gameName}</h1>
              <button onClick={() => setViewMode('SETUP')} className="w-10 h-10 bg-slate-100 text-slate-600 rounded-full flex items-center justify-center text-xl active:scale-95 transition">⚙️</button>
            </div>
            <div className="flex bg-slate-100 p-1 rounded-xl">
              <button onClick={() => setViewMode('GRID')} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${viewMode === 'GRID' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>🧮 Score Grid</button>
              <button onClick={() => setViewMode('GRAPH')} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${viewMode === 'GRAPH' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>📈 Live Graph</button>
            </div>
          </div>

          <div className="pt-[124px]">
            {viewMode === 'GRID' && (
              <div className="animate-in fade-in">
                <table className="w-full text-center border-collapse">
                  <thead className="bg-slate-100 sticky top-[124px] border-b z-30 shadow-sm">
                    <tr>
                      <th className="p-3 w-16 text-slate-500 font-normal bg-slate-100">Rnd</th>
                      {players.map(p => (
                        <th key={p.id} className="p-3 font-semibold min-w-[80px] bg-slate-100">
                          <div className="text-2xl">{p.emoji}</div>
                          <div className="text-xs truncate font-bold text-slate-400 uppercase">{p.name}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rounds.map(round => (
                      <tr key={round.roundId} className="border-b bg-white">
                        <td className="p-2 border-r align-middle bg-slate-50">
                          <div className="flex items-center justify-between px-1">
                            <span className="text-slate-500 font-bold ml-1">{round.roundId}</span>
                            <button onClick={e => { e.stopPropagation(); removeRound(round.roundId); }} className="text-slate-300 hover:text-red-500 px-1">✕</button>
                          </div>
                        </td>
                        {players.map(p => {
                          const isSelected = activeCell?.roundId === round.roundId && activeCell?.playerId === p.id;
                          return (
                            <td 
                              key={p.id} 
                              onClick={() => handleCellTap(round.roundId, p.id)} 
                              className={`p-4 text-xl font-medium border-l border-slate-50 ${isSelected ? 'bg-blue-50 ring-2 ring-blue-500 ring-inset' : 'active:bg-slate-50'}`}
                            >
                              {round.scores[p.id] !== undefined ? round.scores[p.id] : <span className="text-slate-200">-</span>}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-800 text-white sticky bottom-0 z-30 shadow-[0_-4px_6px_rgba(0,0,0,0.1)]">
                    <tr>
                      <td className="p-4 font-bold border-r border-slate-700 text-xs uppercase opacity-50">Tot</td>
                      {players.map(p => {
                        const total = calculateTotal(p.id);
                        const isWinner = settings.target > 0 && (settings.mode === 'UP' ? total >= settings.target : total <= 0);
                        return (
                          <td key={p.id} className={`p-4 font-black text-xl ${isWinner ? 'text-green-400' : ''}`}>
                            {total}
                          </td>
                        );
                      })}
                    </tr>
                  </tfoot>
                </table>
                
                <div className="p-5 flex flex-row gap-3 max-w-md mx-auto mt-4">
                  <button onClick={addRound} className="flex-1 bg-white border-2 p-3.5 rounded-xl font-bold active:bg-slate-50 transition-colors shadow-sm">+ Add Round</button>
                  <button 
                    onClick={saveGame} 
                    className={`flex-1 p-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-sm ${isSaved ? 'bg-green-600 text-white' : 'bg-slate-900 text-white'}`}
                  >
                    <span>{isSaved ? '✅' : '💾'}</span> {isSaved ? 'Saved!' : 'Save Game'}
                  </button>
                </div>
              </div>
            )}
            
            {viewMode === 'GRAPH' && (
              <div className="p-4 animate-in fade-in">
                <div className="flex flex-wrap gap-3 mb-4 justify-center bg-white p-3 rounded-xl shadow-sm border border-slate-100">
                  {players.map(p => (
                    <div key={p.id} className="flex items-center gap-1.5 text-sm font-bold">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: getPlayerColor(p.emoji) }}></div>
                      <span>{p.emoji}</span>
                    </div>
                  ))}
                </div>
                <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                  <svg viewBox={`0 0 400 200`} className="w-full h-auto overflow-visible">
                    {(() => {
                      const pointsData = players.map(p => {
                        let runningTotal = settings.mode === 'DOWN' ? settings.target : 0;
                        const points = [runningTotal];
                        rounds.forEach(r => {
                          if (settings.mode === 'DOWN') runningTotal -= (r.scores[p.id] || 0);
                          else runningTotal += (r.scores[p.id] || 0);
                          points.push(runningTotal);
                        });
                        return { color: getPlayerColor(p.emoji), points };
                      });
                      
                      const allScores = pointsData.flatMap(d => d.points);
                      const max = Math.max(...allScores, 10);
                      const min = Math.min(...allScores, 0);
                      const range = max - min || 1;
                      
                      return (
                        <>
                          {min < 0 && <line x1="0" y1={200 - ((0 - min) / range) * 200} x2="400" y2={200 - ((0 - min) / range) * 200} stroke="#cbd5e1" strokeDasharray="4" />}
                          {pointsData.map((d, i) => (
                            <polyline key={i} points={d.points.map((s, idx) => `${(idx / rounds.length) * 400},${200 - ((s - min) / range) * 200}`).join(' ')} fill="none" stroke={d.color} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" className="drop-shadow-sm" />
                          ))}
                        </>
                      );
                    })()}
                  </svg>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* NUMPAD */}
      {activeCell && viewMode === 'GRID' && (
        <div className="fixed bottom-0 left-0 right-0 bg-white shadow-[0_-10px_40px_rgba(0,0,0,0.1)] border-t-2 border-slate-100 rounded-t-3xl p-5 pb-12 z-[60] animate-in slide-in-from-bottom-full">
          <div className="text-center text-5xl font-black mb-5 py-4 bg-slate-50 rounded-2xl shadow-inner border border-slate-100">{inputValue}</div>
          <div className="grid grid-cols-3 gap-3">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => <button key={num} onClick={() => setInputValue(p => p === '0' ? num.toString() : p + num)} className="bg-slate-100 py-5 rounded-2xl text-2xl font-semibold active:bg-slate-200 transition-colors">{num}</button>)}
            <button onClick={() => setInputValue(p => p.startsWith('-') ? p.substring(1) : '-' + p)} className="bg-slate-200 py-5 rounded-2xl text-xl font-bold active:bg-slate-300">+/-</button>
            <button onClick={() => setInputValue(p => p === '0' ? '0' : p + '0')} className="bg-slate-100 py-5 rounded-2xl text-2xl font-semibold active:bg-slate-200">0</button>
            <button onClick={() => setInputValue(p => p.slice(0, -1) || '0')} className="bg-red-50 text-red-500 py-5 rounded-2xl text-2xl font-bold active:bg-red-100 transition-all active:scale-95">⌫</button>
          </div>
          <button onClick={submitScore} className="w-full mt-4 bg-blue-600 text-white py-5 rounded-2xl text-xl font-bold active:bg-blue-700 transition-all active:scale-95 shadow-lg shadow-blue-100">Enter Score</button>
        </div>
      )}
    </main>
  );
}
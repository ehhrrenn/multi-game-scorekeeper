// app/custom/page.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useGameState } from '../../hooks/useGameState';

// --- Types ---
type Player = { id: string; name: string; emoji: string };
type Round = { roundId: number; scores: Record<string, number> };
type ActiveCell = { roundId: number; playerId: string } | null;

type MatchRecord = {
  matchId: string;
  date: string;
  gameName: string;
  winnerId: string | null;
  finalScores: Record<string, number>;
  activePlayerIds: string[]; 
  savedRounds: Round[]; 
};

// --- Helpers ---
const EMOJIS = ['🦊', '⚡️', '🦖', '🤠', '👾', '🍕', '🚀', '🐙', '🦄', '🥑', '🔥', '💎', '👻', '👑'];
const getRandomEmoji = () => EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
const LINE_COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];

export default function CustomTracker() {
  // --- State ---
  const [players, setPlayers] = useGameState<Player[]>('scorekeeper_players', []);
  const [rounds, setRounds] = useGameState<Round[]>('scorekeeper_rounds', [{ roundId: 1, scores: {} }]);
  const [matchHistory, setMatchHistory] = useGameState<MatchRecord[]>('scorekeeper_history', []);
  
  const [newPlayerName, setNewPlayerName] = useState('');
  const [gameName, setGameName] = useState('Custom Game');
  
  // UI State
  const [activeCell, setActiveCell] = useState<ActiveCell>(null);
  const [inputValue, setInputValue] = useState('0');
  const [viewMode, setViewMode] = useState<'SETUP' | 'GRID' | 'GRAPH'>(players.length === 0 ? 'SETUP' : 'GRID');

  const router = useRouter();

  // --- Core Game Logic ---
  const addPlayer = () => {
    if (!newPlayerName.trim()) return;
    const newPlayer = {
      id: Date.now().toString(),
      name: newPlayerName,
      emoji: getRandomEmoji(),
    };
    setPlayers([...players, newPlayer]);
    setNewPlayerName('');
  };

  const removePlayer = (playerId: string) => {
    setPlayers(players.filter(p => p.id !== playerId));
  };

  const randomizeEmoji = (playerId: string) => {
    setPlayers(players.map(p => 
      p.id === playerId ? { ...p, emoji: getRandomEmoji() } : p
    ));
  };

  const addRound = () => {
    const nextRoundId = rounds.length > 0 ? rounds[rounds.length - 1].roundId + 1 : 1;
    setRounds([...rounds, { roundId: nextRoundId, scores: {} }]);
    setViewMode('GRID'); 
  };

  // NEW: Remove a round and re-index the remaining rounds
  const removeRound = (roundIdToRemove: number) => {
    setActiveCell(null); // Close numpad to prevent saving data to the wrong row

    if (rounds.length === 1) {
      // If it's the very last round, just clear its scores instead of breaking the grid
      setRounds([{ roundId: 1, scores: {} }]);
      return;
    }

    const updatedRounds = rounds
      .filter(r => r.roundId !== roundIdToRemove)
      .map((r, index) => ({ ...r, roundId: index + 1 })); // Recalculate 1, 2, 3...
    
    setRounds(updatedRounds);
  };

  const calculateTotal = (playerId: string) => {
    return rounds.reduce((total, round) => total + (round.scores[playerId] || 0), 0);
  };

  const saveGame = () => {
    if (players.length === 0 || rounds.length === 0) return;

    const finalScores: Record<string, number> = {};
    players.forEach(p => { finalScores[p.id] = calculateTotal(p.id); });

    let winnerId: string | null = null;
    let highestScore = -Infinity;
    
    Object.entries(finalScores).forEach(([playerId, score]) => {
      if (score > highestScore) {
        highestScore = score;
        winnerId = playerId;
      }
    });

    const newMatch: MatchRecord = {
      matchId: Date.now().toString(),
      date: new Date().toLocaleDateString(),
      gameName: gameName,
      winnerId: winnerId,
      finalScores: finalScores,
      activePlayerIds: players.map(p => p.id), 
      savedRounds: [...rounds], 
    };

    setMatchHistory([newMatch, ...matchHistory]); 
    setRounds([{ roundId: 1, scores: {} }]); 
    setGameName('Custom Game');
    setViewMode('SETUP'); // Reset to setup for the next time they play
    
    router.push('/history'); 
  };

  // --- Numpad Logic ---
  const handleCellTap = (roundId: number, playerId: string) => {
    setActiveCell({ roundId, playerId });
    const existingScore = rounds.find(r => r.roundId === roundId)?.scores[playerId];
    setInputValue(existingScore ? existingScore.toString() : '0');
  };

  const handleNumpadInput = (val: string) => {
    if (inputValue === '0' && val !== '0') setInputValue(val);
    else setInputValue(prev => prev + val);
  };

  const toggleNegative = () => {
    setInputValue(prev => prev.startsWith('-') ? prev.substring(1) : '-' + prev);
  };

  const submitScore = () => {
    if (!activeCell) return;
    const numericScore = parseInt(inputValue, 10) || 0;
    
    const updatedRounds = rounds.map(round => {
      if (round.roundId === activeCell.roundId) {
        return { ...round, scores: { ...round.scores, [activeCell.playerId]: numericScore } };
      }
      return round;
    });

    setRounds(updatedRounds);
    setActiveCell(null); 
  };

  const switchTab = (tab: 'SETUP' | 'GRID' | 'GRAPH') => {
    setActiveCell(null);
    setViewMode(tab);
  };

  // --- View Renderers ---
  const renderLiveGraph = () => {
    if (players.length === 0) return (
      <div className="p-10 text-center text-slate-400 font-semibold mt-10">Add players in Setup to see the live graph!</div>
    );

    const chartData = players.map((p, index) => {
      let runningTotal = 0;
      const points = rounds.map(r => {
        runningTotal += (r.scores[p.id] || 0);
        return runningTotal;
      });
      return { 
        id: p.id, emoji: p.emoji, color: LINE_COLORS[index % LINE_COLORS.length], points: [0, ...points] 
      };
    });

    const allScores = chartData.flatMap(d => d.points);
    const maxScore = Math.max(...allScores, 10);
    const minScore = Math.min(...allScores, 0);
    const range = maxScore - minScore || 1;
    const totalRounds = rounds.length;
    const width = 400;
    const height = 200;

    return (
      <div className="p-4 animate-in fade-in slide-in-from-right-2">
         <div className="flex flex-wrap gap-3 mb-4 text-sm font-semibold justify-center bg-white p-3 rounded-xl shadow-sm border border-slate-100">
           {chartData.map(d => (
             <div key={d.id} className="flex items-center gap-1.5">
               <div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: d.color }}></div>
               <span>{d.emoji}</span>
             </div>
           ))}
         </div>
         <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
           <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto overflow-visible">
             {minScore < 0 && (
               <line x1="0" y1={height - ((0 - minScore) / range) * height} x2={width} y2={height - ((0 - minScore) / range) * height} stroke="#cbd5e1" strokeDasharray="4" strokeWidth="1" />
             )}
             {chartData.map(d => {
               const polylinePoints = d.points.map((score, roundIndex) => {
                 const x = (roundIndex / totalRounds) * width;
                 const y = height - ((score - minScore) / range) * height;
                 return `${x},${y}`;
               }).join(' ');

               return (
                 <polyline key={d.id} points={polylinePoints} fill="none" stroke={d.color} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" className="drop-shadow-md transition-all duration-300" />
               );
             })}
           </svg>
           <div className="flex justify-between mt-4 text-xs text-slate-400 font-bold px-1">
             <span>Start</span>
             <span>Round {totalRounds}</span>
           </div>
         </div>
      </div>
    );
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 pb-32">
      
      {/* --- SETUP TAB --- */}
      {viewMode === 'SETUP' && (
        <div className="animate-in fade-in slide-in-from-bottom-2">
          <div className="fixed top-0 left-0 right-0 p-4 bg-white shadow-sm border-b z-30 flex items-center">
            <button 
              onClick={() => switchTab('GRID')} 
              className="text-blue-600 font-bold px-2 py-2 rounded-lg active:bg-blue-50 transition-colors flex items-center gap-1 -ml-2"
            >
              <span className="text-2xl leading-none pb-0.5">‹</span> Back
            </button>
            <h1 className="text-xl font-black text-slate-800 absolute left-1/2 -translate-x-1/2">Game Setup</h1>
          </div>

          <div className="p-6 pt-[88px]">
            <div className="mb-8">
              <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-2 ml-1">Game Title</h2>
              <input 
                type="text" 
                value={gameName}
                onChange={(e) => setGameName(e.target.value)}
                className="text-2xl font-black text-slate-800 border-2 border-slate-200 rounded-xl focus:border-blue-500 focus:outline-none w-full p-4 bg-white placeholder-slate-300 shadow-sm transition-colors"
                placeholder="What are we playing?"
              />
            </div>

            <div>
              <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-2 ml-1">Active Roster</h2>
              
              <div className="flex gap-2 mb-4">
                <input 
                  type="text" 
                  placeholder="New player name..." 
                  className="border-2 border-slate-200 p-3 rounded-xl flex-grow shadow-sm focus:outline-none focus:border-blue-500 transition-colors"
                  value={newPlayerName}
                  onChange={(e) => setNewPlayerName(e.target.value)}
                />
                <button onClick={addPlayer} className="bg-slate-800 text-white px-5 py-3 rounded-xl font-bold shadow-sm active:bg-slate-900 transition-colors">
                  + Add
                </button>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                {players.length === 0 ? (
                  <div className="p-6 text-center text-slate-400 font-medium">No players added yet.</div>
                ) : (
                  players.map((p, i) => (
                    <div key={p.id} className={`flex items-center justify-between p-4 ${i !== players.length - 1 ? 'border-b border-slate-100' : ''}`}>
                      <div className="flex items-center gap-3">
                        <button 
                          onClick={() => randomizeEmoji(p.id)}
                          className="w-12 h-12 bg-slate-100 rounded-full text-2xl flex items-center justify-center hover:bg-slate-200 active:scale-95 transition-all shadow-inner"
                          title="Tap to change emoji"
                        >
                          {p.emoji}
                        </button>
                        <span className="font-bold text-lg text-slate-700">{p.name}</span>
                      </div>
                      <button 
                        onClick={() => removePlayer(p.id)}
                        className="w-10 h-10 flex items-center justify-center text-slate-300 hover:bg-red-50 hover:text-red-500 rounded-full transition-colors text-xl"
                      >
                        ✕
                      </button>
                    </div>
                  ))
                )}
              </div>
              <p className="text-xs text-center text-slate-400 mt-3 font-medium">Tap an emoji to change it!</p>
            </div>
          </div>
        </div>
      )}

      {/* --- ACTIVE GAME VIEWS (GRID & GRAPH) --- */}
      {viewMode !== 'SETUP' && (
        <>
          <div className="fixed top-0 left-0 right-0 p-4 bg-white shadow-sm border-b z-30">
            <div className="flex justify-between items-center mb-4">
              <h1 className="text-2xl font-black text-slate-800 truncate pr-4">{gameName}</h1>
              <button 
                onClick={() => switchTab('SETUP')} 
                className="w-10 h-10 bg-slate-100 text-slate-600 rounded-full flex items-center justify-center text-xl active:bg-slate-200 transition-colors flex-shrink-0"
              >
                ⚙️
              </button>
            </div>

            <div className="flex bg-slate-100 p-1 rounded-xl">
              <button onClick={() => switchTab('GRID')} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${viewMode === 'GRID' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                🧮 Score Grid
              </button>
              <button onClick={() => switchTab('GRAPH')} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${viewMode === 'GRAPH' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                📈 Live Graph
              </button>
            </div>
          </div>

          <div className="pt-[124px]">
            
            {/* Render Grid */}
            {viewMode === 'GRID' && (
              <div className="overflow-x-auto animate-in fade-in slide-in-from-left-2">
                {players.length === 0 ? (
                  <div className="p-10 text-center text-slate-400 font-semibold mt-10">Tap ⚙️ Setup to add players!</div>
                ) : (
                  <table className="w-full text-center border-collapse">
                    <thead className="bg-slate-100 sticky top-[124px] border-b z-10 shadow-sm">
                      <tr>
                        <th className="p-3 w-16 text-slate-500 font-normal">Rnd</th>
                        {players.map(p => (
                          <th key={p.id} className="p-3 font-semibold min-w-[80px]">
                            <div className="text-2xl">{p.emoji}</div>
                            <div className="text-sm truncate">{p.name}</div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rounds.map(round => (
                        <tr key={round.roundId} className="border-b bg-white">
                          
                          {/* UPGRADED: Round number cell now includes a small delete button */}
                          <td className="p-2 border-r align-middle bg-slate-50">
                            <div className="flex items-center justify-between px-1">
                              <span className="text-slate-500 font-bold ml-1">{round.roundId}</span>
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeRound(round.roundId);
                                }}
                                className="w-6 h-6 flex items-center justify-center rounded-full text-slate-300 hover:text-red-500 active:bg-red-50 active:text-red-600 transition-colors"
                              >
                                ✕
                              </button>
                            </div>
                          </td>

                          {players.map(p => {
                            const score = round.scores[p.id];
                            const isSelected = activeCell?.roundId === round.roundId && activeCell?.playerId === p.id;
                            return (
                              <td 
                                key={p.id} 
                                onClick={() => handleCellTap(round.roundId, p.id)}
                                className={`p-3 text-lg cursor-pointer transition-colors ${isSelected ? 'bg-blue-100 border-2 border-blue-500 rounded' : 'active:bg-slate-50'}`}
                              >
                                {score !== undefined ? score : <span className="text-slate-300">-</span>}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-800 text-white sticky bottom-0 z-10">
                      <tr>
                        <td className="p-4 font-bold border-r border-slate-700">Tot</td>
                        {players.map(p => (
                          <td key={p.id} className="p-4 font-bold text-xl">
                            {calculateTotal(p.id)}
                          </td>
                        ))}
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>
            )}

            {/* Render Graph */}
            {viewMode === 'GRAPH' && renderLiveGraph()}

            {/* UPGRADED: Buttons only render when on the GRID tab */}
            {viewMode === 'GRID' && (
              <div className="p-5 text-center flex flex-col gap-3 max-w-md mx-auto mt-4">
                 {players.length > 0 && (
                   <button onClick={addRound} className="bg-white border-2 border-slate-200 text-slate-800 px-6 py-3.5 rounded-xl font-bold shadow-sm w-full active:bg-slate-50 transition-colors">
                     + Add Round
                   </button>
                 )}
                 <button onClick={saveGame} className="bg-slate-900 text-white px-6 py-4 rounded-xl font-bold shadow-md w-full active:bg-slate-800 flex items-center justify-center gap-2 transition-transform active:scale-[0.98]">
                   <span>💾</span> Save to History
                 </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* CUSTOM NUMPAD */}
      {activeCell && viewMode === 'GRID' && (
        <div className="fixed bottom-0 left-0 right-0 bg-white shadow-[0_-10px_40px_rgba(0,0,0,0.1)] border-t-2 border-slate-100 rounded-t-3xl p-5 pb-8 animate-in slide-in-from-bottom-full z-50">
          <div className="text-center text-5xl font-black mb-5 bg-slate-50 py-4 rounded-2xl border border-slate-100 shadow-inner">
            {inputValue}
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
              <button key={num} onClick={() => handleNumpadInput(num.toString())} className="bg-slate-100 py-5 rounded-2xl text-2xl font-semibold active:bg-slate-200 active:scale-[0.95] transition-all">
                {num}
              </button>
            ))}
            <button onClick={toggleNegative} className="bg-slate-200 py-5 rounded-2xl text-xl font-bold active:bg-slate-300 active:scale-[0.95] transition-all">
              +/-
            </button>
            <button onClick={() => handleNumpadInput('0')} className="bg-slate-100 py-5 rounded-2xl text-2xl font-semibold active:bg-slate-200 active:scale-[0.95] transition-all">
              0
            </button>
            <button onClick={() => setInputValue(prev => prev.slice(0, -1) || '0')} className="bg-red-50 text-red-500 py-5 rounded-2xl text-2xl font-bold active:bg-red-100 active:scale-[0.95] transition-all">
              ⌫
            </button>
          </div>
          <button onClick={submitScore} className="w-full mt-4 bg-blue-600 text-white py-5 rounded-2xl text-xl font-bold shadow-lg shadow-blue-200 active:bg-blue-700 active:scale-[0.98] transition-all">
            Enter Score
          </button>
        </div>
      )}
      
    </main>
  );
}
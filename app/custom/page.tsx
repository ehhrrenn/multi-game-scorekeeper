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

type MatchRecord = {
  matchId: string;
  date: string;
  gameName: string;
  winnerId: string | null;
  finalScores: Record<string, number>;
  activePlayerIds: string[];
  savedRounds: Round[];
  playerSnapshots: PlayerSnapshot[];
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
  const [gameName, setGameName] = useGameState<string>('scorekeeper_gameName', 'Custom Game');

  const [newPlayerName, setNewPlayerName] = useState('');
  const [activeCell, setActiveCell] = useState<ActiveCell>(null);
  const [inputValue, setInputValue] = useState('0');
  const [viewMode, setViewMode] = useState<'SETUP' | 'GRID' | 'GRAPH'>(
    players.length === 0 ? 'SETUP' : 'GRID'
  );

  const router = useRouter();

  // Auto-switch view logic
  useEffect(() => {
    const hasScores = rounds.some(r =>
      Object.values(r.scores || {}).some(v => (v ?? 0) !== 0)
    );

    if (players.length === 0) {
      setViewMode('SETUP');
    } else if (rounds.length > 1 || hasScores) {
      setViewMode('GRID');
    }
  }, [players.length, rounds]);

  // --- Logic ---
  const addPlayer = () => {
    if (!newPlayerName.trim()) return;
    setPlayers([...players, { id: Date.now().toString(), name: newPlayerName, emoji: getRandomEmoji() }]);
    setNewPlayerName('');
  };

  const removePlayer = (playerId: string) => setPlayers(players.filter(p => p.id !== playerId));

  const randomizeEmoji = (playerId: string) => {
    setPlayers(players.map(p => (p.id === playerId ? { ...p, emoji: getRandomEmoji() } : p)));
  };

  const addRound = () => {
    const nextRoundId = rounds.length > 0 ? rounds[rounds.length - 1].roundId + 1 : 1;
    setRounds([...rounds, { roundId: nextRoundId, scores: {} }]);
    setViewMode('GRID');
  };

  const removeRound = (roundIdToRemove: number) => {
    setActiveCell(null);
    if (rounds.length === 1) {
      setRounds([{ roundId: 1, scores: {} }]);
      return;
    }
    setRounds(rounds.filter(r => r.roundId !== roundIdToRemove).map((r, i) => ({ ...r, roundId: i + 1 })));
  };

  const calculateTotal = (playerId: string) => rounds.reduce((total, round) => total + (round.scores[playerId] || 0), 0);

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
      gameName,
      winnerId,
      finalScores,
      activePlayerIds: players.map(p => p.id),
      savedRounds: [...rounds],
      playerSnapshots: players.map(p => ({ id: p.id, name: p.name, emoji: p.emoji })),
    };

    setMatchHistory([newMatch, ...matchHistory]);
    setRounds([{ roundId: 1, scores: {} }]);
    setPlayers([]); // Clear active roster for next game
    setGameName('Custom Game');
    setViewMode('SETUP');
    router.push('/history');
  };

  // --- Input ---
  const handleCellTap = (roundId: number, playerId: string) => {
    setActiveCell({ roundId, playerId });
    const existingScore = rounds.find(r => r.roundId === roundId)?.scores[playerId];
    setInputValue(existingScore ? existingScore.toString() : '0');
  };

  const submitScore = () => {
    if (!activeCell) return;
    const numericScore = parseInt(inputValue, 10) || 0;
    setRounds(rounds.map(round => 
      round.roundId === activeCell.roundId 
        ? { ...round, scores: { ...round.scores, [activeCell.playerId]: numericScore } } 
        : round
    ));
    setActiveCell(null);
  };

  const renderLiveGraph = () => {
    const chartData = players.map((p, index) => {
      let total = 0;
      const points = rounds.map(r => { total += (r.scores[p.id] || 0); return total; });
      return { id: p.id, emoji: p.emoji, color: LINE_COLORS[index % LINE_COLORS.length], points: [0, ...points] };
    });

    const allScores = chartData.flatMap(d => d.points);
    const max = Math.max(...allScores, 10), min = Math.min(...allScores, 0), range = max - min || 1;
    const w = 400, h = 200;

    return (
      <div className="p-4 animate-in fade-in">
        <div className="flex flex-wrap gap-3 mb-4 justify-center bg-white p-3 rounded-xl shadow-sm border border-slate-100">
          {chartData.map(d => (
            <div key={d.id} className="flex items-center gap-1.5 text-sm font-bold">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: d.color }}></div>
              <span>{d.emoji}</span>
            </div>
          ))}
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
          <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto overflow-visible">
            {min < 0 && <line x1="0" y1={h - ((0 - min) / range) * h} x2={w} y2={h - ((0 - min) / range) * h} stroke="#cbd5e1" strokeDasharray="4" />}
            {chartData.map(d => (
              <polyline key={d.id} points={d.points.map((s, i) => `${(i / rounds.length) * w},${h - ((s - min) / range) * h}`).join(' ')} fill="none" stroke={d.color} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
            ))}
          </svg>
        </div>
      </div>
    );
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 pb-32">
      {viewMode === 'SETUP' && (
        <div className="animate-in fade-in slide-in-from-bottom-2">
          <div className="fixed top-0 left-0 right-0 p-4 bg-white shadow-sm border-b z-30">
            <div className="relative flex items-center justify-center">
              <h1 className="text-xl font-black text-slate-800">Game Setup</h1>
              <button onClick={() => setViewMode('GRID')} className="absolute right-0 w-10 h-10 bg-slate-100 text-slate-600 rounded-full flex items-center justify-center text-xl active:scale-95 transition">🚀</button>
            </div>
          </div>
          <div className="p-6 pt-[88px]">
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-2 ml-1">Game Title</h2>
            <input type="text" value={gameName} onChange={e => setGameName(e.target.value)} className="text-2xl font-black text-slate-800 border-2 border-slate-200 rounded-xl w-full p-4 bg-white" placeholder="What are we playing?" />
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-2 mt-8 ml-1">Active Roster</h2>
            <div className="flex gap-2 mb-4">
              <input type="text" placeholder="New player name..." className="border-2 border-slate-200 p-3 rounded-xl flex-grow" value={newPlayerName} onChange={e => setNewPlayerName(e.target.value)} />
              <button onClick={addPlayer} className="bg-slate-800 text-white px-5 py-3 rounded-xl font-bold">+ Add</button>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
              {players.map((p, i) => (
                <div key={p.id} className={`flex items-center justify-between p-4 ${i !== players.length - 1 ? 'border-b border-slate-100' : ''}`}>
                  <div className="flex items-center gap-3">
                    <button onClick={() => randomizeEmoji(p.id)} className="w-12 h-12 bg-slate-100 rounded-full text-2xl flex items-center justify-center">{p.emoji}</button>
                    <span className="font-bold text-lg text-slate-700">{p.name}</span>
                  </div>
                  <button onClick={() => removePlayer(p.id)} className="text-slate-300 hover:text-red-500 text-xl">✕</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* --- ACTIVE GAME VIEWS (GRID & GRAPH) --- */}
      {viewMode !== 'SETUP' && (
        <>
          {/* 1. FIXED TOP NAVIGATION (Height is approx 124px) */}
          <div className="fixed top-0 left-0 right-0 p-4 bg-white shadow-sm border-b z-40">
            <div className="flex justify-between items-center mb-4">
              <h1 className="text-2xl font-black text-slate-800 truncate pr-4">{gameName}</h1>
              <button 
                onClick={() => setViewMode('SETUP')} 
                className="w-10 h-10 bg-slate-100 text-slate-600 rounded-full flex items-center justify-center text-xl active:scale-95 transition"
              >
                ⚙️
              </button>
            </div>
            <div className="flex bg-slate-100 p-1 rounded-xl">
              <button 
                onClick={() => setViewMode('GRID')} 
                className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${viewMode === 'GRID' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
              >
                🧮 Score Grid
              </button>
              <button 
                onClick={() => setViewMode('GRAPH')} 
                className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${viewMode === 'GRAPH' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
              >
                📈 Live Graph
              </button>
            </div>
          </div>

          {/* 2. CONTENT WRAPPER: pt-[124px] offsets the fixed header above */}
          <div className="pt-[124px]">
            {viewMode === 'GRID' && (
              /* Removed overflow-x-auto from the immediate parent to fix sticky behavior */
              <div className="animate-in fade-in">
                {players.length === 0 ? (
                  <div className="p-10 text-center text-slate-400">Tap ⚙️ to add players!</div>
                ) : (
                  <table className="w-full text-center border-collapse">
                    {/* 3. STICKY TABLE HEADER: top-[124px] pins it exactly below the nav */}
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
                              <button 
                                onClick={(e) => { e.stopPropagation(); removeRound(round.roundId); }} 
                                className="w-6 h-6 flex items-center justify-center text-slate-300 hover:text-red-500"
                              >
                                ✕
                              </button>
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

                    <tfoot className="bg-slate-800 text-white sticky bottom-0 z-30">
                      <tr>
                        <td className="p-4 font-bold border-r border-slate-700 text-xs uppercase opacity-50">Tot</td>
                        {players.map(p => (
                          <td key={p.id} className="p-4 font-black text-xl">
                            {calculateTotal(p.id)}
                          </td>
                        ))}
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>
            )}
      
            {viewMode === 'GRAPH' && renderLiveGraph()}
            {viewMode === 'GRID' && (
              <div className="p-5 text-center flex flex-col gap-3 max-w-md mx-auto mt-4">
                <button onClick={addRound} className="bg-white border-2 p-3.5 rounded-xl font-bold">+ Add Round</button>
                <button onClick={saveGame} className="bg-slate-900 text-white p-4 rounded-xl font-bold flex items-center justify-center gap-2"><span>💾</span> Save Game</button>
              </div>
            )}
          </div>
        </>
      )}

      {activeCell && viewMode === 'GRID' && (
        <div className="fixed bottom-0 left-0 right-0 bg-white shadow-[0_-10px_40px_rgba(0,0,0,0.1)] border-t-2 p-5 pb-8 z-50">
          <div className="text-center text-5xl font-black mb-5 py-4 bg-slate-50 rounded-2xl shadow-inner">{inputValue}</div>
          <div className="grid grid-cols-3 gap-3">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => <button key={num} onClick={() => setInputValue(p => p === '0' ? num.toString() : p + num)} className="bg-slate-100 py-5 rounded-2xl text-2xl font-semibold active:bg-slate-200">{num}</button>)}
            <button onClick={() => setInputValue(p => p.startsWith('-') ? p.substring(1) : '-' + p)} className="bg-slate-200 py-5 rounded-2xl text-xl font-bold">+/-</button>
            <button onClick={() => setInputValue(p => p === '0' ? '0' : p + '0')} className="bg-slate-100 py-5 rounded-2xl text-2xl font-semibold">0</button>
            <button onClick={() => setInputValue(p => p.slice(0, -1) || '0')} className="bg-red-50 text-red-500 py-5 rounded-2xl text-2xl font-bold">⌫</button>
          </div>
          <button onClick={submitScore} className="w-full mt-4 bg-blue-600 text-white py-5 rounded-2xl text-xl font-bold">Enter Score</button>
        </div>
      )}
    </main>
  );
}
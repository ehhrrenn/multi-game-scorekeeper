// app/roster/[playerId]/page.tsx
'use client';

import { useState, useMemo, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useGameState } from '../../../hooks/useGameState';
import BottomNav from '../../components/BottomNav';
import GameCard, { GameRecord } from '../../components/GameCard';

// --- Types ---
type Player = { id: string; name: string; emoji: string; isTemporary: boolean };

export default function PlayerProfilePage() {
  const params = useParams();
  const router = useRouter();
  
  const playerId = decodeURIComponent(params.playerId as string);

  const [players] = useGameState<Player[]>('scorekeeper_roster', []);
  const [history, setHistory] = useGameState<GameRecord[]>('scorekeeper_history', []);

  // --- HYDRATION FIX: Give useGameState 150ms to pull from LocalStorage ---
  const [isReady, setIsReady] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setIsReady(true), 150);
    return () => clearTimeout(timer);
  }, []);

  const [selectedGame, setSelectedGame] = useState<string>('ALL');
  const [graphMode, setGraphMode] = useState<'TOTAL' | 'PERCENTAGE'>('TOTAL');
  const [timeFilter, setTimeFilter] = useState<'1W' | '1M' | '3M' | '6M' | '1Y' | 'ALL'>('ALL');
  const [expandedGameId, setExpandedGameId] = useState<string | null>(null);

  // --- TYPE FIX: Wrap both IDs in String() to guarantee a match ---
  const player = players.find(p => String(p.id) === String(playerId));

  // --- Filters ---
  const uniqueGames = useMemo(() => Array.from(new Set(history.map(g => g.gameName))), [history]);

  const playerHistory = useMemo(() => {
    return history.filter(g => g.activePlayerIds?.includes(playerId));
  }, [history, playerId]);

  const filteredGames = useMemo(() => {
    return playerHistory.filter(game => selectedGame === 'ALL' || game.gameName === selectedGame);
  }, [playerHistory, selectedGame]);

  // --- Win/Loss Helpers ---
  const getWinnerIds = (game: GameRecord) => {
    const isCountDown = game.settings?.scoreDirection === 'DOWN';
    let bestScore = isCountDown ? Infinity : -Infinity;
    let winners: string[] = [];

    Object.entries(game.finalScores || {}).forEach(([pId, score]) => {
      if (isCountDown ? score < bestScore : score > bestScore) {
        bestScore = score;
        winners = [pId];
      } else if (score === bestScore) {
        winners.push(pId);
      }
    });
    return winners;
  };

  const getLoserIds = (game: GameRecord) => {
    const isCountDown = game.settings?.scoreDirection === 'DOWN';
    let worstScore = isCountDown ? -Infinity : Infinity;
    let losers: string[] = [];

    Object.entries(game.finalScores || {}).forEach(([pId, score]) => {
      if (isCountDown ? score > worstScore : score < worstScore) {
        worstScore = score;
        losers = [pId];
      } else if (score === worstScore) {
        losers.push(pId);
      }
    });
    return losers;
  };

  // --- Hero Stats Calculation ---
  const stats = useMemo(() => {
    let wins = 0;
    let lastPlaces = 0;
    
    filteredGames.forEach(game => {
      if (getWinnerIds(game).includes(playerId)) wins++;
      if (getLoserIds(game).includes(playerId)) lastPlaces++;
    });

    const played = filteredGames.length;
    const winPct = played > 0 ? Math.round((wins / played) * 100) : 0;

    return { played, wins, lastPlaces, winPct };
  }, [filteredGames, playerId]);

  // --- Graph Data Calculation ---
  const graphData = useMemo(() => {
    let chronologicalHistory = [...filteredGames].sort((a, b) => parseInt(a.gameId) - parseInt(b.gameId));

    if (timeFilter !== 'ALL') {
      const now = Date.now();
      const ranges = { '1W': 7, '1M': 30, '3M': 90, '6M': 180, '1Y': 365 };
      const cutoff = now - (ranges[timeFilter] * 24 * 60 * 60 * 1000);
      chronologicalHistory = chronologicalHistory.filter(game => parseInt(game.gameId) >= cutoff);
    }

    let cumulativeWins = 0;
    let gamesPlayedByPlayer = 0;
    const points: number[] = [0]; 

    chronologicalHistory.forEach(game => {
      gamesPlayedByPlayer++;
      if (getWinnerIds(game).includes(playerId)) cumulativeWins++;
      
      if (graphMode === 'TOTAL') {
        points.push(cumulativeWins);
      } else {
        points.push(gamesPlayedByPlayer > 0 ? Math.round((cumulativeWins / gamesPlayedByPlayer) * 100) : 0);
      }
    });

    return points;
  }, [filteredGames, playerId, graphMode, timeFilter]);

  const handleDeleteGame = (gameIdToDelete: string) => {
    setHistory(prev => prev.filter(g => g.gameId !== gameIdToDelete));
    if (expandedGameId === gameIdToDelete) setExpandedGameId(null);
  };

  // 1. Prevent rendering until LocalStorage has fully populated the hook
  if (!isReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 text-slate-400">
        <div className="animate-pulse text-4xl">⏳</div>
      </div>
    );
  }

  // 2. Fallback if the player genuinely doesn't exist
  if (!player) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 text-slate-500 p-4 text-center">
        <div className="text-6xl mb-4">🤷‍♂️</div>
        <h2 className="text-2xl font-black mb-2 text-slate-800 dark:text-slate-200">Player Not Found</h2>
        <p className="mb-6 font-medium text-slate-400">This profile may have been deleted or the URL is incorrect.</p>
        <button onClick={() => router.push('/roster')} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-xl transition-all shadow-md active:scale-95">
          Return to Roster
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-50 pb-32 transition-colors">
      
      {/* Header */}
      <div className="sticky top-0 z-40 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md shadow-sm border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-screen-md mx-auto px-4 h-16 flex items-center gap-3">
          <button onClick={() => router.push('/roster')} className="w-10 h-10 flex items-center justify-center bg-slate-100 dark:bg-slate-800 rounded-full active:scale-95 transition-transform text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
          </button>
          <h1 className="text-xl font-black">Player Dossier</h1>
        </div>
      </div>

      <main className="max-w-screen-md mx-auto p-4 pt-6">
        
        {/* TOP FILTER */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 shadow-sm focus-within:border-blue-500 transition-all mb-6">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Filter Profile Context</label>
          <select value={selectedGame} onChange={(e) => setSelectedGame(e.target.value)} className="w-full bg-transparent font-black text-lg text-slate-800 dark:text-white outline-none appearance-none truncate">
            <option value="ALL">All Games Combined</option>
            {uniqueGames.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>

        {/* HERO CARD & STATS */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col items-center text-center mb-8 relative overflow-hidden">
          <div className="text-6xl mb-3 relative z-10">{player.emoji}</div>
          <h2 className="text-3xl font-black text-slate-800 dark:text-white mb-6 relative z-10">{player.name}</h2>
          
          <div className="grid grid-cols-4 w-full gap-2 relative z-10">
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 flex flex-col items-center justify-center">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Played</span>
              <span className="text-2xl font-black">{stats.played}</span>
            </div>
            <div className="bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded-xl p-3 flex flex-col items-center justify-center border border-emerald-100 dark:border-emerald-800/30">
              <span className="text-[10px] font-bold uppercase tracking-wider mb-1 opacity-80">Wins</span>
              <span className="text-2xl font-black">{stats.wins}</span>
            </div>
            <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl p-3 flex flex-col items-center justify-center border border-red-100 dark:border-red-800/30">
              <span className="text-[10px] font-bold uppercase tracking-wider mb-1 opacity-80">Last</span>
              <span className="text-2xl font-black">{stats.lastPlaces}</span>
            </div>
            <div className="bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-xl p-3 flex flex-col items-center justify-center border border-blue-100 dark:border-blue-800/30">
              <span className="text-[10px] font-bold uppercase tracking-wider mb-1 opacity-80">Win %</span>
              <span className="text-2xl font-black">{stats.winPct}%</span>
            </div>
          </div>
        </div>

        {/* TIMELINE GRAPH */}
        {filteredGames.length > 0 && (
          <div className="mb-8">
            <div className="flex justify-between items-end mb-3 ml-1">
              <h2 className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                Score Trend
              </h2>
              <div className="flex bg-slate-200 dark:bg-slate-800 p-1 rounded-lg">
                <button onClick={() => setGraphMode('TOTAL')} className={`px-2 py-1 rounded-md text-[10px] uppercase font-bold transition-all ${graphMode === 'TOTAL' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}>Wins</button>
                <button onClick={() => setGraphMode('PERCENTAGE')} className={`px-2 py-1 rounded-md text-[10px] uppercase font-bold transition-all ${graphMode === 'PERCENTAGE' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}>Win %</button>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
              
              {/* TIME RANGE TOGGLE */}
              <div className="flex bg-slate-50 dark:bg-slate-950/50 p-1 rounded-lg mb-4 border border-slate-100 dark:border-slate-800 overflow-x-auto scrollbar-hide">
                {['1W', '1M', '3M', '6M', '1Y', 'ALL'].map(tf => (
                  <button 
                    key={tf}
                    onClick={() => setTimeFilter(tf as any)} 
                    className={`flex-1 min-w-[40px] py-1.5 rounded-md text-[10px] font-bold transition-all ${timeFilter === tf ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm border border-slate-200 dark:border-slate-600' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}
                  >
                    {tf === 'ALL' ? 'All Time' : tf}
                  </button>
                ))}
              </div>

              <svg viewBox="-40 -10 500 220" className="w-full h-auto overflow-visible mt-2">
                {(() => {
                  const max = Math.max(...graphData, graphMode === 'PERCENTAGE' ? 100 : 5);
                  const min = 0; 
                  const range = max - min || 1;
                  const xStep = 400 / Math.max(graphData.length - 1, 1);
                  const finalY = 200 - ((graphData[graphData.length - 1] - min) / range) * 200;

                  return (
                    <>
                      {/* Grid Lines */}
                      {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => (
                        <g key={`grid-${i}`}>
                          <line x1="0" y1={200 - (pct * 200)} x2="400" y2={200 - (pct * 200)} stroke="#e2e8f0" strokeDasharray="4" className="dark:stroke-slate-800" />
                          <text x="-8" y={200 - (pct * 200) + 4} fill="#94a3b8" fontSize="10" textAnchor="end" className="dark:fill-slate-600 font-bold">
                            {Math.round(max * pct)}{graphMode === 'PERCENTAGE' ? '%' : ''}
                          </text>
                        </g>
                      ))}
                      
                      {/* Single Player Trend Line */}
                      <polyline 
                        points={graphData.map((val, idx) => `${idx * xStep},${200 - ((val - min) / range) * 200}`).join(' ')} 
                        fill="none" stroke="#3b82f6" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" 
                        className="drop-shadow-md" 
                      />

                      {/* Final Data Label */}
                      {graphData.length > 0 && (
                        <text x="408" y={finalY + 5} fontSize="14" className="font-black" fill="#3b82f6">
                          {graphData[graphData.length - 1]}{graphMode === 'PERCENTAGE' ? '%' : ''}
                        </text>
                      )}
                    </>
                  );
                })()}
              </svg>
            </div>
          </div>
        )}

        <h2 className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3 ml-1">
          {player.name}'s Match Feed
        </h2>
        
        {filteredGames.length === 0 ? (
          <div className="bg-slate-100 dark:bg-slate-800 rounded-2xl p-8 text-center text-slate-500 font-medium border border-slate-200 dark:border-slate-700 border-dashed">
            No games found for this player.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {filteredGames.map((game, index) => (
              <GameCard 
                key={`${game.gameId}-${index}`}
                game={game} 
                isExpanded={expandedGameId === game.gameId}
                onToggle={() => setExpandedGameId(prev => prev === game.gameId ? null : game.gameId)}
                onDelete={handleDeleteGame}
              />
            ))}
          </div>
        )}

      </main>

      <BottomNav />
    </div>
  );
}
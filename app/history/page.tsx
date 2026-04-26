// app/history/page.tsx
'use client';

import { useState, useMemo } from 'react';
import { useGameState } from '../../hooks/useGameState';
import BottomNav from '../components/BottomNav';
import GameCard from '../components/GameCard';

// --- Types ---
type PlayerSnapshot = { id: string; name: string; emoji: string };
type Round = { roundId: number; scores: Record<string, number> };
type GameSettings = { target: number; scoreDirection: 'UP' | 'DOWN' };

type HeroStat = { wins: number; played: number; name: string; emoji: string };
type HeroStatWithPct = HeroStat & { pct: number };
type HeroStats = {
  totalGames: number;
  mostWinsPlayer: HeroStat | null;
  highestWinPctPlayer: HeroStatWithPct | null;
  threshold: number;
};

export type GameRecord = {
  gameId: string;
  date: string;
  gameName: string;
  finalScores: Record<string, number>;
  activePlayerIds: string[];
  savedRounds?: Round[];
  playerSnapshots: PlayerSnapshot[];
  settings?: GameSettings;
};

export default function HistoryPage() {
  const [gameHistory, setGameHistory] = useGameState<GameRecord[]>('scorekeeper_history', []);
  
  // --- Filters & Toggles ---
  const [selectedGame, setSelectedGame] = useState<string>('ALL');
  const [selectedPlayer, setSelectedPlayer] = useState<string>('ALL');
  const [graphMode, setGraphMode] = useState<'TOTAL' | 'PERCENTAGE'>('TOTAL');
  const [timeFilter, setTimeFilter] = useState<'1W' | '1M' | '3M' | '6M' | '1Y' | 'ALL'>('ALL');
  const [expandedGameId, setExpandedGameId] = useState<string | null>(null);

  const uniqueGames = useMemo(() => Array.from(new Set(gameHistory.map(g => g.gameName))), [gameHistory]);
  const uniquePlayers = useMemo(() => {
    const players = new Map<string, PlayerSnapshot>();
    gameHistory.forEach(game => {
      game.playerSnapshots.forEach(p => {
        if (!players.has(p.id)) players.set(p.id, p);
      });
    });
    return Array.from(players.values());
  }, [gameHistory]);

  const filteredHistory = useMemo(() => {
    return gameHistory.filter(game => {
      const matchGame = selectedGame === 'ALL' || game.gameName === selectedGame;
      const matchPlayer = selectedPlayer === 'ALL' || game.activePlayerIds.includes(selectedPlayer);
      return matchGame && matchPlayer;
    });
  }, [gameHistory, selectedGame, selectedPlayer]);

  const getWinnerIds = (game: GameRecord) => {
    const isCountDown = game.settings?.scoreDirection === 'DOWN';
    let bestScore = isCountDown ? Infinity : -Infinity;
    let winners: string[] = [];

    Object.entries(game.finalScores).forEach(([pId, score]) => {
      if (isCountDown ? score < bestScore : score > bestScore) {
        bestScore = score;
        winners = [pId];
      } else if (score === bestScore) {
        winners.push(pId);
      }
    });
    return winners;
  };

  const handleDeleteGame = (gameIdToDelete: string) => {
    setGameHistory(prev => prev.filter(g => g.gameId !== gameIdToDelete));
    if (expandedGameId === gameIdToDelete) setExpandedGameId(null);
  };

  // --- Graph Data Calculation with Time Filter ---
  const graphData = useMemo(() => {
    let chronologicalHistory = [...filteredHistory].sort((a, b) => parseInt(a.gameId) - parseInt(b.gameId));
    
    // Apply Time Filter (gameId is an exact epoch timestamp!)
    if (timeFilter !== 'ALL') {
      const now = Date.now();
      const ranges = { '1W': 7, '1M': 30, '3M': 90, '6M': 180, '1Y': 365 };
      const cutoff = now - (ranges[timeFilter] * 24 * 60 * 60 * 1000);
      chronologicalHistory = chronologicalHistory.filter(game => parseInt(game.gameId) >= cutoff);
    }

    let playersToChart: PlayerSnapshot[] = [];
    if (selectedPlayer !== 'ALL') {
      const p = uniquePlayers.find(p => p.id === selectedPlayer);
      if (p) playersToChart = [p];
    } else {
      const winCounts: Record<string, number> = {};
      chronologicalHistory.forEach(game => {
        getWinnerIds(game).forEach(wId => winCounts[wId] = (winCounts[wId] || 0) + 1);
      });
      const top3Ids = Object.entries(winCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(e => e[0]);
      playersToChart = uniquePlayers.filter(p => top3Ids.includes(p.id));
    }

    return playersToChart.map(player => {
      let cumulativeWins = 0;
      let gamesPlayedByPlayer = 0;
      const points: number[] = [0]; 

      chronologicalHistory.forEach(game => {
        if (game.activePlayerIds.includes(player.id)) {
          gamesPlayedByPlayer++;
          const winners = getWinnerIds(game);
          if (winners.includes(player.id)) cumulativeWins++;
        }
        if (graphMode === 'TOTAL') {
          points.push(cumulativeWins);
        } else {
          points.push(gamesPlayedByPlayer > 0 ? Math.round((cumulativeWins / gamesPlayedByPlayer) * 100) : 0);
        }
      });

      return { ...player, points };
    });
  }, [filteredHistory, selectedPlayer, uniquePlayers, graphMode, timeFilter]);

  const heroStats = useMemo<HeroStats>(() => {
    const totalGames = filteredHistory.length;
    
    const playerStats: Record<string, { wins: number; played: number; name: string; emoji: string }> = {};
    uniquePlayers.forEach(p => { playerStats[p.id] = { wins: 0, played: 0, name: p.name, emoji: p.emoji }; });

    filteredHistory.forEach(game => {
      const winners = getWinnerIds(game);
      game.activePlayerIds.forEach(pId => {
        if (playerStats[pId]) {
          playerStats[pId].played += 1;
          if (winners.includes(pId)) { playerStats[pId].wins += 1; }
        }
      });
    });

    type PlayerStat = { wins: number; played: number; name: string; emoji: string };
    type PlayerStatWithPct = PlayerStat & { pct: number };

    let mostWinsPlayer: PlayerStat | null = null;
    let highestWinPctPlayer: PlayerStatWithPct | null = null;
    
    let maxWins = 0;
    let maxWinPct = -1;

    const threshold = totalGames >= 5 ? 3 : 1;

    Object.values(playerStats).forEach(stat => {
      if (stat.wins > maxWins) {
        maxWins = stat.wins;
        mostWinsPlayer = stat;
      }
      if (stat.played >= threshold) {
        const pct = Math.round((stat.wins / stat.played) * 100);
        if (pct > maxWinPct) {
          maxWinPct = pct;
          highestWinPctPlayer = { ...stat, pct };
        }
      }
    });

    return { totalGames, mostWinsPlayer, highestWinPctPlayer, threshold };
  }, [filteredHistory, uniquePlayers]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-50 pb-32 transition-colors">
      
      <div className="sticky top-0 z-40 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md shadow-sm border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-screen-md mx-auto px-4 h-16 flex items-center justify-between">
          <h1 className="text-2xl font-black">History Vault</h1>
          <span className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-3 py-1 rounded-full text-xs font-bold shadow-inner border border-slate-200 dark:border-slate-700">
            {gameHistory.length} Total Logs
          </span>
        </div>
      </div>

      <main className="max-w-screen-md mx-auto p-4 pt-6">
        
        {/* FILTERS */}
        <div className="flex gap-3 mb-6">
          <div className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 shadow-sm focus-within:border-blue-500 transition-all">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Filter by Game</label>
            <select value={selectedGame} onChange={(e) => setSelectedGame(e.target.value)} className="w-full bg-transparent font-semibold text-slate-800 dark:text-white outline-none appearance-none">
              <option value="ALL">All Games</option>
              {uniqueGames.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>

          <div className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 shadow-sm focus-within:border-blue-500 transition-all">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Filter by Player</label>
            <select value={selectedPlayer} onChange={(e) => setSelectedPlayer(e.target.value)} className="w-full bg-transparent font-semibold text-slate-800 dark:text-white outline-none appearance-none truncate">
              <option value="ALL">All Players</option>
              {uniquePlayers.map(p => <option key={p.id} value={p.id}>{p.emoji} {p.name}</option>)}
            </select>
          </div>
        </div>

        {/* COMPACTED 3-COLUMN HERO STATS */}
        <div className="grid grid-cols-3 gap-2 mb-8">
          
          <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-3 text-white shadow-md shadow-blue-500/20 flex flex-col justify-between relative overflow-hidden">
            <div className="text-blue-100 text-[10px] font-bold uppercase tracking-wider mb-2 relative z-10">Games</div>
            <div className="text-3xl font-black relative z-10">{heroStats.totalGames}</div>
            <div className="text-5xl opacity-20 absolute -right-2 -bottom-2 mix-blend-overlay">🎮</div>
          </div>
          
          <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl p-3 text-white shadow-md shadow-emerald-500/20 flex flex-col justify-between relative overflow-hidden">
            <div className="text-emerald-100 text-[10px] font-bold uppercase tracking-wider mb-1 relative z-10">Most Wins</div>
            {heroStats.mostWinsPlayer ? (
               <div className="relative z-10">
                 <div className="font-bold truncate text-xs leading-tight mb-0.5">{heroStats.mostWinsPlayer?.emoji} {heroStats.mostWinsPlayer?.name}</div>
                 <div className="text-2xl font-black">{heroStats.mostWinsPlayer?.wins}</div>
               </div>
            ) : (
               <div className="text-xs font-medium opacity-70 relative z-10">No wins</div>
            )}
             <div className="text-5xl opacity-20 absolute -right-2 -bottom-2 mix-blend-overlay">🏆</div>
          </div>

          <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl p-3 text-white shadow-md shadow-purple-500/20 flex flex-col justify-between relative overflow-hidden">
            <div className="text-purple-100 text-[10px] font-bold uppercase tracking-wider mb-1 relative z-10">Highest %</div>
            {heroStats.highestWinPctPlayer ? (
               <div className="relative z-10">
                 <div className="font-bold truncate text-xs leading-tight mb-0.5">{heroStats.highestWinPctPlayer?.emoji} {heroStats.highestWinPctPlayer?.name}</div>
                 <div className="text-2xl font-black">{heroStats.highestWinPctPlayer?.pct}%</div>
               </div>
            ) : (
               <div className="text-[10px] font-medium opacity-70 relative z-10 pr-2">Min {heroStats.threshold} required</div>
            )}
            <div className="text-5xl opacity-20 absolute -right-2 -bottom-2 mix-blend-overlay">📈</div>
          </div>

        </div>

        {/* TIMELINE WINS GRAPH */}
        {filteredHistory.length > 0 && (
          <div className="mb-8">
            <div className="flex justify-between items-end mb-3 ml-1">
              <h2 className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                {selectedPlayer === 'ALL' ? 'Top 3 Players Timeline' : 'Player Trajectory'}
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

              {/* EXPANDED VIEWBOX FIX: -40 X offset ensures 100% axis isn't cut off */}
              <svg viewBox="-40 -10 500 220" className="w-full h-auto overflow-visible">
                {(() => {
                  const allScores = graphData.flatMap(d => d.points);
                  const max = Math.max(...allScores, graphMode === 'PERCENTAGE' ? 100 : 5);
                  const min = 0; 
                  const range = max - min || 1;
                  const xStep = 400 / Math.max(graphData[0]?.points.length - 1 || 1, 1);
                  
                  const labelData = graphData.map((d, i) => {
                    const finalY = 200 - ((d.points[d.points.length - 1] - min) / range) * 200;
                    return { ...d, targetY: finalY, index: i };
                  }).sort((a, b) => a.targetY - b.targetY);
                  
                  for (let i = 1; i < labelData.length; i++) {
                    if (labelData[i].targetY - labelData[i - 1].targetY < 20) {
                      labelData[i].targetY = labelData[i - 1].targetY + 20;
                    }
                  }

                  const colors = ['#3b82f6', '#ec4899', '#22c55e', '#f97316', '#a855f7'];

                  return (
                    <>
                      {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => (
                        <g key={`grid-${i}`}>
                          <line x1="0" y1={200 - (pct * 200)} x2="400" y2={200 - (pct * 200)} stroke="#e2e8f0" strokeDasharray="4" className="dark:stroke-slate-800" />
                          <text x="-8" y={200 - (pct * 200) + 4} fill="#94a3b8" fontSize="10" textAnchor="end" className="dark:fill-slate-600 font-bold">
                            {Math.round(max * pct)}{graphMode === 'PERCENTAGE' ? '%' : ''}
                          </text>
                        </g>
                      ))}
                      
                      {graphData.map((d, i) => (
                        <polyline 
                          key={`line-${d.id}`} 
                          points={d.points.map((val, idx) => `${idx * xStep},${200 - ((val - min) / range) * 200}`).join(' ')} 
                          fill="none" stroke={colors[i % colors.length]} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" 
                          className="drop-shadow-sm" 
                        />
                      ))}

                      {labelData.map((d, i) => (
                         <text key={`label-${d.id}`} x="408" y={d.targetY + 5} fontSize="12" className="font-bold" fill={colors[i % colors.length]}>
                           {d.emoji} {d.name.substring(0,6)}
                         </text>
                      ))}
                    </>
                  );
                })()}
              </svg>
            </div>
          </div>
        )}

        <h2 className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3 ml-1">
          Match Feed
        </h2>
        
        {filteredHistory.length === 0 ? (
          <div className="bg-slate-100 dark:bg-slate-800 rounded-2xl p-8 text-center text-slate-500 font-medium border border-slate-200 dark:border-slate-700 border-dashed">
            No games found for this filter combination.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {filteredHistory.map((game, index) => (
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
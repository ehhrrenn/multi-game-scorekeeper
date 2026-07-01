// app/history/page.tsx
'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { collection, deleteDoc, doc, getDocs } from 'firebase/firestore';
import { formatFirstName } from '../../lib/cloudPlayers';
import { db } from '../../lib/firebase';
import { useGameState } from '../../hooks/useGameState';
import { useAuth } from '../../hooks/useAuth';
import {
  getWinnerIdsForRecord,
  inferHasBuiltInEndRule,
  isGameCompleted,
  saveGameRecordToCloud,
  type GameRecord,
} from '../../lib/gameHistory';
import BottomNav from '../components/BottomNav';
import GameCard from '../components/GameCard';

// --- Types ---
type PlayerSnapshot = { id: string; name: string; emoji: string; photoURL?: string; isCloudUser?: boolean; useCustomEmoji?: boolean };

type HeroStat = { wins: number; played: number; name: string; emoji: string; photoURL?: string };
type HeroStatWithPct = HeroStat & { pct: number };
type HeroStats = {
  totalGames: number;
  mostWinsPlayer: HeroStat | null;
  highestWinPctPlayer: HeroStatWithPct | null;
  threshold: number;
};

const TIME_FILTERS: Array<'1W' | '1M' | '3M' | '6M' | '1Y' | 'ALL'> = ['1W', '1M', '3M', '6M', '1Y', 'ALL'];

export default function HistoryPage() {
  // 1. Cloud State
  const [cloudHistory, setCloudHistory] = useState<GameRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // 2. Local State (Legacy Fallback)
  const [localHistory, setLocalHistory] = useGameState<GameRecord[]>('scorekeeper_history', []);
  const { user, loading: authLoading } = useAuth();

  // --- Filters & Toggles ---
  const [selectedGame, setSelectedGame] = useState<string>('ALL');
  const [selectedPlayer, setSelectedPlayer] = useState<string>('ALL');
  const [graphMode, setGraphMode] = useState<'TOTAL' | 'PERCENTAGE'>('TOTAL');
  const [timeFilter, setTimeFilter] = useState<'1W' | '1M' | '3M' | '6M' | '1Y' | 'ALL'>('ALL');
  const [expandedGameId, setExpandedGameId] = useState<string | null>(null);

  // 3. Fetch from Firestore
  useEffect(() => {
    async function fetchCloudHistory() {
      if (authLoading) {
        return;
      }

      if (!db || !user) {
        setCloudHistory([]);
        setLoading(false);
        return;
      }

      try {
        const gamesSnapshot = await getDocs(collection(db, 'Games'));
        const fetchedGames = gamesSnapshot.docs.map(doc => doc.data() as GameRecord);
        setCloudHistory(fetchedGames);
      } catch (error) {
        console.error("Error fetching games from Firebase:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchCloudHistory();
  }, [authLoading, user]);

  // 4. Merge Data Models safely
  const allHistory = useMemo(() => {
    const combined = [...localHistory, ...cloudHistory].map(game => ({
      ...game,
      // Sanitize corrupted arrays from past merges
      activePlayerIds: Array.from(new Set(game.activePlayerIds))
    }));
    
    // Deduplicate by gameId and sort by date (Newest first for the feed)
    return Array.from(new Map(combined.map(h => [h.gameId, h])).values())
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [localHistory, cloudHistory]);

  const uniqueGames = useMemo(() => Array.from(new Set(allHistory.map(g => g.gameName))), [allHistory]);
  const uniquePlayers = useMemo(() => {
    const players = new Map<string, PlayerSnapshot>();
    allHistory.forEach(game => {
      game.playerSnapshots?.forEach(p => {
        if (!players.has(p.id)) players.set(p.id, p);
      });
    });
    return Array.from(players.values());
  }, [allHistory]);

  const filteredHistory = useMemo(() => {
    return allHistory.filter(game => {
      const matchGame = selectedGame === 'ALL' || game.gameName === selectedGame;
      const matchPlayer = selectedPlayer === 'ALL' || game.activePlayerIds.includes(selectedPlayer);
      return matchGame && matchPlayer;
    });
  }, [allHistory, selectedGame, selectedPlayer]);

  const getScoreDirectionForGame = useCallback((game: GameRecord): 'UP' | 'DOWN' => {
    if (game.settings?.scoreDirection) {
      return game.settings.scoreDirection;
    }

    if (game.winCondition === 'LOW') {
      return 'DOWN';
    }

    return 'UP';
  }, []);

  const getWinnerIds = useCallback((game: GameRecord) => {
    if (!isGameCompleted(game)) {
      return [];
    }

    if (game.winnerIds?.length) {
      return game.winnerIds;
    }

    return getWinnerIdsForRecord(game, getScoreDirectionForGame(game));
  }, [getScoreDirectionForGame]);

  const handleFinishGame = async (gameToFinish: GameRecord) => {
    const scoreDirection = getScoreDirectionForGame(gameToFinish);
    const completedRecord: GameRecord = {
      ...gameToFinish,
      settings: {
        target: gameToFinish.settings?.target || 0,
        scoreDirection,
      },
      status: 'COMPLETED',
      completedAt: new Date().toISOString(),
      completedReason: 'MANUAL_FINISH',
      winnerIds: getWinnerIdsForRecord(gameToFinish, scoreDirection),
      hasBuiltInEndRule: inferHasBuiltInEndRule(gameToFinish),
    };

    setLocalHistory((prev) => prev.map((game) => (game.gameId === completedRecord.gameId ? completedRecord : game)));
    setCloudHistory((prev) => prev.map((game) => (game.gameId === completedRecord.gameId ? completedRecord : game)));

    if (!db) {
      return;
    }

    try {
      await saveGameRecordToCloud(db, completedRecord);
    } catch (error) {
      console.error('Error finalizing game in cloud:', error);
    }
  };

  const handleDeleteGame = async (gameIdToDelete: string) => {
    setLocalHistory(prev => prev.filter(g => g.gameId !== gameIdToDelete));
    setCloudHistory(prev => prev.filter(g => g.gameId !== gameIdToDelete));
    if (expandedGameId === gameIdToDelete) setExpandedGameId(null);

    if (!db) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'Games', gameIdToDelete));
    } catch (error) {
      console.error('Error deleting game from cloud:', error);
    }
  };

  // --- Graph Data Calculation with Time Filter ---
  const graphData = useMemo(() => {
    // Note: We parse the game.date instead of game.gameId to support Cloud String IDs safely
    let chronologicalHistory = [...filteredHistory].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    // Apply Time Filter
    if (timeFilter !== 'ALL') {
      const now = chronologicalHistory.length
        ? Math.max(...chronologicalHistory.map((game) => new Date(game.date).getTime()))
        : 0;
      const ranges = { '1W': 7, '1M': 30, '3M': 90, '6M': 180, '1Y': 365 };
      const cutoff = now - (ranges[timeFilter] * 24 * 60 * 60 * 1000);
      chronologicalHistory = chronologicalHistory.filter(game => new Date(game.date).getTime() >= cutoff);
    }

    let playersToChart: PlayerSnapshot[] = [];
    if (selectedPlayer !== 'ALL') {
      const p = uniquePlayers.find(p => p.id === selectedPlayer);
      if (p) playersToChart = [p];
    } else {
      const winCounts: Record<string, number> = {};
      chronologicalHistory.forEach(game => {
        if (!isGameCompleted(game)) {
          return;
        }
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
        if (isGameCompleted(game) && game.activePlayerIds.includes(player.id)) {
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
  }, [filteredHistory, getWinnerIds, graphMode, selectedPlayer, timeFilter, uniquePlayers]);

  const heroStats = useMemo<HeroStats>(() => {
    const totalGames = filteredHistory.length;
    
    const playerStats: Record<string, HeroStat> = {};
    uniquePlayers.forEach(p => { playerStats[p.id] = { wins: 0, played: 0, name: p.name, emoji: p.emoji, photoURL: p.photoURL }; });

    filteredHistory.forEach(game => {
      if (!isGameCompleted(game)) {
        return;
      }

      const winners = getWinnerIds(game);
      game.activePlayerIds.forEach(pId => {
        if (playerStats[pId]) {
          playerStats[pId].played += 1;
          if (winners.includes(pId)) { playerStats[pId].wins += 1; }
        }
      });
    });

    let mostWinsPlayer: HeroStat | null = null;
    let highestWinPctPlayer: HeroStatWithPct | null = null;
    
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
  }, [filteredHistory, getWinnerIds, uniquePlayers]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen bg-[#f6f6f2] text-[#111]">
        <div className="h-12 w-12 border-2 border-black border-t-transparent animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f6f6f2] text-[#111] pb-32 transition-colors newsprint-page">

      <div className="sticky top-0 z-40 bg-[#fbfbf8]/95 backdrop-blur-md border-b border-black/20">
        <div className="max-w-screen-md mx-auto px-4 h-16 flex items-center justify-between">
          <h1 className="text-2xl font-black tracking-tight [font-family:Georgia,'Times_New_Roman',serif]">History Vault</h1>
          <span className="bg-white text-black px-3 py-1 rounded-none text-xs font-bold border border-black/20 uppercase tracking-[0.18em]">
            {allHistory.length} Total Games
          </span>
        </div>
      </div>

      <main className="max-w-screen-md mx-auto p-4 pt-6">

        {/* FILTERS */}
        {allHistory.length > 0 && (
          <div className="flex gap-3 mb-6">
            <div className="flex-1 bg-white border border-black/20 rounded-none px-3 py-2">
              <label className="text-[10px] font-bold text-black/55 uppercase tracking-wider block mb-1">Filter by Game</label>
              <select value={selectedGame} onChange={(e) => setSelectedGame(e.target.value)} className="w-full bg-transparent font-bold text-black outline-none appearance-none">
                <option value="ALL">All Games</option>
                {uniqueGames.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>

            <div className="flex-1 bg-white border border-black/20 rounded-none px-3 py-2">
              <label className="text-[10px] font-bold text-black/55 uppercase tracking-wider block mb-1">Filter by Player</label>
                <select
                  value={selectedPlayer}
                  onChange={e => setSelectedPlayer(e.target.value)}
                  className="w-full bg-transparent font-bold text-black outline-none appearance-none"
                >
                  <option value="ALL">All Players</option>
                  {/* Replace the complex avatar logic with a simple text-only fallback for the dropdown */}
                  {uniquePlayers.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.isCloudUser && p.photoURL && !p.useCustomEmoji ? '☞' : (p.emoji || '☞')} {p.isCloudUser ? formatFirstName(p.name) : p.name}
                    </option>
                  ))}
                </select>
            </div>
          </div>
        )}

        {/* 3-COLUMN HERO STAT PILLARS */}
        <div className="bg-[#fbfbf8] border border-black/20 rounded-none p-5 mb-8 grid grid-cols-3 gap-3 text-center">

          <div>
            <div className="text-2xl mb-1">✶</div>
            <div className="font-black text-2xl text-black leading-none">{heroStats.totalGames}</div>
            <div className="text-[9px] font-bold text-black/55 uppercase tracking-widest mt-2">Games</div>
          </div>

          <div className="border-l border-black/10">
            {heroStats.mostWinsPlayer ? (
              <>
                <div className="w-9 h-9 mx-auto mb-1 rounded-full overflow-hidden border border-black/20 bg-white flex items-center justify-center text-lg">
                  {heroStats.mostWinsPlayer.photoURL ? (
                    <Image src={heroStats.mostWinsPlayer.photoURL} alt="" width={36} height={36} unoptimized className="w-full h-full object-cover" />
                  ) : (
                    <span>{heroStats.mostWinsPlayer.emoji}</span>
                  )}
                </div>
                <div className="font-black text-2xl text-black leading-none">{heroStats.mostWinsPlayer.wins}</div>
                <div className="text-[9px] font-bold text-black/45 truncate mt-0.5">{heroStats.mostWinsPlayer.name.substring(0,10)}</div>
              </>
            ) : (
              <>
                <div className="text-2xl mb-1 opacity-30">✪</div>
                <div className="font-black text-2xl text-black/25 leading-none">—</div>
              </>
            )}
            <div className="text-[9px] font-bold text-black/55 uppercase tracking-widest mt-2">Most Wins</div>
          </div>

          <div className="border-l border-black/10">
            {heroStats.highestWinPctPlayer ? (
              <>
                <div className="w-9 h-9 mx-auto mb-1 rounded-full overflow-hidden border border-black/20 bg-white flex items-center justify-center text-lg">
                  {heroStats.highestWinPctPlayer.photoURL ? (
                    <Image src={heroStats.highestWinPctPlayer.photoURL} alt="" width={36} height={36} unoptimized className="w-full h-full object-cover" />
                  ) : (
                    <span>{heroStats.highestWinPctPlayer.emoji}</span>
                  )}
                </div>
                <div className="font-black text-2xl text-black leading-none">{heroStats.highestWinPctPlayer.pct}%</div>
                <div className="text-[9px] font-bold text-black/45 truncate mt-0.5">{heroStats.highestWinPctPlayer.name.substring(0,10)}</div>
              </>
            ) : (
              <>
                <div className="text-2xl mb-1 opacity-30">✷</div>
                <div className="text-[9px] font-bold text-black/40 leading-tight mt-1">Min {heroStats.threshold} required</div>
              </>
            )}
            <div className="text-[9px] font-bold text-black/55 uppercase tracking-widest mt-2">Highest %</div>
          </div>

        </div>

        {/* TIMELINE WINS GRAPH */}
        {filteredHistory.length > 0 && (
          <div className="mb-8">
            <div className="flex justify-between items-end mb-3 ml-1">
              <h2 className="text-xs font-black text-black/55 uppercase tracking-[0.18em]">
                {selectedPlayer === 'ALL' ? 'Top 3 Players Timeline' : 'Player Trajectory'}
              </h2>

              <div className="flex border border-black/20">
                <button onClick={() => setGraphMode('TOTAL')} className={`px-3 py-1 text-[10px] uppercase font-bold tracking-wider transition-all ${graphMode === 'TOTAL' ? 'bg-black text-white' : 'text-black/55 hover:bg-black/5'}`}>Wins</button>
                <button onClick={() => setGraphMode('PERCENTAGE')} className={`px-3 py-1 text-[10px] uppercase font-bold tracking-wider transition-all border-l border-black/20 ${graphMode === 'PERCENTAGE' ? 'bg-black text-white' : 'text-black/55 hover:bg-black/5'}`}>Win %</button>
              </div>
            </div>

            <div className="bg-[#fbfbf8] p-4 border border-black/20 rounded-none overflow-hidden">

              {/* TIME RANGE TOGGLE */}
              <div className="flex border border-black/20 mb-4 overflow-x-auto scrollbar-hide">
                {TIME_FILTERS.map((tf, i) => (
                  <button
                    key={tf}
                    onClick={() => setTimeFilter(tf)}
                    className={`flex-1 min-w-[44px] py-1.5 text-[10px] font-bold uppercase tracking-wider transition-all ${i > 0 ? 'border-l border-black/20' : ''} ${timeFilter === tf ? 'bg-black text-white' : 'text-black/55 hover:bg-black/5'}`}
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
                          <line x1="0" y1={200 - (pct * 200)} x2="400" y2={200 - (pct * 200)} stroke="rgba(0,0,0,0.12)" strokeDasharray="4" />
                          <text x="-8" y={200 - (pct * 200) + 4} fill="rgba(0,0,0,0.45)" fontSize="10" textAnchor="end" className="font-bold">
                            {Math.round(max * pct)}{graphMode === 'PERCENTAGE' ? '%' : ''}
                          </text>
                        </g>
                      ))}

                      {graphData.map((d, i) => (
                        <polyline
                          key={`line-${d.id}`}
                          points={d.points.map((val, idx) => `${idx * xStep},${200 - ((val - min) / range) * 200}`).join(' ')}
                          fill="none" stroke={colors[i % colors.length]} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"
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

        <h2 className="text-xs font-black text-black/55 uppercase tracking-[0.18em] mb-3 ml-1">
          Match Feed
        </h2>

        {filteredHistory.length === 0 ? (
          <div className="bg-[#fbfbf8] rounded-none p-8 text-center text-black/55 font-medium border border-black/20 border-dashed">
            {allHistory.length === 0 ? 'No games found in the vault.' : 'No games found for this filter combination.'}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {filteredHistory.map((game, index) => (
              <GameCard
                key={`${game.gameId}-${index}`}
                game={game}
                winnerIds={getWinnerIds(game)}
                isComplete={isGameCompleted(game)}
                canFinish={!inferHasBuiltInEndRule(game) && !isGameCompleted(game)}
                isExpanded={expandedGameId === game.gameId}
                onToggle={() => setExpandedGameId(prev => prev === game.gameId ? null : game.gameId)}
                onDelete={handleDeleteGame}
                onFinish={() => void handleFinishGame(game)}
              />
            ))}
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
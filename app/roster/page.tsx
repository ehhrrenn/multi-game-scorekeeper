// app/roster/page.tsx
'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useGameState } from '../../hooks/useGameState';

// --- Types ---
type Player = { id: string; name: string; emoji: string };
type Round = { roundId: number; scores: Record<string, number> };
type PlayerSnapshot = { id: string; name: string; emoji: string };
type GameProfile = { name: string; winCondition: 'HIGH' | 'LOW'; scoreDirection: 'UP' | 'DOWN' };
type GameSettings = { target: number };

type MatchRecord = {
  matchId: string;
  date: string;
  gameName: string;
  finalScores: Record<string, number>;
  activePlayerIds: string[];
  savedRounds: Round[];
  playerSnapshots: PlayerSnapshot[];
  settings?: GameSettings;
};

type PlayerStats = {
  playerId: string;
  name: string;
  emoji: string;
  gamesPlayed: number;
  wins: number;
  winRate: number;
  totalPoints: number;
  avgPoints: number;
  bestScore: number;
};

export default function RosterPage() {
  const [players] = useGameState<Player[]>('scorekeeper_global_roster', []);
  const [history] = useGameState<MatchRecord[]>('scorekeeper_history', []);
  const [gameProfiles] = useGameState<GameProfile[]>('scorekeeper_game_profiles', [{ name: 'Custom Game', winCondition: 'HIGH', scoreDirection: 'UP' }]);

  // --- Analytics Engine ---
  const stats = useMemo<PlayerStats[]>(() => {
    const map = new Map<string, PlayerStats>();

    // Seed with current roster
    players.forEach(p => {
      map.set(p.id, {
        playerId: p.id,
        name: p.name,
        emoji: p.emoji,
        gamesPlayed: 0,
        wins: 0,
        winRate: 0,
        totalPoints: 0,
        avgPoints: 0,
        bestScore: -Infinity
      });
    });

    // Process Match History
    history.forEach(match => {
      const profile = gameProfiles.find(p => p.name === match.gameName) || { winCondition: 'HIGH' };
      const isLowWin = profile.winCondition === 'LOW';
      
      let matchWinnerId: string | null = null;
      let winningScore = isLowWin ? Infinity : -Infinity;

      // Determine winner for this specific match
      Object.entries(match.finalScores).forEach(([pId, score]) => {
        if (isLowWin ? score < winningScore : score > winningScore) {
          winningScore = score;
          matchWinnerId = pId;
        }
      });

      // Update Player Stats
      Object.entries(match.finalScores).forEach(([pId, score]) => {
        const playerStat = map.get(pId);
        if (playerStat) {
          playerStat.gamesPlayed += 1;
          playerStat.totalPoints += score;
          if (pId === matchWinnerId) playerStat.wins += 1;
          
          // For global best, we track their highest numerical output
          if (score > playerStat.bestScore) playerStat.bestScore = score;
        }
      });
    });

    // Finalize Averages & Rates
    return Array.from(map.values())
      .map(p => ({
        ...p,
        winRate: p.gamesPlayed > 0 ? p.wins / p.gamesPlayed : 0,
        avgPoints: p.gamesPlayed > 0 ? p.totalPoints / p.gamesPlayed : 0,
        bestScore: p.bestScore === -Infinity ? 0 : p.bestScore
      }))
      .sort((a, b) => b.gamesPlayed - a.gamesPlayed || b.wins - a.wins); // Sort by most active
  }, [players, history, gameProfiles]);

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-50 pb-32 transition-colors">
      
      {/* UNIFIED HEADER */}
      <div className="fixed top-0 left-0 right-0 h-16 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md shadow-sm border-b border-slate-200 dark:border-slate-800 z-40 flex items-center justify-between px-4 max-w-screen-md mx-auto">
        <h1 className="text-2xl font-black text-slate-800 dark:text-white">Player Roster</h1>
        <div className="text-sm font-bold text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-full">
          {players.length} Players
        </div>
      </div>

      <div className="pt-[88px] px-4 max-w-screen-md mx-auto animate-in fade-in slide-in-from-bottom-2">
        {stats.length === 0 ? (
          <div className="text-center p-10 bg-white dark:bg-slate-900 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-800 mt-10 shadow-sm">
            <div className="text-4xl mb-3 opacity-50">👥</div>
            <h2 className="text-xl font-bold text-slate-700 dark:text-slate-200">No Players Yet</h2>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-2">Players added during Game Setup will appear here automatically.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {stats.map(p => (
              <Link 
                href={`/roster/${p.playerId}`} 
                key={p.playerId}
                className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between gap-4 active:scale-[0.98] transition hover:border-blue-300 dark:hover:border-blue-700"
              >
                <div className="flex items-center gap-3">
                  {/* High Contrast Emoji Wrapper */}
                  <div className="w-12 h-12 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50 rounded-full flex items-center justify-center text-2xl shadow-sm dark:shadow-none">
                    {p.emoji}
                  </div>
                  <div>
                    <div className="text-lg font-black text-slate-800 dark:text-slate-100">{p.name}</div>
                    <div className="text-xs text-slate-400 dark:text-slate-500 font-bold">
                      {p.gamesPlayed} games • {p.wins} wins • {(p.winRate * 100).toFixed(0)}%
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 text-center">
                  <div className="hidden sm:block">
                    <div className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase">Total</div>
                    <div className="font-black text-slate-800 dark:text-slate-200">{p.totalPoints}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase">Avg</div>
                    <div className="font-black text-slate-800 dark:text-slate-200">{p.avgPoints.toFixed(0)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase">Best</div>
                    <div className="font-black text-slate-800 dark:text-slate-200">{p.bestScore}</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
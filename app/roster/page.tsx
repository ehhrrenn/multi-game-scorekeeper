// app/roster/page.tsx
'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useGameState } from '../../hooks/useGameState';

// --- Types ---
type Player = { id: string; name: string; emoji: string };
type PlayerSnapshot = { id: string; name: string; emoji: string };
type Round = { roundId: number; scores: Record<string, number> };

type MatchRecord = {
  matchId: string;
  date: string;
  gameName: string;
  winnerId: string | null;
  finalScores: Record<string, number>;
  activePlayerIds: string[];
  savedRounds: Round[];
  playerSnapshots?: PlayerSnapshot[];
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
  const [players] = useGameState<Player[]>('scorekeeper_players', []);
  const [history] = useGameState<MatchRecord[]>('scorekeeper_history', []);

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
        bestScore: 0,
      });
    });

    history.forEach(match => {
      const participants =
        match.playerSnapshots ??
        players.filter(p => match.activePlayerIds.includes(p.id));

      participants.forEach(p => {
        if (!map.has(p.id)) {
          map.set(p.id, {
            playerId: p.id,
            name: p.name,
            emoji: p.emoji,
            gamesPlayed: 0,
            wins: 0,
            winRate: 0,
            totalPoints: 0,
            avgPoints: 0,
            bestScore: 0,
          });
        }

        const stat = map.get(p.id)!;
        const score = match.finalScores[p.id] ?? 0;

        stat.gamesPlayed += 1;
        stat.totalPoints += score;
        stat.bestScore = Math.max(stat.bestScore, score);
        if (match.winnerId === p.id) stat.wins += 1;
      });
    });

    map.forEach(stat => {
      stat.avgPoints = stat.gamesPlayed ? stat.totalPoints / stat.gamesPlayed : 0;
      stat.winRate = stat.gamesPlayed ? stat.wins / stat.gamesPlayed : 0;
    });

    return Array.from(map.values()).sort(
      (a, b) => b.gamesPlayed - a.gamesPlayed || b.winRate - a.winRate
    );
  }, [players, history]);

  return (
    <main className="min-h-screen p-6 pb-32">
      <header className="mb-8 mt-4">
        <h1 className="text-3xl font-black text-slate-800">Roster</h1>
        <p className="text-slate-500 mt-1">All players and lifetime performance.</p>
      </header>

      {stats.length === 0 ? (
        <div className="bg-slate-100 border-2 border-dashed border-slate-200 rounded-3xl p-10 text-center">
          <div className="text-5xl mb-4 opacity-50">👥</div>
          <h3 className="text-xl font-bold text-slate-700 mb-2">No players yet</h3>
          <p className="text-slate-500">Add players in a game to start tracking stats.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {stats.map(p => (
            <Link
              key={p.playerId}
              href={`/roster/${p.playerId}`}
              className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between gap-4 active:scale-[0.98] transition"
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center text-2xl">
                  {p.emoji}
                </div>
                <div>
                  <div className="text-lg font-black text-slate-800">{p.name}</div>
                  <div className="text-xs text-slate-400 font-bold">
                    {p.gamesPlayed} games • {p.wins} wins • {(p.winRate * 100).toFixed(0)}%
                  </div>
                </div>
              </div>

              <div className="flex gap-3 text-center">
                <div>
                  <div className="text-[10px] text-slate-400 font-bold uppercase">Total</div>
                  <div className="font-black text-slate-800">{p.totalPoints}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 font-bold uppercase">Avg</div>
                  <div className="font-black text-slate-800">{p.avgPoints.toFixed(1)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 font-bold uppercase">Best</div>
                  <div className="font-black text-slate-800">{p.bestScore}</div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
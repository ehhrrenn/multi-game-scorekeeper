// app/roster/[playerId]/page.tsx
'use client';

import { useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useGameState } from '../../../hooks/useGameState';

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

function rankInMatch(match: MatchRecord, playerId: string): number | null {
  const sorted = Object.entries(match.finalScores)
    .sort(([, a], [, b]) => b - a)
    .map(([id]) => id);

  const index = sorted.indexOf(playerId);
  return index === -1 ? null : index + 1;
}

export default function PlayerDetailPage() {
  const { playerId } = useParams<{ playerId: string }>();
  const router = useRouter();

  const [players] = useGameState<Player[]>('scorekeeper_players', []);
  const [history] = useGameState<MatchRecord[]>('scorekeeper_history', []);

  const rosterPlayer = players.find(p => p.id === playerId);

  const games = useMemo(() => {
    return history
      .filter(match =>
        match.playerSnapshots
          ? match.playerSnapshots.some(p => p.id === playerId)
          : match.activePlayerIds.includes(playerId)
      )
      .map(match => {
        const snapshot =
          match.playerSnapshots?.find(p => p.id === playerId) ??
          rosterPlayer ??
          { id: playerId, name: 'Unknown', emoji: '❓' };

        const score = match.finalScores[playerId] ?? 0;

        return {
          matchId: match.matchId,
          date: match.date,
          gameName: match.gameName,
          score,
          rank: rankInMatch(match, playerId),
          winner: match.winnerId === playerId,
          snapshot,
        };
      });
  }, [history, playerId, rosterPlayer]);

  const stats = useMemo(() => {
    const gamesPlayed = games.length;
    const wins = games.filter(g => g.winner).length;
    const totalPoints = games.reduce((sum, g) => sum + g.score, 0);
    const bestScore = games.reduce((max, g) => Math.max(max, g.score), 0);
    const avgPoints = gamesPlayed ? totalPoints / gamesPlayed : 0;
    const winRate = gamesPlayed ? wins / gamesPlayed : 0;

    return { gamesPlayed, wins, totalPoints, bestScore, avgPoints, winRate };
  }, [games]);

  const graphData = useMemo(() => {
    let runningTotal = 0;
    return games.map(g => {
      runningTotal += g.score;
      return runningTotal;
    });
  }, [games]);

  if (!rosterPlayer && games.length === 0) {
    return (
      <main className="min-h-screen p-6 pb-32 text-center">
        <div className="text-5xl mb-4">❓</div>
        <h2 className="text-xl font-bold mb-2">Player not found</h2>
        <button
          onClick={() => router.push('/roster')}
          className="text-blue-600 font-bold"
        >
          Back to Roster
        </button>
      </main>
    );
  }

  const display = games[0]?.snapshot ?? rosterPlayer!;

  // Graph layout
  const width = 400;
  const height = 200;
  const max = Math.max(...graphData, 10);
  const min = Math.min(...graphData, 0);
  const range = max - min || 1;

  return (
    <main className="min-h-screen p-6 pb-32">
      {/* Player Card */}
      <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center text-3xl">
            {display.emoji}
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-800">
              {display.name}
            </h1>
            <p className="text-slate-500">
              {stats.gamesPlayed} games • {stats.wins} wins • {(stats.winRate * 100).toFixed(0)}%
            </p>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="mt-6 grid grid-cols-2 gap-3">
          <div className="bg-slate-50 rounded-xl p-4">
            <div className="text-xs font-bold text-slate-400 uppercase">Total Points</div>
            <div className="text-2xl font-black">{stats.totalPoints}</div>
          </div>
          <div className="bg-slate-50 rounded-xl p-4">
            <div className="text-xs font-bold text-slate-400 uppercase">Best Game</div>
            <div className="text-2xl font-black">{stats.bestScore}</div>
          </div>
          <div className="bg-slate-50 rounded-xl p-4">
            <div className="text-xs font-bold text-slate-400 uppercase">Avg / Game</div>
            <div className="text-2xl font-black">{stats.avgPoints.toFixed(1)}</div>
          </div>
          <div className="bg-slate-50 rounded-xl p-4">
            <div className="text-xs font-bold text-slate-400 uppercase">Wins</div>
            <div className="text-2xl font-black">{stats.wins}</div>
          </div>
        </div>
      </div>

      {/* Performance Graph */}
      <h2 className="mt-8 mb-3 text-sm font-bold text-slate-400 uppercase tracking-wider">
        Performance Over Time
      </h2>

      {graphData.length === 0 ? (
        <div className="bg-slate-100 rounded-2xl p-10 text-center text-slate-400">
          No games yet
        </div>
      ) : (
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
          <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
            <polyline
              points={graphData
                .map((val, i) => {
                  const x = (i / Math.max(graphData.length - 1, 1)) * width;
                  const y = height - ((val - min) / range) * height;
                  return `${x},${y}`;
                })
                .join(' ')}
              fill="none"
              stroke="#3b82f6"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      )}

      {/* Games List */}
      <h2 className="mt-8 mb-3 text-sm font-bold text-slate-400 uppercase tracking-wider">
        Games Played
      </h2>

      <div className="grid gap-3">
        {games.map(g => (
          <div
            key={g.matchId}
            className="bg-white p-4 rounded-2xl border border-slate-100"
          >
            <div className="text-xs font-bold text-slate-400">{g.date}</div>
            <div className="text-lg font-black">{g.gameName}</div>
            <div className="text-sm text-slate-500 mt-1">
              Score: <span className="font-bold">{g.score}</span>
              {g.rank && <span className="ml-2">• Rank #{g.rank}</span>}
              {g.winner && <span className="ml-2 text-yellow-600 font-bold">🏆 Winner</span>}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
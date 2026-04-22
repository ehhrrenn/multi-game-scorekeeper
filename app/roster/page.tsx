// app/roster/page.tsx
'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useGameState } from '../../hooks/useGameState';

type Player = { id: string; name: string; emoji: string };
type Round = { roundId: number; scores: Record<string, number> };

type MatchRecord = {
  matchId: string;
  date: string;
  gameName: string;
  winnerId: string | null;
  finalScores: Record<string, number>;
  activePlayerIds: string[];
  savedRounds: Round[];
};

type PlayerStats = {
  playerId: string;
  gamesPlayed: number;
  wins: number;
  winRate: number;
  totalPoints: number;
  avgPoints: number;
  bestScore: number;
  lastPlayed: string | null;
};

const EMOJIS = ['🦊','⚡️','🦖','🤠','👾','🍕','🚀','🐙','🦄','🥑','🔥','💎','👻','👑'];
const getRandomEmoji = () => EMOJIS[Math.floor(Math.random() * EMOJIS.length)];

function buildStats(players: Player[], history: MatchRecord[]): Record<string, PlayerStats> {
  const stats: Record<string, PlayerStats> = {};

  for (const p of players) {
    stats[p.id] = {
      playerId: p.id,
      gamesPlayed: 0,
      wins: 0,
      winRate: 0,
      totalPoints: 0,
      avgPoints: 0,
      bestScore: Number.NEGATIVE_INFINITY,
      lastPlayed: null,
    };
  }

  for (const match of history) {
    for (const playerId of match.activePlayerIds) {
      if (!stats[playerId]) {
        // player existed in history but not in current roster (deleted/old)
        stats[playerId] = {
          playerId,
          gamesPlayed: 0,
          wins: 0,
          winRate: 0,
          totalPoints: 0,
          avgPoints: 0,
          bestScore: Number.NEGATIVE_INFINITY,
          lastPlayed: null,
        };
      }

      const s = stats[playerId];
      const score = match.finalScores[playerId] ?? 0;

      s.gamesPlayed += 1;
      s.totalPoints += score;
      s.bestScore = Math.max(s.bestScore, score);
      if (match.winnerId === playerId) s.wins += 1;

      // lastPlayed as "latest encountered". If you later store ISO date, you can compare properly.
      s.lastPlayed = match.date;
    }
  }

  // finalize derived values
  for (const key of Object.keys(stats)) {
    const s = stats[key];
    s.avgPoints = s.gamesPlayed ? s.totalPoints / s.gamesPlayed : 0;
    s.winRate = s.gamesPlayed ? s.wins / s.gamesPlayed : 0;
    if (s.bestScore === Number.NEGATIVE_INFINITY) s.bestScore = 0;
  }

  return stats;
}

export default function RosterPage() {
  const [players, setPlayers] = useGameState<Player[]>('scorekeeper_players', []);
  const [history] = useGameState<MatchRecord[]>('scorekeeper_history', []);

  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<'NAME'|'GAMES'|'WINS'|'WINRATE'|'TOTAL'|'AVG'|'BEST'>('GAMES');

  const statsMap = useMemo(() => buildStats(players, history), [players, history]);

  const filteredPlayers = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = players.filter(p => !q || p.name.toLowerCase().includes(q));

    const score = (p: Player) => statsMap[p.id] ?? {
      playerId: p.id, gamesPlayed: 0, wins: 0, winRate: 0, totalPoints: 0, avgPoints: 0, bestScore: 0, lastPlayed: null
    };

    list.sort((a, b) => {
      const sa = score(a);
      const sb = score(b);
      switch (sortBy) {
        case 'NAME': return a.name.localeCompare(b.name);
        case 'GAMES': return sb.gamesPlayed - sa.gamesPlayed;
        case 'WINS': return sb.wins - sa.wins;
        case 'WINRATE': return sb.winRate - sa.winRate;
        case 'TOTAL': return sb.totalPoints - sa.totalPoints;
        case 'AVG': return sb.avgPoints - sa.avgPoints;
        case 'BEST': return sb.bestScore - sa.bestScore;
        default: return 0;
      }
    });

    return list;
  }, [players, query, sortBy, statsMap]);

  const updatePlayerName = (playerId: string, name: string) => {
    setPlayers(prev => prev.map(p => (p.id === playerId ? { ...p, name } : p)));
  };

  const randomizeEmoji = (playerId: string) => {
    setPlayers(prev => prev.map(p => (p.id === playerId ? { ...p, emoji: getRandomEmoji() } : p)));
  };

  const deletePlayer = (playerId: string) => {
    if (!window.confirm('Remove this player from the roster? This does not delete old match history.')) return;
    setPlayers(prev => prev.filter(p => p.id !== playerId));
  };

  return (
    <main className="min-h-screen p-6 pb-32">
      <header className="mb-6 mt-4">
        <h1 className="text-3xl font-black text-slate-800">Roster</h1>
        <p className="text-slate-500 mt-1">Global players and lifetime stats.</p>
      </header>

      <div className="flex flex-col gap-3 mb-5">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search players…"
          className="w-full border-2 border-slate-200 rounded-xl p-3 bg-white focus:outline-none focus:border-blue-500"
        />

        <div className="flex gap-2 overflow-x-auto pb-1">
          {([
            ['GAMES','Most Games'],
            ['WINS','Most Wins'],
            ['WINRATE','Best Win%'],
            ['TOTAL','Most Points'],
            ['AVG','Best Avg'],
            ['BEST','Best Game'],
            ['NAME','Name'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setSortBy(key)}
              className={`px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition
                ${sortBy === key ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-700 active:bg-slate-50'}
              `}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {filteredPlayers.length === 0 ? (
        <div className="bg-slate-100 border-2 border-dashed border-slate-200 rounded-3xl p-10 text-center">
          <div className="text-5xl mb-4 opacity-50">👥</div>
          <h3 className="text-xl font-bold text-slate-700 mb-2">No players found</h3>
          <p className="text-slate-500">Add players from Custom Game setup for now (or we can add creation here next).</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredPlayers.map(p => {
            const s = statsMap[p.id] ?? {
              playerId: p.id, gamesPlayed: 0, wins: 0, winRate: 0, totalPoints: 0, avgPoints: 0, bestScore: 0, lastPlayed: null
            };

            return (
              <div key={p.id} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => randomizeEmoji(p.id)}
                      className="w-12 h-12 bg-slate-100 rounded-full text-2xl flex items-center justify-center hover:bg-slate-200 active:scale-95 transition"
                      aria-label="Randomize emoji"
                    >
                      {p.emoji}
                    </button>
                    <div>
                      <input
                        value={p.name}
                        onChange={e => updatePlayerName(p.id, e.target.value)}
                        className="font-black text-slate-800 text-lg bg-transparent focus:outline-none border-b border-transparent focus:border-slate-200"
                      />
                      <div className="text-xs text-slate-400 font-bold mt-0.5">
                        {s.gamesPlayed} games • {s.wins} wins • {(s.winRate * 100).toFixed(0)}% win
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => deletePlayer(p.id)}
                    className="w-10 h-10 text-slate-300 hover:text-red-500 active:scale-95 transition text-xl font-bold -mr-2 -mt-2"
                    aria-label="Delete player"
                  >
                    ✕
                  </button>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                    <div className="text-[10px] text-slate-400 font-bold uppercase">Total</div>
                    <div className="text-lg font-black text-slate-800">{s.totalPoints}</div>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                    <div className="text-[10px] text-slate-400 font-bold uppercase">Avg</div>
                    <div className="text-lg font-black text-slate-800">{s.avgPoints.toFixed(1)}</div>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                    <div className="text-[10px] text-slate-400 font-bold uppercase">Best</div>
                    <div className="text-lg font-black text-slate-800">{s.bestScore}</div>
                  </div>
                </div>

                <div className="mt-4 flex justify-end">
                  <Link
                    href={`/roster/${p.id}`}
                    className="text-sm font-bold bg-blue-50 text-blue-600 px-4 py-2 rounded-lg active:bg-blue-100 transition"
                  >
                    View details →
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
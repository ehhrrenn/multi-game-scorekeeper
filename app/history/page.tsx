// app/history/page.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
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

// Graph Colors
const LINE_COLORS = [
  '#3b82f6',
  '#ef4444',
  '#10b981',
  '#f59e0b',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
  '#f97316',
];

const secondaryBtn =
  'text-sm font-bold px-4 py-2 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 active:bg-slate-300 transition-colors';

const primaryBtn =
  'text-sm font-bold px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 transition-colors';

export default function HistoryPage() {
  const [matchHistory, setMatchHistory] = useGameState<MatchRecord[]>('scorekeeper_history', []);
  const [players] = useGameState<Player[]>('scorekeeper_players', []);
  const [, setRounds] = useGameState<Round[]>('scorekeeper_rounds', []);
  const [expandedView, setExpandedView] = useState<{ matchId: string; view: 'MATRIX' | 'GRAPH' } | null>(null);

  const router = useRouter();

  // --- Helpers ---
  const getMatchPlayers = (match: MatchRecord): PlayerSnapshot[] => {
    if (match.playerSnapshots && match.playerSnapshots.length > 0) return match.playerSnapshots;
    return players
      .filter(p => match.activePlayerIds.includes(p.id))
      .map(p => ({ id: p.id, name: p.name, emoji: p.emoji }));
  };

  const getMatchPlayerMap = (match: MatchRecord): Record<string, PlayerSnapshot> => {
    const map: Record<string, PlayerSnapshot> = {};
    getMatchPlayers(match).forEach(p => {
      map[p.id] = p;
    });
    return map;
  };

  // --- Actions ---
  const resumeMatch = (matchId: string) => {
    const match = matchHistory.find(m => m.matchId === matchId);
    if (!match) return;
    setRounds(match.savedRounds);
    setMatchHistory(matchHistory.filter(m => m.matchId !== matchId));
    router.push('/custom');
  };

  const deleteMatch = (matchId: string) => {
    if (window.confirm('Are you sure you want to delete this game record?')) {
      setMatchHistory(matchHistory.filter(m => m.matchId !== matchId));
    }
  };

  const toggleView = (matchId: string, view: 'MATRIX' | 'GRAPH') => {
    if (expandedView?.matchId === matchId && expandedView.view === view) {
      setExpandedView(null);
    } else {
      setExpandedView({ matchId, view });
    }
  };

  // --- Sub Views ---
  const renderMatrix = (match: MatchRecord) => {
    const matchPlayers = getMatchPlayers(match);

    return (
      <div className="mt-4 border-t border-slate-100 pt-4">
        <h4 className="font-bold text-slate-700 mb-3 text-sm uppercase tracking-wide">Score Grid</h4>
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-center text-sm border-collapse">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="p-2 w-12 text-slate-400 font-normal">Rnd</th>
                {matchPlayers.map(p => (
                  <th key={p.id} className="p-2 font-semibold min-w-[60px] border-l">
                    {p.emoji}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {match.savedRounds.map(round => (
                <tr key={round.roundId} className="border-b bg-white">
                  <td className="p-2 text-slate-400">{round.roundId}</td>
                  {matchPlayers.map(p => (
                    <td key={p.id} className="p-2 border-l">
                      {round.scores[p.id] ?? '-'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderGraph = (match: MatchRecord) => {
    const matchPlayers = getMatchPlayers(match);

    const chartData = matchPlayers.map((p, index) => {
      let total = 0;
      const points = match.savedRounds.map(r => {
        total += r.scores[p.id] || 0;
        return total;
      });
      return {
        id: p.id,
        emoji: p.emoji,
        color: LINE_COLORS[index % LINE_COLORS.length],
        points: [0, ...points],
      };
    });

    const allScores = chartData.flatMap(d => d.points);
    const max = Math.max(...allScores, 10);
    const min = Math.min(...allScores, 0);
    const range = max - min || 1;
    const width = 400;
    const height = 200;

    return (
      <div className="mt-4 border-t border-slate-100 pt-4">
        <h4 className="font-bold text-slate-700 mb-3 text-sm uppercase tracking-wide">Performance Timeline</h4>
        <div className="bg-slate-50 p-2 rounded-xl border border-slate-200">
          <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
            {chartData.map(d => {
              const points = d.points
                .map((s, i) => {
                  const x = (i / (d.points.length - 1)) * width;
                  const y = height - ((s - min) / range) * height;
                  return `${x},${y}`;
                })
                .join(' ');
              return <polyline key={d.id} points={points} fill="none" stroke={d.color} strokeWidth="3" />;
            })}
          </svg>
        </div>
      </div>
    );
  };

  // --- Render ---
  return (
    <main className="min-h-screen p-6 pb-32">
      <header className="mb-8 mt-4">
        <h1 className="text-3xl font-black text-slate-800">History</h1>
        <p className="text-slate-500 mt-1">Your past games and scores.</p>
      </header>

      {matchHistory.length === 0 ? (
        <div className="bg-slate-100 border-2 border-dashed border-slate-200 rounded-3xl p-10 text-center">
          <div className="text-5xl mb-4">📭</div>
          <h3 className="text-xl font-bold text-slate-700 mb-2">No games yet</h3>
          <Link href="/" className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold">
            Start a Game
          </Link>
        </div>
      ) : (
        <div className="grid gap-5">
          {matchHistory.map(match => {
            const map = getMatchPlayerMap(match);
            const winner = match.winnerId ? map[match.winnerId] : null;
            const winnerScore = match.winnerId ? match.finalScores[match.winnerId] ?? 0 : 0;

            const sorted = Object.entries(match.finalScores).sort(([, a], [, b]) => b - a);
            const isMatrixOpen = expandedView?.matchId === match.matchId && expandedView.view === 'MATRIX';
            const isGraphOpen = expandedView?.matchId === match.matchId && expandedView.view === 'GRAPH';

            return (
              <div key={match.matchId} className="bg-white p-5 rounded-2xl border border-slate-100">
                <div className="flex justify-between mb-4">
                  <div>
                    <span className="text-xs font-bold text-slate-500">{match.date}</span>
                    <h2 className="text-2xl font-black text-slate-800">{match.gameName}</h2>
                  </div>
                  <button onClick={() => deleteMatch(match.matchId)} className="text-xl text-slate-300 hover:text-red-500">
                    ✕
                  </button>
                </div>

                <div className="bg-yellow-50 p-3 rounded-xl flex items-center gap-3 mb-4">
                  <div className="text-2xl">🏆</div>
                  <div className="flex-grow">
                    <div className="text-xs font-bold text-yellow-800">Winner</div>
                    <div className="font-bold text-lg text-yellow-900">
                      {winner ? `${winner.emoji} ${winner.name}` : 'Unknown'}
                    </div>
                  </div>
                  <div className="font-black text-xl text-yellow-700">{winnerScore}</div>
                </div>

                <div className="flex gap-3 overflow-x-auto mb-3">
                  {sorted.map(([playerId, score], i) => {
                    const p = map[playerId];
                    return (
                      <div key={playerId} className="bg-slate-50 px-3 py-2 rounded-xl min-w-[70px] text-center">
                        <div className="text-xs font-bold text-slate-400">#{i + 1}</div>
                        <div>{p?.emoji ?? '❓'}</div>
                        <div className="text-sm font-semibold truncate">{p?.name ?? 'Unknown'}</div>
                        <div className="font-black">{score}</div>
                      </div>
                    );
                  })}
                </div>

                {isMatrixOpen && renderMatrix(match)}
                {isGraphOpen && renderGraph(match)}

                <div className="mt-4 flex justify-end gap-2">
                  <button onClick={() => toggleView(match.matchId, 'MATRIX')} className={secondaryBtn}>
                    🧮 Grid
                  </button>
                  <button onClick={() => toggleView(match.matchId, 'GRAPH')} className={secondaryBtn}>
                    📈 Graph
                  </button>
                  <button onClick={() => resumeMatch(match.matchId)} className={primaryBtn}>
                    ↺ Resume
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}

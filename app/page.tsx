// app/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useGameState } from '../hooks/useGameState';

// --- Types ---
type Player = { id: string; name: string; emoji: string };
type Round = { roundId: number; scores: Record<string, number> };
type PlayerSnapshot = { id: string; name: string; emoji: string };

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

export default function Home() {
  const router = useRouter();

  const [players, setPlayers] = useGameState<Player[]>('scorekeeper_players', []);
  const [rounds, setRounds] = useGameState<Round[]>('scorekeeper_rounds', [{ roundId: 1, scores: {} }]);
  const [matchHistory, setMatchHistory] = useGameState<MatchRecord[]>('scorekeeper_history', []);
  const [gameName, setGameName] = useGameState<string>('scorekeeper_gameName', 'Custom Game');

  const [mounted, setMounted] = useState(false);
  const [showDialog, setShowDialog] = useState(false);

  useEffect(() => setMounted(true), []);

  const hasAnyScore = useMemo(() => {
    return rounds.some(r => Object.values(r.scores || {}).some(v => (v ?? 0) !== 0));
  }, [rounds]);

  const gameInProgress = useMemo(() => {
    return players.length > 0 && (hasAnyScore || rounds.length > 1);
  }, [players.length, hasAnyScore, rounds.length]);

  const calculateTotal = (playerId: string) =>
    rounds.reduce((sum, r) => sum + (r.scores[playerId] || 0), 0);

  const clearGameSetup = () => {
    setPlayers([]);
    setRounds([{ roundId: 1, scores: {} }]);
    setGameName('Custom Game');
  };

  const saveCurrentGame = () => {
    if (players.length === 0) return;

    const finalScores: Record<string, number> = {};
    players.forEach(p => {
      finalScores[p.id] = calculateTotal(p.id);
    });

    let winnerId: string | null = null;
    let highest = -Infinity;
    Object.entries(finalScores).forEach(([id, score]) => {
      if (score > highest) {
        highest = score;
        winnerId = id;
      }
    });

    const playerSnapshots: PlayerSnapshot[] = players.map(p => ({
      id: p.id,
      name: p.name,
      emoji: p.emoji,
    }));

    const newMatch: MatchRecord = {
      matchId: Date.now().toString(),
      date: new Date().toLocaleDateString(),
      gameName,
      winnerId,
      finalScores,
      activePlayerIds: players.map(p => p.id),
      savedRounds: rounds,
      playerSnapshots,
    };

    setMatchHistory([newMatch, ...matchHistory]);
  };

  const startGameFlow = () => {
    if (mounted && gameInProgress) {
      setShowDialog(true);
    } else {
      router.push('/custom');
    }
  };

  const deleteAndStartNew = () => {
    clearGameSetup();
    setShowDialog(false);
    router.push('/custom');
  };

  const saveAndStartNew = () => {
    saveCurrentGame();
    clearGameSetup();
    setShowDialog(false);
    router.push('/custom');
  };

  return (
    <main className="p-6 min-h-screen">
      <header className="mb-6 mt-4">
        <h1 className="text-3xl font-black text-slate-800">Ready to play?</h1>
        <p className="text-slate-500 mt-1">Select a game module to get started.</p>

        {mounted && gameInProgress && (
          <div className="mt-4">
            <button
              onClick={() => router.push('/custom')}
              className="w-full bg-slate-900 text-white px-6 py-4 rounded-2xl font-black flex items-center justify-center gap-2 active:bg-slate-800 transition"
            >
              ▶️ Resume Game
            </button>
            <p className="text-xs text-slate-400 mt-2 text-center">
              Current game: <span className="font-bold">{gameName}</span>
            </p>
          </div>
        )}
      </header>

      <div className="grid gap-4">
        <button
          onClick={startGameFlow}
          className="text-left bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4 active:scale-[0.98] transition"
        >
          <div className="bg-blue-100 w-16 h-16 rounded-xl flex items-center justify-center text-3xl">📝</div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">Custom Game</h2>
            <p className="text-slate-500 text-sm">Round-based grid scoring.</p>
          </div>
        </button>

        <div className="bg-slate-100 p-6 rounded-2xl border border-slate-200 flex items-center gap-4 opacity-60">
          <div className="bg-slate-200 w-16 h-16 rounded-xl flex items-center justify-center text-3xl">🌶️</div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">Farkle</h2>
            <p className="text-slate-500 text-sm">Coming soon</p>
          </div>
        </div>

        <div className="bg-slate-100 p-6 rounded-2xl border border-slate-200 flex items-center gap-4 opacity-60">
          <div className="bg-slate-200 w-16 h-16 rounded-xl flex items-center justify-center text-3xl">🎲</div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">Yahtzee</h2>
            <p className="text-slate-500 text-sm">Coming soon</p>
          </div>
        </div>
      </div>

      {showDialog && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <button onClick={() => setShowDialog(false)} className="absolute inset-0 bg-black/40" />

          <div className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-6 border shadow-xl">
            <h3 className="text-xl font-black mb-2">Start a new game?</h3>
            <p className="text-slate-500 text-sm mb-5">
              You have a game in progress. What would you like to do?
            </p>

            <div className="flex flex-col gap-3">
              <button
                onClick={deleteAndStartNew}
                className="w-full bg-red-50 text-red-700 px-5 py-4 rounded-xl font-black active:bg-red-100"
              >
                🗑️ Delete & Start New
              </button>

              <button
                onClick={saveAndStartNew}
                className="w-full bg-blue-600 text-white px-5 py-4 rounded-xl font-black active:bg-blue-700"
              >
                💾 Save & Start New
              </button>

              <button
                onClick={() => setShowDialog(false)}
                className="w-full bg-slate-100 text-slate-700 px-5 py-4 rounded-xl font-black active:bg-slate-200"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
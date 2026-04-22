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

  // Persisted app state
  const [players, setPlayers] = useGameState<Player[]>('scorekeeper_players', []);
  const [rounds, setRounds] = useGameState<Round[]>('scorekeeper_rounds', [{ roundId: 1, scores: {} }]);
  const [, setMatchHistory] = useGameState<MatchRecord[]>('scorekeeper_history', []);
  const [gameName, setGameName] = useGameState<string>('scorekeeper_gameName', 'Custom Game');

  // Avoid UI flicker because useGameState loads localStorage after mount
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Modal state
  const [showNewGameDialog, setShowNewGameDialog] = useState(false);

  const hasAnyScore = useMemo(() => {
    return rounds.some(r => Object.values(r.scores || {}).some(v => (v ?? 0) !== 0));
  }, [rounds]);

  const gameInProgress = useMemo(() => {
    // active players AND some scoring happened OR multiple rounds
    return players.length > 0 && (hasAnyScore || rounds.length > 1);
  }, [players.length, hasAnyScore, rounds.length]);

  const calculateTotal = (playerId: string) => {
    return rounds.reduce((total, round) => total + (round.scores[playerId] || 0), 0);
  };

  const resetActiveGame = () => {
    setPlayers([]); // ✅ clear active players
    setRounds([{ roundId: 1, scores: {} }]);
    setGameName('Custom Game');
  };

  const saveCurrentGameToHistory = () => {
    if (players.length === 0 || rounds.length === 0) return;

    const finalScores: Record<string, number> = {};
    players.forEach(p => {
      finalScores[p.id] = calculateTotal(p.id);
    });

    let winnerId: string | null = null;
    let highestScore = -Infinity;
    Object.entries(finalScores).forEach(([pid, score]) => {
      if (score > highestScore) {
        highestScore = score;
        winnerId = pid;
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
      gameName, // ✅ persisted name
      winnerId,
      finalScores,
      activePlayerIds: players.map(p => p.id),
      savedRounds: [...rounds],
      playerSnapshots,
    };

    setMatchHistory(prev => [newMatch, ...prev]);
  };

  // --- UI Actions ---
  const handleResume = () => {
    router.push('/custom');
  };

  const handleStartCustom = () => {
    if (mounted && gameInProgress) {
      setShowNewGameDialog(true);
      return;
    }
    router.push('/custom');
  };

  const chooseDeleteAndStartNew = () => {
    resetActiveGame();
    setShowNewGameDialog(false);
    router.push('/custom');
  };

  const chooseSaveAndStartNew = () => {
    saveCurrentGameToHistory();
    resetActiveGame();
    setShowNewGameDialog(false);
    router.push('/custom');
  };

  const chooseCancel = () => {
    setShowNewGameDialog(false);
  };

  return (
    <main className="p-6 min-h-screen">
      <header className="mb-6 mt-4">
        <h1 className="text-3xl font-black text-slate-800">Ready to play?</h1>
        <p className="text-slate-500 mt-1">Select a game module to get started.</p>

        {/* Resume button (only when mounted & in progress) */}
        {mounted && gameInProgress && (
          <div className="mt-4">
            <button
              onClick={handleResume}
              className="w-full bg-slate-900 text-white px-6 py-4 rounded-2xl font-black flex items-center justify-center gap-2 active:bg-slate-800 transition-colors"
            >
              <span className="text-xl">▶️</span> Resume Game
            </button>
            <p className="text-xs text-slate-400 mt-2 text-center">
              Current game: <span className="font-bold">{gameName}</span>
            </p>
          </div>
        )}
      </header>

      <div className="grid gap-4">
        {/* Custom Tracker Card (button so we can intercept) */}
        <button
          onClick={handleStartCustom}
          className="text-left bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4 active:scale-[0.98] transition-transform"
        >
          <div className="bg-blue-100 w-16 h-16 rounded-xl flex items-center justify-center text-3xl">
            📝
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">Custom Game</h2>
            <p className="text-slate-500 text-sm">Round-based grid scoring.</p>
          </div>
        </button>

        {/* Farkle Card (Coming Soon) */}
        <div className="bg-slate-100 p-6 rounded-2xl border border-slate-200 flex items-center gap-4 opacity-60">
          <div className="bg-slate-200 w-16 h-16 rounded-xl flex items-center justify-center text-3xl pb-1">
            🌶️
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">Farkle</h2>
            <p className="text-slate-500 text-sm">Point banking &amp; risk tracking.</p>
          </div>
        </div>

        {/* Yahtzee Card (Coming Soon) */}
        <div className="bg-slate-100 p-6 rounded-2xl border border-slate-200 flex items-center gap-4 opacity-60">
          <div className="bg-slate-200 w-16 h-16 rounded-xl flex items-center justify-center text-3xl pb-1">
            🎲
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">Yahtzee</h2>
            <p className="text-slate-500 text-sm">Classic auto-calculating grid.</p>
          </div>
        </div>
      </div>

      {/* New Game Dialog */}
      {showNewGameDialog && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center">
          {/* Backdrop */}
          <button
            aria-label="Close dialog"
            onClick={chooseCancel}
            className="absolute inset-0 bg-black/40"
          />

          {/* Modal / Sheet */}
          <div className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl border border-slate-200 animate-in fade-in slide-in-from-bottom-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-black text-slate-800">Start a new game?</h3>
                <p className="text-slate-500 mt-1 text-sm">
                  You already have a game in progress (<span className="font-bold">{gameName}</span>). What would you like to do?
                </p>
              </div>
              <button
                onClick={chooseCancel}
                className="w-10 h-10 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-xl hover:bg-slate-200 active:scale-95 transition"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="mt-5 flex flex-col gap-3">
              <button
                onClick={chooseDeleteAndStartNew}
                className="w-full bg-red-50 text-red-700 border border-red-100 px-5 py-4 rounded-2xl font-black active:bg-red-100 transition-colors"
              >
                🗑️ Delete &amp; Start New
              </button>

              <button
                onClick={chooseSaveAndStartNew}
                className="w-full bg-blue-600 text-white px-5 py-4 rounded-2xl font-black active:bg-blue-700 transition-colors"
              >
                💾 Save &amp; Start New
              </button>

              <button
                onClick={chooseCancel}
                className="w-full bg-slate-100 text-slate-700 px-5 py-4 rounded-2xl font-black active:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
            </div>

            <p className="mt-4 text-[11px] text-slate-400 leading-snug">
              “Delete” clears active players + the score grid. “Save” records it in History first.
            </p>
          </div>
        </div>
      )}
    </main>
  );
}

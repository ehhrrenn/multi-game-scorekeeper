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

  // Load existing state
  const [players, setPlayers] = useGameState<Player[]>('scorekeeper_players', []);
  const [rounds, setRounds] = useGameState<Round[]>('scorekeeper_rounds', [{ roundId: 1, scores: {} }]);
  const [matchHistory, setMatchHistory] = useGameState<MatchRecord[]>('scorekeeper_history', []);
  const [gameName, setGameName] = useGameState<string>('scorekeeper_gameName', 'Custom Game');

  const [mounted, setMounted] = useState(false);
  const [showDialog, setShowDialog] = useState(false);

  useEffect(() => setMounted(true), []);

  const gameInProgress = useMemo(() => players.length > 0, [players.length]);

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
    players.forEach(p => { finalScores[p.id] = calculateTotal(p.id); });

    let winnerId: string | null = null;
    let highest = -Infinity;
    Object.entries(finalScores).forEach(([id, score]) => {
      if (score > highest) { highest = score; winnerId = id; }
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
      savedRounds: [...rounds],
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
    <main className="p-6 min-h-screen bg-slate-50 flex flex-col justify-center">
      <header className="mb-12 text-center animate-in fade-in zoom-in duration-700">
        <div className="text-6xl mb-4">🏆</div>
        <h1 className="text-4xl font-black text-slate-800 tracking-tight">Scorekeeper <span className="text-blue-600">Pro</span></h1>
        <p className="text-slate-500 mt-2 font-medium">Professional scoring for every match.</p>

        {mounted && gameInProgress && (
          <div className="mt-10 animate-in fade-in slide-in-from-top-4 duration-500">
            <button
              onClick={() => router.push('/custom')}
              className="w-full bg-blue-600 text-white px-6 py-5 rounded-[2rem] font-black flex items-center justify-between shadow-xl shadow-blue-100 active:scale-95 transition-all"
            >
              <div className="flex items-center gap-4">
                <span className="text-2xl animate-pulse">🎮</span>
                <div className="text-left">
                  <span className="block text-[10px] uppercase tracking-widest opacity-70">Resume Game</span>
                  <span className="text-lg">{gameName}</span>
                </div>
              </div>
              <span className="text-2xl opacity-50">→</span>
            </button>
          </div>
        )}
      </header>

      <div className="grid gap-4 max-w-sm mx-auto w-full">
        <button
          onClick={startGameFlow}
          className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 flex items-center gap-5 active:scale-[0.98] transition group"
        >
          <div className="bg-slate-50 w-16 h-16 rounded-2xl flex items-center justify-center text-3xl group-hover:scale-110 transition shadow-inner">🧮</div>
          <div className="text-left">
            <h2 className="text-xl font-bold text-slate-800">Custom Game</h2>
            <p className="text-slate-500 text-sm">Start a new score grid</p>
          </div>
        </button>

        {/* Coming Soon Section */}
        <div className="mt-8 border-t border-slate-100 pt-8">
          <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest text-center mb-4">Upcoming Modules</p>
          <div className="bg-slate-100/50 p-6 rounded-[2rem] border border-slate-200 flex items-center gap-4 opacity-40 grayscale">
            <div className="bg-slate-200 w-14 h-14 rounded-2xl flex items-center justify-center text-2xl">⛳️</div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Golf Tracker</h2>
              <p className="text-slate-400 text-[10px] font-black uppercase tracking-tighter">Phase 2 Release</p>
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Dialog */}
      {showDialog && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in" onClick={() => setShowDialog(false)} />
          <div className="relative w-full max-w-sm bg-white rounded-[2.5rem] p-8 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="text-4xl text-center mb-4">⚠️</div>
            <h3 className="text-2xl font-black mb-2 text-slate-800 text-center">Active Game Found</h3>
            <p className="text-slate-500 text-center mb-8 leading-relaxed">
              Starting a new game will reset your current board. What should we do with the active match?
            </p>
            <div className="flex flex-col gap-3">
              <button onClick={saveAndStartNew} className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black shadow-lg shadow-blue-100 active:scale-95 transition">
                💾 Save & Start New
              </button>
              <button onClick={deleteAndStartNew} className="w-full bg-red-50 text-red-600 py-4 rounded-2xl font-black active:bg-red-100 transition">
                🗑️ Discard & Start New
              </button>
              <button onClick={() => setShowDialog(false)} className="w-full text-slate-400 py-4 font-bold active:bg-slate-50 rounded-2xl transition">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
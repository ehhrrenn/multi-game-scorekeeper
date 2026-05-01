// app/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useGameState } from '../hooks/useGameState';
import AuthButton from './components/AuthButton';

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

export default function Home() {
  const router = useRouter();

  // Load existing state
  const [players, setPlayers] = useGameState<Player[]>('scorekeeper_players', []);
  const [rounds, setRounds] = useGameState<Round[]>('scorekeeper_rounds', [{ roundId: 1, scores: {} }]);
  const [matchHistory, setMatchHistory] = useGameState<MatchRecord[]>('scorekeeper_history', []);
  const [gameName, setGameName] = useGameState<string>('scorekeeper_gameName', 'Custom Game');
  const [activeMatchId, setActiveMatchId] = useGameState<string | null>('scorekeeper_active_match_id', null);
  const [hasCelebrated, setHasCelebrated] = useGameState<boolean>('scorekeeper_has_celebrated', false);
  const [settings, setSettings] = useGameState<GameSettings>('scorekeeper_settings', { target: 0 });
  const [gameProfiles] = useGameState<GameProfile[]>('scorekeeper_game_profiles', [{ name: 'Custom Game', winCondition: 'HIGH', scoreDirection: 'UP' }]);

  const [mounted, setMounted] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [pendingGameName, setPendingGameName] = useState('Custom Game');
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    setMounted(true);
    const handleScroll = () => setIsScrolled(window.scrollY > 40);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const gameInProgress = useMemo(() => players.length > 0, [players.length]);

  const recentGames = useMemo(() => {
    const classicGameNames = new Set(['Yahtzee', 'Triple Yahtzee', 'Farkle']);
    const customProfileNames = new Set(gameProfiles.map((profile) => profile.name));
    const uniqueGames = new Set<string>();
    matchHistory.forEach(match => {
      if (classicGameNames.has(match.gameName)) {
        return;
      }

      if (customProfileNames.has(match.gameName)) {
        uniqueGames.add(match.gameName);
      }
    });

    return Array.from(uniqueGames);
  }, [gameProfiles, matchHistory]);

  const calculateTotal = (playerId: string) => {
    const activeProfile = gameProfiles.find(p => p.name === gameName) || gameProfiles[0];
    const sum = rounds.reduce((total, r) => total + (r.scores[playerId] || 0), 0);
    return activeProfile.scoreDirection === 'DOWN' ? settings.target - sum : sum;
  };

  const handleGameSelect = (selectedName: string) => {
    if (gameInProgress) {
      setPendingGameName(selectedName);
      setShowDialog(true);
    } else {
      setGameName(selectedName);
      router.push('/custom');
    }
  };

  const deleteAndStartNew = () => {
    setPlayers([]);
    setRounds([{ roundId: 1, scores: {} }]);
    setActiveMatchId(null);
    setHasCelebrated(false);
    setSettings({ target: 0 });
    setGameName(pendingGameName);
    setShowDialog(false);
    router.push('/custom');
  };

  const saveAndStartNew = () => {
    if (players.length > 0 && rounds.length > 0) {
      const finalScores: Record<string, number> = {};
      players.forEach(p => { finalScores[p.id] = calculateTotal(p.id); });

      const newMatch: MatchRecord = {
        matchId: activeMatchId || Date.now().toString(),
        date: new Date().toLocaleDateString(),
        gameName: gameName,
        finalScores,
        activePlayerIds: players.map(p => p.id),
        savedRounds: JSON.parse(JSON.stringify(rounds)),
        playerSnapshots: players.map(p => ({ id: p.id, name: p.name, emoji: p.emoji })),
        settings: { ...settings }
      };

      if (activeMatchId) {
        setMatchHistory(matchHistory.map(m => m.matchId === activeMatchId ? newMatch : m));
      } else {
        setMatchHistory([newMatch, ...matchHistory]);
      }
    }
    deleteAndStartNew();
  };

  if (!mounted) return null;

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-50 pb-32 transition-colors">

      {/* 🟢 NEW CLOUD LOGIN HEADER - Pushes button to top right */}
      <header className="max-w-screen-md mx-auto px-4 pt-4 flex justify-end z-50 relative">
        <AuthButton />
      </header>
      {/* STICKY HEADER */}
      <div className={`fixed top-0 left-0 right-0 h-16 z-40 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md shadow-sm border-b border-slate-200 dark:border-slate-800 transition-all duration-300 flex items-center px-4 max-w-screen-md mx-auto ${isScrolled ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0'}`}>
        <div className="flex items-center gap-2">
          <span className="text-2xl">🏆</span>
          <h1 className="text-xl font-black text-slate-800 dark:text-white">Scorekeeper Pro</h1>
        </div>
      </div>

      <div className="max-w-screen-md mx-auto pt-10 px-4 animate-in fade-in slide-in-from-bottom-2">
        {/* HERO SECTION */}
        <div className="mb-10">
          <h1 className="text-5xl font-black text-slate-800 dark:text-white tracking-tight leading-tight">Scorekeeper Pro</h1>
          <p className="text-slate-500 dark:text-slate-400 font-bold mt-2 text-lg uppercase tracking-widest">Scores Kept. Scores Settled.</p>
        </div>

        {/* DIALOG FOR ACTIVE GAME */}
        {showDialog && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in" onClick={() => setShowDialog(false)} />
            <div className="relative w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[2.5rem] p-8 shadow-2xl animate-in zoom-in-95 duration-200">
              <div className="text-4xl text-center mb-4">⚠️</div>
              <h3 className="text-2xl font-black mb-2 text-slate-800 dark:text-white text-center">Active Game Found</h3>
              <p className="text-slate-500 dark:text-slate-400 text-center mb-8 leading-relaxed font-medium">
                Starting a new game will reset your current board. What should we do with the active game?
              </p>
              <div className="flex flex-col gap-3">
                <button onClick={saveAndStartNew} className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black shadow-lg shadow-blue-100 dark:shadow-none active:scale-95 transition">
                  💾 Save & Start New
                </button>
                <button onClick={deleteAndStartNew} className="w-full bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-100 dark:border-red-900/30 py-4 rounded-2xl font-black active:bg-red-100 dark:active:bg-red-900/40 transition">
                  🗑️ Discard & Start New
                </button>
                <button onClick={() => setShowDialog(false)} className="w-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 font-bold py-3 mt-2">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* GAME MODULES LIST */}
        <h2 className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3 ml-2">Custom Games</h2>
        
        <div className="grid gap-3 mb-8">
          {/* Main Custom Game */}
          <button 
            onClick={() => handleGameSelect('Custom Game')} 
            className="w-full text-left bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-sm flex items-center justify-between active:scale-[0.98] transition hover:border-blue-300 dark:hover:border-blue-700 group"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-blue-50 dark:bg-slate-800 text-blue-600 dark:text-white rounded-full flex items-center justify-center text-2xl shadow-sm border border-blue-100 dark:border-slate-700">
                🧮
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-800 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">Start Custom Game</h3>
                <p className="text-xs font-bold text-slate-400 dark:text-slate-500">Universal multi-player score sheet.</p>
              </div>
            </div>
            <div className="text-slate-300 dark:text-slate-600 text-xl font-bold group-hover:translate-x-1 transition-transform">➔</div>
          </button>

          {/* Dynamic Recent Games from History */}
          {recentGames.filter(name => name !== 'Custom Game').map(name => (
            <button 
              key={name}
              onClick={() => handleGameSelect(name)} 
              className="w-full text-left bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-sm flex items-center justify-between active:scale-[0.98] transition hover:border-blue-300 dark:hover:border-blue-700 group"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-white rounded-full flex items-center justify-center text-2xl shadow-sm border border-slate-100 dark:border-slate-700">
                  📋
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-800 dark:text-white">{name}</h3>
                  <p className="text-xs font-bold text-slate-400 dark:text-slate-500">Play with saved rules.</p>
                </div>
              </div>
              <div className="text-slate-300 dark:text-slate-600 text-xl font-bold group-hover:translate-x-1 transition-transform">➔</div>
            </button>
          ))}
        </div>

        <h2 className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3 ml-2 mt-8">Classic Games</h2>
        <div className="grid gap-3">
          {/* Yahtzee Module */}
          <Link href="/yahtzee" className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-sm flex items-center justify-between hover:border-blue-300 dark:hover:border-blue-700 active:scale-[0.98] transition-all cursor-pointer group">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center text-2xl shadow-sm border border-slate-100 dark:border-slate-700 group-hover:scale-110 transition-transform">
                🎲
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-800 dark:text-white">Yahtzee</h3>
                <p className="text-xs font-bold text-slate-400 dark:text-slate-500">Standard & Triple variants</p>
              </div>
            </div>
            <div className="text-slate-300 dark:text-slate-600 text-xl font-bold group-hover:text-blue-500 transition-colors">▶</div>
          </Link>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-sm flex items-center justify-between opacity-50 grayscale cursor-not-allowed">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center text-2xl shadow-sm border border-slate-100 dark:border-slate-700">
                🎲
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-800 dark:text-white">Farkle</h3>
                <p className="text-xs font-bold text-slate-400 dark:text-slate-500">Coming soon.</p>
              </div>
            </div>
            <div className="text-slate-300 dark:text-slate-600 text-xl font-bold">🔒</div>
          </div>
        </div>

      </div>
    </main>
  );
}
// app/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useGameState } from '../hooks/useGameState';
import { useGameProfilesSync } from '../hooks/useGameProfilesSync';
import { useActiveSession } from '../hooks/useActiveSession';
import { clearStoredGameState } from '../lib/activeGameState';
import { db } from '../lib/firebase';
import { DEFAULT_GAME_PROFILE } from '../lib/gameProfiles';
import { buildCustomGameRecord, buildFarkleGameRecord, buildYahtzeeGameRecord, saveGameRecordToCloud, upsertGameRecord, type GameRecord } from '../lib/gameHistory';
import AuthButton from './components/AuthButton';

// --- Types ---
type Player = { id: string; name: string; emoji: string };
type Round = { roundId: number; scores: Record<string, number> };
type PlayerSnapshot = { id: string; name: string; emoji: string };
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
  const { activeSession, clearSession } = useActiveSession();

  // Load existing state
  const [players, setPlayers] = useGameState<Player[]>('scorekeeper_players', []);
  const [rounds, setRounds] = useGameState<Round[]>('scorekeeper_rounds', [{ roundId: 1, scores: {} }]);
  const [matchHistory, setMatchHistory] = useGameState<MatchRecord[]>('scorekeeper_history', []);
  const [, setGameHistory] = useGameState<GameRecord[]>('scorekeeper_history', []);
  const [gameName, setGameName] = useGameState<string>('scorekeeper_gameName', 'Custom Game');
  const [activeMatchId, setActiveMatchId] = useGameState<string | null>('scorekeeper_active_match_id', null);
  const [, setHasCelebrated] = useGameState<boolean>('scorekeeper_has_celebrated', false);
  const [settings, setSettings] = useGameState<GameSettings>('scorekeeper_settings', { target: 0 });
  const { gameProfiles } = useGameProfilesSync();

  const [showDialog, setShowDialog] = useState(false);
  const [pendingRoute, setPendingRoute] = useState<string | null>(null);
  const [pendingGameName, setPendingGameName] = useState('Custom Game');
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 40);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const gameInProgress = useMemo(() => players.length > 0, [players.length]);

  // True when any active game exists (session-tracked or legacy local custom)
  const hasAnyActiveGame = !!(activeSession?.gameType) || gameInProgress;

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
    const activeProfile = gameProfiles.find((profile) => profile.name === gameName) || gameProfiles[0] || DEFAULT_GAME_PROFILE;
    const sum = rounds.reduce((total, r) => total + (r.scores[playerId] || 0), 0);
    return activeProfile.scoreDirection === 'DOWN' ? settings.target - sum : sum;
  };

  const routeToGameType = (route: string): 'custom' | 'yahtzee' | 'farkle' | null => {
    if (route === '/custom') return 'custom';
    if (route === '/yahtzee') return 'yahtzee';
    if (route === '/farkle') return 'farkle';
    return null;
  };

  const navigateToPendingRoute = () => {
    if (!pendingRoute) {
      return;
    }

    const targetGameType = routeToGameType(pendingRoute);
    if (targetGameType) {
      clearStoredGameState(targetGameType);
    }

    router.push(pendingRoute);
    setPendingRoute(null);
  };

  const handleGameSelect = (selectedName: string) => {
    if (hasAnyActiveGame) {
      setPendingGameName(selectedName);
      setPendingRoute('/custom');
      setShowDialog(true);
    } else {
      setGameName(selectedName);
      clearStoredGameState('custom');
      router.push('/custom');
    }
  };

  const handleClassicGameSelect = (route: string) => {
    if (hasAnyActiveGame) {
      setPendingRoute(route);
      setShowDialog(true);
    } else {
      const targetGameType = routeToGameType(route);
      if (targetGameType) {
        clearStoredGameState(targetGameType);
      }
      router.push(route);
    }
  };

  const deleteAndStartNew = () => {
    // Clear session-tracked active game
    if (activeSession?.gameType) {
      clearStoredGameState(activeSession.gameType);
      clearSession();
    }
    // Also clear legacy local custom state
    setPlayers([]);
    setRounds([{ roundId: 1, scores: {} }]);
    setActiveMatchId(null);
    setHasCelebrated(false);
    setSettings({ target: 0 });
    if (pendingRoute !== '/custom') {
      setGameName('Custom Game');
    } else {
      setGameName(pendingGameName);
    }
    setShowDialog(false);
    navigateToPendingRoute();
  };

  const saveAndStartNew = async () => {
    const newId = `game_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    // Save session-tracked active game (yahtzee or farkle or custom with session)
    if (activeSession?.gameType) {
      let gameRecord: GameRecord | null = null;
      if (activeSession.gameType === 'custom') {
        gameRecord = buildCustomGameRecord(activeSession.gameState, newId);
      } else if (activeSession.gameType === 'yahtzee') {
        gameRecord = buildYahtzeeGameRecord(activeSession.gameState, newId);
      } else if (activeSession.gameType === 'farkle') {
        gameRecord = buildFarkleGameRecord(activeSession.gameState, newId);
      }
      if (gameRecord) {
        setGameHistory(prev => upsertGameRecord(prev, gameRecord!));
        if (db) {
          try { await saveGameRecordToCloud(db, gameRecord); } catch { /* swallow */ }
        }
      }
      clearStoredGameState(activeSession.gameType);
      clearSession();
    } else if (gameInProgress) {
      // Legacy local custom game
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

    // Reset local custom state and navigate
    setPlayers([]);
    setRounds([{ roundId: 1, scores: {} }]);
    setActiveMatchId(null);
    setHasCelebrated(false);
    setSettings({ target: 0 });
    if (pendingRoute !== '/custom') {
      setGameName('Custom Game');
    } else {
      setGameName(pendingGameName);
    }
    setShowDialog(false);
    navigateToPendingRoute();
  };

  return (
    <>
      {/* STICKY HEADER — outside <main> so CSS filter doesn't break fixed positioning */}
      <div className={`newsprint-sticky fixed top-0 left-0 right-0 h-14 z-40 border-b border-black/30 transition-all duration-300 flex items-center px-4 ${isScrolled ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0'}`}>
        <div className="max-w-screen-md mx-auto w-full pl-9 flex items-center gap-2">
          <span className="text-2xl leading-none">❖</span>
          <h1 className="text-xl font-black text-[#111] tracking-tight [font-family:Georgia,'Times_New_Roman',serif]">Scorekeeper Pro</h1>
        </div>
      </div>

      {/* AUTH HEADER — outside <main>; keep auth control in native theme */}
      <div className="newsprint-header">
        <header className="max-w-screen-md mx-auto px-4 pt-4 flex justify-end z-50 relative">
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push('/notes')}
              className="newsprint-invert w-10 h-10 rounded-full bg-[#fbfbf8] border border-black/20 text-black hover:border-black flex items-center justify-center text-lg active:scale-95 transition-colors"
              aria-label="Shared Notes"
              title="Shared Notes"
            >
              ✎
            </button>
            <AuthButton />
          </div>
        </header>
      </div>

      <main className="min-h-screen bg-[#f6f6f2] text-[#111] pb-32 transition-colors newsprint-page">
      <div className="max-w-screen-md mx-auto pt-10 px-4 animate-in fade-in slide-in-from-bottom-2">
        {/* HERO SECTION */}
        <div className="mb-10 border-y-2 border-black py-4">
          <h1 className="text-5xl font-black text-[#111] tracking-tight leading-tight [font-family:Georgia,'Times_New_Roman',serif]">Scorekeeper Pro</h1>
          <p className="text-black/65 font-bold mt-2 text-lg uppercase tracking-[0.22em]">Scores Kept. Scores Settled.</p>
        </div>

        {/* DIALOG FOR ACTIVE GAME */}
        {showDialog && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <div className="absolute inset-0 bg-black/45 backdrop-blur-sm animate-in fade-in" onClick={() => setShowDialog(false)} />
            <div className="relative w-full max-w-sm bg-[#f8f8f5] border-2 border-black/80 rounded-[1.5rem] p-8 shadow-2xl animate-in zoom-in-95 duration-200">
              <div className="text-4xl text-center mb-4">❗</div>
              <h3 className="text-2xl font-black mb-2 text-[#111] text-center [font-family:Georgia,'Times_New_Roman',serif]">Active Game Found</h3>
              <p className="text-black/70 text-center mb-8 leading-relaxed font-medium">
                {activeSession?.gameType
                  ? `A ${activeSession.gameType === 'custom' ? 'Custom Game' : activeSession.gameType === 'yahtzee' ? 'Yahtzee' : 'Farkle'} game is already in progress. Save it first, or discard it to start fresh.`
                  : 'A game is already in progress. Save it first, or discard it to start fresh.'}
              </p>
              <div className="flex flex-col gap-3">
                <button onClick={() => void saveAndStartNew()} className="w-full bg-black text-white py-4 rounded-xl font-black active:scale-95 transition border border-black">
                  ✶ Save & Start New
                </button>
                <button onClick={deleteAndStartNew} className="w-full bg-white text-black border border-black/35 py-4 rounded-xl font-black active:bg-black/5 transition">
                  ✕ Discard & Start New
                </button>
                <button onClick={() => setShowDialog(false)} className="w-full text-black/55 hover:text-black font-bold py-3 mt-2">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* GAME MODULES LIST */}
        <h2 className="text-xs font-black text-black/55 uppercase tracking-[0.18em] mb-3 ml-2">Custom Games</h2>
        
        <div className="grid gap-3 mb-8">
          <button onClick={() => router.push('/choosy')} className="w-full text-left bg-[#fbfbf8] border border-black/20 p-5 flex items-center justify-between hover:border-black active:scale-[0.98] transition-all cursor-pointer group">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center text-2xl shadow-sm border border-black/20 group-hover:scale-110 transition-transform">
                ☞
              </div>
              <div>
                <h3 className="text-lg font-black text-[#111] [font-family:Georgia,'Times_New_Roman',serif]">Choosy</h3>
                <p className="text-xs font-bold text-black/50">Random Touch Selector</p>
              </div>
            </div>
            <div className="text-black/35 text-xl font-bold group-hover:text-black transition-colors">▸</div>
          </button>
          
          {/* Main Custom Game */}
          <button 
            onClick={() => handleGameSelect('Custom Game')} 
            className="w-full text-left bg-[#fbfbf8] border border-black/20 p-5 flex items-center justify-between active:scale-[0.98] transition hover:border-black group"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-white text-black rounded-full flex items-center justify-center text-2xl shadow-sm border border-black/20">
                ✷
              </div>
              <div>
                <h3 className="text-lg font-black text-[#111] transition-colors [font-family:Georgia,'Times_New_Roman',serif]">Start Custom Game</h3>
                <p className="text-xs font-bold text-black/50">Universal multi-player score sheet.</p>
              </div>
            </div>
            <div className="text-black/35 text-xl font-bold group-hover:translate-x-1 transition-transform">▸</div>
          </button>

          {/* Dynamic Recent Games from History */}
          {recentGames.filter(name => name !== 'Custom Game').map(name => (
            <button 
              key={name}
              onClick={() => handleGameSelect(name)} 
              className="w-full text-left bg-[#fbfbf8] border border-black/20 p-5 flex items-center justify-between active:scale-[0.98] transition hover:border-black group"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-white text-black rounded-full flex items-center justify-center text-2xl shadow-sm border border-black/20">
                  ✤
                </div>
                <div>
                  <h3 className="text-lg font-black text-[#111] [font-family:Georgia,'Times_New_Roman',serif]">{name}</h3>
                  <p className="text-xs font-bold text-black/50">Play with saved rules.</p>
                </div>
              </div>
              <div className="text-black/35 text-xl font-bold group-hover:translate-x-1 transition-transform">▸</div>
            </button>
          ))}
        </div>

        <h2 className="text-xs font-black text-black/55 uppercase tracking-[0.18em] mb-3 ml-2 mt-8">Classic Games</h2>
        <div className="grid gap-3">
          {/* Yahtzee Module */}
          <button onClick={() => handleClassicGameSelect('/yahtzee')} className="w-full text-left bg-[#fbfbf8] border border-black/20 p-5 flex items-center justify-between hover:border-black active:scale-[0.98] transition-all cursor-pointer group">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center text-2xl shadow-sm border border-black/20 group-hover:scale-110 transition-transform">
                ⚄
              </div>
              <div>
                <h3 className="text-lg font-black text-[#111] [font-family:Georgia,'Times_New_Roman',serif]">Yahtzee</h3>
                <p className="text-xs font-bold text-black/50">Standard & Triple variants</p>
              </div>
            </div>
            <div className="text-black/35 text-xl font-bold group-hover:text-black transition-colors">▸</div>
          </button>

          <button onClick={() => handleClassicGameSelect('/farkle')} className="w-full text-left bg-[#fbfbf8] border border-black/20 p-5 flex items-center justify-between hover:border-black active:scale-[0.98] transition-all cursor-pointer group">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center text-2xl shadow-sm border border-black/20 group-hover:scale-110 transition-transform">
                ⚅
              </div>
              <div>
                <h3 className="text-lg font-black text-[#111] [font-family:Georgia,'Times_New_Roman',serif]">Farkle</h3>
                <p className="text-xs font-bold text-black/50">Regular & stealing modes</p>
              </div>
            </div>
            <div className="text-black/35 text-xl font-bold group-hover:text-black transition-colors">▸</div>
          </button>
        </div>

      </div>
      </main>
    </>
  );
}

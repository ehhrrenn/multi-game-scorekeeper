'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { ActiveSession } from '../../hooks/useActiveSession';
import { clearStoredGameState } from '../../lib/activeGameState';
import { db } from '../../lib/firebase';
import { createGuestPlayerId, fetchCloudPlayersWithLegacy, formatFirstName, mergePlayersById, upsertCloudPlayer } from '../../lib/cloudPlayers';
import {
  buildCatanGameRecord,
  buildCustomGameRecord,
  buildFarkleGameRecord,
  buildYahtzeeGameRecord,
  saveGameRecordToCloud,
  upsertGameRecord,
  type GameRecord,
} from '../../lib/gameHistory';
import {
  computeBonusHolders,
  computeCatanTotals,
  emptyCatanBuildState,
  ISLAND1_TURN_LIMIT,
  ISLAND2_TARGET_VP,
  type CatanBoard,
  type CatanResourceId,
  type CatanScoreMap,
} from '../../lib/catanScoring';
import { useGameState } from '../../hooks/useGameState';
import BottomNav from '../components/BottomNav';
import { useActiveSession } from '../../hooks/useActiveSession';
import PlayerSetupPanel from '../components/PlayerSetupPanel';
import CatanPlayerBoard from '../components/CatanPlayerBoard';

type Player = { id: string; name: string; emoji: string; photoURL?: string; isCloudUser?: boolean; useCustomEmoji?: boolean };
type PlayerSnapshot = Player;

const EMOJIS = ['☞', '✂', '☂', '☎', '✈', '✉', '✍', '✎', '☕', '⚓', '⚙', '⌚', '⌛', '⚖', '⚒', '⚗', '⚐', '⚑', '♟', '♜'];

const pseudoRandom = (seed: number) => {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

function displayPlayerName(player: PlayerSnapshot): string {
  if (player.isCloudUser) {
    return formatFirstName(player.name);
  }

  return player.name.split(' ')[0] || player.name;
}

export default function CatanPage() {
  const router = useRouter();
  const [phase, setPhase] = useGameState<'SETUP' | 'PLAYING'>('catan_phase', 'SETUP');
  const [players, setPlayers] = useGameState<Player[]>('catan_players', []);
  const [globalRoster, setGlobalRoster] = useGameState<Player[]>('scorekeeper_global_roster', []);
  const [, setGameHistory] = useGameState<GameRecord[]>('scorekeeper_history', []);
  const [scores, setScores] = useGameState<CatanScoreMap>('catan_scores', {});
  const [board, setBoard] = useGameState<CatanBoard>('catan_board', 'island1');
  const [currentRoundIndex, setCurrentRoundIndex] = useGameState<number>('catan_round_index', 0);
  const [currentPlayerIndex, setCurrentPlayerIndex] = useGameState<number>('catan_player_index', 0);
  const [hasCelebrated, setHasCelebrated] = useGameState<boolean>('catan_has_celebrated', false);

  const [allAvailablePlayers, setAllAvailablePlayers] = useState<PlayerSnapshot[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreatingPlayer, setIsCreatingPlayer] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState('');
  const [activeEmojiPicker, setActiveEmojiPicker] = useState<string | null>(null);
  const [showSessionConflict, setShowSessionConflict] = useState(false);
  const [showClearSetupConfirm, setShowClearSetupConfirm] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [winnerEmoji, setWinnerEmoji] = useState<string>('🏆');

  const { activeSession, saveSession, clearSession } = useActiveSession();
  const currentSessionId = activeSession?.gameType === 'catan' ? activeSession.sessionId : undefined;
  const hasInProgressGame = players.length > 0 || Object.keys(scores).length > 0;
  const isIsland2 = board === 'island2';

  useEffect(() => {
    const fetchRoster = async () => {
      if (!db) {
        setAllAvailablePlayers(globalRoster);
        setIsLoading(false);
        return;
      }

      try {
        const cloudPlayers = await fetchCloudPlayersWithLegacy(db);
        setAllAvailablePlayers(mergePlayersById(globalRoster, cloudPlayers as Player[]));
      } catch (error) {
        console.error('Error fetching roster:', error);
        setAllAvailablePlayers(globalRoster);
      } finally {
        setIsLoading(false);
      }
    };

    void fetchRoster();
  }, [globalRoster]);

  useEffect(() => {
    if (!players.length) {
      setCurrentPlayerIndex(0);
      return;
    }

    if (currentPlayerIndex >= players.length) {
      setCurrentPlayerIndex(players.length - 1);
    }
  }, [currentPlayerIndex, players.length, setCurrentPlayerIndex]);

  useEffect(() => {
    if (!hasInProgressGame) {
      return;
    }

    saveSession(
      'catan',
      players.filter((player) => player?.id).map((player) => player.id),
      { players, scores, board, phase, currentRoundIndex, currentPlayerIndex },
      currentSessionId
    );
  }, [board, currentPlayerIndex, currentRoundIndex, currentSessionId, hasInProgressGame, phase, players, saveSession, scores]);

  const playerIds = useMemo(() => players.map((player) => player.id), [players]);

  const totals = useMemo(() => computeCatanTotals(scores, board, playerIds), [board, playerIds, scores]);
  const { roadHolderId, armyHolderId } = useMemo(
    () => (isIsland2 ? computeBonusHolders(scores, playerIds) : { roadHolderId: null, armyHolderId: null }),
    [isIsland2, playerIds, scores]
  );

  const isGameComplete = useMemo(() => {
    if (!players.length) return false;
    if (isIsland2) {
      return Object.values(totals).some((vp) => vp >= ISLAND2_TARGET_VP);
    }
    return currentRoundIndex >= ISLAND1_TURN_LIMIT;
  }, [currentRoundIndex, isIsland2, players.length, totals]);

  const highestTotal = players.length ? Math.max(...players.map((player) => totals[player.id] || 0)) : 0;
  const winningPlayers = useMemo(
    () => (isGameComplete ? players.filter((player) => (totals[player.id] || 0) === highestTotal) : []),
    [highestTotal, isGameComplete, players, totals]
  );

  const persistSessionToHistory = async (session: ActiveSession) => {
    let gameRecord: GameRecord | null = null;

    if (session.gameType === 'custom') {
      gameRecord = buildCustomGameRecord(session.gameState, `game_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`);
    }

    if (session.gameType === 'yahtzee') {
      gameRecord = buildYahtzeeGameRecord(session.gameState, `game_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`);
    }

    if (session.gameType === 'farkle') {
      gameRecord = buildFarkleGameRecord(session.gameState, `game_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`);
    }

    if (session.gameType === 'catan') {
      gameRecord = buildCatanGameRecord(session.gameState, `game_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`);
    }

    if (gameRecord) {
      setGameHistory((prev) => upsertGameRecord(prev, gameRecord));
      if (db) {
        try {
          await saveGameRecordToCloud(db, gameRecord);
        } catch (error) {
          console.error('Error saving replaced session to cloud:', error);
        }
      }
    }

    clearStoredGameState(session.gameType);
    clearSession();
  };

  const resolveSessionConflict = async (action: 'save' | 'delete') => {
    if (activeSession?.gameType && activeSession.gameType !== 'catan') {
      if (action === 'save') {
        await persistSessionToHistory(activeSession);
      } else {
        clearStoredGameState(activeSession.gameType);
        clearSession();
      }
    }

    setShowSessionConflict(false);
    startGame(true);
  };

  const getOrCreateActiveGameId = useCallback(() => {
    if (typeof window === 'undefined') {
      return `catan_${Date.now()}`;
    }

    const existingId = window.localStorage.getItem('scorekeeper_active_game_id');
    if (existingId && existingId.startsWith('catan_')) {
      return existingId;
    }

    const nextId = `catan_${Date.now()}`;
    window.localStorage.setItem('scorekeeper_active_game_id', nextId);
    return nextId;
  }, []);

  const resetGameState = () => {
    setPlayers([]);
    setScores({});
    setBoard('island1');
    setCurrentRoundIndex(0);
    setCurrentPlayerIndex(0);
    setPhase('SETUP');
    setShowCelebration(false);
    setWinnerEmoji('🏆');
    setHasCelebrated(false);
    clearStoredGameState('catan');
    if (activeSession?.gameType === 'catan') {
      clearSession();
    }
  };

  const startGame = (skipConflictCheck = false) => {
    if (!players.length) {
      return;
    }

    if (!skipConflictCheck && activeSession?.gameType && activeSession.gameType !== 'catan') {
      setShowSessionConflict(true);
      return;
    }

    getOrCreateActiveGameId();
    setPhase('PLAYING');
  };

  const buildCurrentRecord = () =>
    buildCatanGameRecord({ players, scores, board, roundIndex: currentRoundIndex, playerIndex: currentPlayerIndex }, getOrCreateActiveGameId());

  const handleSaveAndClose = async () => {
    const gameRecord = buildCurrentRecord();
    if (gameRecord) {
      setGameHistory((prev) => upsertGameRecord(prev, gameRecord));
      if (db) {
        try {
          await saveGameRecordToCloud(db, gameRecord);
        } catch (error) {
          console.error('Error saving Catan game to cloud:', error);
        }
      }
    }

    resetGameState();
    router.push('/history');
  };

  // Auto-save on every board edit so incomplete games appear in history
  useEffect(() => {
    if (phase !== 'PLAYING' || !Object.keys(scores).length) return;
    const timer = setTimeout(() => {
      const gameRecord = buildCatanGameRecord({ players, scores, board, roundIndex: currentRoundIndex, playerIndex: currentPlayerIndex }, getOrCreateActiveGameId());
      if (gameRecord) {
        setGameHistory((prev) => upsertGameRecord(prev, gameRecord));
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [board, currentPlayerIndex, currentRoundIndex, getOrCreateActiveGameId, phase, players, scores, setGameHistory]);

  const addPlayer = async () => {
    const trimmedName = newPlayerName.trim();
    if (!trimmedName) {
      return;
    }

    const newPlayer: Player = {
      id: createGuestPlayerId(),
      name: trimmedName,
      emoji: EMOJIS[Math.floor(Math.random() * EMOJIS.length)],
      isCloudUser: true
    };

    setPlayers((prev) => [...prev.filter((player) => player && player.id), newPlayer]);
    setAllAvailablePlayers((prev) => [...prev, newPlayer]);
    setGlobalRoster((prev) => mergePlayersById(prev, [newPlayer]));
    setNewPlayerName('');
    setIsCreatingPlayer(false);

    if (db) {
      try {
        await upsertCloudPlayer(db, {
          id: newPlayer.id,
          name: newPlayer.name,
          emoji: newPlayer.emoji,
          isCloudUser: true,
          isGuest: true,
          isAuthUser: false
        });
      } catch (error) {
        console.error('Error syncing player to cloud:', error);
      }
    }
  };

  const removePlayer = (playerId: string) => {
    setPlayers((prev) => prev.filter((player) => player.id !== playerId));
    setScores((prev) => {
      const next = { ...prev };
      delete next[playerId];
      return next;
    });
  };

  const movePlayer = (index: number, direction: 'UP' | 'DOWN') => {
    setPlayers((prev) => {
      const next = [...prev];
      if (direction === 'UP' && index > 0) {
        [next[index - 1], next[index]] = [next[index], next[index - 1]];
      }
      if (direction === 'DOWN' && index < next.length - 1) {
        [next[index + 1], next[index]] = [next[index], next[index + 1]];
      }
      return next;
    });
  };

  const updateEmoji = async (playerId: string, nextEmoji: string) => {
    setPlayers((prev) => prev.map((player) => (player.id === playerId ? { ...player, emoji: nextEmoji, useCustomEmoji: true } : player)));
    setAllAvailablePlayers((prev) => prev.map((player) => (player.id === playerId ? { ...player, emoji: nextEmoji, useCustomEmoji: true } : player)));
    setGlobalRoster((prev) => prev.map((player) => (player.id === playerId ? { ...player, emoji: nextEmoji, useCustomEmoji: true } : player)));

    const player = players.find((entry) => entry.id === playerId) || allAvailablePlayers.find((entry) => entry.id === playerId);
    if (db && player) {
      try {
        await upsertCloudPlayer(db, {
          id: playerId,
          name: player.name,
          emoji: nextEmoji,
          photoURL: player.photoURL,
          useCustomEmoji: true,
          isCloudUser: true,
          isGuest: !player.photoURL,
          isAuthUser: Boolean(player.photoURL)
        });
      } catch (error) {
        console.error('Error syncing emoji to cloud:', error);
      }
    }
  };

  const getBuild = useCallback((playerId: string) => scores[playerId] || emptyCatanBuildState(), [scores]);

  const toggleSettlement = (playerId: string, resource: CatanResourceId) => {
    setScores((prev) => {
      const build = prev[playerId] || emptyCatanBuildState();
      const nextHasSettlement = !build.settlements[resource];
      return {
        ...prev,
        [playerId]: {
          ...build,
          settlements: { ...build.settlements, [resource]: nextHasSettlement },
          // Can't have a city with no settlement — cascade-uncheck.
          cities: nextHasSettlement ? build.cities : { ...build.cities, [resource]: false },
        },
      };
    });
  };

  const toggleCity = (playerId: string, resource: CatanResourceId) => {
    setScores((prev) => {
      const build = prev[playerId] || emptyCatanBuildState();
      if (!build.settlements[resource]) return prev;
      return {
        ...prev,
        [playerId]: { ...build, cities: { ...build.cities, [resource]: !build.cities[resource] } },
      };
    });
  };

  const changeRoads = (playerId: string, delta: number) => {
    setScores((prev) => {
      const build = prev[playerId] || emptyCatanBuildState();
      return { ...prev, [playerId]: { ...build, roads: Math.max(0, build.roads + delta) } };
    });
  };

  const changeKnights = (playerId: string, delta: number) => {
    setScores((prev) => {
      const build = prev[playerId] || emptyCatanBuildState();
      return { ...prev, [playerId]: { ...build, knights: Math.max(0, build.knights + delta) } };
    });
  };

  const endTurn = () => {
    if (!isIsland2 && currentRoundIndex >= ISLAND1_TURN_LIMIT) return;
    if (currentPlayerIndex === players.length - 1) {
      setCurrentPlayerIndex(0);
      setCurrentRoundIndex((prev) => prev + 1);
    } else {
      setCurrentPlayerIndex((prev) => prev + 1);
    }
  };

  useEffect(() => {
    if (isGameComplete && !hasCelebrated && winningPlayers.length > 0) {
      const celebrationStart = setTimeout(() => {
        setWinnerEmoji(winningPlayers[0].emoji || '🏆');
        setShowCelebration(true);
        setHasCelebrated(true);
      }, 0);
      const celebrationEnd = setTimeout(() => setShowCelebration(false), 4500);

      return () => {
        clearTimeout(celebrationStart);
        clearTimeout(celebrationEnd);
      };
    }
  }, [isGameComplete, hasCelebrated, winningPlayers, setHasCelebrated]);

  const rainDrops = useMemo(() => {
    const emojiSeed = winnerEmoji.codePointAt(0) || 0;
    return Array.from({ length: 36 }).map((_, i) => {
      const base = emojiSeed + i * 23;
      return {
        id: i,
        emoji: i % 3 === 0 ? winnerEmoji : (i % 2 === 0 ? '🏆' : '🎉'),
        left: `${(pseudoRandom(base) * 100).toFixed(2)}%`,
        animationDuration: `${(pseudoRandom(base + 1) * 2 + 2).toFixed(2)}s`,
        animationDelay: `${(pseudoRandom(base + 2) * 2).toFixed(2)}s`
      };
    });
  }, [winnerEmoji]);

  if (phase === 'PLAYING') {
    return (
      <div className="min-h-screen bg-[#f6f6f2] pb-24 font-sans text-black">
        {showCelebration && (
          <div className="fixed inset-0 z-[120] pointer-events-none overflow-hidden">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-500 flex items-center justify-center">
              <h2 className="text-5xl font-black text-white drop-shadow-2xl animate-bounce z-10 text-center px-4">
                {winningPlayers.map((player) => displayPlayerName(player)).join(', ')} Wins!
              </h2>
            </div>
            {rainDrops.map((drop) => (
              <div
                key={drop.id}
                className="absolute text-4xl animate-fall drop-shadow-xl"
                style={{ left: drop.left, top: '-10%', animationDuration: drop.animationDuration, animationDelay: drop.animationDelay, animationFillMode: 'forwards' }}
              >
                {drop.emoji}
              </div>
            ))}
            <style dangerouslySetInnerHTML={{ __html: `
              @keyframes fall {
                0% { transform: translateY(-10vh) rotate(0deg); opacity: 1; }
                100% { transform: translateY(110vh) rotate(360deg); opacity: 0; }
              }
              .animate-fall { animation-name: fall; animation-timing-function: linear; }
            ` }} />
          </div>
        )}

        <div className="fixed top-0 left-0 right-0 h-16 bg-[#f8f8f5]/95 backdrop-blur-md border-b border-black/20 z-50 flex items-center justify-between px-4 max-w-screen-md mx-auto">
          <div className="min-w-0 pr-4">
            <h1 className="text-2xl font-black text-[#111] truncate [font-family:Georgia,'Times_New_Roman',serif]">
              {isIsland2 ? 'Island Two' : 'Island One'}
            </h1>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-black/55 truncate">
              {isIsland2
                ? `First to ${ISLAND2_TARGET_VP} VP • Turn ${currentRoundIndex + 1}`
                : `Turn ${Math.min(currentRoundIndex + 1, ISLAND1_TURN_LIMIT)} of ${ISLAND1_TURN_LIMIT}`}
            </p>
          </div>
          <button onClick={() => setPhase('SETUP')} className="h-10 px-3 bg-white border border-black/20 text-black rounded-none flex items-center justify-center text-sm font-bold active:scale-95 transition">Game Setup</button>
        </div>

        <main className="max-w-screen-md mx-auto px-4 pt-20">
          <div className="grid gap-3 mb-6">
            {players.map((player, index) => (
              <CatanPlayerBoard
                key={player.id}
                player={player}
                displayName={displayPlayerName(player)}
                build={getBuild(player.id)}
                board={board}
                holdsRoadBonus={player.id === roadHolderId}
                holdsArmyBonus={player.id === armyHolderId}
                isCurrentTurn={index === currentPlayerIndex && !isGameComplete}
                onToggleSettlement={(resource) => toggleSettlement(player.id, resource)}
                onToggleCity={(resource) => toggleCity(player.id, resource)}
                onRoadsChange={(delta) => changeRoads(player.id, delta)}
                onKnightsChange={(delta) => changeKnights(player.id, delta)}
              />
            ))}
          </div>

          <button
            onClick={endTurn}
            disabled={isGameComplete || (!isIsland2 && currentRoundIndex >= ISLAND1_TURN_LIMIT)}
            className="w-full mb-4 h-12 bg-black text-white font-black uppercase tracking-widest text-sm disabled:bg-black/10 disabled:text-black/40 active:scale-[0.98] transition-all"
          >
            {isGameComplete ? 'Game Complete' : `End Turn — ${displayPlayerName(players[currentPlayerIndex] || players[0])} → Next`}
          </button>

          <button onClick={() => void handleSaveAndClose()} className="w-full mb-8 h-11 bg-white border border-black/20 text-black font-bold text-sm active:scale-[0.98] transition-all">
            Save & Finish
          </button>
        </main>

        {showSessionConflict && activeSession?.gameType && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in" onClick={() => setShowSessionConflict(false)} />
            <div className="relative w-full max-w-sm rounded-[2rem] border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900 animate-in zoom-in-95 duration-200">
              <h3 className="mb-2 text-xl font-black text-slate-800 dark:text-white">Active Game Found</h3>
              <p className="mb-6 text-sm leading-relaxed text-slate-500 dark:text-slate-400">A different game session is already in progress. Save and close it, or delete it before starting the Catan Dice Game.</p>
              <div className="flex flex-col gap-3">
                <button onClick={() => void resolveSessionConflict('save')} className="w-full rounded-xl bg-blue-600 py-3 font-bold text-white shadow-sm active:scale-95 transition">Save & Close</button>
                <button onClick={() => void resolveSessionConflict('delete')} className="w-full rounded-xl border border-red-100 bg-red-50 py-3 font-bold text-red-600 transition active:scale-95 dark:border-red-900/30 dark:bg-red-900/20 dark:text-red-400">Delete & Close</button>
              </div>
            </div>
          </div>
        )}

        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f6f6f2] pb-24 font-sans text-black animate-in fade-in slide-in-from-bottom-2">
      <div className="fixed top-0 left-0 right-0 h-16 bg-[#f8f8f5]/95 backdrop-blur-md border-b border-black/20 z-40 flex items-center justify-between px-4 max-w-screen-md mx-auto">
        <h1 className="text-2xl font-black text-[#111] flex items-center gap-2 [font-family:Georgia,'Times_New_Roman',serif]">Catan Setup</h1>
        <button
          onClick={() => startGame()}
          disabled={players.length === 0}
          className={`disabled:bg-black/10 disabled:text-black/40 px-5 h-10 rounded-none font-bold active:scale-95 transition-all flex items-center justify-center text-sm border ${Object.keys(scores).length > 0 ? 'bg-black text-white border-black' : 'bg-white text-black border-black/25'}`}
        >
          {Object.keys(scores).length > 0 ? '▸ Resume Game' : '✦ Start Game'}
        </button>
      </div>

      <div className="mx-auto max-w-screen-md p-6 pt-[88px]">
        <h2 className="mb-2 ml-1 text-sm font-bold uppercase tracking-widest text-black/55">Board</h2>
        <div className="mb-2 rounded-none border border-black/20 bg-[#fbfbf8] p-5">
          <div className="flex border border-black/20 bg-white p-1 rounded-none">
            <button onClick={() => setBoard('island1')} className={`flex-1 rounded-none py-2.5 text-sm font-bold transition-all ${board === 'island1' ? 'bg-black text-white' : 'text-black/60 hover:bg-black/5'}`}>Island One</button>
            <button onClick={() => setBoard('island2')} className={`flex-1 rounded-none py-2.5 text-sm font-bold transition-all ${board === 'island2' ? 'bg-black text-white' : 'text-black/60 hover:bg-black/5'}`}>Island Two</button>
          </div>
          <p className="mt-3 text-xs font-medium text-black/55 leading-relaxed">
            {board === 'island2'
              ? `First to ${ISLAND2_TARGET_VP} VP wins. Adds Longest Road & Largest Army (+2 VP each).`
              : `Each player gets ${ISLAND1_TURN_LIMIT} turns — highest total VP when time's up wins.`}
          </p>
        </div>

        <h2 className="mb-2 ml-1 text-sm font-bold uppercase tracking-widest text-black/55">How To Score</h2>
        <div className="mb-8 rounded-none border border-black/20 bg-[#fbfbf8] p-5 text-xs font-medium text-black/60 leading-relaxed">
          Roll your own dice and tap what you built each turn — a Settlement (1 VP) per resource, then a City (+2 VP) once its Settlement is up.
          {isIsland2 ? ' Roads and Knights don’t score directly, but the player with the most of each (5+ roads / 3+ knights) holds a +2 VP bonus.' : ''}
        </div>

        <PlayerSetupPanel
          rosterPlayers={allAvailablePlayers.filter((p) => !players.some((a) => a.id === p.id))}
          activePlayers={players}
          isLoading={isLoading}
          formatName={displayPlayerName}
          onAddFromRoster={(player) => setPlayers([...players, { ...player }])}
          onRemove={removePlayer}
          onMove={movePlayer}
          onEmojiClick={setActiveEmojiPicker}
          onNewPlayerClick={() => setIsCreatingPlayer(true)}
          onClearSetup={() => setShowClearSetupConfirm(true)}
          createPlayerSlot={
            isCreatingPlayer ? (
              <div className="mb-6 rounded-none border border-black/20 bg-[#fbfbf8] p-4 animate-in fade-in slide-in-from-top-2">
                <div className="flex gap-2">
                  <input
                    value={newPlayerName}
                    onChange={(event) => setNewPlayerName(event.target.value)}
                    placeholder="Player name"
                    className="h-12 flex-1 rounded-none border border-black/20 bg-white px-4 font-bold outline-none focus:border-black"
                    autoFocus
                  />
                  <button onClick={() => void addPlayer()} className="rounded-none border border-black/30 bg-black px-5 font-bold text-white active:scale-95 transition">Add</button>
                  <button onClick={() => setIsCreatingPlayer(false)} className="rounded-none border border-black/20 bg-white px-4 font-bold text-black">✕</button>
                </div>
              </div>
            ) : undefined
          }
        />
      </div>

      {activeEmojiPicker && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in" onClick={() => setActiveEmojiPicker(null)} />
          <div className="relative grid max-w-sm grid-cols-5 gap-2 rounded-none border border-black/20 bg-[#fbfbf8] p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            {EMOJIS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => {
                  void updateEmoji(activeEmojiPicker, emoji);
                  setActiveEmojiPicker(null);
                }}
                className="flex h-12 w-12 items-center justify-center rounded-none border border-black/20 bg-white text-2xl transition active:scale-95 hover:bg-black/5"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}

      {showClearSetupConfirm && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in" onClick={() => setShowClearSetupConfirm(false)} />
          <div className="relative w-full max-w-sm rounded-[2rem] border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900 animate-in zoom-in-95 duration-200">
            <h3 className="mb-2 text-xl font-black text-slate-800 dark:text-white">Clear Catan Setup?</h3>
            <p className="mb-6 text-sm leading-relaxed text-slate-500 dark:text-slate-400">This removes the current Catan setup and any in-progress local board.</p>
            <div className="flex flex-col gap-3">
              <button onClick={() => { resetGameState(); setShowClearSetupConfirm(false); }} className="w-full rounded-xl bg-red-50 py-3 font-bold text-red-600 transition active:scale-95 dark:bg-red-900/20 dark:text-red-400">
                Clear Setup
              </button>
              <button onClick={() => setShowClearSetupConfirm(false)} className="w-full rounded-xl bg-slate-100 py-3 font-bold text-slate-700 transition active:scale-95 dark:bg-slate-800 dark:text-slate-200">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showSessionConflict && activeSession?.gameType && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in" onClick={() => setShowSessionConflict(false)} />
          <div className="relative w-full max-w-sm rounded-[2rem] border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900 animate-in zoom-in-95 duration-200">
            <h3 className="mb-2 text-xl font-black text-slate-800 dark:text-white">Active Game Found</h3>
            <p className="mb-6 text-sm leading-relaxed text-slate-500 dark:text-slate-400">A different game session is already in progress. Save and close it, or delete it before starting the Catan Dice Game.</p>
            <div className="flex flex-col gap-3">
              <button onClick={() => void resolveSessionConflict('save')} className="w-full rounded-xl bg-blue-600 py-3 font-bold text-white shadow-sm active:scale-95 transition">Save & Close</button>
              <button onClick={() => void resolveSessionConflict('delete')} className="w-full rounded-xl border border-red-100 bg-red-50 py-3 font-bold text-red-600 transition active:scale-95 dark:border-red-900/30 dark:bg-red-900/20 dark:text-red-400">Delete & Close</button>
            </div>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
}

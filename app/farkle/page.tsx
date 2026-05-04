'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ActiveSession } from '../../hooks/useActiveSession';
import { clearStoredGameState } from '../../lib/activeGameState';
import { db } from '../../lib/firebase';
import { createGuestPlayerId, fetchCloudPlayersWithLegacy, formatFirstName, mergePlayersById, upsertCloudPlayer } from '../../lib/cloudPlayers';
import { buildCustomGameRecord, buildFarkleGameRecord, buildYahtzeeGameRecord, saveGameRecordToCloud, upsertGameRecord, type FarkleMode, type FarkleScoreMap, type FarkleSettings, type GameRecord } from '../../lib/gameHistory';
import { getFarkleTurnValidationMessage, getQuickAddCombos } from '../../lib/farkleScoring';
import { useGameState } from '../../hooks/useGameState';
import BottomNav from '../components/BottomNav';
import { useActiveSession } from '../../hooks/useActiveSession';
import PlayerSetupPanel from '../components/PlayerSetupPanel';
import ScoreEntrySheet from '../components/ScoreEntrySheet';

type Player = { id: string; name: string; emoji: string; photoURL?: string; isCloudUser?: boolean; useCustomEmoji?: boolean };
type PlayerSnapshot = Player;
type ActiveCell = { roundIndex: number; playerId: string } | null;

const EMOJIS = ['🦊', '⚡️', '🦖', '🤠', '👾', '🍕', '🚀', '🐙', '🦄', '🥑', '🔥', '💎', '👻', '👑', '😎', '🤖', '👽', '🐶', '🐱', '🐼'];
const DEFAULT_SETTINGS: FarkleSettings = { targetScore: 10000, roundCount: null };
const DEFAULT_ROUND_COUNT = 10;

function displayPlayerName(player: PlayerSnapshot): string {
  if (player.isCloudUser) {
    return formatFirstName(player.name);
  }

  return player.name.split(' ')[0] || player.name;
}

export default function FarklePage() {
  const router = useRouter();
  const [phase, setPhase] = useGameState<'SETUP' | 'PLAYING'>('farkle_phase', 'SETUP');
  const [players, setPlayers] = useGameState<Player[]>('farkle_players', []);
  const [globalRoster, setGlobalRoster] = useGameState<Player[]>('scorekeeper_global_roster', []);
  const [gameHistory, setGameHistory] = useGameState<GameRecord[]>('scorekeeper_history', []);
  const [scores, setScores] = useGameState<FarkleScoreMap>('farkle_scores', {});
  const [mode, setMode] = useGameState<FarkleMode>('farkle_mode', 'regular');
  const [settings, setSettings] = useGameState<FarkleSettings>('farkle_settings', DEFAULT_SETTINGS);
  const [currentRoundIndex, setCurrentRoundIndex] = useGameState<number>('farkle_current_round', 0);
  const [currentPlayerIndex, setCurrentPlayerIndex] = useGameState<number>('farkle_current_player', 0);

  const [allAvailablePlayers, setAllAvailablePlayers] = useState<PlayerSnapshot[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreatingPlayer, setIsCreatingPlayer] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState('');
  const [activeEmojiPicker, setActiveEmojiPicker] = useState<string | null>(null);
  const [activeCell, setActiveCell] = useState<ActiveCell>(null);
  const [stealOfferCell, setStealOfferCell] = useState<ActiveCell>(null);
  const [inputValue, setInputValue] = useState('0');
  const [acceptedStolenScore, setAcceptedStolenScore] = useState<number | null>(null);
  const [entryMode, setEntryMode] = useState<'quick' | 'full'>('quick');
  const [showSessionConflict, setShowSessionConflict] = useState(false);
  const [showClearSetupConfirm, setShowClearSetupConfirm] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [playingView, setPlayingView] = useState<'GRID' | 'GRAPH'>('GRID');
  const [showCelebration, setShowCelebration] = useState(false);
  const [winnerEmoji, setWinnerEmoji] = useState<string>('🏆');
  const [hasCelebrated, setHasCelebrated] = useGameState<boolean>('farkle_has_celebrated', false);

  const { activeSession, saveSession, clearSession } = useActiveSession();
  const currentSessionId = activeSession?.gameType === 'farkle' ? activeSession.sessionId : undefined;
  const quickAddCombos = useMemo(() => getQuickAddCombos(), []);
  const hasInProgressGame = players.length > 0 || Object.keys(scores).length > 0;

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
      'farkle',
      players.filter((player) => player?.id).map((player) => player.id),
      { players, scores, mode, settings, phase, currentRoundIndex, currentPlayerIndex },
      currentSessionId
    );
  }, [currentPlayerIndex, currentRoundIndex, currentSessionId, hasInProgressGame, mode, phase, players, saveSession, scores, settings]);

  const getRoundScore = (playerId: string, roundIndex: number): number | null => {
    const value = scores[playerId]?.[String(roundIndex)];
    return typeof value === 'number' ? value : null;
  };

  const totalScores = useMemo(() => {
    return Object.fromEntries(
      players.map((player) => [
        player.id,
        Object.values(scores[player.id] || {}).reduce<number>((sum, value) => sum + (value ?? 0), 0)
      ])
    ) as Record<string, number>;
  }, [players, scores]);

  const highestSavedRoundIndex = useMemo(() => {
    const indexes = Object.values(scores).flatMap((playerRounds) => Object.keys(playerRounds).map(Number));
    return indexes.length ? Math.max(...indexes) : -1;
  }, [scores]);

  const completedRoundCount = useMemo(() => {
    if (!players.length) {
      return 0;
    }

    let roundIndex = 0;
    while (players.every((player) => getRoundScore(player.id, roundIndex) !== null)) {
      roundIndex += 1;
    }

    return roundIndex;
  }, [players, scores]);

  const targetReachedRoundIndex = useMemo(() => {
    if (settings.targetScore <= 0 || players.length === 0) {
      return null;
    }

    const runningTotals: Record<string, number> = Object.fromEntries(players.map((player) => [player.id, 0]));
    const maxRound = Math.max(highestSavedRoundIndex, currentRoundIndex);

    for (let roundIndex = 0; roundIndex <= maxRound; roundIndex += 1) {
      for (const player of players) {
        const score = getRoundScore(player.id, roundIndex);
        if (score === null) {
          continue;
        }

        runningTotals[player.id] += score;
        if (runningTotals[player.id] >= settings.targetScore) {
          return roundIndex;
        }
      }
    }

    return null;
  }, [settings.targetScore, players, highestSavedRoundIndex, currentRoundIndex, scores]);

  const targetReached = targetReachedRoundIndex !== null;
  const roundLimitReached = settings.roundCount !== null && completedRoundCount >= settings.roundCount;
  const usesRoundWinCondition = settings.roundCount !== null;
  const activeWinCondition: 'target' | 'rounds' = usesRoundWinCondition ? 'rounds' : 'target';
  const finalRoundCompletedForTarget = targetReachedRoundIndex !== null && completedRoundCount >= targetReachedRoundIndex + 1;
  const isGameComplete = players.length > 0 && (usesRoundWinCondition ? roundLimitReached : finalRoundCompletedForTarget);
  const currentPlayer = players[currentPlayerIndex] || null;
  const highestTotal = players.length ? Math.max(...players.map((player) => totalScores[player.id] || 0)) : 0;
  const winningPlayers = isGameComplete ? players.filter((player) => (totalScores[player.id] || 0) === highestTotal) : [];
  const visibleRoundCount = Math.max(
    1,
    currentRoundIndex + 1,
    highestSavedRoundIndex + 1,
    settings.roundCount || 0,
    completedRoundCount + (isGameComplete ? 0 : 1)
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
    if (activeSession?.gameType && activeSession.gameType !== 'farkle') {
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

  const getOrCreateActiveGameId = () => {
    if (typeof window === 'undefined') {
      return `farkle_${Date.now()}`;
    }

    const existingId = window.localStorage.getItem('scorekeeper_active_game_id');
    if (existingId && existingId.startsWith('farkle_')) {
      return existingId;
    }

    const nextId = `farkle_${Date.now()}`;
    window.localStorage.setItem('scorekeeper_active_game_id', nextId);
    return nextId;
  };

  const resetGameState = () => {
    setPlayers([]);
    setScores({});
    setMode('regular');
    setSettings(DEFAULT_SETTINGS);
    setCurrentRoundIndex(0);
    setCurrentPlayerIndex(0);
    setPhase('SETUP');
    setActiveCell(null);
    setStealOfferCell(null);
    setInputValue('0');
    setAcceptedStolenScore(null);
    setEntryMode('quick');
    setShowCelebration(false);
    setWinnerEmoji('🏆');
    setHasCelebrated(false);
    clearStoredGameState('farkle');
    if (activeSession?.gameType === 'farkle') {
      clearSession();
    }
  };

  const startGame = (skipConflictCheck = false) => {
    if (!players.length) {
      return;
    }

    if (!skipConflictCheck && activeSession?.gameType && activeSession.gameType !== 'farkle') {
      setShowSessionConflict(true);
      return;
    }

    getOrCreateActiveGameId();
    setPhase('PLAYING');
  };

  const buildCurrentRecord = () => buildFarkleGameRecord({ players, scores, mode, settings }, getOrCreateActiveGameId());

  const handleSaveGame = async () => {
    const gameRecord = buildCurrentRecord();
    if (!gameRecord) {
      return;
    }

    setGameHistory((prev) => upsertGameRecord(prev, gameRecord));
    if (db) {
      try {
        await saveGameRecordToCloud(db, gameRecord);
      } catch (error) {
        console.error('Error saving Farkle game to cloud:', error);
      }
    }

    setIsSaved(true);
    window.setTimeout(() => setIsSaved(false), 2000);
  };

  const handleSaveAndClose = async () => {
    const gameRecord = buildCurrentRecord();
    if (gameRecord) {
      setGameHistory((prev) => upsertGameRecord(prev, gameRecord));
      if (db) {
        try {
          await saveGameRecordToCloud(db, gameRecord);
        } catch (error) {
          console.error('Error saving Farkle game to cloud:', error);
        }
      }
    }

    resetGameState();
    router.push('/history');
  };

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
    setPlayers((prev) => prev.map((player) => (player.id === playerId ? { ...player, emoji: nextEmoji } : player)));
    setAllAvailablePlayers((prev) => prev.map((player) => (player.id === playerId ? { ...player, emoji: nextEmoji } : player)));
    setGlobalRoster((prev) => prev.map((player) => (player.id === playerId ? { ...player, emoji: nextEmoji } : player)));

    const player = players.find((entry) => entry.id === playerId) || allAvailablePlayers.find((entry) => entry.id === playerId);
    if (db && player) {
      try {
        await upsertCloudPlayer(db, {
          id: playerId,
          name: player.name,
          emoji: nextEmoji,
          photoURL: player.photoURL,
          useCustomEmoji: player.useCustomEmoji,
          isCloudUser: true,
          isGuest: !player.photoURL,
          isAuthUser: Boolean(player.photoURL)
        });
      } catch (error) {
        console.error('Error syncing emoji to cloud:', error);
      }
    }
  };

  const isCurrentTurnCell = (roundIndex: number, playerId: string) => {
    return !isGameComplete && currentPlayer?.id === playerId && currentRoundIndex === roundIndex;
  };

  const openScoreEntry = (roundIndex: number, playerId: string) => {
    const existingValue = getRoundScore(playerId, roundIndex);
    const currentTurn = isCurrentTurnCell(roundIndex, playerId);

    if (currentTurn && mode === 'stealing' && currentPlayerIndex > 0 && existingValue === null) {
      const previousPlayer = players[currentPlayerIndex - 1];
      const previousScore = previousPlayer ? getRoundScore(previousPlayer.id, roundIndex) : null;
      if (previousScore !== null && previousScore > 0) {
        setStealOfferCell({ roundIndex, playerId });
        return;
      }
    }

    setAcceptedStolenScore(null);
    setActiveCell({ roundIndex, playerId });
    setInputValue(existingValue !== null ? String(existingValue) : '0');
    setEntryMode(existingValue !== null ? 'full' : 'quick');
  };

  const acceptStealOffer = () => {
    if (!stealOfferCell) {
      return;
    }

    const previousPlayer = players[currentPlayerIndex - 1];
    const previousScore = previousPlayer ? getRoundScore(previousPlayer.id, stealOfferCell.roundIndex) : null;
    const stolenScore = previousScore || 0;
    setAcceptedStolenScore(stolenScore);
    setInputValue(String(stolenScore));
    setActiveCell(stealOfferCell);
    setStealOfferCell(null);
    setEntryMode('quick');
  };

  const rejectStealOffer = () => {
    if (!stealOfferCell) {
      return;
    }

    setAcceptedStolenScore(null);
    setInputValue('0');
    setActiveCell(stealOfferCell);
    setStealOfferCell(null);
    setEntryMode('quick');
  };

  const numericInput = Number.parseInt(inputValue || '0', 10) || 0;
  const validationMessage = activeCell
    ? getFarkleTurnValidationMessage(numericInput, activeCell.roundIndex === currentRoundIndex && activeCell.playerId === currentPlayer?.id ? acceptedStolenScore || 0 : 0)
    : null;
  const isScoreValid = activeCell ? validationMessage === null : false;

  const saveScore = () => {
    if (!activeCell || !isScoreValid) {
      return;
    }

    const scoreToSave = Number.parseInt(inputValue || '0', 10) || 0;
    const wasCurrentTurn = isCurrentTurnCell(activeCell.roundIndex, activeCell.playerId);

    setScores((prev) => ({
      ...prev,
      [activeCell.playerId]: {
        ...(prev[activeCell.playerId] || {}),
        [String(activeCell.roundIndex)]: scoreToSave
      }
    }));

    if (wasCurrentTurn) {
      if (currentPlayerIndex === players.length - 1) {
        const nextRoundIndex = activeCell.roundIndex + 1;
        if (settings.roundCount === null || nextRoundIndex < settings.roundCount) {
          setCurrentRoundIndex(nextRoundIndex);
        }
        setCurrentPlayerIndex(0);
      } else {
        setCurrentPlayerIndex(currentPlayerIndex + 1);
      }
    }

    setActiveCell(null);
    setStealOfferCell(null);
    setAcceptedStolenScore(null);
    setInputValue('0');
    setEntryMode('quick');
  };

  const incrementInput = (amount: number) => {
    setInputValue((prev) => String((Number.parseInt(prev || '0', 10) || 0) + amount));
  };

  useEffect(() => {
    if (isGameComplete && !hasCelebrated && winningPlayers.length > 0) {
      setWinnerEmoji(winningPlayers[0].emoji || '🏆');
      setShowCelebration(true);
      setHasCelebrated(true);
      setTimeout(() => setShowCelebration(false), 4500);
    }
  }, [isGameComplete, hasCelebrated, winningPlayers, setHasCelebrated]);

  const rainDrops = useMemo(() => Array.from({ length: 36 }).map((_, i) => ({
    id: i,
    emoji: i % 3 === 0 ? winnerEmoji : (i % 2 === 0 ? '🏆' : '🎉'),
    left: `${Math.random() * 100}%`,
    animationDuration: `${Math.random() * 2 + 2}s`,
    animationDelay: `${Math.random() * 2}s`
  })), [winnerEmoji]);

  const setWinCondition = (nextCondition: 'target' | 'rounds') => {
    setSettings((prev) => {
      if (nextCondition === 'rounds') {
        return {
          ...prev,
          targetScore: 0,
          roundCount: prev.roundCount && prev.roundCount > 0 ? prev.roundCount : DEFAULT_ROUND_COUNT
        };
      }

      return {
        ...prev,
        targetScore: prev.targetScore > 0 ? prev.targetScore : DEFAULT_SETTINGS.targetScore,
        roundCount: null
      };
    });
  };

  const handleTargetChange = (value: string) => {
    const nextValue = Number.parseInt(value || '0', 10);
    setSettings((prev) => ({
      ...prev,
      targetScore: Number.isFinite(nextValue) ? Math.max(1, nextValue) : DEFAULT_SETTINGS.targetScore,
      roundCount: null
    }));
  };

  const handleRoundCountChange = (value: string) => {
    if (!value.trim()) {
      setSettings((prev) => ({ ...prev, roundCount: DEFAULT_ROUND_COUNT, targetScore: 0 }));
      return;
    }

    const nextValue = Number.parseInt(value, 10);
    setSettings((prev) => ({
      ...prev,
      targetScore: 0,
      roundCount: Number.isFinite(nextValue) && nextValue > 0 ? nextValue : DEFAULT_ROUND_COUNT
    }));
  };

  if (phase === 'PLAYING') {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-[320px] font-sans text-slate-800 dark:text-slate-200">
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

        <div className="fixed top-0 left-0 right-0 h-16 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md shadow-sm border-b border-slate-200 dark:border-slate-800 z-50 flex items-center justify-between px-4 max-w-screen-md mx-auto">
          <div className="min-w-0 pr-4">
            <h1 className="text-2xl font-black text-slate-800 dark:text-white truncate">{mode === 'stealing' ? 'Farkle Stealing' : 'Farkle'}</h1>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500 truncate">
              {usesRoundWinCondition
                ? `First through ${settings.roundCount} rounds • Round ${currentRoundIndex + 1}`
                : `To ${settings.targetScore.toLocaleString()} • ${targetReached ? 'Final Round' : `Round ${currentRoundIndex + 1}`}`}
            </p>
          </div>
          <button onClick={() => setPhase('SETUP')} className="w-10 h-10 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-full flex items-center justify-center text-xl active:scale-95 transition">⚙️</button>
        </div>

        <main className="max-w-screen-md mx-auto px-4 pt-16">
          <div className="sticky top-16 z-40 bg-slate-50/95 dark:bg-slate-950/95 backdrop-blur-md pt-2 pb-3 mb-3">
            <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
              <button onClick={() => setPlayingView('GRID')} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${playingView === 'GRID' ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}>
                🧮 Score Grid
              </button>
              <button onClick={() => setPlayingView('GRAPH')} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${playingView === 'GRAPH' ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}>
                📈 Live Graph
              </button>
            </div>
          </div>

          {playingView === 'GRID' ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden mb-6">
              <div className="max-h-[calc(100dvh-21rem)] overflow-auto scrollbar-hide">
                <table className="w-full table-fixed min-w-max">
                  <colgroup>
                    <col className="w-16" />
                    {players.map((player) => (
                      <col key={`${player.id}-col`} className="w-28" />
                    ))}
                  </colgroup>
                  <thead>
                    <tr>
                      <th className="w-16 sticky left-0 top-0 z-30 bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur-md border-b border-r border-slate-200 dark:border-slate-700 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">
                        Rnd
                      </th>
                      {players.map((player, index) => {
                        const isCurrentPlayer = index === currentPlayerIndex && !isGameComplete;
                        return (
                          <th key={player.id} className={`w-28 sticky top-0 z-20 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 p-3 ${isCurrentPlayer ? 'bg-blue-50/95 dark:bg-blue-900/30' : 'bg-white/95 dark:bg-slate-900/95'}`}>
                            <div className="flex flex-col items-center gap-1">
                              <div className="w-10 h-10 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-full flex items-center justify-center text-xl overflow-hidden shadow-sm">
                                {player.isCloudUser && player.photoURL && !player.useCustomEmoji ? (
                                  <img src={player.photoURL} alt={player.name} referrerPolicy="no-referrer" className="w-full h-full object-cover rounded-full" />
                                ) : (
                                  <span>{player.emoji || '👤'}</span>
                                )}
                              </div>
                              <div className="text-[11px] font-black text-slate-700 dark:text-slate-200 uppercase tracking-wide truncate w-full text-center">
                                {displayPlayerName(player)}
                              </div>
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: visibleRoundCount }).map((_, roundIndex) => (
                      <tr key={roundIndex} className="border-b dark:border-slate-800 bg-white dark:bg-slate-900">
                        <td className="w-16 p-2 border-r dark:border-slate-800 align-middle bg-slate-50 dark:bg-slate-950/50 text-center text-sm font-bold text-slate-500 dark:text-slate-400 sticky left-0 z-10">
                          {roundIndex + 1}
                        </td>
                        {players.map((player) => {
                          const score = getRoundScore(player.id, roundIndex);
                          const editable = true;
                          const isCurrent = isCurrentTurnCell(roundIndex, player.id);
                          const isBust = score === 0 && score !== null;
                          return (
                            <td
                              key={`${player.id}-${roundIndex}`}
                              onClick={() => editable && openScoreEntry(roundIndex, player.id)}
                              className={`relative w-28 border-l border-slate-50 dark:border-slate-800 p-3 text-center align-middle transition ${editable ? 'cursor-pointer active:bg-slate-50 dark:active:bg-slate-800' : 'cursor-default'} ${isCurrent ? 'bg-blue-50 dark:bg-blue-900/20 ring-2 ring-inset ring-blue-500' : ''}`}
                            >
                              {score !== null ? (
                                <div className="flex flex-col items-center justify-center gap-1">
                                  <span className={`text-xl font-black ${isBust ? 'text-red-500 dark:text-red-400' : 'text-slate-800 dark:text-white'}`}>{score}</span>
                                  {isBust && <span className="text-lg leading-none">💥</span>}
                                </div>
                              ) : (
                                <span className={`text-xl font-black ${isCurrent ? 'text-blue-500 dark:text-blue-300' : 'text-slate-200 dark:text-slate-700'}`}>{isCurrent ? '•' : '-'}</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-800 dark:bg-slate-200 text-white border-t dark:border-slate-700">
                    <tr>
                      <td className="w-16 p-4 font-bold border-r border-slate-700 dark:border-slate-300 text-xs uppercase opacity-60 text-center sticky left-0 z-10 bg-slate-800 dark:bg-slate-200">Tot</td>
                      {players.map((player) => {
                        const total = totalScores[player.id] || 0;
                        const hasWon = isGameComplete && total === highestTotal;
                        return (
                          <td key={`${player.id}-total`} className={`w-28 p-4 text-center text-xl font-black ${hasWon ? 'text-emerald-300 dark:text-emerald-600' : ''}`}>
                            {total}
                          </td>
                        );
                      })}
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden mb-6 animate-in fade-in">
              <svg viewBox={`0 -20 480 240`} className="w-full h-auto overflow-visible">
                {(() => {
                  const pointsData = players.map((player) => {
                    let runningTotal = 0;
                    const points = [0];
                    for (let roundIndex = 0; roundIndex < visibleRoundCount; roundIndex += 1) {
                      const roundScore = getRoundScore(player.id, roundIndex);
                      runningTotal += roundScore ?? 0;
                      points.push(runningTotal);
                    }

                    return { color: '#3b82f6', emoji: player.emoji, finalScore: runningTotal, points };
                  });

                  const allScores = pointsData.flatMap((d) => d.points);
                  const max = Math.max(...allScores, 10);
                  const min = Math.min(...allScores, 0);
                  const range = max - min || 1;

                  const labelData = pointsData
                    .map((d, i) => ({ ...d, color: ['#3b82f6', '#ec4899', '#22c55e', '#f97316', '#a855f7', '#8b5cf6', '#ef4444', '#06b6d4'][i % 8], targetY: 200 - ((d.finalScore - min) / range) * 200 }))
                    .sort((a, b) => a.targetY - b.targetY);

                  for (let i = 1; i < labelData.length; i += 1) {
                    if (labelData[i].targetY - labelData[i - 1].targetY < 18) {
                      labelData[i].targetY = labelData[i - 1].targetY + 18;
                    }
                  }

                  return (
                    <>
                      {min < 0 && <line x1="0" y1={200 - ((0 - min) / range) * 200} x2="400" y2={200 - ((0 - min) / range) * 200} stroke="#cbd5e1" strokeDasharray="4" />}
                      {labelData.map((d, i) => (
                        <polyline
                          key={`line-${i}`}
                          points={d.points.map((s, idx) => `${(idx / Math.max(d.points.length - 1, 1)) * 400},${200 - ((s - min) / range) * 200}`).join(' ')}
                          fill="none"
                          stroke={d.color}
                          strokeWidth="3.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="drop-shadow-sm"
                        />
                      ))}
                      {labelData.map((d, i) => (
                        <text key={`label-${i}`} x="408" y={d.targetY + 5} fill={d.color} fontSize="14" fontWeight="bold" className="drop-shadow-sm">
                          {d.finalScore} {d.emoji}
                        </text>
                      ))}
                    </>
                  );
                })()}
              </svg>
            </div>
          )}

          <div className="fixed bottom-[calc(116px+env(safe-area-inset-bottom))] left-0 right-0 z-40 mx-auto w-full max-w-screen-md px-4">
            <div className="rounded-2xl border border-slate-200/80 bg-slate-50/95 p-3 shadow-lg backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/95">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {!isGameComplete && currentPlayer && (
                  <button
                    onClick={() => openScoreEntry(currentRoundIndex, currentPlayer.id)}
                    className="rounded-xl bg-white dark:bg-slate-900 border-2 border-blue-200 dark:border-blue-900/50 p-4 text-sm font-black text-blue-600 dark:text-blue-300 shadow-sm active:scale-[0.98] transition"
                  >
                    🎯 Enter {displayPlayerName(currentPlayer)} Score
                  </button>
                )}
                <button
                  onClick={() => void handleSaveGame()}
                  className={`rounded-xl p-4 text-sm font-black shadow-sm active:scale-[0.98] transition ${isSaved ? 'bg-green-600 text-white' : 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'}`}
                >
                  {isSaved ? '✅ Saved!' : '💾 Save Game'}
                </button>
                <button
                  onClick={() => void handleSaveAndClose()}
                  className={`rounded-xl p-4 text-sm font-black shadow-sm active:scale-[0.98] transition ${isGameComplete ? 'bg-red-600 text-white' : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200'}`}
                >
                  {isGameComplete ? '🏁 Save & Close' : '⏹️ End Game'}
                </button>
              </div>
            </div>
          </div>
        </main>

        {stealOfferCell && currentPlayerIndex > 0 && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in" onClick={() => setStealOfferCell(null)} />
            <div className="relative w-full max-w-sm rounded-[2rem] border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900 animate-in zoom-in-95 duration-200">
              <h3 className="text-xl font-black text-slate-800 dark:text-white mb-2">Steal Previous Score?</h3>
              <p className="text-sm leading-relaxed text-slate-500 dark:text-slate-400 mb-6">
                {displayPlayerName(players[currentPlayerIndex - 1])} scored {getRoundScore(players[currentPlayerIndex - 1].id, stealOfferCell.roundIndex) || 0} points this round. Accept it to preload the num pad, or start fresh.
              </p>
              <div className="flex flex-col gap-3">
                <button onClick={acceptStealOffer} className="w-full rounded-xl bg-blue-600 py-3 font-bold text-white shadow-sm active:scale-95 transition">
                  Accept & Build On
                </button>
                <button onClick={rejectStealOffer} className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 font-bold text-slate-700 active:scale-95 transition dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  Start Fresh
                </button>
              </div>
            </div>
          </div>
        )}

        <ScoreEntrySheet
          open={!!activeCell}
          onClose={() => {
            setActiveCell(null);
            setAcceptedStolenScore(null);
            setInputValue('0');
            setEntryMode('quick');
          }}
          title={
            activeCell
              ? `${displayPlayerName(players.find((p) => p.id === activeCell.playerId) || { id: '', name: 'Player', emoji: '👤' })} • Round ${activeCell.roundIndex + 1}`
              : ''
          }
          displayValue={String(numericInput)}
          validationMessage={validationMessage}
          validLabel="Valid Farkle total"
          onSubmit={saveScore}
          submitDisabled={!isScoreValid}
          headerExtra={
            acceptedStolenScore !== null ? (
              <p className="mt-2 text-center text-xs font-bold uppercase tracking-[0.18em] text-amber-500">
                Stolen base: {acceptedStolenScore}
              </p>
            ) : undefined
          }
        >
          <div className="mb-3 flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
            <button
              onClick={() => setEntryMode('quick')}
              className={`flex-1 rounded-lg py-2 text-sm font-bold transition-all ${
                entryMode === 'quick' ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white' : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              Quick Entry
            </button>
            <button
              onClick={() => setEntryMode('full')}
              className={`flex-1 rounded-lg py-2 text-sm font-bold transition-all ${
                entryMode === 'full' ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white' : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              Full 0-9
            </button>
          </div>

          {entryMode === 'quick' ? (
            <div className="grid grid-cols-3 gap-2 mb-3">
              {quickAddCombos.map((combo) => (
                <button
                  key={combo.id}
                  onClick={() => incrementInput(combo.points)}
                  className="rounded-xl bg-amber-50 px-3 py-2.5 text-sm font-black text-amber-700 transition active:scale-95 dark:bg-amber-900/20 dark:text-amber-300"
                >
                  <span className="block text-xl leading-none">+{combo.points}</span>
                  <span className="block text-[11px] uppercase tracking-wide opacity-70 mt-1">{combo.label}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2 mb-3">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
                <button
                  key={digit}
                  onClick={() => setInputValue((prev) => (prev === '0' ? String(digit) : `${prev}${digit}`))}
                  className="rounded-xl bg-slate-100 py-3 text-xl font-semibold transition active:scale-95 dark:bg-slate-800"
                >
                  {digit}
                </button>
              ))}
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => { setInputValue('0'); setAcceptedStolenScore(null); }}
              className="rounded-xl bg-red-50 py-3 text-lg font-bold text-red-500 transition active:scale-95 dark:bg-red-900/20 dark:text-red-400"
            >
              {acceptedStolenScore !== null ? 'Clear Steal' : 'Clear'}
            </button>
            <button
              onClick={() => setInputValue((prev) => (prev === '0' ? '0' : `${prev}0`))}
              className="rounded-xl bg-slate-100 py-3 text-xl font-semibold transition active:scale-95 dark:bg-slate-800"
            >
              0
            </button>
            <button
              onClick={() => setInputValue((prev) => (prev.length <= 1 ? '0' : prev.slice(0, -1)))}
              className="rounded-xl bg-slate-200 py-3 text-xl font-bold text-slate-700 transition active:scale-95 dark:bg-slate-700 dark:text-slate-200"
            >
              ⌫
            </button>
          </div>
        </ScoreEntrySheet>

        {showSessionConflict && activeSession?.gameType && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in" onClick={() => setShowSessionConflict(false)} />
            <div className="relative w-full max-w-sm rounded-[2rem] border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900 animate-in zoom-in-95 duration-200">
              <h3 className="mb-2 text-xl font-black text-slate-800 dark:text-white">Active Game Found</h3>
              <p className="mb-6 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                A {activeSession.gameType === 'custom' ? 'Custom Game' : activeSession.gameType === 'yahtzee' ? 'Yahtzee' : 'Farkle'} session is already in progress. Save and close it, or delete it before starting Farkle.
              </p>
              <div className="flex flex-col gap-3">
                <button onClick={() => void resolveSessionConflict('save')} className="w-full rounded-xl bg-blue-600 py-3 font-bold text-white shadow-sm active:scale-95 transition">
                  Save & Close
                </button>
                <button onClick={() => void resolveSessionConflict('delete')} className="w-full rounded-xl border border-red-100 bg-red-50 py-3 font-bold text-red-600 transition active:scale-95 dark:border-red-900/30 dark:bg-red-900/20 dark:text-red-400">
                  Delete & Close
                </button>
              </div>
            </div>
          </div>
        )}

        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-24 font-sans text-slate-800 dark:text-slate-200 animate-in fade-in slide-in-from-bottom-2">
      <div className="fixed top-0 left-0 right-0 h-16 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md shadow-sm border-b border-slate-200 dark:border-slate-800 z-40 flex items-center justify-between px-4 max-w-screen-md mx-auto">
        <h1 className="text-2xl font-black text-slate-800 dark:text-white flex items-center gap-2">🎲 Farkle Setup</h1>
        <button
          onClick={() => startGame()}
          disabled={players.length === 0}
          className={`h-10 rounded-full px-5 text-sm font-bold shadow-sm transition-all active:scale-95 ${players.length === 0 ? 'bg-slate-200 text-slate-400 dark:bg-slate-800' : Object.keys(scores).length > 0 ? 'bg-blue-600 text-white' : 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'}`}
        >
          {Object.keys(scores).length > 0 ? '▶️ Resume Game' : '🚀 Start Game'}
        </button>
      </div>

      <div className="mx-auto max-w-screen-md p-6 pt-[88px]">
        <h2 className="mb-2 ml-1 text-sm font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">Game Rules</h2>
        <div className="mb-6 rounded-2xl border-2 border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <label className="mb-3 block text-xs font-bold uppercase tracking-widest text-slate-400">Farkle Mode</label>
          <div className="flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
            <button onClick={() => setMode('regular')} className={`flex-1 rounded-lg py-2.5 text-sm font-bold transition-all ${mode === 'regular' ? 'bg-white text-slate-800 shadow-sm dark:bg-slate-700 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>Regular</button>
            <button onClick={() => setMode('stealing')} className={`flex-1 rounded-lg py-2.5 text-sm font-bold transition-all ${mode === 'stealing' ? 'bg-white text-slate-800 shadow-sm dark:bg-slate-700 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>Stealing</button>
          </div>
        </div>

        <h2 className="mb-2 ml-1 text-sm font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">Win Conditions</h2>
        <div className="mb-8 rounded-2xl border-2 border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <label className="mb-3 block text-xs font-bold uppercase tracking-widest text-slate-400">Win Method</label>
          <div className="mb-4 flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
            <button
              onClick={() => setWinCondition('target')}
              className={`flex-1 rounded-lg py-2.5 text-sm font-bold transition-all ${activeWinCondition === 'target' ? 'bg-white text-slate-800 shadow-sm dark:bg-slate-700 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}
            >
              Target Score
            </button>
            <button
              onClick={() => setWinCondition('rounds')}
              className={`flex-1 rounded-lg py-2.5 text-sm font-bold transition-all ${activeWinCondition === 'rounds' ? 'bg-white text-slate-800 shadow-sm dark:bg-slate-700 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}
            >
              Round Count
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={`mb-2 block text-xs font-bold uppercase tracking-widest ${activeWinCondition === 'target' ? 'text-slate-400' : 'text-slate-300 dark:text-slate-600'}`}>Target Score</label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSettings((prev) => ({ ...prev, targetScore: Math.max(1, prev.targetScore - 500), roundCount: null }))}
                disabled={activeWinCondition !== 'target'}
                className="h-11 w-11 rounded-xl bg-slate-100 text-xl font-black disabled:opacity-40 disabled:cursor-not-allowed dark:bg-slate-800"
              >
                -
              </button>
              <input
                type="number"
                min={1}
                value={settings.targetScore}
                onChange={(event) => handleTargetChange(event.target.value)}
                disabled={activeWinCondition !== 'target'}
                className="h-11 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 text-lg font-black outline-none focus:border-blue-500 disabled:opacity-40 disabled:cursor-not-allowed dark:border-slate-700 dark:bg-slate-950"
              />
              <button
                onClick={() => setSettings((prev) => ({ ...prev, targetScore: prev.targetScore + 500, roundCount: null }))}
                disabled={activeWinCondition !== 'target'}
                className="h-11 w-11 rounded-xl bg-slate-100 text-xl font-black disabled:opacity-40 disabled:cursor-not-allowed dark:bg-slate-800"
              >
                +
              </button>
            </div>
          </div>
          <div>
            <label className={`mb-2 block text-xs font-bold uppercase tracking-widest ${activeWinCondition === 'rounds' ? 'text-slate-400' : 'text-slate-300 dark:text-slate-600'}`}>Round Count</label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSettings((prev) => ({ ...prev, targetScore: 0, roundCount: Math.max(1, (prev.roundCount || DEFAULT_ROUND_COUNT) - 1) }))}
                disabled={activeWinCondition !== 'rounds'}
                className="h-11 w-11 rounded-xl bg-slate-100 text-xl font-black disabled:opacity-40 disabled:cursor-not-allowed dark:bg-slate-800"
              >
                -
              </button>
              <input
                type="number"
                min={1}
                value={settings.roundCount ?? DEFAULT_ROUND_COUNT}
                onChange={(event) => handleRoundCountChange(event.target.value)}
                disabled={activeWinCondition !== 'rounds'}
                className="h-11 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 text-lg font-black outline-none focus:border-blue-500 disabled:opacity-40 disabled:cursor-not-allowed dark:border-slate-700 dark:bg-slate-950"
              />
              <button
                onClick={() => setSettings((prev) => ({ ...prev, targetScore: 0, roundCount: (prev.roundCount || DEFAULT_ROUND_COUNT) + 1 }))}
                disabled={activeWinCondition !== 'rounds'}
                className="h-11 w-11 rounded-xl bg-slate-100 text-xl font-black disabled:opacity-40 disabled:cursor-not-allowed dark:bg-slate-800"
              >
                +
              </button>
            </div>
            <p className="mt-2 text-xs font-medium text-slate-500 dark:text-slate-400">Pick one method only. Switching methods automatically disables and clears the other win condition.</p>
          </div>
          </div>
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
              <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 animate-in fade-in slide-in-from-top-2">
                <div className="flex gap-2">
                  <input
                    value={newPlayerName}
                    onChange={(event) => setNewPlayerName(event.target.value)}
                    placeholder="Player name"
                    className="h-12 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 font-bold outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950"
                    autoFocus
                  />
                  <button onClick={() => void addPlayer()} className="rounded-xl bg-blue-600 px-5 font-bold text-white shadow-sm active:scale-95 transition">Add</button>
                  <button onClick={() => setIsCreatingPlayer(false)} className="rounded-xl bg-slate-200 px-4 font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">✕</button>
                </div>
              </div>
            ) : undefined
          }
        />
      </div>

      {activeEmojiPicker && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in" onClick={() => setActiveEmojiPicker(null)} />
          <div className="relative grid max-w-sm grid-cols-5 gap-2 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900 animate-in zoom-in-95 duration-200">
            {EMOJIS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => {
                  void updateEmoji(activeEmojiPicker, emoji);
                  setActiveEmojiPicker(null);
                }}
                className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-2xl transition active:scale-95 dark:bg-slate-800"
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
            <h3 className="mb-2 text-xl font-black text-slate-800 dark:text-white">Clear Farkle Setup?</h3>
            <p className="mb-6 text-sm leading-relaxed text-slate-500 dark:text-slate-400">This removes the current Farkle setup and any in-progress local board.</p>
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
            <p className="mb-6 text-sm leading-relaxed text-slate-500 dark:text-slate-400">A different game session is already in progress. Save and close it, or delete it before starting Farkle.</p>
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
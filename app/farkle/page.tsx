'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import Image from 'next/image';
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
import DiceRollerSheet from '../components/DiceRollerSheet';

type Player = { id: string; name: string; emoji: string; photoURL?: string; isCloudUser?: boolean; useCustomEmoji?: boolean };
type PlayerSnapshot = Player;
type ActiveCell = { roundIndex: number; playerId: string } | null;

const EMOJIS = ['☞', '✂', '☂', '☎', '✈', '✉', '✍', '✎', '☕', '⚓', '⚙', '⌚', '⌛', '⚖', '⚒', '⚗', '⚐', '⚑', '♟', '♜'];
const DEFAULT_SETTINGS: FarkleSettings = { targetScore: 10000, roundCount: null };
const DEFAULT_ROUND_COUNT = 10;
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

export default function FarklePage() {
  const router = useRouter();
  const [phase, setPhase] = useGameState<'SETUP' | 'PLAYING'>('farkle_phase', 'SETUP');
  const [players, setPlayers] = useGameState<Player[]>('farkle_players', []);
  const [globalRoster, setGlobalRoster] = useGameState<Player[]>('scorekeeper_global_roster', []);
  const [, setGameHistory] = useGameState<GameRecord[]>('scorekeeper_history', []);
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
  const [chasePromptCell, setChasePromptCell] = useState<ActiveCell>(null);
  const [inputValue, setInputValue] = useState('0');
  const [acceptedStolenScore, setAcceptedStolenScore] = useState<number | null>(null);
  const [entryMode, setEntryMode] = useState<'quick' | 'full'>('quick');
  const [showSessionConflict, setShowSessionConflict] = useState(false);
  const [showClearSetupConfirm, setShowClearSetupConfirm] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [playingView, setPlayingView] = useState<'GRID' | 'GRAPH'>('GRID');
  const [showCelebration, setShowCelebration] = useState(false);
  const [winnerEmoji, setWinnerEmoji] = useState<string>('🏆');
  const [gridEditVersion, setGridEditVersion] = useState(0);
  const [hasCelebrated, setHasCelebrated] = useGameState<boolean>('farkle_has_celebrated', false);
  const [showDiceRoller, setShowDiceRoller] = useState(false);

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

  const getRoundScore = useCallback((playerId: string, roundIndex: number): number | null => {
    const value = scores[playerId]?.[String(roundIndex)];
    return typeof value === 'number' ? value : null;
  }, [scores]);

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
  }, [getRoundScore, players]);

  const targetChaseState = useMemo(() => {
    const totals: Record<string, number> = Object.fromEntries(players.map((player) => [player.id, 0]));

    if (settings.roundCount !== null || settings.targetScore <= 0 || players.length === 0) {
      return {
        chaseActive: false,
        chaseComplete: false,
        leaderId: null as string | null,
        scoreToBeat: 0,
        totals,
        pointsNeededToPassForCurrentPlayer: null as number | null
      };
    }

    const maxRound = Math.max(highestSavedRoundIndex, currentRoundIndex);
    let chaseActive = false;
    let chaseComplete = false;
    let leaderId: string | null = null;
    let scoreToBeat = 0;
    let failedAttemptsSinceLeader = 0;

    for (let roundIndex = 0; roundIndex <= maxRound; roundIndex += 1) {
      for (const player of players) {
        const score = getRoundScore(player.id, roundIndex);
        if (score === null) {
          continue;
        }

        totals[player.id] += score;

        if (!chaseActive) {
          const anyReachedTarget = Object.values(totals).some((value) => value >= settings.targetScore);
          if (!anyReachedTarget) {
            continue;
          }

          chaseActive = true;
          let nextLeaderId: string | null = null;
          let nextScoreToBeat = -Infinity;
          for (const contender of players) {
            const contenderTotal = totals[contender.id] || 0;
            if (contenderTotal > nextScoreToBeat) {
              nextScoreToBeat = contenderTotal;
              nextLeaderId = contender.id;
            }
          }

          leaderId = nextLeaderId;
          scoreToBeat = Math.max(0, nextScoreToBeat);
          failedAttemptsSinceLeader = 0;
          continue;
        }

        if (chaseComplete || !leaderId || player.id === leaderId) {
          continue;
        }

        const challengerTotal = totals[player.id] || 0;
        if (challengerTotal > scoreToBeat) {
          leaderId = player.id;
          scoreToBeat = challengerTotal;
          failedAttemptsSinceLeader = 0;
        } else {
          failedAttemptsSinceLeader += 1;
          if (failedAttemptsSinceLeader >= players.length - 1) {
            chaseComplete = true;
          }
        }
      }
    }

    if (chaseActive && players.length === 1) {
      chaseComplete = true;
    }

    const currentPlayerId = players[currentPlayerIndex]?.id || null;
    const currentPlayerTotal = currentPlayerId ? totals[currentPlayerId] || 0 : 0;
    const pointsNeededToPassForCurrentPlayer =
      chaseActive && !chaseComplete && currentPlayerId && leaderId && currentPlayerId !== leaderId
        ? Math.max(1, scoreToBeat - currentPlayerTotal + 1)
        : null;

    return {
      chaseActive,
      chaseComplete,
      leaderId,
      scoreToBeat,
      totals,
      pointsNeededToPassForCurrentPlayer
    };
  }, [currentPlayerIndex, currentRoundIndex, getRoundScore, highestSavedRoundIndex, players, settings.roundCount, settings.targetScore]);

  const roundLimitReached = settings.roundCount !== null && completedRoundCount >= settings.roundCount;
  const usesRoundWinCondition = settings.roundCount !== null;
  const activeWinCondition: 'target' | 'rounds' = usesRoundWinCondition ? 'rounds' : 'target';
  const isGameComplete = players.length > 0 && (usesRoundWinCondition ? roundLimitReached : targetChaseState.chaseComplete);
  const currentPlayer = players[currentPlayerIndex] || null;
  const highestTotal = players.length ? Math.max(...players.map((player) => totalScores[player.id] || 0)) : 0;
  const winningPlayers = useMemo(
    () => (isGameComplete ? players.filter((player) => (totalScores[player.id] || 0) === highestTotal) : []),
    [highestTotal, isGameComplete, players, totalScores]
  );
  const visibleRoundCount = Math.max(
    1,
    currentRoundIndex + 1,
    highestSavedRoundIndex + 1,
    settings.roundCount || 0,
    completedRoundCount + (isGameComplete ? 0 : 1)
  );
  const graphLineStyles = useMemo(() => {
    const shades = ['#111111', '#2e2e2e', '#4a4a4a', '#666666', '#7a7a7a', '#909090', '#3a3a3a', '#555555'];
    const widths = [4, 3.5, 3.5, 3, 3, 2.5, 2.5, 2];
    const dashes = ['', '10 6', '4 4', '14 6 2 6', '2 4', '12 4', '8 3 2 3', '1 4'];

    return players.map((_, index) => ({
      stroke: shades[index % shades.length],
      strokeWidth: widths[index % widths.length],
      strokeDasharray: dashes[index % dashes.length]
    }));
  }, [players]);
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

  const getOrCreateActiveGameId = useCallback(() => {
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
  }, []);

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
    setChasePromptCell(null);
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

  const handleShare = () => {
    const gameName = mode === 'stealing' ? 'Farkle Stealing' : 'Farkle';
    const sortedPlayers = [...players].sort((a, b) => (totalScores[b.id] || 0) - (totalScores[a.id] || 0));
    const scoreLines = sortedPlayers.map((p, i) => `${i + 1}. ${p.emoji} ${displayPlayerName(p)}: ${totalScores[p.id] || 0}`);
    const shareText = `🏆 ${gameName}\n${scoreLines.join('\n')}`;
    if (navigator.share) {
      navigator.share({ title: `${gameName} Results`, text: shareText }).catch(() => {});
    } else {
      navigator.clipboard.writeText(shareText).catch(() => {});
    }
  };

  // Auto-save on every score change so incomplete games appear in history
  useEffect(() => {
    if (phase !== 'PLAYING' || gridEditVersion === 0) return;
    const timer = setTimeout(() => {
      const gameRecord = buildFarkleGameRecord({ players, scores, mode, settings }, getOrCreateActiveGameId());
      if (gameRecord) {
        setGameHistory(prev => upsertGameRecord(prev, gameRecord));
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [getOrCreateActiveGameId, gridEditVersion, mode, phase, players, scores, settings, setGameHistory]);

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

  const isCurrentTurnCell = (roundIndex: number, playerId: string) => {
    return !isGameComplete && currentPlayer?.id === playerId && currentRoundIndex === roundIndex;
  };

  const openScoreEntry = (roundIndex: number, playerId: string) => {
    const existingValue = getRoundScore(playerId, roundIndex);
    const currentTurn = isCurrentTurnCell(roundIndex, playerId);
    const shouldShowChasePrompt =
      currentTurn
      && targetChaseState.chaseActive
      && !targetChaseState.chaseComplete
      && targetChaseState.leaderId !== null
      && playerId !== targetChaseState.leaderId;
    let shouldShowStealPrompt = false;

    if (currentTurn && mode === 'stealing' && existingValue === null) {
      const sourcePlayerIndex = currentPlayerIndex > 0 ? currentPlayerIndex - 1 : players.length - 1;
      const sourceRoundIndex = currentPlayerIndex > 0 ? roundIndex : roundIndex - 1;
      const sourcePlayer = players[sourcePlayerIndex];
      const previousScore = sourcePlayer && sourceRoundIndex >= 0 ? getRoundScore(sourcePlayer.id, sourceRoundIndex) : null;
      if (previousScore !== null && previousScore > 0) {
        shouldShowStealPrompt = true;
      }
    }

    if ((shouldShowStealPrompt || shouldShowChasePrompt) && existingValue === null) {
      if (shouldShowStealPrompt) {
        setStealOfferCell({ roundIndex, playerId });
      }
      if (shouldShowChasePrompt) {
        setChasePromptCell({ roundIndex, playerId });
      }
      return;
    }

    setAcceptedStolenScore(null);
    setActiveCell({ roundIndex, playerId });
    setInputValue(existingValue !== null ? String(existingValue) : '0');
    setEntryMode(existingValue !== null ? 'full' : 'quick');
  };

  const getStealOfferSource = (offerCell: NonNullable<ActiveCell>) => {
    if (!players.length) {
      return null;
    }

    const sourcePlayerIndex = currentPlayerIndex > 0 ? currentPlayerIndex - 1 : players.length - 1;
    const sourceRoundIndex = currentPlayerIndex > 0 ? offerCell.roundIndex : offerCell.roundIndex - 1;

    if (sourceRoundIndex < 0) {
      return null;
    }

    const sourcePlayer = players[sourcePlayerIndex];
    if (!sourcePlayer) {
      return null;
    }

    const sourceScore = getRoundScore(sourcePlayer.id, sourceRoundIndex);
    if (sourceScore === null) {
      return null;
    }

    return {
      player: sourcePlayer,
      roundIndex: sourceRoundIndex,
      score: sourceScore
    };
  };

  const acceptStealOffer = () => {
    if (!stealOfferCell) {
      return;
    }

    const source = getStealOfferSource(stealOfferCell);
    const stolenScore = source?.score || 0;
    setAcceptedStolenScore(stolenScore);
    setInputValue(String(stolenScore));
    setActiveCell(stealOfferCell);
    setStealOfferCell(null);
    setChasePromptCell(null);
    setEntryMode('quick');
  };
  const stealOfferSource = stealOfferCell ? getStealOfferSource(stealOfferCell) : null;


  const rejectStealOffer = () => {
    if (!stealOfferCell) {
      return;
    }

    setAcceptedStolenScore(null);
    setInputValue('0');
    setActiveCell(stealOfferCell);
    setStealOfferCell(null);
    setChasePromptCell(null);
    setEntryMode('quick');
  };

  const quickSelectFarkleFromStealOffer = () => {
    if (!stealOfferCell) {
      return;
    }

    const scoreToSave = 0;
    const wasCurrentTurn = isCurrentTurnCell(stealOfferCell.roundIndex, stealOfferCell.playerId);

    setScores((prev) => ({
      ...prev,
      [stealOfferCell.playerId]: {
        ...(prev[stealOfferCell.playerId] || {}),
        [String(stealOfferCell.roundIndex)]: scoreToSave
      }
    }));
    setGridEditVersion((prev) => prev + 1);

    if (wasCurrentTurn) {
      if (currentPlayerIndex === players.length - 1) {
        const nextRoundIndex = stealOfferCell.roundIndex + 1;
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
    setChasePromptCell(null);
    setAcceptedStolenScore(null);
    setInputValue('0');
    setEntryMode('quick');
  };

  const combinedPromptCell = stealOfferCell || chasePromptCell;
  const chasePromptInfo = useMemo(() => {
    if (!combinedPromptCell || !targetChaseState.chaseActive || targetChaseState.chaseComplete || !targetChaseState.leaderId) {
      return null;
    }

    const playerTotal = targetChaseState.totals[combinedPromptCell.playerId] || 0;
    const pointsNeededToPass = combinedPromptCell.playerId === targetChaseState.leaderId
      ? 0
      : Math.max(1, targetChaseState.scoreToBeat - playerTotal + 1);

    return {
      scoreToBeat: targetChaseState.scoreToBeat,
      pointsNeededToPass,
      isCurrentLeader: combinedPromptCell.playerId === targetChaseState.leaderId
    };
  }, [combinedPromptCell, targetChaseState]);

  const continueFromCombinedPrompt = () => {
    if (!combinedPromptCell) {
      return;
    }

    setAcceptedStolenScore(null);
    setInputValue('0');
    setActiveCell(combinedPromptCell);
    setStealOfferCell(null);
    setChasePromptCell(null);
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
    setGridEditVersion((prev) => prev + 1);

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
    setChasePromptCell(null);
    setAcceptedStolenScore(null);
    setInputValue('0');
    setEntryMode('quick');
  };

  const incrementInput = (amount: number) => {
    setInputValue((prev) => String((Number.parseInt(prev || '0', 10) || 0) + amount));
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
      <div className="min-h-screen bg-[#f6f6f2] pb-[320px] font-sans text-black">
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
            <h1 className="text-2xl font-black text-[#111] truncate [font-family:Georgia,'Times_New_Roman',serif]">{mode === 'stealing' ? 'Farkle Stealing' : 'Farkle'}</h1>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-black/55 truncate">
              {usesRoundWinCondition
                ? `First through ${settings.roundCount} rounds • Round ${currentRoundIndex + 1}`
                : targetChaseState.chaseActive
                  ? `Score To Beat ${targetChaseState.scoreToBeat.toLocaleString()} • Round ${currentRoundIndex + 1}`
                  : `To ${settings.targetScore.toLocaleString()} • Round ${currentRoundIndex + 1}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowDiceRoller(true)} className="h-10 px-3 bg-white border border-black/20 text-black rounded-none flex items-center justify-center text-sm font-bold active:scale-95 transition gap-1.5"><span className="text-xl leading-none">⚂</span> <span>Roll Dice</span></button>
            <button onClick={() => setPhase('SETUP')} className="h-10 px-3 bg-white border border-black/20 text-black rounded-none flex items-center justify-center text-sm font-bold active:scale-95 transition">Game Setup</button>
          </div>
        </div>

        <main className="max-w-screen-md mx-auto px-4 pt-16">
          <div className="sticky top-16 z-40 bg-[#f6f6f2]/95 backdrop-blur-md pt-2 pb-3 mb-3">
            <div className="flex bg-white border border-black/20 p-1 rounded-none">
              <button onClick={() => setPlayingView('GRID')} className={`flex-1 py-2 rounded-none text-sm font-bold transition-all ${playingView === 'GRID' ? 'bg-black text-white' : 'text-black/60 hover:bg-black/5'}`}>Score Grid</button>
              <button onClick={() => setPlayingView('GRAPH')} className={`flex-1 py-2 rounded-none text-sm font-bold transition-all ${playingView === 'GRAPH' ? 'bg-black text-white' : 'text-black/60 hover:bg-black/5'}`}>Live Graph</button>
            </div>
          </div>

          {playingView === 'GRID' ? (
            <div className="bg-white border border-black/20 rounded-none overflow-hidden mb-6">
              <div className="overflow-x-auto overflow-y-visible scrollbar-hide">
                <table className="w-full table-fixed min-w-max border-collapse [&_thead_th]:border [&_thead_th]:border-black/10 [&_tbody_td]:border [&_tbody_td]:border-black/10">
                  <colgroup>
                    <col className="w-16" />
                    {players.map((player) => (
                      <col key={`${player.id}-col`} className="w-28" />
                    ))}
                  </colgroup>
                  <thead>
                    <tr>
                      <th className="w-16 sticky left-0 top-0 z-30 bg-[#f6f6f2]/95 backdrop-blur-md py-3 text-xs font-bold text-black/55 uppercase tracking-wider">
                        Rnd
                      </th>
                      {players.map((player, index) => {
                        const isCurrentPlayer = index === currentPlayerIndex && !isGameComplete;
                        return (
                          <th key={player.id} className={`w-28 sticky top-0 z-20 backdrop-blur-md p-3 ${isCurrentPlayer ? 'bg-black/5' : 'bg-white/95'}`}>
                            <div className="flex flex-col items-center gap-1">
                              <div className="w-10 h-10 bg-[#f6f6f2] border border-black/20 rounded-none flex items-center justify-center text-xl overflow-hidden">
                                {player.isCloudUser && player.photoURL && !player.useCustomEmoji ? (
                                  <Image src={player.photoURL} alt={player.name} width={40} height={40} unoptimized referrerPolicy="no-referrer" className="w-full h-full object-cover rounded-none" />
                                ) : (
                                  <span>{player.emoji || '☞'}</span>
                                )}
                              </div>
                              <div className="text-[11px] font-black text-black uppercase tracking-wide truncate w-full text-center">
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
                      <tr key={roundIndex} className="bg-white">
                        <td className="w-16 p-2 align-middle bg-[#f6f6f2] text-center text-sm font-bold text-black/65 sticky left-0 z-10">
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
                              className={`relative w-28 p-3 text-center align-middle transition ${editable ? 'cursor-pointer active:bg-black/5' : 'cursor-default'} ${isCurrent ? 'bg-black/5 ring-2 ring-inset ring-black' : ''}`}
                            >
                              {score !== null ? (
                                <div className="flex flex-col items-center justify-center gap-1">
                                  <span className={`text-xl font-black ${isBust ? 'text-black/70' : 'text-black'}`}>{score}</span>
                                  {isBust && <span className="text-lg leading-none">💥</span>}
                                </div>
                              ) : (
                                <span className={`text-xl font-black ${isCurrent ? 'text-black' : 'text-black/20'}`}>{isCurrent ? '•' : '-'}</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-black text-white border-t border-black">
                    <tr>
                      <td className="w-16 p-4 font-bold border-r border-white/10 text-xs uppercase opacity-60 text-center sticky left-0 z-10 bg-black">Tot</td>
                      {players.map((player) => {
                        const total = totalScores[player.id] || 0;
                        const hasWon = isGameComplete && total === highestTotal;
                        return (
                          <td key={`${player.id}-total`} className={`w-28 p-4 text-center text-xl font-black ${hasWon ? 'text-white' : ''}`}>
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
            <div className="animate-in fade-in mb-6">
              <div className="mb-4 flex flex-wrap justify-center gap-3 border border-black/20 bg-[#fbfbf8] p-3 rounded-none">
                {players.map((player, index) => (
                  <div key={player.id} className="flex items-center gap-2 border border-black/20 bg-white px-2 py-1 text-sm font-bold rounded-none">
                    <svg width="28" height="12" viewBox="0 0 28 12" aria-hidden="true">
                      <line
                        x1="1"
                        y1="6"
                        x2="27"
                        y2="6"
                        stroke={graphLineStyles[index]?.stroke}
                        strokeWidth={graphLineStyles[index]?.strokeWidth}
                        strokeDasharray={graphLineStyles[index]?.strokeDasharray || undefined}
                        strokeLinecap="butt"
                      />
                    </svg>
                    <span>{displayPlayerName(player)}</span>
                  </div>
                ))}
              </div>

              <div className="overflow-hidden border border-black/20 bg-white p-4 rounded-none">
                <svg viewBox="0 -20 480 240" className="h-auto w-full overflow-visible">
                  {(() => {
                    const roundCount = Math.max(visibleRoundCount, 1);
                    const xForRound = (roundNumber: number) => (roundNumber / roundCount) * 400;
                    const pointsData = players.map((player, index) => {
                      let runningTotal = 0;
                      const points = [0];
                      for (let roundIndex = 0; roundIndex < roundCount; roundIndex += 1) {
                        const roundScore = getRoundScore(player.id, roundIndex);
                        runningTotal += roundScore ?? 0;
                        points.push(runningTotal);
                      }

                      return {
                        name: displayPlayerName(player),
                        color: graphLineStyles[index]?.stroke || '#111111',
                        strokeWidth: graphLineStyles[index]?.strokeWidth || 3,
                        strokeDasharray: graphLineStyles[index]?.strokeDasharray || '',
                        finalScore: runningTotal,
                        points,
                      };
                    });

                    const allScores = pointsData.flatMap((d) => d.points);
                    const max = Math.max(...allScores, 10);
                    const min = Math.min(...allScores, 0);
                    const range = max - min || 1;

                    const labelData = pointsData
                      .map((d) => ({
                        ...d,
                        targetY: 200 - ((d.finalScore - min) / range) * 200,
                      }))
                      .sort((a, b) => a.targetY - b.targetY);

                    for (let i = 1; i < labelData.length; i += 1) {
                      if (labelData[i].targetY - labelData[i - 1].targetY < 18) {
                        labelData[i].targetY = labelData[i - 1].targetY + 18;
                      }
                    }

                    return (
                      <>
                        {Array.from({ length: roundCount }, (_, idx) => idx + 1).map((roundNumber) => (
                          <line
                            key={`x-grid-${roundNumber}`}
                            x1={xForRound(roundNumber)}
                            y1="0"
                            x2={xForRound(roundNumber)}
                            y2="200"
                            stroke="#d1d1cb"
                            strokeWidth="1"
                          />
                        ))}

                        {min < 0 && (
                          <line
                            x1="0"
                            y1={200 - ((0 - min) / range) * 200}
                            x2="400"
                            y2={200 - ((0 - min) / range) * 200}
                            stroke="#7a7a7a"
                            strokeDasharray="4"
                          />
                        )}

                        <line x1="0" y1="200" x2="400" y2="200" stroke="#6f6f69" strokeWidth="1.2" />

                        {Array.from({ length: roundCount }, (_, idx) => idx + 1).map((roundNumber) => (
                          <text
                            key={`x-label-${roundNumber}`}
                            x={xForRound(roundNumber)}
                            y="216"
                            textAnchor="middle"
                            fill="#4a4a44"
                            fontSize="11"
                            fontWeight="700"
                          >
                            R{roundNumber}
                          </text>
                        ))}

                        {pointsData.map((d, i) => (
                          <polyline
                            key={`line-${i}`}
                            points={d.points
                              .map((score, idx) => `${(idx / roundCount) * 400},${200 - ((score - min) / range) * 200}`)
                              .join(' ')}
                            fill="none"
                            stroke={d.color}
                            strokeWidth={d.strokeWidth}
                            strokeDasharray={d.strokeDasharray || undefined}
                            strokeLinecap="butt"
                            strokeLinejoin="miter"
                          />
                        ))}

                        {labelData.map((d, i) => (
                          <text key={`label-${i}`} x="408" y={d.targetY + 5} fill={d.color} fontSize="14" fontWeight="bold">
                            {d.name} {d.finalScore}
                          </text>
                        ))}
                      </>
                    );
                  })()}
                </svg>
              </div>
            </div>
          )}

          <div className="fixed bottom-[calc(116px+env(safe-area-inset-bottom))] left-0 right-0 z-40 mx-auto w-full max-w-screen-md px-4">
            <div className="rounded-none border border-black/20 bg-[#f6f6f2]/95 p-3 backdrop-blur-md">
              <div className="flex gap-2">
                {!isGameComplete && currentPlayer && (
                  <button
                    onClick={() => openScoreEntry(currentRoundIndex, currentPlayer.id)}
                    className="flex-1 rounded-none bg-white border border-black/20 p-4 text-sm font-black text-black active:scale-[0.98] transition"
                  >
                    Enter {displayPlayerName(currentPlayer)} Score
                  </button>
                )}
                {isGameComplete && (
                  <button
                    onClick={handleShare}
                    className="rounded-none bg-white border border-black/20 text-black p-4 text-sm font-black active:scale-[0.98] transition"
                  >
                    Share
                  </button>
                )}
                <button
                  onClick={() => void handleSaveAndClose()}
                  className="flex-1 rounded-none border border-black/30 bg-black p-4 text-sm font-black text-white active:scale-[0.98] transition"
                >
                  Finish & Close
                </button>
              </div>
            </div>
          </div>
        </main>

        {combinedPromptCell && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
            <div
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in"
              onClick={() => {
                setStealOfferCell(null);
                setChasePromptCell(null);
              }}
            />
            <div className="relative w-full max-w-sm rounded-[2rem] border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900 animate-in zoom-in-95 duration-200">
              <h3 className="text-xl font-black text-slate-800 dark:text-white mb-2">
                {stealOfferCell ? 'Steal Previous Score?' : 'Score To Beat'}
              </h3>
              {chasePromptInfo && (
                <div className="mb-5 rounded-2xl border-2 border-amber-300 bg-gradient-to-b from-amber-50 to-orange-50 px-4 py-4 text-slate-900 shadow-sm dark:border-amber-700/80 dark:from-amber-900/30 dark:to-orange-900/20 dark:text-amber-100">
                  <p className="text-sm font-black tracking-[0.01em] text-amber-700 dark:text-amber-300">
                    {displayPlayerName(players.find((p) => p.id === targetChaseState.leaderId) || { id: '', name: 'Player', emoji: '☞' })} has reached the target
                  </p>
                  <p className="mt-1 text-sm font-bold uppercase tracking-[0.08em] text-slate-700 dark:text-amber-200/90">
                    Score To Beat
                  </p>
                  <p className="text-4xl leading-none font-black text-orange-600 dark:text-orange-300">
                    {chasePromptInfo.scoreToBeat.toLocaleString()}
                  </p>
                  {chasePromptInfo.isCurrentLeader ? (
                    <p className="mt-2 text-base font-bold leading-snug text-slate-700 dark:text-amber-100/90">
                      {displayPlayerName(players.find((p) => p.id === combinedPromptCell.playerId) || { id: '', name: 'Player', emoji: '☞' })} is currently leading. Everyone else must beat this score.
                    </p>
                  ) : (
                    <>
                      <p className="mt-3 text-sm font-bold uppercase tracking-[0.08em] text-slate-700 dark:text-amber-200/90">
                        Needed To Pass
                      </p>
                      <p className="text-4xl leading-none font-black text-red-600 dark:text-red-300">
                        {chasePromptInfo.pointsNeededToPass.toLocaleString()}
                      </p>
                      <p className="mt-2 text-base font-bold leading-snug text-slate-700 dark:text-amber-100/90">
                        {displayPlayerName(players.find((p) => p.id === combinedPromptCell.playerId) || { id: '', name: 'Player', emoji: '☞' })} must clear this number this turn.
                      </p>
                    </>
                  )}
                </div>
              )}
              {stealOfferCell && (
                <p className="text-sm leading-relaxed text-slate-500 dark:text-slate-400 mb-6">
                  {stealOfferSource
                    ? `${displayPlayerName(stealOfferSource.player)} scored ${stealOfferSource.score} points ${stealOfferSource.roundIndex === stealOfferCell.roundIndex ? 'this round' : 'last round'}. Accept it to preload the num pad, or start fresh.`
                    : 'Accept the previous score to preload the num pad, or start fresh.'}
                </p>
              )}
              <div className="flex flex-col gap-3">
                {stealOfferCell ? (
                  <>
                    <button onClick={acceptStealOffer} className="w-full rounded-xl bg-blue-600 py-3 font-bold text-white shadow-sm active:scale-95 transition">
                      Accept & Build On
                    </button>
                    <button onClick={quickSelectFarkleFromStealOffer} className="w-full rounded-xl bg-red-600 py-3 font-bold text-white shadow-sm active:scale-95 transition">
                      Farkle (0)
                    </button>
                    <button onClick={rejectStealOffer} className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 font-bold text-slate-700 active:scale-95 transition dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                      Start Fresh
                    </button>
                  </>
                ) : (
                  <button onClick={continueFromCombinedPrompt} className="w-full rounded-xl bg-blue-600 py-3 font-bold text-white shadow-sm active:scale-95 transition">
                    Continue
                  </button>
                )}
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
              ? `${displayPlayerName(players.find((p) => p.id === activeCell.playerId) || { id: '', name: 'Player', emoji: '☞' })} • Round ${activeCell.roundIndex + 1}`
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
          <div className="mb-3 flex border border-black/20 bg-[#ecece7] p-1">
            <button
              onClick={() => setEntryMode('quick')}
              className={`flex-1 py-2 text-sm font-black uppercase tracking-[0.08em] transition-colors ${
                entryMode === 'quick' ? 'border border-black/30 bg-black text-white' : 'text-black/55'
              }`}
            >
              Quick Entry
            </button>
            <button
              onClick={() => setEntryMode('full')}
              className={`flex-1 py-2 text-sm font-black uppercase tracking-[0.08em] transition-colors ${
                entryMode === 'full' ? 'border border-black/30 bg-black text-white' : 'text-black/55'
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
                  className="border border-black/20 bg-white px-3 py-2.5 text-sm font-black text-black transition-colors active:bg-black active:text-white"
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
                  className="border border-black/20 bg-white py-3 text-xl font-black transition-colors active:bg-black active:text-white"
                >
                  {digit}
                </button>
              ))}
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => { setInputValue('0'); setAcceptedStolenScore(null); }}
              className="border border-black/20 bg-[#e2e2dc] py-3 text-lg font-black text-black transition-colors active:bg-black active:text-white"
            >
              {acceptedStolenScore !== null ? 'Clear Steal' : 'Clear'}
            </button>
            <button
              onClick={() => setInputValue((prev) => (prev === '0' ? '0' : `${prev}0`))}
              className="border border-black/20 bg-white py-3 text-xl font-black transition-colors active:bg-black active:text-white"
            >
              0
            </button>
            <button
              onClick={() => setInputValue((prev) => (prev.length <= 1 ? '0' : prev.slice(0, -1)))}
              className="border border-black/20 bg-[#ecece7] py-3 text-xl font-black text-black transition-colors active:bg-black active:text-white"
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

        <DiceRollerSheet
          open={showDiceRoller}
          onClose={() => setShowDiceRoller(false)}
          gameType="farkle"
        />

        <BottomNav />
      </div>
    );
  }

  return (
      <div className="min-h-screen bg-[#f6f6f2] pb-24 font-sans text-black animate-in fade-in slide-in-from-bottom-2">
      <div className="fixed top-0 left-0 right-0 h-16 bg-[#f8f8f5]/95 backdrop-blur-md border-b border-black/20 z-40 flex items-center justify-between px-4 max-w-screen-md mx-auto">
        <h1 className="text-2xl font-black text-[#111] flex items-center gap-2 [font-family:Georgia,'Times_New_Roman',serif]">Farkle Setup</h1>
        <button
          onClick={() => startGame()}
          disabled={players.length === 0}
          className={`disabled:bg-black/10 disabled:text-black/40 px-5 h-10 rounded-none font-bold active:scale-95 transition-all flex items-center justify-center text-sm border ${Object.keys(scores).length > 0 ? 'bg-black text-white border-black' : 'bg-white text-black border-black/25'}`}
        >
          {Object.keys(scores).length > 0 ? '▸ Resume Game' : '✦ Start Game'}
        </button>
      </div>

      <div className="mx-auto max-w-screen-md p-6 pt-[88px]">
        <h2 className="mb-2 ml-1 text-sm font-bold uppercase tracking-widest text-black/55">Game Rules</h2>
        <div className="mb-6 rounded-none border border-black/20 bg-[#fbfbf8] p-5">
          <label className="mb-3 block text-xs font-bold uppercase tracking-widest text-black/55">Farkle Mode</label>
          <div className="flex border border-black/20 bg-white p-1 rounded-none">
            <button onClick={() => setMode('regular')} className={`flex-1 rounded-none py-2.5 text-sm font-bold transition-all ${mode === 'regular' ? 'bg-black text-white' : 'text-black/60 hover:bg-black/5'}`}>Regular</button>
            <button onClick={() => setMode('stealing')} className={`flex-1 rounded-none py-2.5 text-sm font-bold transition-all ${mode === 'stealing' ? 'bg-black text-white' : 'text-black/60 hover:bg-black/5'}`}>Stealing</button>
          </div>
        </div>

        <h2 className="mb-2 ml-1 text-sm font-bold uppercase tracking-widest text-black/55">Win Conditions</h2>
        <div className="mb-8 rounded-none border border-black/20 bg-[#fbfbf8] p-5">
          <label className="mb-3 block text-xs font-bold uppercase tracking-widest text-black/55">Win Method</label>
          <div className="mb-4 flex border border-black/20 bg-white p-1 rounded-none">
            <button
              onClick={() => setWinCondition('target')}
              className={`flex-1 rounded-none py-2.5 text-sm font-bold transition-all ${activeWinCondition === 'target' ? 'bg-black text-white' : 'text-black/60 hover:bg-black/5'}`}
            >
              Target Score
            </button>
            <button
              onClick={() => setWinCondition('rounds')}
              className={`flex-1 rounded-none py-2.5 text-sm font-bold transition-all ${activeWinCondition === 'rounds' ? 'bg-black text-white' : 'text-black/60 hover:bg-black/5'}`}
            >
              Round Count
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={`mb-2 block text-xs font-bold uppercase tracking-widest ${activeWinCondition === 'target' ? 'text-black/55' : 'text-black/30'}`}>Target Score</label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSettings((prev) => ({ ...prev, targetScore: Math.max(1, prev.targetScore - 500), roundCount: null }))}
                disabled={activeWinCondition !== 'target'}
                className="h-11 w-11 rounded-none border border-black/20 bg-white text-xl font-black disabled:opacity-40 disabled:cursor-not-allowed"
              >
                -
              </button>
              <input
                type="number"
                min={1}
                value={settings.targetScore}
                onChange={(event) => handleTargetChange(event.target.value)}
                disabled={activeWinCondition !== 'target'}
                className="h-11 flex-1 rounded-none border border-black/20 bg-white px-4 text-lg font-black outline-none focus:border-black disabled:opacity-40 disabled:cursor-not-allowed"
              />
              <button
                onClick={() => setSettings((prev) => ({ ...prev, targetScore: prev.targetScore + 500, roundCount: null }))}
                disabled={activeWinCondition !== 'target'}
                className="h-11 w-11 rounded-none border border-black/20 bg-white text-xl font-black disabled:opacity-40 disabled:cursor-not-allowed"
              >
                +
              </button>
            </div>
          </div>
          <div>
            <label className={`mb-2 block text-xs font-bold uppercase tracking-widest ${activeWinCondition === 'rounds' ? 'text-black/55' : 'text-black/30'}`}>Round Count</label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSettings((prev) => ({ ...prev, targetScore: 0, roundCount: Math.max(1, (prev.roundCount || DEFAULT_ROUND_COUNT) - 1) }))}
                disabled={activeWinCondition !== 'rounds'}
                className="h-11 w-11 rounded-none border border-black/20 bg-white text-xl font-black disabled:opacity-40 disabled:cursor-not-allowed"
              >
                -
              </button>
              <input
                type="number"
                min={1}
                value={settings.roundCount ?? DEFAULT_ROUND_COUNT}
                onChange={(event) => handleRoundCountChange(event.target.value)}
                disabled={activeWinCondition !== 'rounds'}
                className="h-11 flex-1 rounded-none border border-black/20 bg-white px-4 text-lg font-black outline-none focus:border-black disabled:opacity-40 disabled:cursor-not-allowed"
              />
              <button
                onClick={() => setSettings((prev) => ({ ...prev, targetScore: 0, roundCount: (prev.roundCount || DEFAULT_ROUND_COUNT) + 1 }))}
                disabled={activeWinCondition !== 'rounds'}
                className="h-11 w-11 rounded-none border border-black/20 bg-white text-xl font-black disabled:opacity-40 disabled:cursor-not-allowed"
              >
                +
              </button>
            </div>
            <p className="mt-2 text-xs font-medium text-black/55">Pick one method only. Switching methods automatically disables and clears the other win condition.</p>
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
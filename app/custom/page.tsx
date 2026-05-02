// app/custom/page.tsx
'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useGameState } from '../../hooks/useGameState';
import type { ActiveSession } from '../../hooks/useActiveSession';
import { clearStoredGameState } from '../../lib/activeGameState';
import { db } from '../../lib/firebase';
import { createGuestPlayerId, fetchCloudPlayersWithLegacy, formatFirstName, mergePlayersById, upsertCloudPlayer } from '../../lib/cloudPlayers';
import { useActiveSession } from '../../hooks/useActiveSession';
import { buildCustomGameRecord, buildFarkleGameRecord, buildYahtzeeGameRecord, saveGameRecordToCloud, upsertGameRecord, type GameRecord } from '../../lib/gameHistory';
import PlayerSetupPanel from '../components/PlayerSetupPanel';
import ScoreEntrySheet from '../components/ScoreEntrySheet';

// --- Types ---
type Player = { id: string; name: string; emoji: string; isCloudUser?: boolean; photoURL?: string; useCustomEmoji?: boolean };
type Round = { roundId: number; scores: Record<string, number> };
type ActiveCell = { roundId: number; playerId: string } | null;
type GameProfile = { name: string; winCondition: 'HIGH' | 'LOW' };
type GameSettings = { target: number; scoreDirection: 'UP' | 'DOWN' };

// --- Helpers ---
const EMOJIS = ['🦊', '⚡️', '🦖', '🤠', '👾', '🍕', '🚀', '🐙', '🦄', '🥑', '🔥', '💎', '👻', '👑', '😎', '🤖', '👽', '🐶', '🐱', '🐼'];
const EMOJI_COLORS: Record<string, string> = {
  '🦊': '#f97316', '⚡️': '#eab308', '🦖': '#22c55e', '🤠': '#8b5cf6', 
  '👾': '#a855f7', '🍕': '#ef4444', '🚀': '#3b82f6', '🐙': '#ec4899', 
  '🦄': '#d946ef', '🥑': '#84cc16', '🔥': '#dc2626', '💎': '#06b6d4', 
  '👻': '#94a3b8', '👑': '#fbbf24', '😎': '#38bdf8', '🤖': '#64748b',
  '👽': '#10b981', '🐶': '#d97706', '🐱': '#f59e0b', '🐼': '#1e293b'
};

const getRandomEmoji = () => EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
const getPlayerColor = (emoji: string) => EMOJI_COLORS[emoji] || '#3b82f6';

export default function CustomTracker() {
  const [players, setPlayers] = useGameState<Player[]>('scorekeeper_players', []);
  const [globalRoster, setGlobalRoster] = useGameState<Player[]>('scorekeeper_global_roster', []);
  const [rounds, setRounds] = useGameState<Round[]>('scorekeeper_rounds', [{ roundId: 1, scores: {} }]);
  const [gameHistory, setGameHistory] = useGameState<GameRecord[]>('scorekeeper_history', []);
  
  const [settings, setSettings] = useGameState<GameSettings>('scorekeeper_settings', { target: 0, scoreDirection: 'UP' });
  const [gameProfiles, setGameProfiles] = useGameState<GameProfile[]>('scorekeeper_game_profiles', [{ name: 'Custom Game', winCondition: 'HIGH' }]);
  const [activeGameName, setActiveGameName] = useGameState<string>('scorekeeper_gameName', 'Custom Game');
  
  const [activeGameId, setActiveGameId] = useGameState<string | null>('scorekeeper_active_game_id', null);
  const [hasCelebrated, setHasCelebrated] = useGameState<boolean>('scorekeeper_has_celebrated', false);

  const [newPlayerName, setNewPlayerName] = useState('');
  const [isCreatingPlayer, setIsCreatingPlayer] = useState(false);
  const [activeCell, setActiveCell] = useState<ActiveCell>(null);
  const [inputValue, setInputValue] = useState('0');
  const [isSaved, setIsSaved] = useState(false);
  const [viewMode, setViewMode] = useState<'SETUP' | 'GRID' | 'GRAPH'>('GRID');
  const [activeEmojiPicker, setActiveEmojiPicker] = useState<string | null>(null);
  
  const [isCreatingGame, setIsCreatingGame] = useState(false);
  const [newGameInput, setNewGameInput] = useState('');
  const [isEditingGameName, setIsEditingGameName] = useState(false);
  const [editNameInput, setEditNameInput] = useState('');
  
  const [showCelebration, setShowCelebration] = useState(false);
  const [winnerEmoji, setWinnerEmoji] = useState<string>('🏆');
  const [showSessionConflict, setShowSessionConflict] = useState(false);

  const router = useRouter();
  const activeProfile = gameProfiles.find(p => p.name === activeGameName) || gameProfiles[0];
  const { activeSession, saveSession, clearSession } = useActiveSession();
  const currentSessionId = activeSession?.gameType === 'custom' ? activeSession.sessionId : undefined;
  
  const isGameStarted = rounds.length > 1 || Object.values(rounds[0]?.scores || {}).some(score => score !== undefined && score !== null);

// --- CLOUD MERGE LOGIC ---
  const [cloudPlayers, setCloudPlayers] = useState<Player[]>([]);

  useEffect(() => {
    async function fetchCloudRoster() {
      if (!db) {
        setCloudPlayers([]);
        return;
      }

      try {
        const users = await fetchCloudPlayersWithLegacy(db);
        setCloudPlayers(users as Player[]);
      } catch (error) {
        console.error("Error fetching cloud users:", error);
      }
    }
    fetchCloudRoster();
  }, []);

const allAvailablePlayers = useMemo(() => {
    // 1. We combine the local saved roster and cloud roster. 
    // MAKE SURE your local storage variable here is actually named 'globalRoster' 
    // (or whatever variable your 'scorekeeper_global_roster' useGameState uses!)
    const combined = mergePlayersById((globalRoster || []), cloudPlayers).filter(p => p && p.id);
    
    // 2. Safely deduplicate by ID so you don't get doubles
    return combined.sort((a, b) => {
      const nameA = a.name || '';
      const nameB = b.name || '';
      return nameA.localeCompare(nameB);
    });
  }, [globalRoster, cloudPlayers]); // <-- Dependencies must be globalRoster and cloudPlayers

  useEffect(() => {
    if (viewMode === 'SETUP' && !isGameStarted) {
      const lastPlayedOfThisType = gameHistory.find(g => g.gameName === activeGameName);
      if (lastPlayedOfThisType?.settings) {
        setSettings(lastPlayedOfThisType.settings);
      } else {
        setSettings({ target: 0, scoreDirection: 'UP' });
      }
    }
  }, [activeGameName, viewMode, isGameStarted]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedPlayers = window.localStorage.getItem('scorekeeper_players');
      const parsedPlayers = storedPlayers ? JSON.parse(storedPlayers) : [];
      if (parsedPlayers.length === 0) setViewMode('SETUP');
      else setViewMode('GRID');
    }
  }, []);

  useEffect(() => {
    if (!players.length) {
      return;
    }

    saveSession(
      'custom',
      players.filter((player) => player?.id).map((player) => player.id),
      { players, rounds, activeGameName, settings, activeGameId },
      currentSessionId
    );
  }, [activeGameId, activeGameName, currentSessionId, players, rounds, saveSession, settings]);

  const calculateTotal = (pId: string) => {
    const sum = rounds.reduce((total, r) => total + (r.scores[pId] || 0), 0);
    return settings.scoreDirection === 'DOWN' ? settings.target - sum : sum;
  };

// 1. First, strip out any null/ghost players
  const validPlayers = players.filter(p => p && p.id);
  
  // 2. Only check if the valid players have finished the round
  const lastRound = rounds[rounds.length - 1];
  const isRoundComplete = Boolean(lastRound) && validPlayers.length > 0 && validPlayers.every(p => 
    lastRound.scores[p.id] !== undefined && lastRound.scores[p.id] !== null
  );

  const { isGameOver, currentWinner } = useMemo(() => {
    if (!settings.target || settings.target <= 0 || !isRoundComplete) return { isGameOver: false, currentWinner: null };
    
    let over = false;
    let winnerId: string | null = null;
    let bestScore = settings.scoreDirection === 'DOWN' ? Infinity : -Infinity;

    players.forEach(p => {
      const total = calculateTotal(p.id);
      if (settings.scoreDirection === 'UP' && total >= settings.target) {
        over = true;
        if (total > bestScore) { bestScore = total; winnerId = p.id; }
      }
      if (settings.scoreDirection === 'DOWN' && total <= 0) {
        over = true;
        if (total < bestScore) { bestScore = total; winnerId = p.id; }
      }
    });

    const winningPlayer = players.find(p => p.id === winnerId);
    return { isGameOver: over, currentWinner: winningPlayer };
  }, [rounds, players, settings.target, settings.scoreDirection, isRoundComplete]);

  useEffect(() => {
    if (validPlayers.length === 0 || rounds.length === 0 || isGameOver || !isRoundComplete) {
      return;
    }

    const timeout = setTimeout(() => {
      setRounds(prev => {
        const currentLastRound = prev[prev.length - 1];
        const shouldAppendRound = validPlayers.every(player => {
          const score = currentLastRound?.scores[player.id];
          return score !== undefined && score !== null;
        });

        if (!currentLastRound || !shouldAppendRound) {
          return prev;
        }

        return [...prev, { roundId: currentLastRound.roundId + 1, scores: {} }];
      });
    }, 300);

    return () => clearTimeout(timeout);
  }, [isGameOver, isRoundComplete, rounds.length, setRounds, validPlayers]);

  useEffect(() => {
    if (isGameOver && !hasCelebrated && currentWinner) {
      setWinnerEmoji(currentWinner.emoji);
      setShowCelebration(true);
      setHasCelebrated(true);
      setTimeout(() => setShowCelebration(false), 5000);
    }
  }, [isGameOver, hasCelebrated, setHasCelebrated, currentWinner]);

  const handleCreateGame = () => {
    const trimmed = newGameInput.trim();
    if (!trimmed) { setIsCreatingGame(false); return; }
    if (!gameProfiles.find(p => p.name.toLowerCase() === trimmed.toLowerCase())) {
      setGameProfiles([{ name: trimmed, winCondition: 'HIGH' }, ...gameProfiles]);
    }
    setActiveGameName(trimmed);
    setNewGameInput('');
    setIsCreatingGame(false);
  };

  const handleEditGameName = () => {
    const trimmed = editNameInput.trim();
    if (!trimmed || trimmed === activeGameName) { setIsEditingGameName(false); return; }
    
    setGameProfiles(gameProfiles.map(p => p.name === activeGameName ? { ...p, name: trimmed } : p));
    setGameHistory(gameHistory.map(m => m.gameName === activeGameName ? { ...m, gameName: trimmed } : m));
    setActiveGameName(trimmed);
    setIsEditingGameName(false);
  };

  const updateProfileRule = (updates: Partial<GameProfile>) => {
    setGameProfiles(gameProfiles.map(p => p.name === activeGameName ? { ...p, ...updates } : p));
  };

  const clearSetup = () => {
    setPlayers([]);
    setRounds([{ roundId: 1, scores: {} }]);
    setActiveGameName('Custom Game');
    setSettings({ target: 0, scoreDirection: 'UP' });
    setActiveCell(null);
    setInputValue('0');
    setActiveGameId(null);
    setHasCelebrated(false);
    if (activeSession?.gameType === 'custom') {
      clearSession();
    }
  };

  const addPlayer = async () => {
    const trimmedName = newPlayerName.trim();
    if (!trimmedName) { setIsCreatingPlayer(false); return; }

    const existingGlobal = globalRoster.find(p => p.name.toLowerCase() === trimmedName.toLowerCase());
    if (existingGlobal) {
      if (!players.find(p => p.id === existingGlobal.id)) setPlayers([...players, existingGlobal]);
    } else {
      const newPlayer = { id: createGuestPlayerId(), name: trimmedName, emoji: getRandomEmoji(), isCloudUser: true, isGuest: true };
      setGlobalRoster([...globalRoster, newPlayer]);
      setPlayers([...players, newPlayer]);

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
    }
    setNewPlayerName('');
    setIsCreatingPlayer(false);
  };

  const selectFromGlobal = (player: Player) => {
    if (!players.find(p => p.id === player.id)) setPlayers([...players, player]);
  };

  const removePlayer = (playerId: string) => setPlayers(players.filter(p => p && p.id !== playerId));

  const movePlayer = (index: number, direction: 'UP' | 'DOWN') => {
    const newPlayers = [...players];
    if (direction === 'UP' && index > 0) {
      [newPlayers[index - 1], newPlayers[index]] = [newPlayers[index], newPlayers[index - 1]];
    } else if (direction === 'DOWN' && index < newPlayers.length - 1) {
      [newPlayers[index + 1], newPlayers[index]] = [newPlayers[index], newPlayers[index + 1]];
    }
    setPlayers(newPlayers);
  };

  const updateEmoji = async (playerId: string, newEmoji: string) => {
    const updatedPlayers = players.map(p => p.id === playerId ? { ...p, emoji: newEmoji } : p);
    setPlayers(updatedPlayers);
    setGlobalRoster(globalRoster.map(p => p.id === playerId ? { ...p, emoji: newEmoji } : p));
    setGameHistory(gameHistory.map(game => ({
      ...game,
      playerSnapshots: game.playerSnapshots.map(p => p.id === playerId ? { ...p, emoji: newEmoji } : p)
    })));

    const playerToUpdate = updatedPlayers.find(p => p.id === playerId);
    if (db && playerToUpdate) {
      try {
        await upsertCloudPlayer(db, {
          id: playerToUpdate.id,
          name: playerToUpdate.name,
          emoji: newEmoji,
          photoURL: playerToUpdate.photoURL,
          useCustomEmoji: playerToUpdate.useCustomEmoji,
          isCloudUser: true,
          isGuest: !playerToUpdate.photoURL,
          isAuthUser: Boolean(playerToUpdate.photoURL)
        });
      } catch (error) {
        console.error('Error syncing emoji to cloud:', error);
      }
    }
  };

  const addRound = () => {
    const nextId = rounds.length > 0 ? rounds[rounds.length - 1].roundId + 1 : 1;
    setRounds([...rounds, { roundId: nextId, scores: {} }]);
  };

  const removeRound = (id: number) => {
    setActiveCell(null);
    if (rounds.length === 1) { setRounds([{ roundId: 1, scores: {} }]); return; }
    setRounds(rounds.filter(r => r.roundId !== id).map((r, i) => ({ ...r, roundId: i + 1 })));
  };

  const saveGame = () => {
    if (players.length === 0 || rounds.length === 0) return;

    const gameIdToUse = activeGameId || Date.now().toString();
    if (!activeGameId) setActiveGameId(gameIdToUse);

    const newGame = buildCustomGameRecord({
      players,
      rounds,
      activeGameName,
      settings,
      activeGameId: gameIdToUse
    }, gameIdToUse);

    if (!newGame) {
      return;
    }

    setGameHistory(prev => upsertGameRecord(prev, newGame));
    
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const handleStartNewGame = async () => {
    const completedGame = buildCustomGameRecord({
      players,
      rounds,
      activeGameName,
      settings,
      activeGameId
    }, `game_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`);

    if (completedGame) {
      setGameHistory(prev => upsertGameRecord(prev, completedGame));
      if (db) {
        try {
          await saveGameRecordToCloud(db, completedGame);
        } catch (error) {
          console.error('Error saving completed game to cloud:', error);
        }
      }
    } else {
      saveGame();
    }

    setRounds([{ roundId: 1, scores: {} }]);
    setActiveGameId(null);
    setHasCelebrated(false);
    setActiveCell(null);
    setInputValue('0');
  };

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
      setGameHistory(prev => upsertGameRecord(prev, gameRecord!));
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

  const handleSaveAndClose = async () => {
    if (players.length === 0) {
      router.push('/');
      return;
    }

    const gameRecord = buildCustomGameRecord({
      players,
      rounds,
      activeGameName,
      settings,
      activeGameId
    }, `game_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`);

    if (!gameRecord) {
      router.push('/history');
      return;
    }

    setGameHistory(prev => upsertGameRecord(prev, gameRecord));

    if (db) {
      try {
        await saveGameRecordToCloud(db, gameRecord);
      } catch (error) {
        console.error('Error saving game to cloud:', error);
      }
    }

    setPlayers([]);
    setRounds([{ roundId: 1, scores: {} }]);
    setActiveGameId(null);
    setHasCelebrated(false);
    clearSession();
    clearStoredGameState('custom');
    router.push('/history');
  };

  const handleStartOrResumeGame = () => {
    if (players.length === 0) {
      return;
    }

    if (activeSession?.gameType && activeSession.gameType !== 'custom') {
      setShowSessionConflict(true);
      return;
    }

    setViewMode('GRID');
  };

  const resolveSessionConflict = async (action: 'save' | 'delete') => {
    if (activeSession?.gameType && activeSession.gameType !== 'custom') {
      if (action === 'save') {
        await persistSessionToHistory(activeSession);
      } else {
        clearStoredGameState(activeSession.gameType);
        clearSession();
      }
    }

    setShowSessionConflict(false);
    setViewMode('GRID');
  };

  const handleCellTap = (roundId: number, playerId: string) => {
    setActiveCell({ roundId, playerId });
    const existingScore = rounds.find(r => r.roundId === roundId)?.scores[playerId];
    setInputValue(existingScore !== undefined && existingScore !== null ? existingScore.toString() : '0');
  };

  const submitScore = () => {
    if (!activeCell) return;
    const val = parseInt(inputValue, 10) || 0;
    setRounds(rounds.map(r => r.roundId === activeCell.roundId ? { ...r, scores: { ...r.scores, [activeCell.playerId]: val } } : r));
    setActiveCell(null);
  };

  const rainDrops = useMemo(() => Array.from({ length: 40 }).map((_, i) => ({
    id: i,
    emoji: i % 3 === 0 ? winnerEmoji : (i % 2 === 0 ? '🏆' : '🎉'),
    left: `${Math.random() * 100}%`,
    animationDuration: `${Math.random() * 2 + 2}s`,
    animationDelay: `${Math.random() * 2}s`
  })), [winnerEmoji]);

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-50 pb-32 transition-colors">
      
      {showCelebration && (
        <div className="fixed inset-0 z-[100] pointer-events-none overflow-hidden">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-500 flex items-center justify-center">
            <h2 className="text-5xl font-black text-white drop-shadow-2xl animate-bounce z-10 text-center px-4">
              {(currentWinner?.isCloudUser ? formatFirstName(currentWinner?.name) : currentWinner?.name)} Wins!
            </h2>
          </div>
          {rainDrops.map(drop => (
            <div 
              key={drop.id} 
              className="absolute text-4xl animate-fall drop-shadow-xl"
              style={{ left: drop.left, top: '-10%', animationDuration: drop.animationDuration, animationDelay: drop.animationDelay, animationFillMode: 'forwards' }}
            >
              {drop.emoji}
            </div>
          ))}
          <style dangerouslySetInnerHTML={{__html: `
            @keyframes fall {
              0% { transform: translateY(-10vh) rotate(0deg); opacity: 1; }
              100% { transform: translateY(110vh) rotate(360deg); opacity: 0; }
            }
            .animate-fall { animation-name: fall; animation-timing-function: linear; }
          `}} />
        </div>
      )}

      {viewMode === 'SETUP' && (
        <div className="max-w-screen-md mx-auto animate-in fade-in slide-in-from-bottom-2 pb-24">
          <div className="fixed top-0 left-0 right-0 h-16 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md shadow-sm border-b border-slate-200 dark:border-slate-800 z-40 flex items-center justify-between px-4 max-w-screen-md mx-auto">
            <h1 className="text-2xl font-black text-slate-800 dark:text-white">🧮 Game Setup</h1>
            <button 
              onClick={handleStartOrResumeGame} 
              disabled={players.length === 0}
              className={`disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 text-white px-5 h-10 rounded-full font-bold shadow-sm active:scale-95 transition-all flex items-center justify-center text-sm ${isGameStarted ? 'bg-blue-600' : 'bg-slate-900 dark:bg-slate-100 dark:text-slate-900'}`}
            >
              {isGameStarted ? '▶️ Resume Game' : '🚀 Start Game'}
            </button>
          </div>
          
          <div className="p-6 pt-[88px]">
            <div className="flex justify-between items-end mb-2 ml-1">
               <h2 className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Select Game</h2>
            </div>
            
            <div className="flex gap-2 overflow-x-auto pb-4 mb-2 scrollbar-hide">
              {gameProfiles.map(profile => (
                <button 
                  key={profile.name} 
                  onClick={() => setActiveGameName(profile.name)} 
                  className={`whitespace-nowrap px-5 py-2.5 rounded-full text-sm font-bold transition-all border ${activeGameName === profile.name ? 'bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900 border-slate-800 dark:border-slate-100 shadow-sm' : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-slate-300'}`}
                >
                  {profile.name}
                </button>
              ))}
              <button 
                onClick={() => setIsCreatingGame(true)} 
                className="whitespace-nowrap px-4 py-2.5 rounded-full text-sm font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 border border-blue-100 dark:border-slate-800 transition-all"
              >
                + New
              </button>
            </div>

            {!isCreatingGame && (
              <div className="flex items-center gap-2 mb-6">
                 {isEditingGameName ? (
                    <div className="flex w-full gap-2 animate-in slide-in-from-left-2">
                       <input type="text" value={editNameInput} onChange={e => setEditNameInput(e.target.value)} className="border-2 border-slate-200 dark:border-slate-700 p-3 rounded-xl flex-grow focus:outline-none focus:border-blue-500 bg-white dark:bg-slate-900 font-bold dark:text-white" autoFocus />
                       <button onClick={handleEditGameName} className="bg-blue-600 text-white px-5 rounded-xl font-bold">Save</button>
                       <button onClick={() => setIsEditingGameName(false)} className="bg-slate-200 dark:bg-slate-800 px-4 rounded-xl font-bold text-slate-600 dark:text-slate-300">✕</button>
                    </div>
                 ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-xl font-black text-slate-800 dark:text-white px-2">{activeGameName}</span>
                      <button onClick={() => { setEditNameInput(activeGameName); setIsEditingGameName(true); }} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition">✏️</button>
                    </div>
                 )}
              </div>
            )}

            {isCreatingGame && (
              <div className="flex gap-2 mb-6 animate-in slide-in-from-top-2">
                <input type="text" value={newGameInput} onChange={e => setNewGameInput(e.target.value)} placeholder="e.g. Uno, Darts..." className="border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 rounded-xl flex-grow focus:outline-none focus:border-blue-500 font-bold dark:text-white" autoFocus />
                <button onClick={handleCreateGame} className="bg-blue-600 text-white px-5 rounded-xl font-bold">Add</button>
                <button onClick={() => setIsCreatingGame(false)} className="bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-4 rounded-xl font-bold">✕</button>
              </div>
            )}

            <h2 className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 ml-1 mt-6">Game Rules</h2>
            <div className="bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-2xl p-5 mb-8 shadow-sm">
              <div className="mb-6 pb-6 border-b border-slate-100 dark:border-slate-800">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-3">Global Rule: Win Condition</label>
                <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                  <button onClick={() => updateProfileRule({ winCondition: 'HIGH' })} className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${activeProfile.winCondition === 'HIGH' ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}>🏆 Highest Score</button>
                  <button onClick={() => updateProfileRule({ winCondition: 'LOW' })} className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${activeProfile.winCondition === 'LOW' ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}>⛳️ Lowest Score</button>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-3">Session Rules: Target & Direction</label>
                
                <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl mb-4">
                  <button onClick={() => setSettings({ ...settings, scoreDirection: 'UP' })} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${settings.scoreDirection === 'UP' ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}>📈 Count Up</button>
                  <button onClick={() => setSettings({ ...settings, scoreDirection: 'DOWN' })} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${settings.scoreDirection === 'DOWN' ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}>📉 Count Down</button>
                </div>

                <input 
                  type="number" 
                  value={settings.target || ''} 
                  onChange={e => setSettings({ ...settings, target: parseInt(e.target.value) || 0 })} 
                  placeholder={settings.scoreDirection === 'UP' ? 'Target Score (Optional)' : 'Starting Score (e.g. 501)'}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-3 font-bold text-slate-800 dark:text-white outline-none focus:border-blue-500"
                />
              </div>
            </div>
            
            <PlayerSetupPanel
              rosterPlayers={allAvailablePlayers.filter(gp => gp && gp.id && !players.some(p => p && p.id === gp.id))}
              activePlayers={players.filter(p => p && p.id)}
              isLoading={false}
              formatName={(p) => p.isCloudUser ? formatFirstName(p.name) : p.name}
              onAddFromRoster={(gp) => setPlayers([...players.filter(p => p && p.id), gp])}
              onRemove={(id) => setPlayers(players.filter(p => p && p.id !== id))}
              onMove={movePlayer}
              onEmojiClick={setActiveEmojiPicker}
              onNewPlayerClick={() => setIsCreatingPlayer(true)}
              onClearSetup={clearSetup}
              createPlayerSlot={
                isCreatingPlayer ? (
                  <div className="flex gap-2 mb-6 animate-in slide-in-from-top-2">
                    <input type="text" value={newPlayerName} onChange={e => setNewPlayerName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addPlayer()} placeholder="Player Name..." className="border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 rounded-xl flex-grow focus:outline-none focus:border-emerald-500 font-bold dark:text-white" autoFocus />
                    <button onClick={addPlayer} className="bg-emerald-600 text-white px-5 rounded-xl font-bold">Add</button>
                    <button onClick={() => setIsCreatingPlayer(false)} className="bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-4 rounded-xl font-bold">✕</button>
                  </div>
                ) : undefined
              }
            />
          </div>

          {activeEmojiPicker && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
              <div className="bg-white dark:bg-slate-900 border dark:border-slate-800 rounded-[2rem] p-6 shadow-2xl w-full max-w-sm animate-in zoom-in-95 duration-200">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xl font-black text-slate-800 dark:text-white">Choose Emoji</h3>
                  <button onClick={() => setActiveEmojiPicker(null)} className="w-8 h-8 flex items-center justify-center bg-slate-100 dark:bg-slate-800 rounded-full text-slate-500 hover:text-slate-700 dark:hover:text-white active:scale-95 transition-all">✕</button>
                </div>
                <div className="grid grid-cols-5 gap-3">
                  {EMOJIS.map(emoji => (
                    <button 
                      key={emoji} 
                      onClick={() => { updateEmoji(activeEmojiPicker, emoji); setActiveEmojiPicker(null); }}
                      className="text-3xl aspect-square flex items-center justify-center bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-2xl active:scale-90 transition-all shadow-sm dark:shadow-none"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {showSessionConflict && activeSession?.gameType && (
            <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
              <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in" onClick={() => setShowSessionConflict(false)} />
              <div className="relative w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[2rem] p-6 shadow-2xl animate-in zoom-in-95 duration-200">
                <h3 className="text-xl font-black mb-2 text-slate-800 dark:text-white">Active Game Found</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">
                  A {activeSession.gameType === 'yahtzee' ? 'Yahtzee' : 'Custom Game'} session is already in progress. Save and close it, or delete it before starting this game.
                </p>
                <div className="flex flex-col gap-3">
                  <button onClick={() => void resolveSessionConflict('save')} className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold shadow-sm active:scale-95 transition-all">
                    Save & Close
                  </button>
                  <button onClick={() => void resolveSessionConflict('delete')} className="w-full bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-100 dark:border-red-900/30 py-3 rounded-xl font-bold active:scale-95 transition-all">
                    Delete & Close
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {viewMode !== 'SETUP' && (
        <div className="max-w-screen-md mx-auto">
          <div className="fixed top-0 left-0 right-0 h-16 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md shadow-sm border-b border-slate-200 dark:border-slate-800 z-40 flex items-center justify-between px-4 max-w-screen-md mx-auto">
            <h1 className="text-2xl font-black text-slate-800 dark:text-white truncate pr-4">{activeGameName}</h1>
            <button onClick={() => setViewMode('SETUP')} className="w-10 h-10 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-full flex items-center justify-center text-xl active:scale-95 transition">⚙️</button>
          </div>

          <div className="pt-[80px] px-4">
             <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl mb-4">
              <button onClick={() => setViewMode('GRID')} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${viewMode === 'GRID' ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}>🧮 Score Grid</button>
              <button onClick={() => setViewMode('GRAPH')} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${viewMode === 'GRAPH' ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}>📈 Live Graph</button>
            </div>

            {viewMode === 'GRID' && (
              <div className="animate-in fade-in pb-4">
                
                {/* 🚨 REMOVED `overflow-x-auto` HERE SO STICKY HEADER WORKS GLOBALLY */}
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden mb-8">
                  {/* The overflow-x-auto allows horizontal swiping on small screens */}
                  <div className="overflow-x-auto scrollbar-hide">
                    {/* table-fixed ensures all columns are exactly the same width */}
                    <table className="w-full table-fixed min-w-max">
                      <thead>
                        <tr>
                          {/* Round Column - Fixed Width */}
                          <th className="w-16 sticky left-0 z-30 bg-slate-50/90 dark:bg-slate-800/90 backdrop-blur-md border-b border-r border-slate-200 dark:border-slate-700 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">
                            Rnd
                          </th>
                          
                          {/* Player Columns - Min Width for swiping */}
                          {players.filter(p => p && p.id).map((p) => (
                            <th key={p.id} className="min-w-[100px] w-auto sticky top-0 z-20 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 p-3">
                              <div className="flex flex-col items-center gap-1">
                                <div className="w-10 h-10 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-full flex items-center justify-center text-xl overflow-hidden shadow-sm">
                                  {/* Plug in the Avatar logic here! */}
                                  {p.isCloudUser && p.photoURL && !p.useCustomEmoji ? (
                                    <img src={p.photoURL} alt={p.name} className="w-full h-full object-cover rounded-full" />
                                  ) : (
                                    <span>{p.emoji || '👤'}</span>
                                  )}
                                </div>
                                {/* Truncate ensures really long names don't break the layout if First Name fails */}
                                  <div className="text-xs font-black text-slate-700 dark:text-slate-200 uppercase tracking-wide truncate w-full text-center">
                                  {p.isCloudUser ? formatFirstName(p.name) : p.name.split(' ')[0]}
                                </div>
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                    
                    <tbody>
                      {rounds.map(round => (
                        <tr key={round.roundId} className="border-b dark:border-slate-800 bg-white dark:bg-slate-900">
                          <td className="p-2 border-r dark:border-slate-800 align-middle bg-slate-50 dark:bg-slate-950/50">
                            <div className="flex items-center justify-between px-1">
                              <span className="text-slate-500 dark:text-slate-400 font-bold ml-1">{round.roundId}</span>
                              <button onClick={e => { e.stopPropagation(); removeRound(round.roundId); }} className="text-slate-300 dark:text-slate-600 hover:text-red-500 px-1">✕</button>
                            </div>
                          </td>
                          {players.filter(p => p && p.id).map(p => {
                            const isSelected = activeCell?.roundId === round.roundId && activeCell?.playerId === p.id;
                            return (
                              <td 
                                key={p.id} 
                                onClick={() => handleCellTap(round.roundId, p.id)} 
                                className={`p-4 text-xl font-medium text-center border-l border-slate-50 dark:border-slate-800 ${isSelected ? 'bg-blue-50 dark:bg-blue-900/20 ring-2 ring-blue-500 ring-inset' : 'active:bg-slate-50 dark:active:bg-slate-800'}`}
                              >
                                {round.scores[p.id] !== undefined ? round.scores[p.id] : <span className="text-slate-200 dark:text-slate-700">-</span>}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-800 dark:bg-slate-900 text-white sticky bottom-0 z-30 shadow-[0_-4px_6px_rgba(0,0,0,0.1)] border-t dark:border-slate-700">
                      <tr>
                        <td className="p-4 font-bold border-r border-slate-700 dark:border-slate-800 text-xs uppercase opacity-50 text-center">Tot</td>
                        {players.filter(p => p && p.id).map((p) => {
                          const total = calculateTotal(p.id);
                          let isWinner = false;
                          if (settings.target > 0) {
                            if (settings.scoreDirection === 'UP' && total >= settings.target) isWinner = true;
                            if (settings.scoreDirection === 'DOWN' && total <= 0) isWinner = true;
                          }
                          return (
                            <td key={p.id} className={`p-4 font-black text-xl text-center ${isWinner && isRoundComplete ? 'text-green-400' : ''}`}>
                              {total}
                            </td>
                          );
                        })}
                      </tr>
                    </tfoot></table>
                  </div>
                </div>
                
                <div className="flex flex-row gap-3">
                  {isGameOver ? (
                    <button 
                      onClick={handleStartNewGame} 
                      className="flex-1 bg-blue-600 text-white p-4 rounded-xl font-black active:bg-blue-700 transition-colors shadow-lg shadow-blue-100 dark:shadow-none"
                    >
                      🔄 Start New Game
                    </button>
                  ) : (
                    <button onClick={addRound} className="flex-1 bg-white dark:bg-slate-900 border-2 dark:border-slate-800 p-3.5 rounded-xl font-bold active:bg-slate-50 dark:active:bg-slate-800 transition-colors shadow-sm">
                      + Round
                    </button>
                  )}
                  
                  {isGameOver ? (
                    <button 
                      onClick={handleSaveAndClose} 
                      className="flex-1 p-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-sm bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900"
                    >
                      💾 Save Game & Close
                    </button>
                  ) : (
                    <button 
                      onClick={saveGame} 
                      className={`flex-1 p-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-sm ${isSaved ? 'bg-green-600 text-white' : 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'}`}
                    >
                      <span>{isSaved ? '✅' : '💾'}</span> {isSaved ? 'Saved!' : 'Save Game'}
                    </button>
                  )}
                </div>
              </div>
            )}
            
            {viewMode === 'GRAPH' && (
              <div className="animate-in fade-in">
                <div className="flex flex-wrap gap-3 mb-4 justify-center bg-white dark:bg-slate-900 p-3 rounded-xl shadow-sm border border-slate-100 dark:border-slate-800">
                  {players.map(p => (
                    <div key={p.id} className="flex items-center gap-1.5 text-sm font-bold bg-slate-50 dark:bg-slate-800/50 px-2 py-1 rounded-full border border-slate-100 dark:border-slate-700/50">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: getPlayerColor(p.emoji) }}></div>
                      <span>{p.isCloudUser && p.photoURL && !p.useCustomEmoji ? (
                          <img src={p.photoURL} alt={p.name} className="w-4 h-4 object-cover rounded-full" />
                        ) : (
                          <span>{p.emoji || '👤'}</span>
                        )}</span>
                    </div>
                  ))}
                </div>
                <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden">
                  
                  {/* Expanded SVG viewBox to 480 wide to leave 80px room on the right for labels */}
                  <svg viewBox={`0 -20 480 240`} className="w-full h-auto overflow-visible">
                    {(() => {
                      const pointsData = players.map(p => {
                        let runningTotal = settings.scoreDirection === 'DOWN' ? settings.target : 0;
                        const points = [runningTotal];
                        rounds.forEach(r => {
                          if (settings.scoreDirection === 'DOWN') runningTotal -= (r.scores[p.id] || 0);
                          else runningTotal += (r.scores[p.id] || 0);
                          points.push(runningTotal);
                        });
                        return { color: getPlayerColor(p.emoji), emoji: p.emoji, finalScore: runningTotal, points };
                      });
                      
                      const allScores = pointsData.flatMap(d => d.points);
                      const max = Math.max(...allScores, 10);
                      const min = Math.min(...allScores, 0);
                      const range = max - min || 1;
                      
                      // 1. Calculate Target Y coordinates for the labels
                      const labelData = pointsData.map(d => ({
                        ...d,
                        targetY: 200 - ((d.finalScore - min) / range) * 200
                      })).sort((a, b) => a.targetY - b.targetY); // Sort by vertical position to detect overlaps
                      
                      // 2. Anti-collision algorithm (push labels down if they overlap)
                      for (let i = 1; i < labelData.length; i++) {
                        if (labelData[i].targetY - labelData[i - 1].targetY < 18) {
                          labelData[i].targetY = labelData[i - 1].targetY + 18;
                        }
                      }

                      return (
                        <>
                          {/* Zero Line */}
                          {min < 0 && <line x1="0" y1={200 - ((0 - min) / range) * 200} x2="400" y2={200 - ((0 - min) / range) * 200} stroke="#cbd5e1" strokeDasharray="4" />}
                          
                          {/* The Lines */}
                          {pointsData.map((d, i) => (
                            <polyline key={`line-${i}`} points={d.points.map((s, idx) => `${(idx / rounds.length) * 400},${200 - ((s - min) / range) * 200}`).join(' ')} fill="none" stroke={d.color} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" className="drop-shadow-sm" />
                          ))}

                          {/* The Collision-Detected Labels */}
                          {labelData.map((d, i) => (
                             <text
                               key={`label-${i}`}
                               x="408" 
                               y={d.targetY + 5} // Vertically center on its anchor point
                               fill={d.color}
                               fontSize="14"
                               fontWeight="bold"
                               className="drop-shadow-sm"
                             >
                               {d.finalScore} {d.emoji}
                             </text>
                          ))}
                        </>
                      );
                    })()}
                  </svg>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <ScoreEntrySheet
        open={!!(activeCell && viewMode === 'GRID')}
        onClose={() => { setActiveCell(null); setInputValue('0'); }}
        title={
          activeCell
            ? `${(() => { const p = players.find(pl => pl.id === activeCell.playerId); return p ? (p.isCloudUser ? formatFirstName(p.name) : p.name) : 'Player'; })()} • Round ${activeCell.roundId}`
            : ''
        }
        displayValue={inputValue}
        onSubmit={submitScore}
      >
        <div className="grid grid-cols-3 gap-2 mb-3">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
            <button
              key={num}
              onClick={() => setInputValue(p => p === '0' ? num.toString() : p === '-' ? '-' + num : p + num)}
              className="bg-slate-100 dark:bg-slate-800 py-3 rounded-xl text-xl font-semibold active:bg-slate-200 dark:active:bg-slate-700 transition-colors"
            >
              {num}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => setInputValue(p => p === '0' ? '-' : p === '-' ? '0' : p.startsWith('-') ? p.substring(1) : '-' + p)}
            className="bg-slate-200 dark:bg-slate-700 py-3 rounded-xl text-lg font-bold active:bg-slate-300 dark:active:bg-slate-600 text-slate-700 dark:text-slate-200"
          >
            +/-
          </button>
          <button
            onClick={() => setInputValue(p => p === '0' || p === '-' ? p : p + '0')}
            className="bg-slate-100 dark:bg-slate-800 py-3 rounded-xl text-xl font-semibold active:bg-slate-200 dark:active:bg-slate-700"
          >
            0
          </button>
          <button
            onClick={() => setInputValue(p => p.slice(0, -1) || '0')}
            className="bg-red-50 dark:bg-red-900/20 text-red-500 py-3 rounded-xl text-xl font-bold active:bg-red-100 dark:active:bg-red-900/40 transition-all active:scale-95"
          >
            ⌫
          </button>
        </div>
      </ScoreEntrySheet>
    </main>
  );
}
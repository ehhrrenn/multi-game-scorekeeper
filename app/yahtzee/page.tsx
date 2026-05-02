// app/yahtzee/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ActiveSession } from '../../hooks/useActiveSession';
import { clearStoredGameState } from '../../lib/activeGameState';
import { db } from '../../lib/firebase';
import { createGuestPlayerId, fetchCloudPlayersWithLegacy, formatFirstName, mergePlayersById, upsertCloudPlayer } from '../../lib/cloudPlayers';
import { buildCustomGameRecord, buildFarkleGameRecord, buildYahtzeeGameRecord, saveGameRecordToCloud, upsertGameRecord, type GameRecord } from '../../lib/gameHistory';
import { useGameState } from '../../hooks/useGameState'; 
import BottomNav from '../components/BottomNav';
import { useActiveSession } from '../../hooks/useActiveSession';
import PlayerSetupPanel from '../components/PlayerSetupPanel';
import ScoreEntrySheet from '../components/ScoreEntrySheet';

// --- Types ---
type Player = { id: string; name: string; emoji: string; photoURL?: string; isCloudUser?: boolean; useCustomEmoji?: boolean };
type PlayerSnapshot = { id: string; name: string; emoji: string; photoURL?: string; isCloudUser?: boolean; useCustomEmoji?: boolean };

// For Yahtzee, scores are mapped: playerId -> categoryId -> array of scores (length 1 for standard, 3 for triple)
type YahtzeeScoreMap = Record<string, Record<string, (number | null)[]>>;
type ActiveCell = { playerId: string; category: string; colIndex: number } | null;

// --- Constants ---
const EMOJIS = ['🦊', '⚡️', '🦖', '🤠', '👾', '🍕', '🚀', '🐙', '🦄', '🥑', '🔥', '💎', '👻', '👑', '😎', '🤖', '👽', '🐶', '🐱', '🐼'];

const UPPER_CATEGORIES = [
  { id: 'ones', name: 'Ones' }, { id: 'twos', name: 'Twos' },
  { id: 'threes', name: 'Threes' }, { id: 'fours', name: 'Fours' },
  { id: 'fives', name: 'Fives' }, { id: 'sixes', name: 'Sixes' }
];

const LOWER_CATEGORIES = [
  { id: '3kind', name: '3 of a Kind' }, { id: '4kind', name: '4 of a Kind' },
  { id: 'fullHouse', name: 'Full House (25)' }, { id: 'smStraight', name: 'Sm. Straight (30)' },
  { id: 'lgStraight', name: 'Lg. Straight (40)' }, { id: 'yahtzee', name: 'YAHTZEE (50)' },
  { id: 'chance', name: 'Chance' }, { id: 'bonus', name: 'Yahtzee Bonus' }
];

export default function YahtzeePage() {
  const router = useRouter();

  // --- Core Game State ---
  const [phase, setPhase] = useState<'SETUP' | 'PLAYING'>('SETUP');
  const [players, setPlayers] = useGameState<Player[]>('yahtzee_players', []);
  const [globalRoster, setGlobalRoster] = useGameState<Player[]>('scorekeeper_global_roster', []);
  const [gameHistory, setGameHistory] = useGameState<GameRecord[]>('scorekeeper_history', []);
  const [isTripleYahtzee, setIsTripleYahtzee] = useGameState<boolean>('yahtzee_is_triple', false);
  const [scores, setScores] = useGameState<YahtzeeScoreMap>('yahtzee_scores_v2', {});

  // --- Roster & UI State ---
  const [allAvailablePlayers, setAllAvailablePlayers] = useState<PlayerSnapshot[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreatingPlayer, setIsCreatingPlayer] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState('');
  const [activeEmojiPicker, setActiveEmojiPicker] = useState<string | null>(null);
  const [showSessionConflict, setShowSessionConflict] = useState(false);
  const [showClearSetupConfirm, setShowClearSetupConfirm] = useState(false);
  const [playingView, setPlayingView] = useState<'GRID' | 'GRAPH'>('GRID');
  const [isSaved, setIsSaved] = useState(false);
  
  // --- Grid Interaction State ---
  const [activeCell, setActiveCell] = useState<ActiveCell>(null);
  const [inputValue, setInputValue] = useState('');
  const columnsPerPlayer = isTripleYahtzee ? 3 : 1;

  const { activeSession, saveSession, clearSession } = useActiveSession();

  const currentSessionId = activeSession?.gameType === 'yahtzee' ? activeSession.sessionId : undefined;
  const hasInProgressGame = players.length > 0 || Object.keys(scores).length > 0;

  useEffect(() => {
    if (players.length > 0 && Object.keys(scores).length > 0) {
      setPhase('PLAYING');
    }
  }, [players.length, scores]);

  // Fetch the Global Roster on Mount
  useEffect(() => {
    const fetchRoster = async () => {
      if (!db) {
        setAllAvailablePlayers(globalRoster);
        setIsLoading(false);
        return;
      }

      try {
        const cloudPlayers = await fetchCloudPlayersWithLegacy(db);
        const merged = mergePlayersById(globalRoster, cloudPlayers as Player[]);
        setAllAvailablePlayers(merged);
      } catch (error) {
        console.error("Error fetching roster:", error);
        setAllAvailablePlayers(globalRoster);
      } finally {
        setIsLoading(false);
      }
    };
    fetchRoster();
  }, [globalRoster]);

  useEffect(() => {
    if (!hasInProgressGame) {
      return;
    }

    saveSession(
      'yahtzee',
      players.filter((player) => player?.id).map((player) => player.id),
      { players, scores, isTripleYahtzee, phase },
      currentSessionId
    );
  }, [currentSessionId, hasInProgressGame, isTripleYahtzee, phase, players, saveSession, scores]);

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
      setGameHistory((prev) => upsertGameRecord(prev, gameRecord!));
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
    if (activeSession?.gameType && activeSession.gameType !== 'yahtzee') {
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
      return `yahtzee_${Date.now()}`;
    }

    const existingId = window.localStorage.getItem('scorekeeper_active_game_id');
    if (existingId && existingId.startsWith('yahtzee_')) {
      return existingId;
    }

    const newId = `yahtzee_${Date.now()}`;
    window.localStorage.setItem('scorekeeper_active_game_id', newId);
    return newId;
  };

  // --- Setup Actions ---
  const startGame = (skipConflictCheck = false) => {
    if (players.length === 0) return;

    if (!skipConflictCheck && activeSession?.gameType && activeSession.gameType !== 'yahtzee') {
      setShowSessionConflict(true);
      return;
    }
    
    // Initialize score map if starting fresh
    if (Object.keys(scores).length === 0) {
      const initialScores: YahtzeeScoreMap = {};
      players.forEach(p => {
        initialScores[p.id] = {};
        [...UPPER_CATEGORIES, ...LOWER_CATEGORIES].forEach(cat => {
          initialScores[p.id][cat.id] = Array(columnsPerPlayer).fill(null);
        });
      });
      setScores(initialScores);
    }
    
    getOrCreateActiveGameId();
    setPhase('PLAYING');
  };

  const handleSaveAndClose = async () => {
    const gameRecord = buildYahtzeeGameRecord({ players, scores, isTripleYahtzee }, getOrCreateActiveGameId());
    if (!gameRecord) {
      router.push('/history');
      return;
    }

    setGameHistory((prev) => upsertGameRecord(prev, gameRecord));

    if (db) {
      try {
        await saveGameRecordToCloud(db, gameRecord);
      } catch (error) {
        console.error('Error saving Yahtzee game to cloud:', error);
      }
    }

    setPlayers([]);
    setScores({});
    clearSession();
    clearStoredGameState('yahtzee');
    router.push('/history');
  };

  const handleSaveGame = () => {
    const gameRecord = buildYahtzeeGameRecord({
      players,
      scores,
      isTripleYahtzee
    }, getOrCreateActiveGameId());

    if (!gameRecord) {
      return;
    }

    setGameHistory((prev) => upsertGameRecord(prev, gameRecord));
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const addPlayer = async () => {
    if (!newPlayerName.trim()) return;
    const newId = createGuestPlayerId();
    const newPlayer: Player = { id: newId, name: newPlayerName.trim(), emoji: EMOJIS[Math.floor(Math.random() * EMOJIS.length)], isCloudUser: true };
    setPlayers([...players.filter(p => p && p.id), newPlayer]);
    setAllAvailablePlayers(prev => [...prev, newPlayer]);
    setGlobalRoster(prev => mergePlayersById(prev, [newPlayer]));
    setNewPlayerName('');
    setIsCreatingPlayer(false);
    if (db) {
      try {
        await upsertCloudPlayer(db, {
          id: newId,
          name: newPlayer.name,
          emoji: newPlayer.emoji,
          isCloudUser: true,
          isGuest: true,
          isAuthUser: false
        });
      } catch (err) {}
    }
  };

  const movePlayer = (index: number, direction: 'UP' | 'DOWN') => {
    const newPlayers = [...players];
    if (direction === 'UP' && index > 0) [newPlayers[index - 1], newPlayers[index]] = [newPlayers[index], newPlayers[index - 1]];
    else if (direction === 'DOWN' && index < newPlayers.length - 1) [newPlayers[index + 1], newPlayers[index]] = [newPlayers[index], newPlayers[index + 1]];
    setPlayers(newPlayers);
  };

  const updateEmoji = async (playerId: string, newEmoji: string) => {
    setPlayers(players.map(p => p.id === playerId ? { ...p, emoji: newEmoji } : p));
    setAllAvailablePlayers(prev => prev.map(p => p.id === playerId ? { ...p, emoji: newEmoji } : p));
    setGlobalRoster(prev => prev.map(p => p.id === playerId ? { ...p, emoji: newEmoji } : p));
    const playerToUpdate = players.find(p => p.id === playerId) || allAvailablePlayers.find(p => p.id === playerId);
    if (db && playerToUpdate) {
      try {
        await upsertCloudPlayer(db, {
          id: playerId,
          name: playerToUpdate.name,
          emoji: newEmoji,
          photoURL: playerToUpdate.photoURL,
          useCustomEmoji: playerToUpdate.useCustomEmoji,
          isCloudUser: true,
          isGuest: !playerToUpdate.photoURL,
          isAuthUser: Boolean(playerToUpdate.photoURL)
        });
      } catch (err) {}
    }
  };

  const clearSetup = () => {
    setShowClearSetupConfirm(true);
  };

  const confirmClearSetup = () => {
    setPlayers([]);
    setScores({});
    window.localStorage.removeItem('scorekeeper_active_game_id');
    if (activeSession?.gameType === 'yahtzee') {
      clearSession();
    }
    setShowClearSetupConfirm(false);
  };

  const cancelClearSetup = () => {
    setShowClearSetupConfirm(false);
  };

  // --- Playing Actions & Calculations ---
  const handleCellClick = (playerId: string, category: string, colIndex: number) => {
    setActiveCell({ playerId, category, colIndex });
    const currentVal = scores[playerId]?.[category]?.[colIndex];
    setInputValue(currentVal !== null && currentVal !== undefined ? currentVal.toString() : '');
  };

  const saveScore = () => {
    if (!activeCell) return;
    const { playerId, category, colIndex } = activeCell;
    const numericValue = inputValue === '' ? null : parseInt(inputValue, 10);
    
    setScores(prev => {
      const playerScores = prev[playerId] || {};
      const catScores = playerScores[category] ? [...playerScores[category]] : Array(columnsPerPlayer).fill(null);
      catScores[colIndex] = numericValue;
      return { ...prev, [playerId]: { ...playerScores, [category]: catScores } };
    });
    
    setActiveCell(null);
    setInputValue('');
  };

  const handleSaveScore = (scoreToSave: number) => {
    if (!activeCell) return;

    // 1. Update the score state
    // Note: If your state setter is named something other than 'setScores', 
    // change it here (e.g., setGameData, etc.)
    setScores(prevScores => {
      // Get the current player's scores, or default to an empty object
      const playerScores = prevScores[activeCell.playerId] || {};
      
      // Get the specific category array, or default to an array with nulls
      const categoryScores = playerScores[activeCell.category] || [null]; 
      
      // Copy the array to avoid mutating state directly
      const newCategoryScores = [...categoryScores];
      
      // Update the specific column index with the new score
      newCategoryScores[activeCell.colIndex] = scoreToSave;

      // Return the newly constructed state
      return {
        ...prevScores,
        [activeCell.playerId]: {
          ...playerScores,
          [activeCell.category]: newCategoryScores
        }
      };
    });

    // 2. Clean up and close the modal
    setActiveCell(null);
    setInputValue('');
  };

  const calcUpperTotal = (playerId: string, colIndex: number) => UPPER_CATEGORIES.reduce((sum, cat) => sum + (scores[playerId]?.[cat.id]?.[colIndex] || 0), 0);
  const calcUpperBonus = (upperTotal: number) => upperTotal >= 63 ? 35 : 0;
  const calcLowerTotal = (playerId: string, colIndex: number) => LOWER_CATEGORIES.reduce((sum, cat) => sum + (scores[playerId]?.[cat.id]?.[colIndex] || 0), 0);
  const calcGrandTotal = (playerId: string) => {
    let total = 0;
    for (let colIdx = 0; colIdx < columnsPerPlayer; colIdx += 1) {
      const upTotal = calcUpperTotal(playerId, colIdx);
      const bonus = calcUpperBonus(upTotal);
      const lowTotal = calcLowerTotal(playerId, colIdx);
      const baseTotal = upTotal + bonus + lowTotal;
      const multiplier = isTripleYahtzee ? (colIdx + 1) : 1;
      total += baseTotal * multiplier;
    }
    return total;
  };

  const isGameComplete =
    players.length > 0 &&
    players.every((player) =>
      [...UPPER_CATEGORIES, ...LOWER_CATEGORIES].every((category) =>
        Array.from({ length: columnsPerPlayer }).every((_, colIdx) => {
          const value = scores[player.id]?.[category.id]?.[colIdx];
          return value !== null && value !== undefined;
        })
      )
    );

  // Helper to generate the correct keypad options based on the active category
  const getScoringOptions = (categoryId: string) => {
    switch (categoryId) {
      // Upper Section (Multiples of the dice value - max 5 dice)
      case 'ones': return [0, 1, 2, 3, 4, 5];
      case 'twos': return [0, 2, 4, 6, 8, 10];
      case 'threes': return [0, 3, 6, 9, 12, 15];
      case 'fours': return [0, 4, 8, 12, 16, 20];
      case 'fives': return [0, 5, 10, 15, 20, 25];
      case 'sixes': return [0, 6, 12, 18, 24, 30];
      // Fixed Lower Section
      case 'fullHouse': return [0, 25];
      case 'smStraight': return [0, 30];
      case 'lgStraight': return [0, 40];
      case 'yahtzee': return [0, 50];
      // Variable Lower Section (Fallback to standard numpad)
      case '3kind':
      case '4kind':
      case 'chance':
      case 'bonus':
      default: 
        return 'NUMPAD'; 
    }
  };
  
  // ==========================================
  // RENDER: PLAYING PHASE (Premium Grid)
  // ==========================================
  if (phase === 'PLAYING') {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-[300px] font-sans text-slate-800 dark:text-slate-200">
        <div className="fixed top-0 left-0 right-0 h-16 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md shadow-sm border-b border-slate-200 dark:border-slate-800 z-40 flex items-center justify-between px-4 max-w-screen-md mx-auto">
          <h1 className="text-2xl font-black text-slate-800 dark:text-white truncate pr-4">{isTripleYahtzee ? 'Triple Yahtzee' : 'Yahtzee'}</h1>
          <button onClick={() => setPhase('SETUP')} className="w-10 h-10 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-full flex items-center justify-center text-xl active:scale-95 transition">⚙️</button>
        </div>

        <main className="max-w-screen-md mx-auto px-4 pt-[80px]">
          <div className="sticky top-16 z-30 bg-slate-50/95 dark:bg-slate-950/95 backdrop-blur-md pt-2 pb-3">
            <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
              <button onClick={() => setPlayingView('GRID')} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${playingView === 'GRID' ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}>🧮 Score Grid</button>
              <button onClick={() => setPlayingView('GRAPH')} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${playingView === 'GRAPH' ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}>📈 Live Graph</button>
            </div>
          </div>

          {playingView === 'GRID' && false /* header moved inside scroll container */}

          <div className="overflow-x-auto scrollbar-hide">
          <div className="min-w-max pb-8">
            {playingView === 'GRID' ? (
              <>
            {/* Sticky player header — inside overflow-x-auto so it scrolls horizontally with the grid */}
            <div className="sticky top-[124px] z-20 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 flex">
              <div className="w-24 flex-shrink-0 border-r border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-800/90" />
              {players.map((p) => (
                <div key={p.id} className="flex flex-1 min-w-[80px] flex-col items-center p-3 text-center border-r border-slate-100 dark:border-slate-800/50 last:border-r-0">
                  <div className="w-10 h-10 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full flex items-center justify-center text-lg mb-1 shadow-sm overflow-hidden">
                    {p.isCloudUser && p.photoURL && !p.useCustomEmoji ? <img src={p.photoURL} alt={p.name} referrerPolicy="no-referrer" className="w-full h-full object-cover" /> : <span>{p.emoji}</span>}
                  </div>
                  <div className="text-[10px] font-bold uppercase truncate w-full px-1">{p.isCloudUser ? formatFirstName(p.name) : p.name}</div>
                  {isTripleYahtzee && (
                    <div className="flex w-full mt-1 text-[9px] font-black text-slate-400">
                      <span className="flex-1 border-r border-slate-200 dark:border-slate-700">X1</span>
                      <span className="flex-1 border-r border-slate-200 dark:border-slate-700">X2</span>
                      <span className="flex-1">X3</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
            {/* UPPER SECTION */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden mb-6">
              <div className="bg-slate-100 dark:bg-slate-800/50 px-4 py-2 text-xs font-black uppercase tracking-widest text-slate-500 border-b border-slate-200 dark:border-slate-800">Upper Section</div>
              {UPPER_CATEGORIES.map(cat => (
                <div key={cat.id} className="flex border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                  <div className="w-24 flex-shrink-0 p-3 font-bold text-sm text-slate-700 dark:text-slate-300 border-r border-slate-100 dark:border-slate-800">{cat.name}</div>
                  {players.map(p => (
                    <div key={`${p.id}-${cat.id}`} className="flex flex-1 min-w-[80px] border-r border-slate-100 dark:border-slate-800/50 last:border-r-0">
                      {Array.from({ length: columnsPerPlayer }).map((_, colIdx) => {
                        const isTriple = isTripleYahtzee;
                        const val = scores[p.id]?.[cat.id]?.[colIdx];
                        return (
                          <button 
                            key={colIdx} onClick={() => handleCellClick(p.id, cat.id, colIdx)}
                            className={`flex-1 flex items-center justify-center font-black text-lg ${isTriple ? 'border-r last:border-r-0 border-slate-100 dark:border-slate-800/50 text-base' : ''} ${val !== null && val !== undefined ? 'text-blue-600 dark:text-blue-400' : 'text-slate-300 dark:text-slate-700'}`}
                          >
                            {val !== null && val !== undefined ? val : '-'}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              ))}
              {/* Upper Totals */}
              <div className="flex bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
                <div className="w-24 flex-shrink-0 p-3 font-black text-xs uppercase tracking-wider text-slate-500 border-r border-slate-200 dark:border-slate-800">Subtotal</div>
                {players.map(p => (
                  <div key={`${p.id}-sub`} className="flex flex-1 min-w-[80px] border-r border-slate-200 dark:border-slate-800 last:border-r-0">
                    {Array.from({ length: columnsPerPlayer }).map((_, colIdx) => (
                      <div key={colIdx} className={`flex-1 flex items-center justify-center font-bold text-sm text-slate-500 ${isTripleYahtzee ? 'border-r last:border-r-0 border-slate-200 dark:border-slate-800' : ''}`}>{calcUpperTotal(p.id, colIdx)}</div>
                    ))}
                  </div>
                ))}
              </div>
              <div className="flex bg-emerald-50 dark:bg-emerald-900/10">
                <div className="w-24 flex-shrink-0 p-3 font-black text-[10px] uppercase tracking-wider text-emerald-600 dark:text-emerald-500 border-r border-emerald-100 dark:border-emerald-800">Bonus (63+)</div>
                {players.map(p => (
                  <div key={`${p.id}-bonus`} className="flex flex-1 min-w-[80px] border-r border-emerald-100 dark:border-emerald-800 last:border-r-0">
                    {Array.from({ length: columnsPerPlayer }).map((_, colIdx) => {
                      const bonus = calcUpperBonus(calcUpperTotal(p.id, colIdx));
                      return <div key={colIdx} className={`flex-1 flex items-center justify-center font-black text-sm ${bonus > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-300 dark:text-slate-600'} ${isTripleYahtzee ? 'border-r last:border-r-0 border-emerald-100 dark:border-emerald-800' : ''}`}>{bonus > 0 ? '+35' : '-'}</div>
                    })}
                  </div>
                ))}
              </div>
            </div>

            {/* LOWER SECTION */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden mb-6">
              <div className="bg-slate-100 dark:bg-slate-800/50 px-4 py-2 text-xs font-black uppercase tracking-widest text-slate-500 border-b border-slate-200 dark:border-slate-800">Lower Section</div>
              {LOWER_CATEGORIES.map(cat => (
                <div key={cat.id} className="flex border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                  <div className="w-24 flex-shrink-0 p-3 font-bold text-xs text-slate-700 dark:text-slate-300 border-r border-slate-100 dark:border-slate-800 flex items-center leading-tight">{cat.name}</div>
                  {players.map(p => (
                    <div key={`${p.id}-${cat.id}`} className="flex flex-1 min-w-[80px] border-r border-slate-100 dark:border-slate-800/50 last:border-r-0">
                      {Array.from({ length: columnsPerPlayer }).map((_, colIdx) => {
                        const isTriple = isTripleYahtzee;
                        const val = scores[p.id]?.[cat.id]?.[colIdx];
                        return (
                          <button 
                            key={colIdx} onClick={() => handleCellClick(p.id, cat.id, colIdx)}
                            className={`flex-1 flex items-center justify-center font-black text-lg ${isTriple ? 'border-r last:border-r-0 border-slate-100 dark:border-slate-800/50 text-base' : ''} ${val !== null && val !== undefined ? 'text-blue-600 dark:text-blue-400' : 'text-slate-300 dark:text-slate-700'}`}
                          >
                            {val !== null && val !== undefined ? val : '-'}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              ))}
            </div>

            {/* GRAND TOTALS */}
            <div className="bg-slate-800 dark:bg-slate-200 rounded-2xl shadow-sm overflow-hidden flex border border-slate-900 dark:border-white">
              <div className="w-24 flex-shrink-0 p-4 font-black text-xs uppercase tracking-widest text-slate-100 dark:text-slate-900 border-r border-slate-700 dark:border-slate-300 flex items-center">Grand Total</div>
              {players.map(p => (
                <div key={`${p.id}-grand`} className="flex flex-1 min-w-[80px] border-r border-slate-700 dark:border-slate-300 last:border-r-0">
                  {Array.from({ length: columnsPerPlayer }).map((_, colIdx) => {
                    const upTotal = calcUpperTotal(p.id, colIdx);
                    const bonus = calcUpperBonus(upTotal);
                    const lowTotal = calcLowerTotal(p.id, colIdx);
                    const grand = upTotal + bonus + lowTotal;
                    const multiplier = isTripleYahtzee ? (colIdx + 1) : 1;
                    return (
                      <div key={colIdx} className={`flex-1 flex flex-col items-center justify-center p-2 ${isTripleYahtzee ? 'border-r last:border-r-0 border-slate-700 dark:border-slate-300' : ''}`}>
                         <span className="font-black text-xl text-white dark:text-black">{grand * multiplier}</span>
                         {isTripleYahtzee && <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500">({grand}x{multiplier})</span>}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            <div className="mt-4 mb-6">
              <button
                onClick={isGameComplete ? handleSaveAndClose : handleSaveGame}
                className={`w-full py-3.5 rounded-xl text-base font-bold shadow-sm active:scale-95 transition-all ${isGameComplete ? 'bg-red-600 text-white' : isSaved ? 'bg-green-600 text-white' : 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'}`}
              >
                <span>{isSaved && !isGameComplete ? '✅' : '💾'}</span> {isGameComplete ? 'Save & Close' : isSaved ? 'Saved!' : 'Save Game'}
              </button>
            </div>

            </>
            ) : (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-4 animate-in fade-in">
                <svg viewBox="-40 -10 500 220" className="w-full h-auto overflow-visible">
                  {(() => {
                    const categoryOrder = [...UPPER_CATEGORIES.map(c => c.id), ...LOWER_CATEGORIES.map(c => c.id)];
                    const pointsData = players.map((p) => {
                      let runningTotal = 0;
                      const points = [0];

                      for (let colIdx = 0; colIdx < columnsPerPlayer; colIdx += 1) {
                        const multiplier = isTripleYahtzee ? (colIdx + 1) : 1;
                        let upperTotal = 0;

                        for (const categoryId of categoryOrder) {
                          const value = scores[p.id]?.[categoryId]?.[colIdx] || 0;
                          points.push(points[points.length - 1] + value * multiplier);
                          runningTotal += value * multiplier;

                          if (UPPER_CATEGORIES.some(cat => cat.id === categoryId)) {
                            upperTotal += value;
                          }
                        }

                        const bonus = calcUpperBonus(upperTotal) * multiplier;
                        if (bonus > 0) {
                          points.push(points[points.length - 1] + bonus);
                          runningTotal += bonus;
                        }
                      }

                      return { id: p.id, emoji: p.emoji, name: p.name, isCloudUser: p.isCloudUser, points, finalScore: runningTotal };
                    });

                    const allScores = pointsData.flatMap(d => d.points);
                    const max = Math.max(...allScores, 10);
                    const min = Math.min(...allScores, 0);
                    const range = max - min || 1;
                    const longestPath = Math.max(...pointsData.map(d => d.points.length), 1);
                    const xStep = 400 / Math.max(longestPath - 1, 1);

                    const labelData = pointsData
                      .map((d) => {
                        const finalY = 200 - ((d.finalScore - min) / range) * 200;
                        return { ...d, targetY: finalY };
                      })
                      .sort((a, b) => a.targetY - b.targetY);

                    for (let i = 1; i < labelData.length; i += 1) {
                      if (labelData[i].targetY - labelData[i - 1].targetY < 20) {
                        labelData[i].targetY = labelData[i - 1].targetY + 20;
                      }
                    }

                    const colors = ['#3b82f6', '#ec4899', '#22c55e', '#f97316', '#a855f7', '#8b5cf6', '#ef4444', '#06b6d4'];

                    return (
                      <>
                        {min < 0 && <line x1="0" y1={200 - ((0 - min) / range) * 200} x2="400" y2={200 - ((0 - min) / range) * 200} stroke="#cbd5e1" strokeDasharray="4" className="dark:stroke-slate-700" />}
                        {pointsData.map((d, i) => (
                          <polyline
                            key={`line-${d.id}`}
                            points={d.points.map((val, idx) => `${idx * xStep},${200 - ((val - min) / range) * 200}`).join(' ')}
                            fill="none"
                            stroke={colors[i % colors.length]}
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        ))}
                        {labelData.map((d, i) => (
                          <text key={`label-${d.id}`} x="408" y={d.targetY + 5} fontSize="12" fill={colors[i % colors.length]} className="font-bold drop-shadow-sm">
                            {d.finalScore} {d.emoji} {(d.isCloudUser ? formatFirstName(d.name) : d.name).substring(0, 8)}
                          </text>
                        ))}
                      </>
                    );
                  })()}
                </svg>

                <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800 grid grid-cols-2 gap-2">
                  {players.map((player) => (
                    <div key={player.id} className="bg-slate-50 dark:bg-slate-950 rounded-xl px-3 py-2 flex items-center justify-between">
                      <span className="font-bold text-sm truncate">{player.isCloudUser ? formatFirstName(player.name) : player.name}</span>
                      <span className="font-black text-base">{calcGrandTotal(player.id)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
          </div>
        </main>

        {/* SCORE INPUT BOTTOM SHEET */}
      <ScoreEntrySheet
        open={!!activeCell}
        onClose={() => { setActiveCell(null); setInputValue(''); }}
        title={
          activeCell
            ? `${players.find(p => p.id === activeCell.playerId)?.isCloudUser ? formatFirstName(players.find(p => p.id === activeCell.playerId)?.name ?? '') : (players.find(p => p.id === activeCell.playerId)?.name ?? 'Player')} • ${UPPER_CATEGORIES.find(c => c.id === activeCell.category)?.name ?? LOWER_CATEGORIES.find(c => c.id === activeCell.category)?.name ?? activeCell.category}`
            : ''
        }
        displayValue={inputValue || '-'}
        onSubmit={() => handleSaveScore(Number(inputValue))}
        submitDisabled={inputValue === ''}
      >
        {activeCell && (() => {
          const options = getScoringOptions(activeCell.category);
          if (options === 'NUMPAD') {
            return (
              <>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                    <button
                      key={num}
                      onClick={() => setInputValue(prev => prev.length < 3 ? prev + num : prev)}
                      className="bg-slate-100 dark:bg-slate-800 py-3 rounded-xl text-xl font-semibold active:bg-slate-200 dark:active:bg-slate-700 transition-colors"
                    >
                      {num}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setInputValue('')}
                    className="rounded-xl bg-red-50 py-3 text-lg font-bold text-red-500 transition active:scale-95 dark:bg-red-900/20 dark:text-red-400"
                  >
                    Clear
                  </button>
                  <button
                    onClick={() => setInputValue(prev => prev + '0')}
                    className="bg-slate-100 dark:bg-slate-800 py-3 rounded-xl text-xl font-semibold active:bg-slate-200 dark:active:bg-slate-700 transition-colors"
                  >
                    0
                  </button>
                  <button
                    onClick={() => setInputValue(prev => prev.slice(0, -1))}
                    className="bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 py-3 rounded-xl text-xl font-bold active:bg-slate-300 dark:active:bg-slate-600 transition-all active:scale-95"
                  >
                    ⌫
                  </button>
                </div>
              </>
            );
          }
          return (
            <>
              <div className={`grid gap-2 mb-3 ${options.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                {options.map((scoreOpt) => (
                  <button
                    key={scoreOpt}
                    onClick={() => setInputValue(scoreOpt.toString())}
                    className={`py-3 rounded-xl text-xl font-bold transition-all active:scale-95 ${
                      inputValue === scoreOpt.toString()
                        ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 active:bg-slate-200 dark:active:bg-slate-700'
                    }`}
                  >
                    {scoreOpt}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setInputValue('')}
                className="w-full rounded-xl bg-red-50 py-3 text-lg font-bold text-red-500 transition active:scale-95 dark:bg-red-900/20 dark:text-red-400 mb-0"
              >
                Clear
              </button>
            </>
          );
        })()}
      </ScoreEntrySheet>

      {showSessionConflict && activeSession?.gameType && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in" onClick={() => setShowSessionConflict(false)} />
          <div className="relative w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[2rem] p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <h3 className="text-xl font-black mb-2 text-slate-800 dark:text-white">Active Game Found</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">
              A {activeSession.gameType === 'custom' ? 'Custom Game' : 'Yahtzee'} session is already in progress. Save and close it, or delete it before starting Yahtzee.
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

        <BottomNav />
      </div>
    );
  }

  // ==========================================
  // RENDER: SETUP PHASE
  // ==========================================
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-24 font-sans text-slate-800 dark:text-slate-200 animate-in fade-in slide-in-from-bottom-2">
      <div className="fixed top-0 left-0 right-0 h-16 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md shadow-sm border-b border-slate-200 dark:border-slate-800 z-40 flex items-center justify-between px-4 max-w-screen-md mx-auto">
        <h1 className="text-2xl font-black text-slate-800 dark:text-white flex items-center gap-2">🎲 Yahtzee Setup</h1>
        <button 
          onClick={() => startGame()} 
          disabled={players.length === 0}
          className={`disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 text-white px-5 h-10 rounded-full font-bold shadow-sm active:scale-95 transition-all flex items-center justify-center text-sm ${Object.keys(scores).length > 0 ? 'bg-blue-600' : 'bg-slate-900 dark:bg-slate-100 dark:text-slate-900'}`}
        >
          {Object.keys(scores).length > 0 ? '▶️ Resume Game' : '🚀 Start Game'}
        </button>
      </div>
      
      <div className="p-6 pt-[88px] max-w-screen-md mx-auto">

        {/* Game Rules */}
        <h2 className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 ml-1">Game Rules</h2>
        <div className="bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-2xl p-5 mb-8 shadow-sm">
          <div>
            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-3">Game Variant</label>
            <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
              <button onClick={() => setIsTripleYahtzee(false)} className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${!isTripleYahtzee ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}>Standard (1 Column)</button>
              <button onClick={() => setIsTripleYahtzee(true)} className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${isTripleYahtzee ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}>Triple (3 Columns)</button>
            </div>
          </div>
        </div>
        
        <PlayerSetupPanel
          rosterPlayers={allAvailablePlayers.filter(gp => gp && gp.id && !players.some(p => p && p.id === gp.id))}
          activePlayers={players.filter(p => p && p.id)}
          isLoading={isLoading}
          formatName={(p) => p.isCloudUser ? formatFirstName(p.name) : p.name}
          onAddFromRoster={(gp) => setPlayers([...players.filter(p => p && p.id), gp])}
          onRemove={(id) => setPlayers(players.filter(p => p && p.id !== id))}
          onMove={movePlayer}
          onEmojiClick={setActiveEmojiPicker}
          onNewPlayerClick={() => setIsCreatingPlayer(true)}
          onClearSetup={() => setShowClearSetupConfirm(true)}
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

      {/* Emoji Picker Modal */}
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

      {showClearSetupConfirm && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in" onClick={cancelClearSetup} />
          <div className="relative w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[2.5rem] p-8 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="text-4xl text-center mb-4">⚠️</div>
            <h3 className="text-2xl font-black mb-2 text-slate-800 dark:text-white text-center">Clear Setup?</h3>
            <p className="text-slate-500 dark:text-slate-400 text-center mb-8 leading-relaxed font-medium">
              This will remove all selected players and clear the active Yahtzee board.
            </p>
            <div className="flex flex-col gap-3">
              <button onClick={confirmClearSetup} className="w-full bg-red-600 text-white py-4 rounded-2xl font-black shadow-lg shadow-red-200/30 dark:shadow-none active:scale-95 transition">
                🗑️ Clear Setup
              </button>
              <button onClick={cancelClearSetup} className="w-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 font-bold py-3 mt-2">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

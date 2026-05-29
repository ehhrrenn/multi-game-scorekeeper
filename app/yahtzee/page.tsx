// app/yahtzee/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import type { ActiveSession } from '../../hooks/useActiveSession';
import { clearStoredGameState } from '../../lib/activeGameState';
import { db } from '../../lib/firebase';
import { createGuestPlayerId, fetchCloudPlayersWithLegacy, formatFirstName, mergePlayersById, upsertCloudPlayer } from '../../lib/cloudPlayers';
import { buildCustomGameRecord, buildFarkleGameRecord, buildYahtzeeGameRecord, buildYahtzeeGraphSeries, saveGameRecordToCloud, upsertGameRecord, type GameRecord, type YahtzeeScoreEntry } from '../../lib/gameHistory';
import { useGameState } from '../../hooks/useGameState'; 
import BottomNav from '../components/BottomNav';
import { useActiveSession } from '../../hooks/useActiveSession';
import PlayerSetupPanel from '../components/PlayerSetupPanel';
import ScoreEntrySheet from '../components/ScoreEntrySheet';
import DiceRollerSheet from '../components/DiceRollerSheet';

// --- Types ---
type Player = { id: string; name: string; emoji: string; photoURL?: string; isCloudUser?: boolean; useCustomEmoji?: boolean };
type PlayerSnapshot = { id: string; name: string; emoji: string; photoURL?: string; isCloudUser?: boolean; useCustomEmoji?: boolean };

// For Yahtzee, scores are mapped: playerId -> categoryId -> array of scores (length 1 for standard, 3 for triple)
type YahtzeeScoreMap = Record<string, Record<string, (number | null)[]>>;
type ActiveCell = { playerId: string; category: string; colIndex: number } | null;

// --- Constants ---
const EMOJIS = ['☞', '✂', '☂', '☎', '✈', '✉', '✍', '✎', '☕', '⚓', '⚙', '⌚', '⌛', '⚖', '⚒', '⚗', '⚐', '⚑', '♟', '♜'];

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

const UPPER_DICE_DINGBATS: Record<string, string> = {
  ones: '⚀',
  twos: '⚁',
  threes: '⚂',
  fours: '⚃',
  fives: '⚄',
  sixes: '⚅',
};

export default function YahtzeePage() {
  const router = useRouter();

  // --- Core Game State ---
  const [phase, setPhase] = useState<'SETUP' | 'PLAYING'>('SETUP');
  const [players, setPlayers] = useGameState<Player[]>('yahtzee_players', []);
  const [globalRoster, setGlobalRoster] = useGameState<Player[]>('scorekeeper_global_roster', []);
  const [, setGameHistory] = useGameState<GameRecord[]>('scorekeeper_history', []);
  const [isTripleYahtzee, setIsTripleYahtzee] = useGameState<boolean>('yahtzee_is_triple', false);
  const [scores, setScores] = useGameState<YahtzeeScoreMap>('yahtzee_scores_v2', {});
  const [scoreEntries, setScoreEntries] = useGameState<YahtzeeScoreEntry[]>('yahtzee_score_entries_v1', []);

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
  const [gridEditVersion, setGridEditVersion] = useState(0);
  const [showDiceRoller, setShowDiceRoller] = useState(false);
  const columnsPerPlayer = isTripleYahtzee ? 3 : 1;
  const totalGridColumns = 1 + players.length * columnsPerPlayer;
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

  const { activeSession, saveSession, clearSession } = useActiveSession();

  const currentSessionId = activeSession?.gameType === 'yahtzee' ? activeSession.sessionId : undefined;
  const hasInProgressGame = players.length > 0 || Object.keys(scores).length > 0;

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
      { players, scores, isTripleYahtzee, phase, scoreEntries },
      currentSessionId
    );
  }, [currentSessionId, hasInProgressGame, isTripleYahtzee, phase, players, saveSession, scoreEntries, scores]);

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
      setScoreEntries([]);
    }
    
    getOrCreateActiveGameId();
    setPhase('PLAYING');
  };

  const handleSaveAndClose = async () => {
    const gameRecord = buildYahtzeeGameRecord({ players, scores, isTripleYahtzee, scoreEntries }, getOrCreateActiveGameId(), {
      markCompleted: true,
      completedReason: isGameComplete ? 'BUILT_IN_COMPLETE' : 'MANUAL_FINISH'
    });
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
    setScoreEntries([]);
    clearSession();
    clearStoredGameState('yahtzee');
    router.push('/history');
  };

  const handleSaveGame = () => {
    const gameRecord = buildYahtzeeGameRecord({
      players,
      scores,
      isTripleYahtzee,
      scoreEntries
    }, getOrCreateActiveGameId());

    if (!gameRecord) {
      return;
    }

    setGameHistory((prev) => upsertGameRecord(prev, gameRecord));
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const handleShare = () => {
    const gameName = isTripleYahtzee ? 'Triple Yahtzee' : 'Yahtzee';
    const sortedPlayers = [...players].sort((a, b) => calcGrandTotal(b.id) - calcGrandTotal(a.id));
    const scoreLines = sortedPlayers.map((p, i) => `${i + 1}. ${p.emoji} ${p.isCloudUser ? formatFirstName(p.name) : p.name}: ${calcGrandTotal(p.id)}`);
    const shareText = `🏆 ${gameName}\n${scoreLines.join('\n')}`;
    if (navigator.share) {
      navigator.share({ title: `${gameName} Results`, text: shareText }).catch(() => {});
    } else {
      navigator.clipboard.writeText(shareText).catch(() => {});
    }
  };

  // Auto-save on every score change so incomplete games appear in history
  useEffect(() => {
    if (phase !== 'PLAYING' || gridEditVersion === 0 || scoreEntries.length === 0) return;
    const timer = setTimeout(() => {
      const activeId = typeof window !== 'undefined'
        ? (window.localStorage.getItem('scorekeeper_active_game_id') || `yahtzee_${Date.now()}`)
        : `yahtzee_${Date.now()}`;
      const gameRecord = buildYahtzeeGameRecord({ players, scores, isTripleYahtzee, scoreEntries }, activeId);
      if (gameRecord) {
        setGameHistory(prev => upsertGameRecord(prev, gameRecord));
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [gridEditVersion, isTripleYahtzee, phase, players, scoreEntries, scores, setGameHistory]);

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
      } catch {}
    }
  };

  const movePlayer = (index: number, direction: 'UP' | 'DOWN') => {
    const newPlayers = [...players];
    if (direction === 'UP' && index > 0) [newPlayers[index - 1], newPlayers[index]] = [newPlayers[index], newPlayers[index - 1]];
    else if (direction === 'DOWN' && index < newPlayers.length - 1) [newPlayers[index + 1], newPlayers[index]] = [newPlayers[index], newPlayers[index + 1]];
    setPlayers(newPlayers);
  };

  const updateEmoji = async (playerId: string, newEmoji: string) => {
    setPlayers(players.map(p => p.id === playerId ? { ...p, emoji: newEmoji, useCustomEmoji: true } : p));
    setAllAvailablePlayers(prev => prev.map(p => p.id === playerId ? { ...p, emoji: newEmoji, useCustomEmoji: true } : p));
    setGlobalRoster(prev => prev.map(p => p.id === playerId ? { ...p, emoji: newEmoji, useCustomEmoji: true } : p));
    const playerToUpdate = players.find(p => p.id === playerId) || allAvailablePlayers.find(p => p.id === playerId);
    if (db && playerToUpdate) {
      try {
        await upsertCloudPlayer(db, {
          id: playerId,
          name: playerToUpdate.name,
          emoji: newEmoji,
          photoURL: playerToUpdate.photoURL,
          useCustomEmoji: true,
          isCloudUser: true,
          isGuest: !playerToUpdate.photoURL,
          isAuthUser: Boolean(playerToUpdate.photoURL)
        });
      } catch {}
    }
  };

  const confirmClearSetup = () => {
    setPlayers([]);
    setScores({});
    setScoreEntries([]);
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

  const handleSaveScore = (scoreToSave: number) => {
    if (!activeCell) return;

    const nextEntry: YahtzeeScoreEntry = {
      playerId: activeCell.playerId,
      categoryId: activeCell.category,
      colIndex: activeCell.colIndex,
      score: scoreToSave,
    };

    setScores(prevScores => {
      const playerScores = prevScores[activeCell.playerId] || {};
      const categoryScores = playerScores[activeCell.category] || [null]; 
      const newCategoryScores = [...categoryScores];
      newCategoryScores[activeCell.colIndex] = scoreToSave;

      return {
        ...prevScores,
        [activeCell.playerId]: {
          ...playerScores,
          [activeCell.category]: newCategoryScores
        }
      };
    });
    setScoreEntries((prevEntries) => [...prevEntries, nextEntry]);
    setGridEditVersion((prev) => prev + 1);

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
      <div className="min-h-screen bg-[#f6f6f2] pb-[300px] font-sans text-black">
        <div className="fixed top-0 left-0 right-0 h-16 bg-[#f8f8f5]/95 backdrop-blur-md border-b border-black/20 z-50 flex items-center justify-between px-4 max-w-screen-md mx-auto">
          <h1 className="text-2xl font-black text-[#111] truncate pr-4 [font-family:Georgia,'Times_New_Roman',serif]">{isTripleYahtzee ? 'Triple Yahtzee' : 'Yahtzee'}</h1>
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
            <>
              <div className="bg-white border border-black/20 rounded-none overflow-hidden mb-8">
                <div className="overflow-x-auto overflow-y-visible scrollbar-hide">
                  <table className="w-full table-fixed min-w-max border-collapse [&_thead_th]:border [&_thead_th]:border-black/10 [&_tbody_td]:border [&_tbody_td]:border-black/10">
                    <colgroup>
                      <col className="w-24" />
                      {players.map((p) => (
                        Array.from({ length: columnsPerPlayer }).map((_, colIdx) => (
                          <col key={`${p.id}-col-${colIdx}`} className="w-24" />
                        ))
                      ))}
                    </colgroup>
                    <thead>
                      <tr>
                        <th className="w-24 sticky left-0 top-0 z-30 bg-[#f6f6f2]/95 backdrop-blur-md py-3 text-xs font-bold text-black/55 uppercase tracking-wider">
                          Cat
                        </th>
                        {players.map((p) => (
                          <th key={p.id} colSpan={columnsPerPlayer} className="sticky top-0 z-20 bg-white/95 backdrop-blur-md p-3">
                            <div className="flex flex-col items-center gap-1">
                              <div className="w-10 h-10 bg-[#f6f6f2] border border-black/20 rounded-none flex items-center justify-center text-xl overflow-hidden">
                                {p.isCloudUser && p.photoURL && !p.useCustomEmoji ? <Image src={p.photoURL} alt={p.name} width={40} height={40} unoptimized referrerPolicy="no-referrer" className="w-full h-full object-cover rounded-none" /> : <span>{p.emoji}</span>}
                              </div>
                              <div className="text-[11px] font-black uppercase tracking-wide truncate w-full px-1 text-center text-black">{p.isCloudUser ? formatFirstName(p.name) : p.name}</div>
                              {isTripleYahtzee && (
                                <div className="flex w-full text-[9px] font-black text-slate-400">
                                  <span className="flex-1 border-r border-slate-200 dark:border-slate-700">X1</span>
                                  <span className="flex-1 border-r border-slate-200 dark:border-slate-700">X2</span>
                                  <span className="flex-1">X3</span>
                                </div>
                              )}
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td colSpan={totalGridColumns} className="bg-[#f6f6f2] px-4 py-2 text-xs font-black uppercase tracking-widest text-black/55 border-b border-black/10">
                          Upper Section
                        </td>
                      </tr>
                      {UPPER_CATEGORIES.map((cat) => (
                        <tr key={cat.id} className="hover:bg-black/5 transition-colors">
                          <td className="w-24 sticky left-0 z-10 bg-white p-3 font-bold text-sm text-black border-r border-black/10">
                            {UPPER_DICE_DINGBATS[cat.id]} {cat.name}
                          </td>
                          {players.map((p) => (
                            Array.from({ length: columnsPerPlayer }).map((_, colIdx) => {
                              const val = scores[p.id]?.[cat.id]?.[colIdx];
                              return (
                                <td key={`${p.id}-${cat.id}-${colIdx}`} className="w-24 border-r border-black/10 last:border-r-0">
                                  <button
                                    onClick={() => handleCellClick(p.id, cat.id, colIdx)}
                                    className="w-full py-3 font-black text-base text-center text-black"
                                  >
                                    {val !== null && val !== undefined ? val : <span className="text-black/25">-</span>}
                                  </button>
                                </td>
                              );
                            })
                          ))}
                        </tr>
                      ))}
                      <tr className="bg-[#f6f6f2] border-b border-black/10">
                        <td className="w-24 sticky left-0 z-10 bg-[#f6f6f2] p-3 font-black text-xs uppercase tracking-wider text-black/55 border-r border-black/10">
                          Subtotal
                        </td>
                        {players.map((p) => (
                          Array.from({ length: columnsPerPlayer }).map((_, colIdx) => (
                            <td key={`${p.id}-sub-${colIdx}`} className="w-24 py-2 text-center font-bold text-sm text-black/65 border-r border-black/10">
                              {calcUpperTotal(p.id, colIdx)}
                            </td>
                          ))
                        ))}
                      </tr>
                      <tr className="bg-[#f6f6f2] border-b border-black/10">
                        <td className="w-24 sticky left-0 z-10 bg-[#f6f6f2] p-3 font-black text-[10px] uppercase tracking-wider text-black/60 border-r border-black/10">
                          Bonus (63+)
                        </td>
                        {players.map((p) => (
                          Array.from({ length: columnsPerPlayer }).map((_, colIdx) => {
                            const bonus = calcUpperBonus(calcUpperTotal(p.id, colIdx));
                            return (
                              <td key={`${p.id}-bonus-${colIdx}`} className={`w-24 py-2 text-center font-black text-sm border-r border-black/10 ${bonus > 0 ? 'text-black' : 'text-black/25'}`}>
                                {bonus > 0 ? '+35' : '-'}
                              </td>
                            );
                          })
                        ))}
                      </tr>

                      <tr>
                        <td colSpan={totalGridColumns} className="bg-[#f6f6f2] px-4 py-2 text-xs font-black uppercase tracking-widest text-black/55 border-b border-black/10">
                          Lower Section
                        </td>
                      </tr>
                      {LOWER_CATEGORIES.map((cat) => (
                        <tr key={cat.id} className="hover:bg-black/5 transition-colors">
                          <td className="w-24 sticky left-0 z-10 bg-white p-3 font-bold text-xs text-black border-r border-black/10 leading-tight">
                            {cat.name}
                          </td>
                          {players.map((p) => (
                            Array.from({ length: columnsPerPlayer }).map((_, colIdx) => {
                              const val = scores[p.id]?.[cat.id]?.[colIdx];
                              return (
                                <td key={`${p.id}-${cat.id}-${colIdx}`} className="w-24 border-r border-black/10 last:border-r-0">
                                  <button
                                    onClick={() => handleCellClick(p.id, cat.id, colIdx)}
                                    className="w-full py-3 font-black text-base text-center text-black"
                                  >
                                    {val !== null && val !== undefined ? val : <span className="text-black/25">-</span>}
                                  </button>
                                </td>
                              );
                            })
                          ))}
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-black text-white border-t border-black">
                      <tr>
                        <td className="w-24 sticky left-0 z-10 bg-black p-4 font-black text-xs uppercase tracking-widest border-r border-white/10">
                          Grand
                        </td>
                        {players.map((p) => (
                          Array.from({ length: columnsPerPlayer }).map((_, colIdx) => {
                            const upTotal = calcUpperTotal(p.id, colIdx);
                            const bonus = calcUpperBonus(upTotal);
                            const lowTotal = calcLowerTotal(p.id, colIdx);
                            const grand = upTotal + bonus + lowTotal;
                            const multiplier = isTripleYahtzee ? (colIdx + 1) : 1;
                            return (
                              <td key={`${p.id}-grand-${colIdx}`} className="w-24 p-3 text-center border-r border-white/10">
                                <span className="font-black text-xl text-white">{grand * multiplier}</span>
                                {isTripleYahtzee && <div className="text-[9px] font-bold text-white/55">({grand}x{multiplier})</div>}
                              </td>
                            );
                          })
                        ))}
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

            <div className="fixed bottom-[calc(116px+env(safe-area-inset-bottom))] left-0 right-0 z-40 mx-auto w-full max-w-screen-md px-4">
              <div className="rounded-none border border-black/20 bg-[#f6f6f2]/95 p-3 backdrop-blur-md">
                <div className="flex gap-2">
                  {isGameComplete && (
                    <button
                      onClick={handleShare}
                      className="bg-white text-black font-bold px-4 py-3.5 rounded-none border border-black/20 text-base active:scale-95 transition-all"
                    >
                      Share
                    </button>
                  )}
                  <button
                    onClick={handleSaveAndClose}
                    className="flex-1 py-3.5 rounded-none text-base font-bold border border-black/30 bg-black text-white active:scale-95 transition-all"
                  >
                    Finish & Close
                  </button>
                </div>
              </div>
            </div>
            </>
            ) : (
              <div className="animate-in fade-in">
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
                      <span>{player.isCloudUser ? formatFirstName(player.name) : player.name.split(' ')[0] || player.name}</span>
                    </div>
                  ))}
                </div>

                <div className="overflow-hidden border border-black/20 bg-white p-4 rounded-none">
                  <svg viewBox="0 -20 480 240" className="h-auto w-full overflow-visible">
                    {(() => {
                      const pointsData = buildYahtzeeGraphSeries({
                        players,
                        scores,
                        isTripleYahtzee,
                        scoreEntries,
                      }).map((d, index) => ({
                        ...d,
                        name: d.isCloudUser ? formatFirstName(d.name) : d.name.split(' ')[0] || d.name,
                        color: graphLineStyles[index]?.stroke || '#111111',
                        strokeWidth: graphLineStyles[index]?.strokeWidth || 3,
                        strokeDasharray: graphLineStyles[index]?.strokeDasharray || '',
                      }));

                      const allScores = pointsData.flatMap((d) => d.points);
                      const max = Math.max(...allScores, 10);
                      const min = Math.min(...allScores, 0);
                      const range = max - min || 1;
                      const longestPath = Math.max(...pointsData.map((d) => d.points.length), 1);
                      const roundCount = Math.max(longestPath - 1, 1);
                      const xForRound = (roundNumber: number) => (roundNumber / roundCount) * 400;

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
                              key={`line-${d.id}`}
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

                          {labelData.map((d) => (
                            <text key={`label-${d.id}`} x="408" y={d.targetY + 5} fill={d.color} fontSize="14" fontWeight="bold">
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
                      className="border border-black/20 bg-white py-3 text-xl font-black transition-colors active:bg-black active:text-white"
                    >
                      {num}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setInputValue('')}
                    className="border border-black/20 bg-[#ecece7] py-3 text-lg font-black text-black transition-colors active:bg-black active:text-white"
                  >
                    Clear
                  </button>
                  <button
                    onClick={() => setInputValue(prev => prev + '0')}
                    className="border border-black/20 bg-white py-3 text-xl font-black transition-colors active:bg-black active:text-white"
                  >
                    0
                  </button>
                  <button
                    onClick={() => setInputValue(prev => prev.slice(0, -1))}
                    className="border border-black/20 bg-[#e2e2dc] py-3 text-xl font-black text-black transition-colors active:bg-black active:text-white"
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
                    className={`border py-3 text-xl font-black transition-colors ${
                      inputValue === scoreOpt.toString()
                        ? 'border-black/30 bg-black text-white'
                        : 'border-black/20 bg-white text-black active:bg-black active:text-white'
                    }`}
                  >
                    {scoreOpt}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setInputValue('')}
                className="mb-0 w-full border border-black/20 bg-[#e2e2dc] py-3 text-lg font-black text-black transition-colors active:bg-black active:text-white"
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

        <DiceRollerSheet
          open={showDiceRoller}
          onClose={() => setShowDiceRoller(false)}
          gameType="yahtzee"
        />

        <BottomNav />
      </div>
    );
  }

  // ==========================================
  // RENDER: SETUP PHASE
  // ==========================================
  return (
    <div className="min-h-screen bg-[#f6f6f2] pb-24 font-sans text-black animate-in fade-in slide-in-from-bottom-2">
      <div className="fixed top-0 left-0 right-0 h-16 bg-[#f8f8f5]/95 backdrop-blur-md border-b border-black/20 z-40 flex items-center justify-between px-4 max-w-screen-md mx-auto">
        <h1 className="text-2xl font-black text-[#111] flex items-center gap-2 [font-family:Georgia,'Times_New_Roman',serif]">Yahtzee Setup</h1>
        <button 
          onClick={() => startGame()} 
          disabled={players.length === 0}
          className={`disabled:bg-black/10 disabled:text-black/40 px-5 h-10 rounded-none font-bold active:scale-95 transition-all flex items-center justify-center text-sm border ${Object.keys(scores).length > 0 ? 'bg-black text-white border-black' : 'bg-white text-black border-black/25'}`}
        >
          {Object.keys(scores).length > 0 ? '▸ Resume Game' : '✦ Start Game'}
        </button>
      </div>
      
      <div className="p-6 pt-[88px] max-w-screen-md mx-auto">

        {/* Game Rules */}
        <h2 className="text-sm font-bold text-black/55 uppercase tracking-widest mb-2 ml-1">Game Rules</h2>
        <div className="bg-[#fbfbf8] border border-black/20 rounded-none p-5 mb-8">
          <div>
            <label className="text-xs font-bold text-black/55 uppercase tracking-widest block mb-3">Game Variant</label>
            <div className="flex bg-white border border-black/20 p-1 rounded-none">
              <button onClick={() => setIsTripleYahtzee(false)} className={`flex-1 py-2.5 rounded-none text-sm font-bold transition-all ${!isTripleYahtzee ? 'bg-black text-white' : 'text-black/60 hover:bg-black/5'}`}>Standard (1 Column)</button>
              <button onClick={() => setIsTripleYahtzee(true)} className={`flex-1 py-2.5 rounded-none text-sm font-bold transition-all ${isTripleYahtzee ? 'bg-black text-white' : 'text-black/60 hover:bg-black/5'}`}>Triple (3 Columns)</button>
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
                <input type="text" value={newPlayerName} onChange={e => setNewPlayerName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addPlayer()} placeholder="Player Name..." className="border border-black/20 bg-white p-3 rounded-none flex-grow focus:outline-none focus:border-black font-bold text-black" autoFocus />
                <button onClick={addPlayer} className="bg-black text-white px-5 rounded-none border border-black/30 font-bold">Add</button>
                <button onClick={() => setIsCreatingPlayer(false)} className="bg-white text-black border border-black/20 px-4 rounded-none font-bold">✕</button>
              </div>
            ) : undefined
          }
        />
      </div>

      {/* Emoji Picker Modal */}
      {activeEmojiPicker && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
          <div className="bg-[#fbfbf8] border border-black/20 rounded-none p-6 shadow-2xl w-full max-w-sm animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-black text-[#111]">Choose Emoji</h3>
              <button onClick={() => setActiveEmojiPicker(null)} className="w-8 h-8 flex items-center justify-center bg-white border border-black/20 rounded-none text-black/70 hover:text-black active:scale-95 transition-all">✕</button>
            </div>
            <div className="grid grid-cols-5 gap-3">
              {EMOJIS.map(emoji => (
                <button 
                  key={emoji} 
                  onClick={() => { updateEmoji(activeEmojiPicker, emoji); setActiveEmojiPicker(null); }}
                  className="text-3xl aspect-square flex items-center justify-center bg-white border border-black/20 hover:bg-black/5 rounded-none active:scale-90 transition-all"
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

// app/custom/page.tsx
'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useGameState } from '../../hooks/useGameState';
import { doc, setDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';

// --- Types ---
type Player = { id: string; name: string; emoji: string; isCloudUser?: boolean };
type Round = { roundId: number; scores: Record<string, number> };
type ActiveCell = { roundId: number; playerId: string } | null;
type PlayerSnapshot = { id: string; name: string; emoji: string };
type GameProfile = { name: string; winCondition: 'HIGH' | 'LOW' }; 
type GameSettings = { target: number; scoreDirection: 'UP' | 'DOWN' };

type GameRecord = {
  gameId: string;
  date: string;
  gameName: string;
  finalScores: Record<string, number>;
  activePlayerIds: string[];
  savedRounds: Round[];
  playerSnapshots: PlayerSnapshot[];
  settings?: GameSettings;
};

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

  const router = useRouter();
  const activeProfile = gameProfiles.find(p => p.name === activeGameName) || gameProfiles[0];
  
  const isGameStarted = rounds.length > 1 || Object.values(rounds[0]?.scores || {}).some(score => score !== undefined && score !== null);

// --- CLOUD MERGE LOGIC ---
  const [cloudPlayers, setCloudPlayers] = useState<Player[]>([]);

  useEffect(() => {
    async function fetchCloudRoster() {
      try {
        const querySnapshot = await getDocs(collection(db, 'Users'));
        const users = querySnapshot.docs.map(doc => {
          const data = doc.data();
          return { 
             id: doc.id, // Guarantee a strict ID
             name: data.name || 'Unknown User', // Fallback to prevent crash
             emoji: data.emoji || '👤',
             ...data, 
             isCloudUser: true 
          } as Player;
        });
        setCloudPlayers(users);
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
    const combined = [...(globalRoster || []), ...cloudPlayers].filter(p => p && p.id);
    
    // 2. Safely deduplicate by ID so you don't get doubles
    return Array.from(new Map(combined.map(p => [p.id, p])).values())
      .sort((a, b) => {
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

  const calculateTotal = (pId: string) => {
    const sum = rounds.reduce((total, r) => total + (r.scores[pId] || 0), 0);
    return settings.scoreDirection === 'DOWN' ? settings.target - sum : sum;
  };

// 1. First, strip out any null/ghost players
  const validPlayers = players.filter(p => p && p.id);
  
  // 2. Only check if the valid players have finished the round
  const isRoundComplete = validPlayers.length > 0 && validPlayers.every(p => 
    rounds[rounds.length - 1].scores[p.id] !== undefined && rounds[rounds.length - 1].scores[p.id] !== null
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
    if (players.length === 0 || rounds.length === 0 || isGameOver) return;

    if (isRoundComplete) {
      const timeout = setTimeout(() => {
        setRounds(prev => {
          const last = prev[prev.length - 1];
          if (players.every(p => last.scores[p.id] !== undefined)) {
            return [...prev, { roundId: last.roundId + 1, scores: {} }];
          }
          return prev;
        });
      }, 300);
      return () => clearTimeout(timeout);
    }
  }, [rounds, players, setRounds, isGameOver, isRoundComplete]);

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
  };

  const addPlayer = () => {
    const trimmedName = newPlayerName.trim();
    if (!trimmedName) { setIsCreatingPlayer(false); return; }

    const existingGlobal = globalRoster.find(p => p.name.toLowerCase() === trimmedName.toLowerCase());
    if (existingGlobal) {
      if (!players.find(p => p.id === existingGlobal.id)) setPlayers([...players, existingGlobal]);
    } else {
      const newPlayer = { id: Date.now().toString(), name: trimmedName, emoji: getRandomEmoji() };
      setGlobalRoster([...globalRoster, newPlayer]);
      setPlayers([...players, newPlayer]);
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

  const updateEmoji = (playerId: string, newEmoji: string) => {
    const updatedPlayers = players.map(p => p.id === playerId ? { ...p, emoji: newEmoji } : p);
    setPlayers(updatedPlayers);
    setGlobalRoster(globalRoster.map(p => p.id === playerId ? { ...p, emoji: newEmoji } : p));
    setGameHistory(gameHistory.map(game => ({
      ...game,
      playerSnapshots: game.playerSnapshots.map(p => p.id === playerId ? { ...p, emoji: newEmoji } : p)
    })));
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
    
    const finalScores: Record<string, number> = {};
    players.forEach(p => { finalScores[p.id] = calculateTotal(p.id); });
    
    const gameIdToUse = activeGameId || Date.now().toString();
    if (!activeGameId) setActiveGameId(gameIdToUse);

    const newGame: GameRecord = {
      gameId: gameIdToUse,
      date: new Date().toLocaleDateString(),
      gameName: activeGameName,
      finalScores,
      activePlayerIds: players.map(p => p.id),
      savedRounds: JSON.parse(JSON.stringify(rounds)),
      playerSnapshots: players.map(p => ({ id: p.id, name: p.name, emoji: p.emoji })),
      settings: { ...settings }
    };
    
    if (activeGameId) {
      setGameHistory(gameHistory.map(m => m.gameId === gameIdToUse ? newGame : m));
    } else {
      setGameHistory([newGame, ...gameHistory]);
    }
    
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const handleStartNewGame = () => {
    saveGame();
    setRounds([{ roundId: 1, scores: {} }]);
    setActiveGameId(null);
    setHasCelebrated(false);
    setActiveCell(null);
    setInputValue('0');
  };

  const handleSaveAndClose = async () => {
    if (players.length === 0) {
      router.push('/');
      return;
    }

    // Generate a unique ID for this specific game
    const newGameId = `game_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const finalScores: Record<string, number> = {};
    players.forEach(p => { finalScores[p.id] = calculateTotal(p.id); });

    const gameRecord: GameRecord = {
      gameId: newGameId, // <-- Using the new gameId
      date: new Date().toISOString(),
      gameName: activeGameName,
      finalScores,
      activePlayerIds: players.map(p => p.id),
      savedRounds: JSON.parse(JSON.stringify(rounds)),
      playerSnapshots: players.map(p => ({ id: p.id, name: p.name, emoji: p.emoji })),
      settings: { ...settings }
    };

    // 1. Legacy Save (Keeps your app snappy & acts as offline backup)
    setGameHistory(prev => [gameRecord, ...prev]);

    // 2. Cloud Save (The Magic)
    try {
      // We use setDoc here to force the Document ID to exactly match your gameRecord.gameId
      await setDoc(doc(db, 'Games', gameRecord.gameId), gameRecord);
      console.log("Game successfully written to Cloud!");
    } catch (error) {
      console.error("Error saving game to Cloud:", error);
    }

    // 3. Teardown Active Game State
    setPlayers([]);
    setRounds([{ roundId: 1, scores: {} }]);
    setActiveGameId(null);
    setHasCelebrated(false);
    router.push('/history');
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
              {currentWinner?.name} Wins!
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
            <h1 className="text-2xl font-black text-slate-800 dark:text-white">Game Setup</h1>
            <button 
              onClick={() => setViewMode('GRID')} 
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
            
            {/* SAVED ROSTER MOVED ABOVE ACTIVE PLAYERS */}
            <div className="flex justify-between items-end mb-2 ml-1 mt-6">
              <h2 className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Saved Roster</h2>
            </div>
            
            <div className="flex gap-2 overflow-x-auto pb-4 mb-2 scrollbar-hide">
              {allAvailablePlayers
                .filter(gp => gp && gp.id && !players.some(p => p && p.id === gp.id))
                .map(gp => (
                <button 
                  key={gp.id} 
                  // Kept the safe direct-state update to prevent ghosts!
                  onClick={() => setPlayers([...players.filter(p => p && p.id), gp])} 
                  className="whitespace-nowrap px-4 py-2.5 rounded-full text-sm font-bold bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-700 shadow-sm transition-all flex items-center gap-2 active:scale-95"
                >
                  <span>{gp.emoji || '👤'}</span> {gp.name || 'Unknown'}
                  {/* Small cloud indicator for Firebase users */}
                  {gp.isCloudUser && <span className="text-blue-500 ml-1 text-xs">☁️</span>}
                </button>
              ))}
              
              {/* Your exact New Player button formatting restored */}
              <button 
                onClick={() => setIsCreatingPlayer(true)} 
                className="whitespace-nowrap px-4 py-2.5 rounded-full text-sm font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-100 dark:border-emerald-800 transition-all"
              >
                + New Player
              </button>
            </div>

            {isCreatingPlayer && (
              <div className="flex gap-2 mb-6 animate-in slide-in-from-top-2">
                <input type="text" value={newPlayerName} onChange={e => setNewPlayerName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addPlayer()} placeholder="Player Name..." className="border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 rounded-xl flex-grow focus:outline-none focus:border-emerald-500 font-bold dark:text-white" autoFocus />
                <button onClick={addPlayer} className="bg-emerald-600 text-white px-5 rounded-xl font-bold">Add</button>
                <button onClick={() => setIsCreatingPlayer(false)} className="bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-4 rounded-xl font-bold">✕</button>
              </div>
            )}

            <h2 className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 ml-1 mt-6">Current Active Players</h2>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden mb-8">
              {players.length === 0 ? <div className="p-6 text-center text-slate-400 font-medium">No players added to the game yet. Select from the roster above.</div> : players.filter(p => p && p.id).map((p, i) => (
                <div key={p.id} className={`flex items-stretch justify-between ${i !== players.length - 1 ? 'border-b border-slate-100 dark:border-slate-800' : ''}`}>
                  <div className="flex items-center gap-3 p-4">
                    <button onClick={() => setActiveEmojiPicker(p.id)} className="w-12 h-12 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50 rounded-full text-2xl flex items-center justify-center active:scale-95 transition shadow-sm dark:shadow-none">{p.emoji}</button>
                    <span className="font-bold text-lg text-slate-700 dark:text-slate-200">{p.name}{p.isCloudUser && <span className="ml-2 text-sm">☁️</span>}</span>
                  </div>
                  <div className="flex items-stretch">
                    {/* Bulletproof Removal Logic directly targets the active 'players' state */}
                    <button onClick={() => setPlayers(players.filter(activeP => activeP && activeP.id !== p.id))} className="px-4 text-slate-300 dark:text-slate-600 hover:text-red-500 transition-colors border-l border-slate-100 dark:border-slate-800">✕</button>
                    <div className="flex flex-col border-l border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30 w-12">
                      <button disabled={i === 0} onClick={() => movePlayer(i, 'UP')} className="flex-1 flex items-center justify-center text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-20 transition-colors pb-1">▲</button>
                      <button disabled={i === players.length - 1} onClick={() => movePlayer(i, 'DOWN')} className="flex-1 flex items-center justify-center text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-20 transition-colors pt-1">▼</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {(players.length > 0 || rounds.length > 1 || activeGameName !== 'Custom Game') && (
              <div className="flex justify-center mt-12 pb-12">
                <button onClick={clearSetup} className="text-red-500 font-bold px-6 py-3 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 active:scale-95 transition-all text-xs uppercase tracking-widest">
                  Clear Active Setup
                </button>
              </div>
            )}
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
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-900 mb-6">
                  <table className="w-full text-center border-collapse relative">
                    
                    <thead className="sticky top-[64px] z-30 shadow-sm backdrop-blur-md bg-slate-100/95 dark:bg-slate-800/95 transition-colors">
                      <tr>
                        <th className="p-3 w-16 text-slate-500 dark:text-slate-400 font-normal border-b border-slate-200 dark:border-slate-700">Rnd</th>
                        {players.filter(p => p && p.id).map((p) => (
                          <th key={p.id} className="p-3 font-semibold min-w-[80px] border-b border-slate-200 dark:border-slate-700">
                            <div className="text-2xl bg-white dark:bg-slate-700/80 w-10 h-10 mx-auto rounded-full flex items-center justify-center shadow-sm dark:shadow-none mb-1">{p.emoji}</div>
                            <div className="text-xs truncate font-bold text-slate-500 dark:text-slate-300 uppercase">{p.name}</div>
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
                                className={`p-4 text-xl font-medium border-l border-slate-50 dark:border-slate-800 ${isSelected ? 'bg-blue-50 dark:bg-blue-900/20 ring-2 ring-blue-500 ring-inset' : 'active:bg-slate-50 dark:active:bg-slate-800'}`}
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
                        <td className="p-4 font-bold border-r border-slate-700 dark:border-slate-800 text-xs uppercase opacity-50">Tot</td>
                        {players.filter(p => p && p.id).map((p) => {
                          const total = calculateTotal(p.id);
                          let isWinner = false;
                          if (settings.target > 0) {
                            if (settings.scoreDirection === 'UP' && total >= settings.target) isWinner = true;
                            if (settings.scoreDirection === 'DOWN' && total <= 0) isWinner = true;
                          }
                          return (
                            <td key={p.id} className={`p-4 font-black text-xl ${isWinner && isRoundComplete ? 'text-green-400' : ''}`}>
                              {total}
                            </td>
                          );
                        })}
                      </tr>
                    </tfoot>
                  </table>
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
                      <span>{p.emoji}</span>
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

      {activeCell && viewMode === 'GRID' && (
        <div className="fixed bottom-0 left-0 right-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md shadow-[0_-10px_40px_rgba(0,0,0,0.1)] dark:shadow-[0_-10px_40px_rgba(0,0,0,0.5)] border-t-2 border-slate-100 dark:border-slate-800 rounded-t-2xl p-4 pb-safe z-[60] animate-in slide-in-from-bottom-full max-w-screen-md mx-auto">
          
          <div className="flex justify-between items-center mb-3">
             <div className="flex-1 text-center text-4xl font-black py-2 bg-slate-50 dark:bg-slate-950 rounded-xl shadow-inner border border-slate-100 dark:border-slate-800 tracking-tight">{inputValue}</div>
          </div>
          
          <div className="grid grid-cols-3 gap-2">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
              <button 
                key={num} 
                onClick={() => setInputValue(p => p === '0' ? num.toString() : p === '-' ? '-' + num : p + num)} 
                className="bg-slate-100 dark:bg-slate-800 py-3 rounded-xl text-xl font-semibold active:bg-slate-200 dark:active:bg-slate-700 transition-colors"
              >
                {num}
              </button>
            ))}
            
            <button 
              onClick={() => setInputValue(p => p === '0' ? '-' : p === '-' ? '0' : p.startsWith('-') ? p.substring(1) : '-' + p)} 
              className="bg-slate-200 dark:bg-slate-700 py-3 rounded-xl text-lg font-bold active:bg-slate-300 dark:active:bg-slate-600"
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
          <button 
            onClick={submitScore} 
            className="w-full mt-3 bg-blue-600 text-white py-3.5 rounded-xl text-lg font-bold active:bg-blue-700 transition-all active:scale-95 shadow-md shadow-blue-500/20"
          >
            Enter Score
          </button>
        </div>
      )}
    </main>
  );
}
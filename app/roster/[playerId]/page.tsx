// app/roster/[playerId]/page.tsx
'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { useParams, useRouter } from 'next/navigation';
import { deleteDoc, doc, getDoc, collection, getDocs, updateDoc, query, where, writeBatch } from 'firebase/firestore';
import { fetchCloudPlayersWithLegacy, formatFirstName } from '../../../lib/cloudPlayers';
import { db } from '../../../lib/firebase';
import { getWinnerIdsForRecord, isGameCompleted } from '../../../lib/gameHistory';
import { useGameState } from '../../../hooks/useGameState';
import { useAuth } from '../../../hooks/useAuth';
import BottomNav from '../../components/BottomNav';
import GameCard, { GameRecord } from '../../components/GameCard';

// --- Types ---
type Player = { id: string; name: string; emoji: string; photoURL?: string; isGuest?: boolean; isCloudUser?: boolean; useCustomEmoji?: boolean };

const EMOJIS = ['☞', '✤', '✦', '✷', '✶', '✳', '✲', '✚', '✱', '✧', '✥', '❖', '✪', '✺', '✹', '✸', '⚘', '⚜', '☙', '☘'];

export default function PlayerProfilePage() {
  const params = useParams();
  const router = useRouter();
  const playerId = decodeURIComponent(params.playerId as string);
  
  // Auth & Admin Check
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.uid === process.env.NEXT_PUBLIC_ADMIN_UID;

  // 1. Data State (Cloud + Local)
  const [cloudPlayer, setCloudPlayer] = useState<Player | null>(null);
  const [cloudHistory, setCloudHistory] = useState<GameRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [localPlayers, setLocalPlayers] = useGameState<Player[]>('scorekeeper_global_roster', []);
  const [localHistory, setLocalHistory] = useGameState<GameRecord[]>('scorekeeper_history', []);

  // 2. UI State
  const [filterGame, setFilterGame] = useState<string>('ALL');
  const [expandedGameId, setExpandedGameId] = useState<string | null>(null);
  
  // Edit & Delete State
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editEmoji, setEditEmoji] = useState('');
  const [editUseCustomEmoji, setEditUseCustomEmoji] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Admin Merge State
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [allCloudUsers, setAllCloudUsers] = useState<Player[]>([]);
  const [targetMergeId, setTargetMergeId] = useState<string>('');
  const [isMerging, setIsMerging] = useState(false);

  // 3. Fetch Cloud Data
  useEffect(() => {
    async function fetchCloudProfile() {
      if (!db) {
        setCloudPlayer(null);
        setCloudHistory([]);
        setLoading(false);
        return;
      }

      try {
        const userRef = doc(db, 'users', playerId);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) setCloudPlayer(userSnap.data() as Player);

        const gamesRef = collection(db, 'Games');
        const q = query(gamesRef, where('activePlayerIds', 'array-contains', playerId));
        const gamesSnap = await getDocs(q);
        setCloudHistory(gamesSnap.docs.map(doc => doc.data() as GameRecord));
      } catch (error) {
        console.error("Error fetching profile from Firebase:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchCloudProfile();
  }, [playerId]);

  // 4. Merge Data Models
  const player = useMemo(() => {
    if (cloudPlayer) return { ...cloudPlayer, isCloudUser: true };
    const local = localPlayers.find(p => p.id === playerId);
    if (local) return { ...local, isCloudUser: false };
    return null;
  }, [cloudPlayer, localPlayers, playerId]);

  const allHistory = useMemo(() => {
    const localMatches = localHistory.filter(h => h.activePlayerIds.includes(playerId));
    const combined = [...localMatches, ...cloudHistory];
    return Array.from(new Map(combined.map(h => [h.gameId, h])).values())
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [localHistory, cloudHistory, playerId]);

  // 5. Filtering & Analytics Engine
  const uniqueGames = useMemo(() => Array.from(new Set(allHistory.map(g => g.gameName))), [allHistory]);
  
  const filteredGames = useMemo(() => {
    if (filterGame === 'ALL') return allHistory;
    return allHistory.filter(g => g.gameName === filterGame);
  }, [allHistory, filterGame]);

  const getScoreDirectionForGame = useCallback((game: GameRecord): 'UP' | 'DOWN' => {
    if (game.settings?.scoreDirection) {
      return game.settings.scoreDirection;
    }

    if (game.winCondition === 'LOW') {
      return 'DOWN';
    }

    return 'UP';
  }, []);

  const stats = useMemo(() => {
    let wins = 0;
    let lastPlaces = 0;
    const scoresForGraph: number[] = [];

    filteredGames.forEach(game => {
      const playerScore = game.finalScores[playerId];
      const completed = isGameCompleted(game);
      const scoreDirection = getScoreDirectionForGame(game);
      
      if (playerScore !== undefined) scoresForGraph.push(playerScore);

      if (!completed) {
        return;
      }

      const winners = getWinnerIdsForRecord(game, scoreDirection);

      let losingScore = scoreDirection === 'UP' ? Infinity : -Infinity;
      
      game.activePlayerIds.forEach(pid => {
        const score = game.finalScores[pid];
        if (score !== undefined) {
          if (scoreDirection === 'UP') {
            if (score < losingScore) losingScore = score;
          } else {
            if (score > losingScore) losingScore = score;
          }
        }
      });

      if (winners.includes(playerId)) wins += 1;
      if (playerScore === losingScore && game.activePlayerIds.length > 1) lastPlaces += 1;
    });

    return {
      gamesPlayed: filteredGames.length,
      wins,
      lastPlaces,
      graphData: scoresForGraph.reverse() 
    };
  }, [filteredGames, getScoreDirectionForGame, playerId]);

  const width = 400; const height = 120;
  const max = Math.max(...stats.graphData, 10); const min = Math.min(...stats.graphData, 0); const range = max - min || 1;
  const graphPadding = 10;
  const graphWidth = width - graphPadding * 2;
  const graphHeight = height - graphPadding * 2;

  // Handlers
const handleEditClick = useCallback(() => {
  if (player) {
    setEditName(player.name);
    setEditEmoji(player.emoji || '☞');
    setEditUseCustomEmoji(Boolean(player.useCustomEmoji) || !player.photoURL);
  }

  setIsEditing(true);
}, [player]);

const handleSave = async () => {
  if (!player) return;
  
  if (player.isCloudUser) {
    if (!db) {
      console.warn('Skipped cloud profile update: Firebase is not configured.');
      return;
    }

    // 1. Save directly to Firestore for Cloud Users
    try {
      const userRef = doc(db, 'users', player.id);
      await updateDoc(userRef, {
        name: editName,
        emoji: editUseCustomEmoji ? (editEmoji || player.emoji || '☞') : (player.emoji || '☞'),
        useCustomEmoji: editUseCustomEmoji,
      });
      setIsEditing(false);
    } catch (error) {
      console.error("Error updating cloud profile:", error);
    }
  } else {
    // 2. Original local save logic for Guest/Local players
    setLocalPlayers(prev => prev.map(p => p.id === player.id ? { ...p, name: editName, emoji: editEmoji || p.emoji || '☞', useCustomEmoji: editUseCustomEmoji } : p));
    setIsEditing(false);
  }
};

const handleDelete = async () => {
    setLocalPlayers(localPlayers.filter(p => p.id !== playerId));

    if (db) {
      try {
        await deleteDoc(doc(db, 'users', playerId));
      } catch (error) {
        console.error('Error deleting player from cloud:', error);
      }
    }

    router.push('/roster');
  };

  const handleDeleteGame = async (gameId: string) => {
    setLocalHistory(prev => prev.filter(game => game.gameId !== gameId));
    setCloudHistory(prev => prev.filter(game => game.gameId !== gameId));

    if (!db) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'Games', gameId));
    } catch (error) {
      console.error('Error deleting game from cloud:', error);
    }
  };

  // --- ADMIN MERGE LOGIC ---
  const handleOpenMergeModal = async () => {
    setShowMergeModal(true);
      if (!db) {
        setAllCloudUsers([]);
        return;
      }

    // Fetch target users
    const users = await fetchCloudPlayersWithLegacy(db);
    setAllCloudUsers(users.filter(p => p.id !== playerId));
  };

  const executeMerge = async () => {
      if (!targetMergeId || !db) return;
    setIsMerging(true);

    try {
      // 1. Setup a Firestore Batch
      const batch = writeBatch(db);

      // 2. Query all cloud games for the old ID
      const gamesRef = collection(db, 'Games');
      const q = query(gamesRef, where('activePlayerIds', 'array-contains', playerId));
      const gamesSnap = await getDocs(q);

      // 3. Queue the game updates in the batch
      gamesSnap.docs.forEach(gameDoc => {
        const gameData = gameDoc.data() as GameRecord;
        
        // Swap ID in active array
        const newActiveIds = gameData.activePlayerIds.map(id => id === playerId ? targetMergeId : id);
        
        // Swap ID key in final scores
        const newScores = { ...gameData.finalScores };
        if (newScores[playerId] !== undefined) {
          newScores[targetMergeId] = newScores[playerId];
          delete newScores[playerId];
        }

        // Swap ID in snapshots (if tracking them)
        const newSnapshots = gameData.playerSnapshots?.map(snap => 
          snap.id === playerId ? { ...snap, id: targetMergeId } : snap
        ) || [];

        batch.update(gameDoc.ref, {
          activePlayerIds: newActiveIds,
          finalScores: newScores,
          playerSnapshots: newSnapshots
        });
      });

      // 4. Delete the ghost profile from Cloud Users (if it exists)
      const oldUserRef = doc(db, 'users', playerId);
      batch.delete(oldUserRef);

      // 5. Commit Cloud Changes
      await batch.commit();

      // 6. Update Local Storage Fallback
      setLocalPlayers(prev => prev.filter(p => p.id !== playerId));
      setLocalHistory(prev => prev.map(game => {
        if (!game.activePlayerIds.includes(playerId)) return game;
        const newActiveIds = game.activePlayerIds.map(id => id === playerId ? targetMergeId : id);
        const newScores = { ...game.finalScores };
        if (newScores[playerId] !== undefined) {
          newScores[targetMergeId] = newScores[playerId];
          delete newScores[playerId];
        }
        return { ...game, activePlayerIds: newActiveIds, finalScores: newScores };
      }));

      // Merge Complete! Go back to Roster
      router.push('/roster');

    } catch (error) {
      console.error("Error executing merge:", error);
      setIsMerging(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen bg-[#f6f6f2] text-[#111]">
        <div className="h-12 w-12 border-2 border-black border-t-transparent animate-spin"></div>
      </div>
    );
  }

  if (!player) return null;

  return (
    <main className="min-h-screen bg-[#f6f6f2] text-[#111] pb-32 transition-colors newsprint-page">
      
      {/* Existing Delete Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/60 animate-in fade-in" onClick={() => setShowDeleteConfirm(false)} />
          <div className="relative w-full max-w-sm bg-[#f7f5ee] border-[3px] border-black rounded-none p-8 shadow-[8px_8px_0_0_rgba(0,0,0,0.9)] animate-in zoom-in-95 duration-200">
            <div className="text-4xl text-center mb-4">✕</div>
            <h3 className="text-2xl font-black mb-2 text-[#111] text-center uppercase tracking-[0.04em] [font-family:Georgia,'Times_New_Roman',serif]">Delete Player?</h3>
            <p className="text-black/70 text-center mb-8 leading-relaxed font-semibold">
              This will permanently remove <span className="font-bold text-slate-700 dark:text-slate-200">{player.isCloudUser ? formatFirstName(player.name) : player.name}</span> from the roster, but their history will remain safe in the vault.
            </p>
            <div className="flex flex-col gap-3">
              <button onClick={handleDelete} className="w-full bg-black text-white py-4 rounded-none font-black uppercase tracking-[0.08em] border border-black active:translate-y-px transition">
                Yes, Delete
              </button>
              <button onClick={() => setShowDeleteConfirm(false)} className="w-full text-black/60 hover:text-black font-bold uppercase tracking-[0.1em] py-3 mt-2">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- NEW: Admin Merge Modal --- */}
      {showMergeModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/60 animate-in fade-in" onClick={() => !isMerging && setShowMergeModal(false)} />
          <div className="relative w-full max-w-sm bg-[#f7f5ee] border-[3px] border-black rounded-none p-6 shadow-[8px_8px_0_0_rgba(0,0,0,0.9)] animate-in zoom-in-95 duration-200">
            <h3 className="text-xl font-black mb-2 text-[#111] uppercase tracking-[0.04em] [font-family:Georgia,'Times_New_Roman',serif]">Admin Merge</h3>
            <p className="text-sm text-black/70 mb-6 leading-relaxed font-semibold">
              Move all of <b>{player.isCloudUser ? formatFirstName(player.name) : player.name}&apos;s</b> history into a synced Cloud Account. This cannot be undone.
            </p>
            
            <select 
              value={targetMergeId} 
              onChange={e => setTargetMergeId(e.target.value)}
              className="w-full bg-white border border-black/20 rounded-none px-4 py-3 mb-6 font-bold text-black outline-none"
            >
              <option value="" disabled>Select target account...</option>
              {allCloudUsers.map(u => (
                <option key={u.id} value={u.id}>{u.isCloudUser ? formatFirstName(u.name) : u.name} {u.isGuest ? '(Guest)' : '(Google)'}</option>
              ))}
            </select>

            <div className="flex gap-2">
              <button onClick={() => setShowMergeModal(false)} disabled={isMerging} className="flex-1 bg-white border border-black/20 text-black/70 font-bold py-3 rounded-none uppercase tracking-[0.08em]">
                Cancel
              </button>
              <button 
                onClick={executeMerge} 
                disabled={!targetMergeId || isMerging} 
                className="flex-1 bg-black text-white font-black py-3 rounded-none uppercase tracking-[0.08em] disabled:opacity-50 flex justify-center items-center"
              >
                {isMerging ? <div className="h-5 w-5 border-2 border-white border-t-transparent animate-spin"></div> : 'Confirm Merge'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sticky Header */}
      <div className="fixed top-0 left-0 right-0 h-16 bg-[#fbfbf8]/95 backdrop-blur-md border-b-2 border-black/25 shadow-[0_4px_0_0_rgba(0,0,0,0.08)] z-40 flex items-center justify-between px-4 max-w-screen-md mx-auto">
        <h1 className="text-xl font-black text-[#111] [font-family:Georgia,'Times_New_Roman',serif]">Player Profile</h1>
        <div className="flex gap-2">
          {/* Admin Context Menu */}
          {isAdmin && !player.isCloudUser && (
            <button onClick={handleOpenMergeModal} className="w-10 h-10 flex items-center justify-center bg-white text-black rounded-none border border-black/20 text-sm font-bold active:translate-y-px transition">
              ❖
            </button>
          )}

          {isEditing ? (
            <>
              <button onClick={() => setIsEditing(false)} className="px-3 py-1.5 text-sm font-bold text-black/60 bg-white border border-black/20 rounded-none uppercase tracking-[0.08em]">Cancel</button>
              <button onClick={handleSave} className="px-4 py-1.5 text-sm font-bold text-white bg-black rounded-none shadow-sm uppercase tracking-[0.08em]">Save</button>
            </>
          ) : (
            <>
              <button onClick={handleEditClick} className="w-10 h-10 flex items-center justify-center bg-white text-black rounded-none border border-black/20 text-lg active:translate-y-px transition">✎</button>
              <button onClick={() => setShowDeleteConfirm(true)} className="w-10 h-10 flex items-center justify-center bg-white text-black rounded-none border border-black/20 text-lg active:translate-y-px transition">✕</button>
            </>
          )}
        </div>
      </div>

      <div className="pt-[88px] px-4 max-w-screen-md mx-auto animate-in fade-in slide-in-from-bottom-2">
        
        {/* Top Context Filter */}
        {allHistory.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-4 mb-4 scrollbar-hide">
            <button onClick={() => setFilterGame('ALL')} className={`whitespace-nowrap px-4 py-1.5 rounded-none text-xs font-bold uppercase tracking-[0.08em] transition-all border ${filterGame === 'ALL' ? 'bg-black text-white border-black' : 'bg-white text-black/60 border-black/20'}`}>
              All Games
            </button>
            {uniqueGames.map(name => (
              <button key={name} onClick={() => setFilterGame(name)} className={`whitespace-nowrap px-4 py-1.5 rounded-none text-xs font-bold uppercase tracking-[0.08em] transition-all border ${filterGame === name ? 'bg-black text-white border-black' : 'bg-white text-black/60 border-black/20'}`}>
                {name}
              </button>
            ))}
          </div>
        )}

        {/* Hero Dossier Card */}
        <div className="bg-[#f7f5ee] p-6 rounded-none border-[3px] border-black relative overflow-hidden mb-8 shadow-[8px_8px_0_0_rgba(0,0,0,0.9)]">
          {player.isCloudUser && (
            <div className="absolute top-0 right-0 bg-black text-white text-[10px] font-bold px-3 py-1 rounded-none z-10 shadow-sm uppercase tracking-[0.16em]">
              CLOUD SYNCED
            </div>
          )}
          
          <div className="absolute -right-6 -bottom-6 text-9xl opacity-[0.04] select-none pointer-events-none">
            {isEditing ? editEmoji : player.emoji || '✤'}
          </div>
          
          <div className="relative z-10 flex items-center gap-5">
            {isEditing ? (
              <button 
                onClick={() => setShowEmojiPicker(true)}
                className="w-20 h-20 shrink-0 bg-white border-2 border-black border-dashed rounded-none flex items-center justify-center text-4xl active:translate-y-px transition shadow-inner relative"
              >
                {(!editUseCustomEmoji && player.photoURL) ? (
                  <Image src={player.photoURL} alt={player.name} width={80} height={80} unoptimized className="w-20 h-20 rounded-none border-2 border-black shadow-sm object-cover" />
                ) : (
                  <>{editEmoji || '☞'}</>
                )}
              </button>
            ) : (
              player.photoURL && !player.useCustomEmoji ? (
                <Image src={player.photoURL} alt={player.name} width={80} height={80} unoptimized className="w-20 h-20 rounded-none border-2 border-black shadow-sm object-cover" />
              ) : (
                <div className="w-20 h-20 shrink-0 bg-white border border-black/20 rounded-none flex items-center justify-center text-4xl shadow-sm">
                  {player.emoji || '✤'}
                </div>
              )
            )}

            <div className="flex-1 min-w-0">
              {isEditing ? (
                <input 
                  type="text" 
                  value={editName} 
                  onChange={e => setEditName(e.target.value)} 
                  className="bg-white border border-black/20 rounded-none px-3 py-2 font-black text-2xl text-black outline-none focus:border-black w-full [font-family:Georgia,'Times_New_Roman',serif]"
                  autoFocus
                />
              ) : (
                <h1 className="text-3xl font-black text-[#111] truncate [font-family:Georgia,'Times_New_Roman',serif]">{player.isCloudUser ? formatFirstName(player.name) : player.name}</h1>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 mt-6 border-t-2 border-black pt-6">
             <div className="text-center">
                <div className="text-2xl mb-1">✶</div>
                <div className="font-black text-xl text-black">{stats.gamesPlayed}</div>
                <div className="text-[9px] font-bold text-black/55 uppercase tracking-widest">Games</div>
             </div>
             <div className="text-center border-l border-black/10">
                <div className="text-2xl mb-1">✪</div>
                <div className="font-black text-xl text-black">{stats.wins}</div>
                <div className="text-[9px] font-bold text-black/55 uppercase tracking-widest">Wins</div>
             </div>
             <div className="text-center border-l border-black/10">
                <div className="text-2xl mb-1">✕</div>
                <div className="font-black text-xl text-black">{stats.lastPlaces}</div>
                <div className="text-[9px] font-bold text-black/55 uppercase tracking-widest">Last Place</div>
             </div>
          </div>
        </div>

        {/* Dynamic SVG Score Graph */}
        {stats.graphData.length > 1 && (
          <div className="bg-[#f7f5ee] p-5 rounded-none border-[3px] border-black shadow-[8px_8px_0_0_rgba(0,0,0,0.9)] mb-8">
            <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto overflow-visible">
              <rect x="0" y="0" width={width} height={height} fill="none" stroke="rgba(0,0,0,0.85)" strokeWidth="2" />
              <line x1={graphPadding} y1={height - graphPadding} x2={width - graphPadding} y2={height - graphPadding} stroke="rgba(0,0,0,0.35)" strokeWidth="1.5" />
              <line x1={graphPadding} y1={graphPadding} x2={graphPadding} y2={height - graphPadding} stroke="rgba(0,0,0,0.25)" strokeWidth="1.5" />
              <polyline 
                points={stats.graphData.map((val, i) => { 
                  const x = graphPadding + (i / Math.max(stats.graphData.length - 1, 1)) * graphWidth; 
                  const y = graphPadding + (1 - ((val - min) / range)) * graphHeight; 
                  return `${x},${y}`; 
                }).join(' ')} 
                fill="none" 
                stroke="#111" 
                strokeWidth="3.5" 
                strokeLinecap="square" 
                strokeLinejoin="miter" 
                className="drop-shadow-sm" 
              />
            </svg>
          </div>
        )}

        {/* Match Feed */}
        <div className="flex justify-between items-end mb-3 ml-1">
           <h2 className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
             Game History
           </h2>
        </div>
        
        <div className="grid gap-3 pb-8">
          {filteredGames.length === 0 ? (
            <div className="text-center p-6 text-black/55 font-medium border-2 border-dashed border-black/20 rounded-none bg-[#fbfbf8]">
              No games match this filter.
            </div>
          ) : (
            filteredGames.map((game, index) => (
              <GameCard 
                key={`${game.gameId}-${index}`}
                game={game} 
                winnerIds={isGameCompleted(game) ? getWinnerIdsForRecord(game, getScoreDirectionForGame(game)) : []}
                isComplete={isGameCompleted(game)}
                canFinish={false}
                isExpanded={expandedGameId === game.gameId}
                onToggle={() => setExpandedGameId(prev => prev === game.gameId ? null : game.gameId)}
                onDelete={handleDeleteGame}
                onFinish={() => undefined}
              />
            ))
          )}
        </div>
      </div>

      {/* Emoji Picker Modal */}
            {showEmojiPicker && (
              <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/80 backdrop-blur-md p-6 animate-in fade-in">
                <div className="bg-[#fbfbf8] border border-black/20 rounded-none p-6 shadow-2xl w-full max-w-sm animate-in zoom-in-95 duration-200">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-black text-[#111]">Choose Emoji</h3>
                    <button onClick={() => setShowEmojiPicker(false)} className="w-8 h-8 flex items-center justify-center bg-white border border-black/20 rounded-none text-black/70 hover:text-black active:scale-95 transition-all">✕</button>
                  </div>
                  
                  {/* INJECTED: Revert to Photo Button */}
                  {player.isCloudUser && player.photoURL && (
                    <button 
                      onClick={() => {
                        setEditUseCustomEmoji(false);
                        setShowEmojiPicker(false); // Close the modal
                      }}
                      className="w-full mb-4 py-3 bg-white text-black font-bold rounded-none flex items-center justify-center gap-2 border border-black/20 transition-all active:scale-95"
                    >
                      <span>🖼️</span> Use Google Photo
                    </button>
                  )}

                  <div className="grid grid-cols-5 gap-3">
                    {EMOJIS.map(emoji => (
                      <button 
                        key={emoji} 
                        onClick={() => { setEditEmoji(emoji); setEditUseCustomEmoji(true); setShowEmojiPicker(false); }}
                        className="text-3xl aspect-square flex items-center justify-center bg-white border border-black/20 hover:bg-black/5 rounded-none active:scale-90 transition-all"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
      
      <BottomNav />
    </main>
  );
}
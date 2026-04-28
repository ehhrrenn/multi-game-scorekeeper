// app/roster/page.tsx
'use client';

import { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useGameState } from '../../hooks/useGameState';

// --- Types ---
type Player = { id: string; name: string; emoji: string; photoURL?: string; isGuest?: boolean };
type Round = { roundId: number; scores: Record<string, number> };
type PlayerSnapshot = { id: string; name: string; emoji: string; photoURL?: string };
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

type PlayerStats = {
  playerId: string;
  name: string;
  emoji: string;
  photoURL?: string;
  gamesPlayed: number;
  wins: number;
  winRate: number;
  totalPoints: number;
  avgPoints: number;
  bestScore: number;
  isCloudUser: boolean; // Helps us badge them in the UI
  useCustomEmoji: boolean;
};

export default function RosterPage() {
  // 1. Cloud State
  const [cloudPlayers, setCloudPlayers] = useState<Player[]>([]);
  const [cloudHistory, setCloudHistory] = useState<MatchRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // 2. Local Storage State (The Legacy Data)
  const [localPlayers] = useGameState<Player[]>('scorekeeper_global_roster', []);
  const [localHistory] = useGameState<MatchRecord[]>('scorekeeper_history', []);
  const [gameProfiles] = useGameState<GameProfile[]>('scorekeeper_game_profiles', [{ name: 'Custom Game', winCondition: 'HIGH', scoreDirection: 'UP' }]);

  // 3. Fetch from Firestore on mount
  useEffect(() => {
    async function fetchCloudData() {
      try {
        const usersSnapshot = await getDocs(collection(db, 'Users'));
        const fetchedUsers = usersSnapshot.docs.map(doc => doc.data() as Player);
        
        const gamesSnapshot = await getDocs(collection(db, 'Games'));
        const fetchedGames = gamesSnapshot.docs.map(doc => doc.data() as MatchRecord);

        setCloudPlayers(fetchedUsers);
        setCloudHistory(fetchedGames);
      } catch (error) {
        console.error("Error fetching data from Firebase:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchCloudData();
  }, []);

  // 4. Merge Local and Cloud Data safely
  const allPlayers = useMemo(() => {
    const combined = [...localPlayers, ...cloudPlayers];
    // Deduplicate by ID (in case a local player was already migrated to cloud)
    return Array.from(new Map(combined.map(p => [p.id, p])).values());
  }, [localPlayers, cloudPlayers]);

  const allHistory = useMemo(() => {
    const combined = [...localHistory, ...cloudHistory];
    // Deduplicate by matchId
    return Array.from(new Map(combined.map(h => [h.matchId, h])).values());
  }, [localHistory, cloudHistory]);

  // 5. Analytics Engine (Running on merged data)
  const playerStats = useMemo(() => {
    const statsMap: Record<string, PlayerStats> = {};

    allPlayers.forEach(p => {
      // Determine if they exist in the cloud array to show a cloud icon later
      const isCloud = cloudPlayers.some(cp => cp.id === p.id);

      statsMap[p.id] = {
        playerId: p.id,
        name: p.name,
        emoji: p.emoji,
        photoURL: p.photoURL,
        gamesPlayed: 0,
        wins: 0,
        winRate: 0,
        totalPoints: 0,
        avgPoints: 0,
        bestScore: 0,
        isCloudUser: isCloud,
        useCustomEmoji: false,
      };
    });

    allHistory.forEach(game => {
      const profile = gameProfiles.find(p => p.name === game.gameName) || gameProfiles[0];
      const winCondition = profile.winCondition;
      let winningScore = winCondition === 'HIGH' ? -Infinity : Infinity;
      let winners: string[] = [];

      // Find the winning score
      game.activePlayerIds.forEach(pid => {
        const score = game.finalScores[pid];
        if (score !== undefined) {
          if ((winCondition === 'HIGH' && score > winningScore) || 
              (winCondition === 'LOW' && score < winningScore)) {
            winningScore = score;
            winners = [pid];
          } else if (score === winningScore) {
            winners.push(pid);
          }
        }
      });

      // Update stats
      game.activePlayerIds.forEach(pid => {
        if (!statsMap[pid]) return; 
        
        const score = game.finalScores[pid] || 0;
        const pStats = statsMap[pid];

        pStats.gamesPlayed += 1;
        pStats.totalPoints += score;
        if (winners.includes(pid)) pStats.wins += 1;
        
        if (pStats.gamesPlayed === 1) {
          pStats.bestScore = score;
        } else {
          if (winCondition === 'HIGH') {
            pStats.bestScore = Math.max(pStats.bestScore, score);
          } else {
            pStats.bestScore = Math.min(pStats.bestScore, score);
          }
        }
      });
    });

    return Object.values(statsMap)
      .map(p => ({
        ...p,
        winRate: p.gamesPlayed > 0 ? p.wins / p.gamesPlayed : 0,
        avgPoints: p.gamesPlayed > 0 ? p.totalPoints / p.gamesPlayed : 0
      }))
      .sort((a, b) => b.winRate - a.winRate || b.gamesPlayed - a.gamesPlayed);
  }, [allPlayers, allHistory, gameProfiles, cloudPlayers]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-50 pb-32 transition-colors">
      
      <div className="sticky top-0 z-40 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md shadow-sm border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-screen-md mx-auto px-4 h-16 flex items-center justify-between">
          <h1 className="text-2xl font-black">All Players</h1>
          <span className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-3 py-1 rounded-full text-xs font-bold shadow-inner border border-slate-200 dark:border-slate-700">
            {allPlayers.length} Total Players
          </span>
        </div>
      </div>

      {/* 2. MATCHING MAIN CONTAINER */}
      <main className="max-w-screen-md mx-auto p-4 space-y-6">
        
        {/* Optional: If you ever want top-level Hero Stats for the whole roster, put the flex-box row here! */}

        <h2 className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3 ml-1 mt-2">
          Player Profiles
        </h2>

        {/* 3. MATCHING FEED / LIST VIEW */}
        {loading ? (
          <div className="text-center p-8 text-slate-400 font-medium">Syncing Cloud Roster...</div>
        ) : playerStats.length === 0 ? (
          <div className="bg-slate-100 dark:bg-slate-800 rounded-2xl p-8 text-center text-slate-500 font-medium border border-slate-200 dark:border-slate-700 border-dashed">
            No players found. Start a game to add players!
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {playerStats.map((p) => (
              <Link 
                key={p.playerId} 
                href={`/roster/${p.playerId}`}
                className="block bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm hover:border-blue-300 dark:hover:border-blue-700 active:scale-[0.98] transition-all"
              >
                <div className="flex items-center gap-4 mb-4">
                  
                  {/* Matching Avatar Sizing */}
                  <div className="w-14 h-14 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-full flex items-center justify-center text-3xl shadow-sm overflow-hidden flex-shrink-0">
                    {p.isCloudUser && p.photoURL && !p.useCustomEmoji ? (
                      <img src={p.photoURL} alt={p.name} className="w-full h-full object-cover" />
                    ) : (
                      <span>{p.emoji || '👤'}</span>
                    )}
                  </div>
                  
                  {/* Name and Topline Stats */}
                  <div className="flex-1 min-w-0">
                    <div className="text-lg font-black flex items-center gap-2 truncate">
                      <span className="truncate">{p.name}</span>
                      {p.isCloudUser && <span className="text-xs flex-shrink-0 text-blue-500">☁️</span>}
                    </div>
                    <div className="text-xs text-slate-400 dark:text-slate-500 font-bold truncate">
                      {p.gamesPlayed} games • {p.wins} wins • {(p.winRate * 100).toFixed(0)}%
                    </div>
                  </div>
                  
                  {/* Native iOS Chevron to imply clickability */}
                  <div className="text-slate-300 dark:text-slate-600 pl-2">
                    ❯
                  </div>
                </div>

                {/* Stat Pillars */}
                <div className="flex gap-3 text-center">
                  <div className="hidden sm:block flex-1 bg-slate-50 dark:bg-slate-800/50 rounded-xl py-2">
                    <div className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">Total</div>
                    <div className="font-black text-slate-800 dark:text-slate-200">{p.totalPoints}</div>
                  </div>
                  <div className="flex-1 bg-slate-50 dark:bg-slate-800/50 rounded-xl py-2">
                    <div className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">Avg</div>
                    <div className="font-black text-slate-800 dark:text-slate-200">{p.avgPoints.toFixed(0)}</div>
                  </div>
                  <div className="flex-1 bg-slate-50 dark:bg-slate-800/50 rounded-xl py-2">
                    <div className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">Best</div>
                    <div className="font-black text-emerald-600 dark:text-emerald-400">{p.bestScore}</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
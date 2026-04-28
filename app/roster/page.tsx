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
    <main className="pb-24 pt-6 px-4 max-w-screen-md mx-auto min-h-screen">
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-800 dark:text-slate-100">
            Global Roster
          </h1>
          <p className="text-slate-500 dark:text-slate-400 font-medium mt-1">
            {allPlayers.length} Players Synced
          </p>
        </div>
      </div>

      {allPlayers.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 text-center border-2 border-dashed border-slate-200 dark:border-slate-800">
          <div className="text-4xl mb-3">☁️</div>
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200 mb-2">No Players Found</h3>
          <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">
            Log in or create a local player to start your roster.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {playerStats.map((p) => (
            <Link key={p.playerId} href={`/roster/${p.playerId}`}>
              <div className="relative bg-white dark:bg-slate-900 p-5 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 active:scale-[0.98] transition-transform cursor-pointer overflow-hidden">
                
                {/* Cloud Indicator Badge */}
                {p.isCloudUser && (
                  <div className="absolute top-0 right-0 bg-blue-500 text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl z-10">
                    CLOUD
                  </div>
                )}

                <div className="flex items-center gap-4 mb-4 mt-2">
                  {p.photoURL ? (
                    <img src={p.photoURL} alt={p.name} className="w-12 h-12 rounded-full border border-slate-200 dark:border-slate-700 object-cover" />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-2xl">
                      {p.isCloudUser && p.photoURL && !p.useCustomEmoji ? (
  <img src={p.photoURL} alt={p.name} className="w-full h-full object-cover rounded-full" />
) : (
  <span>{p.emoji || '👤'}</span>
)}
                    </div>
                  )}
                  <div>
                    <div className="text-lg font-black text-slate-800 dark:text-slate-100">{p.name}</div>
                    <div className="text-xs text-slate-400 dark:text-slate-500 font-bold">
                      {p.gamesPlayed} games • {p.wins} wins • {(p.winRate * 100).toFixed(0)}%
                    </div>
                  </div>
                </div>

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
                    <div className="font-black text-slate-800 dark:text-slate-200">{p.bestScore}</div>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
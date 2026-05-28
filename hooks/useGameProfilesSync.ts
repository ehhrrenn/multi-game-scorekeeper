import { useCallback, useEffect, useMemo } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { useGameState } from './useGameState';
import { db } from '../lib/firebase';
import {
  DEFAULT_GAME_PROFILE,
  buildDerivedProfilesFromHistory,
  dedupeGameProfiles,
  fetchCloudGameProfiles,
  upsertCloudGameProfiles,
  type GameProfile
} from '../lib/gameProfiles';
import { isGameCompleted, type GameRecord } from '../lib/gameHistory';

type SetGameProfilesInput = GameProfile[] | ((prevProfiles: GameProfile[]) => GameProfile[]);

function serializeProfiles(profiles: GameProfile[]): string {
  return JSON.stringify(
    profiles.map((profile) => ({
      name: profile.name,
      winCondition: profile.winCondition,
      scoreDirection: profile.scoreDirection,
      endMode: profile.endMode,
      target: profile.target,
      roundLimit: profile.roundLimit,
      createdAt: profile.createdAt,
      lastModified: profile.lastModified
    }))
  );
}

export function useGameProfilesSync() {
  const [localProfiles, setLocalProfiles] = useGameState<GameProfile[]>('scorekeeper_game_profiles', [DEFAULT_GAME_PROFILE]);
  const gameProfiles = useMemo(() => dedupeGameProfiles(localProfiles), [localProfiles]);

  useEffect(() => {
    if (!db) {
      return;
    }

    let cancelled = false;

    async function syncFromCloud() {
      try {
        const [cloudProfiles, gamesSnapshot] = await Promise.all([
          fetchCloudGameProfiles(db),
          getDocs(collection(db, 'Games'))
        ]);

        const cloudHistory = gamesSnapshot.docs.map((snap) => snap.data() as GameRecord);
        const completedHistory = cloudHistory.filter((record) => isGameCompleted(record));
        const derivedFromHistory = buildDerivedProfilesFromHistory(completedHistory);
        const merged = dedupeGameProfiles([...localProfiles, ...cloudProfiles, ...derivedFromHistory]);

        if (cancelled) {
          return;
        }

        if (serializeProfiles(merged) !== serializeProfiles(gameProfiles)) {
          setLocalProfiles(merged);
        }

        const cloudMap = new Map(cloudProfiles.map((profile) => [profile.name.toLowerCase(), serializeProfiles([profile])]));
        const toUpsert = merged.filter((profile) => cloudMap.get(profile.name.toLowerCase()) !== serializeProfiles([profile]));
        if (toUpsert.length) {
          await upsertCloudGameProfiles(db, toUpsert);
        }
      } catch (error) {
        console.error('Error syncing game profiles:', error);
      }
    }

    void syncFromCloud();

    return () => {
      cancelled = true;
    };
  }, [gameProfiles, localProfiles, setLocalProfiles]);

  const setGameProfiles = useCallback((nextProfiles: SetGameProfilesInput) => {
    setLocalProfiles((prevProfiles) => {
      const normalizedPrevious = dedupeGameProfiles(prevProfiles);
      const resolvedProfiles = typeof nextProfiles === 'function'
        ? nextProfiles(normalizedPrevious)
        : nextProfiles;

      const normalizedProfiles = dedupeGameProfiles(resolvedProfiles);

      if (db) {
        upsertCloudGameProfiles(db, normalizedProfiles).catch((error) => {
          console.error('Error saving game profiles to cloud:', error);
        });
      }

      return normalizedProfiles;
    });
  }, [setLocalProfiles]);

  return useMemo(() => ({
    gameProfiles,
    setGameProfiles
  }), [gameProfiles, setGameProfiles]);
}

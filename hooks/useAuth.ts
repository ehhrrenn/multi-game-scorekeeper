// hooks/useAuth.ts
import { useEffect, useState } from 'react';
import { auth, db } from '../lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { upsertCloudPlayer } from '../lib/cloudPlayers';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';

type CloudProfile = {
  name?: string;
  emoji?: string;
  photoURL?: string;
  useCustomEmoji?: boolean;
};

export function useAuth() {
  const safeAuth = auth;
  const safeDb = db;
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<CloudProfile | null>(null);
  const [loading, setLoading] = useState(Boolean(safeAuth && safeDb));

  useEffect(() => {
    if (!safeAuth || !safeDb) {
      return;
    }

    let unsubscribeProfile: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(safeAuth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);

        const userRef = doc(safeDb, 'users', firebaseUser.uid);
        const existingSnap = await getDoc(userRef);
        const existing = existingSnap.exists() ? (existingSnap.data() as CloudProfile) : null;
        
        await upsertCloudPlayer(safeDb, {
          id: firebaseUser.uid,
          name: firebaseUser.displayName || 'Anonymous Player',
          emoji: existing?.emoji || '☞',
          photoURL: existing?.photoURL || firebaseUser.photoURL || '',
          useCustomEmoji: existing?.useCustomEmoji || false,
          isCloudUser: true,
          isGuest: false,
          isAuthUser: true,
          lastLogin: new Date().toISOString()
        });

        if (unsubscribeProfile) {
          unsubscribeProfile();
        }

        unsubscribeProfile = onSnapshot(userRef, (snapshot) => {
          if (snapshot.exists()) {
            setProfile(snapshot.data() as CloudProfile);
            return;
          }

          setProfile(null);
        });
        
      } else {
        setUser(null);
        setProfile(null);
        if (unsubscribeProfile) {
          unsubscribeProfile();
          unsubscribeProfile = null;
        }
      }
      setLoading(false);
    });

    // Cleanup subscription on unmount
    return () => {
      unsubscribe();
      if (unsubscribeProfile) {
        unsubscribeProfile();
      }
    };
  }, [safeAuth, safeDb]);

  return { user, profile, loading };
}
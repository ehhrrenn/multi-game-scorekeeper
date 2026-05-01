// hooks/useAuth.ts
import { useEffect, useState } from 'react';
import { auth, db } from '../lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { upsertCloudPlayer } from '../lib/cloudPlayers';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const safeAuth = auth;
  const safeDb = db;

  useEffect(() => {
    if (!safeAuth || !safeDb) {
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(safeAuth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        
        await upsertCloudPlayer(safeDb, {
          id: firebaseUser.uid,
          name: firebaseUser.displayName || 'Anonymous Player',
          emoji: '👤',
          photoURL: firebaseUser.photoURL || '',
          isCloudUser: true,
          isGuest: false,
          isAuthUser: true,
          lastLogin: new Date().toISOString()
        });
        
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, []);

  return { user, loading };
}
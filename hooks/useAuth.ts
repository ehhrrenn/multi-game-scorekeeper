// hooks/useAuth.ts
import { useEffect, useState } from 'react';
import { auth, db } from '../lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        
        // --- THE SYNC LOGIC ---
        // Create a reference to this user's specific document in the "Users" collection
        const userRef = doc(db, 'Users', firebaseUser.uid);
        
        // Write their data to the database
        await setDoc(userRef, {
          id: firebaseUser.uid,
          name: firebaseUser.displayName || 'Anonymous Player',
          email: firebaseUser.email || '',
          photoURL: firebaseUser.photoURL || '',
          emoji: '👤', // Fallback for UI elements that still expect an emoji
          isGuest: false,
          lastLogin: new Date()
        }, { merge: true }); 
        // Note: { merge: true } is crucial! It ensures we only update these specific fields 
        // without accidentally wiping out any other stats we might attach to this document later.
        
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
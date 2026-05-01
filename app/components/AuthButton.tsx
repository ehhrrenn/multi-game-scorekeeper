// app/components/AuthButton.tsx
'use client';

import { auth, db, firebaseConfigError, isFirebaseConfigured } from '../../lib/firebase';
import { GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { formatFirstName, upsertCloudPlayer } from '../../lib/cloudPlayers';
import { useAuth } from '../../hooks/useAuth';

export default function AuthButton() {
  const { user, loading } = useAuth();
  const safeAuth = auth;
  const safeDb = db;

  if (!isFirebaseConfigured || !safeAuth || !safeDb) {
    return (
      <button
        type="button"
        disabled
        title={firebaseConfigError || 'Firebase is not configured'}
        className="bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400 font-bold py-2.5 px-5 rounded-full cursor-not-allowed"
      >
        Sign-in unavailable
      </button>
    );
  }

  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(safeAuth, provider);
      
      if (result.user) {
        await upsertCloudPlayer(safeDb, {
          id: result.user.uid,
          name: result.user.displayName || 'Anonymous Player',
          emoji: '👤',
          photoURL: result.user.photoURL || '',
          isCloudUser: true,
          isGuest: false,
          isAuthUser: true,
          lastLogin: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error("Google Login failed:", error);
    }
  };

  if (loading) {
    return <div className="h-10 w-24 bg-slate-200 dark:bg-slate-800 animate-pulse rounded-full"></div>;
  }

  if (user) {
    return (
      <div className="flex items-center gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 py-1.5 pl-1.5 pr-4 rounded-full shadow-sm">
        <img 
          src={user.photoURL || ''} 
          alt="Profile" 
          className="w-8 h-8 rounded-full border border-slate-200 dark:border-slate-700" 
        />
        <div className="flex flex-col">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">Player 1</span>
          <span className="text-sm font-bold text-slate-800 dark:text-slate-100 leading-none mt-1 truncate max-w-[100px]">{formatFirstName(user.displayName || '')}</span>
        </div>
        <button 
          onClick={() => signOut(safeAuth)} 
          className="ml-2 w-8 h-8 flex items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          title="Sign Out"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
        </button>
      </div>
    );
  }

  return (
    <button 
      onClick={handleLogin} 
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm text-slate-700 dark:text-slate-200 font-bold py-2.5 px-5 rounded-full flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-800 active:scale-95 transition-all"
    >
      <svg className="w-5 h-5" viewBox="0 0 24 24">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
      </svg>
      Sign in with Google
    </button>
  );
}
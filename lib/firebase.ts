// lib/firebase.ts
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || ''
};

const requiredEnvMap: Record<keyof typeof firebaseConfig, string> = {
  apiKey: 'NEXT_PUBLIC_FIREBASE_API_KEY',
  authDomain: 'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  projectId: 'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  storageBucket: 'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
  messagingSenderId: 'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  appId: 'NEXT_PUBLIC_FIREBASE_APP_ID'
};

const missingFirebaseEnv = Object.entries(firebaseConfig)
  .filter(([, value]) => !value)
  .map(([key]) => requiredEnvMap[key as keyof typeof firebaseConfig]);

export const isFirebaseConfigured = missingFirebaseEnv.length === 0;
export const firebaseConfigError = isFirebaseConfigured
  ? null
  : `Firebase is disabled. Missing env vars: ${missingFirebaseEnv.join(', ')}`;

// Initialize only when public env vars are present to avoid runtime auth/invalid-api-key crashes.
let app: FirebaseApp | null = null;
if (isFirebaseConfigured) {
  app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
} else if (typeof window !== 'undefined') {
  console.warn(firebaseConfigError);
}

// Export the specific Firebase services we will be using
export const auth: Auth | null = app ? getAuth(app) : null;
export const db: Firestore | null = app ? getFirestore(app) : null;
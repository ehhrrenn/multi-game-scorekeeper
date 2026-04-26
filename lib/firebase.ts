// lib/firebase.ts
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyARSSvXpCwemlCLnVmiueEaEeKpEjUEZhY",
  authDomain: "game-scorekeeper-54f72.firebaseapp.com",
  projectId: "game-scorekeeper-54f72",
  storageBucket: "game-scorekeeper-54f72.firebasestorage.app",
  messagingSenderId: "1098830396762",
  appId: "1:1098830396762:web:9ba9183034530dc2ae8763"
};

// Initialize Firebase (This pattern prevents re-initialization errors during Next.js hot reloads)
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Export the specific Firebase services we will be using
export const auth = getAuth(app);
export const db = getFirestore(app);
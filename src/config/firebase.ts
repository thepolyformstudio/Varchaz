/* ============================================================
   Varchaz — Firebase Configuration
   ============================================================
   Replace these placeholder values with your actual Firebase
   project config from the Firebase Console.
   ============================================================ */

import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyCn4uvkrQvBZLYSJydpNsZes_Kqos-TqwQ',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'varchaz.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'varchaz',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'varchaz.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '690200623564',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:690200623564:web:27939c217ba3aacc8e0569'
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Enable offline persistence
enableIndexedDbPersistence(db).catch((err) => {
  if (err.code === 'failed-precondition') {
    console.warn('Firestore persistence failed: multiple tabs open');
  } else if (err.code === 'unimplemented') {
    console.warn('Firestore persistence not supported in this browser');
  }
});

export default app;

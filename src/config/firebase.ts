import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

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

export default app;

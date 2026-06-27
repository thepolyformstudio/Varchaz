/* ============================================================
   Varchaz — Auth Context
   ============================================================ */

import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  updateProfile,
  type User
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import type { AppUser, UserRole } from '../types';

interface AuthContextType {
  firebaseUser: User | null;
  appUser: AppUser | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string, role: UserRole, supervisorId?: string) => Promise<void>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  refreshUser: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Listen for Firebase auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        await fetchAppUser(user.uid);
      } else {
        setAppUser(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  async function fetchAppUser(uid: string) {
    try {
      const userDoc = await getDoc(doc(db, 'users', uid));
      if (userDoc.exists()) {
        setAppUser(userDoc.data() as AppUser);
      } else {
        setAppUser(null);
      }
    } catch (err) {
      console.error('Error fetching user profile:', err);
      setAppUser(null);
    }
  }

  async function login(email: string, password: string) {
    setError(null);
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      await fetchAppUser(cred.user.uid);
    } catch (err: any) {
      const msg = getAuthErrorMessage(err.code);
      setError(msg);
      throw new Error(msg);
    }
  }

  async function register(
    email: string,
    password: string,
    displayName: string,
    role: UserRole,
    supervisorId?: string
  ) {
    setError(null);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(cred.user, { displayName });

      // Create user document in Firestore
      const userData: AppUser = {
        uid: cred.user.uid,
        email: email.toLowerCase(),
        displayName,
        role,
        status: role === 'admin' ? 'approved' : 'pending',
        supervisorId: supervisorId || null,
        parentSupervisorId: role === 'supervisor' ? (supervisorId || null) : null,
        financialYear: 'apr-mar',
        assignedSupervisors: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        disabledAt: null,
        disabledBy: null,
        profileComplete: true
      };

      await setDoc(doc(db, 'users', cred.user.uid), userData);

      // Create approval record if not admin
      if (role !== 'admin' && supervisorId) {
        const approvalId = `${cred.user.uid}_${Date.now()}`;
        await setDoc(doc(db, 'approvals', approvalId), {
          userId: cred.user.uid,
          supervisorId,
          status: 'pending',
          requestedAt: serverTimestamp(),
          processedAt: null,
          processedBy: null,
          role,
          userName: displayName,
          userEmail: email.toLowerCase()
        });
      }

      await fetchAppUser(cred.user.uid);
    } catch (err: any) {
      console.error('Registration failed:', err);
      const friendlyMsg = getAuthErrorMessage(err.code);
      const msg = friendlyMsg === 'An authentication error occurred' && err.message ? err.message : friendlyMsg;
      setError(msg);
      throw new Error(msg);
    }
  }

  async function logout() {
    try {
      await signOut(auth);
      setAppUser(null);
    } catch (err: any) {
      setError('Failed to sign out');
    }
  }

  async function resetPassword(email: string) {
    setError(null);
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (err: any) {
      const msg = getAuthErrorMessage(err.code);
      setError(msg);
      throw new Error(msg);
    }
  }

  async function refreshUser() {
    if (firebaseUser) {
      await fetchAppUser(firebaseUser.uid);
    }
  }

  function clearError() {
    setError(null);
  }

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        appUser,
        loading,
        error,
        login,
        register,
        logout,
        resetPassword,
        refreshUser,
        clearError
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

function getAuthErrorMessage(code: string): string {
  switch (code) {
    case 'auth/email-already-in-use': return 'This email is already registered';
    case 'auth/invalid-email': return 'Invalid email address';
    case 'auth/user-not-found': return 'No account found with this email';
    case 'auth/wrong-password': return 'Incorrect password';
    case 'auth/weak-password': return 'Password is too weak';
    case 'auth/too-many-requests': return 'Too many attempts. Please try again later';
    case 'auth/user-disabled': return 'This account has been disabled';
    case 'auth/invalid-credential': return 'Invalid email or password';
    default: return 'An authentication error occurred';
  }
}

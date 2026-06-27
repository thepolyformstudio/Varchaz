/* ============================================================
   Varchaz — User Service
   ============================================================ */

import {
  collection, doc, getDoc, getDocs, updateDoc, query, where, serverTimestamp, orderBy
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type { AppUser } from '../types';

const USERS_COL = 'users';

/** Fetch a single user by UID */
export async function fetchUser(uid: string): Promise<AppUser | null> {
  const snap = await getDoc(doc(db, USERS_COL, uid));
  return snap.exists() ? (snap.data() as AppUser) : null;
}

/** Fetch all users */
export async function fetchAllUsers(): Promise<AppUser[]> {
  const snap = await getDocs(collection(db, USERS_COL));
  const users = snap.docs.map(d => d.data() as AppUser);
  return users.sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));
}

/** Fetch users by role */
export async function fetchUsersByRole(role: string): Promise<AppUser[]> {
  const snap = await getDocs(
    query(collection(db, USERS_COL), where('role', '==', role), orderBy('displayName'))
  );
  return snap.docs.map(d => d.data() as AppUser);
}

/** Fetch users mapped to a supervisor */
export async function fetchUsersBySupervisor(supervisorId: string): Promise<AppUser[]> {
  const snap = await getDocs(
    query(collection(db, USERS_COL), where('supervisorId', '==', supervisorId), where('role', '==', 'user'))
  );
  return snap.docs.map(d => d.data() as AppUser);
}

/** Fetch all users under a supervisor hierarchy (recursive) */
export async function fetchUsersInHierarchy(supervisorId: string): Promise<AppUser[]> {
  const directUsers = await fetchUsersBySupervisor(supervisorId);
  const childSupervisors = await fetchChildSupervisors(supervisorId);

  let allUsers = [...directUsers];
  for (const child of childSupervisors) {
    const childUsers = await fetchUsersInHierarchy(child.uid);
    allUsers = [...allUsers, ...childUsers];
  }
  return allUsers;
}

/** Fetch child supervisors (supervisors whose parentSupervisorId = given ID) */
export async function fetchChildSupervisors(supervisorId: string): Promise<AppUser[]> {
  const snap = await getDocs(
    query(
      collection(db, USERS_COL),
      where('parentSupervisorId', '==', supervisorId),
      where('role', '==', 'supervisor')
    )
  );
  return snap.docs.map(d => d.data() as AppUser);
}

/** Fetch all supervisors */
export async function fetchAllSupervisors(): Promise<AppUser[]> {
  const snap = await getDocs(query(collection(db, USERS_COL), where('role', '==', 'supervisor')));
  const sups = snap.docs.map(d => d.data() as AppUser);
  return sups
    .filter(s => s.status === 'approved')
    .sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));
}

/** Fetch all viewers */
export async function fetchAllViewers(): Promise<AppUser[]> {
  const all = await fetchAllUsers();
  return all.filter(u => u.role === 'viewer');
}

/** Update user profile */
export async function updateUserProfile(uid: string, updates: Partial<AppUser>): Promise<void> {
  await updateDoc(doc(db, USERS_COL, uid), {
    ...updates,
    updatedAt: serverTimestamp()
  });
}

/** Soft-delete (disable) a user */
export async function softDeleteUser(uid: string, disabledBy: string): Promise<void> {
  await updateDoc(doc(db, USERS_COL, uid), {
    status: 'disabled',
    disabledAt: serverTimestamp(),
    disabledBy,
    updatedAt: serverTimestamp()
  });
}

/** Reactivate a disabled user */
export async function reactivateUser(uid: string): Promise<void> {
  await updateDoc(doc(db, USERS_COL, uid), {
    status: 'approved',
    disabledAt: null,
    disabledBy: null,
    updatedAt: serverTimestamp()
  });
}

/** Reassign user to a different supervisor */
export async function reassignUser(uid: string, newSupervisorId: string): Promise<void> {
  await updateDoc(doc(db, USERS_COL, uid), {
    supervisorId: newSupervisorId,
    updatedAt: serverTimestamp()
  });
}

/** Count users by status */
export async function countUsersByStatus(): Promise<Record<string, number>> {
  const all = await fetchAllUsers();
  const counts: Record<string, number> = { pending: 0, approved: 0, disabled: 0, total: all.length };
  all.forEach(u => { counts[u.status] = (counts[u.status] || 0) + 1; });
  return counts;
}

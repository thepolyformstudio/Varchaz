/* ============================================================
   Varchaz — Approval Service
   ============================================================ */

import {
  collection, doc, getDocs, updateDoc, query, where, serverTimestamp, orderBy, getDoc
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type { Approval } from '../types';
import { updateUserProfile } from './userService';

const APPROVALS_COL = 'approvals';

/** Fetch pending approvals for a supervisor */
export async function fetchPendingApprovals(supervisorId: string): Promise<Approval[]> {
  const snap = await getDocs(
    query(
      collection(db, APPROVALS_COL),
      where('supervisorId', '==', supervisorId),
      where('status', '==', 'pending')
    )
  );
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Approval));
}

/** Fetch all approvals (admin) */
export async function fetchAllApprovals(): Promise<Approval[]> {
  const snap = await getDocs(
    query(collection(db, APPROVALS_COL), orderBy('requestedAt', 'desc'))
  );
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Approval));
}

/** Approve a user */
export async function approveUser(approvalId: string, userId: string, approvedBy: string): Promise<void> {
  const approvalRef = doc(db, APPROVALS_COL, approvalId);
  const approvalSnap = await getDoc(approvalRef);
  const approvalData = approvalSnap.exists() ? approvalSnap.data() as Approval : null;

  // Update approval record
  await updateDoc(approvalRef, {
    status: 'approved',
    processedAt: serverTimestamp(),
    processedBy: approvedBy
  });

  // Update user status
  const updates: any = { status: 'approved' };
  if (approvalData && approvalData.role === 'viewer' && approvalData.supervisorId) {
    updates.assignedSupervisors = [approvalData.supervisorId];
  }

  await updateUserProfile(userId, updates);
}

/** Reject a user */
export async function rejectUser(approvalId: string, userId: string, rejectedBy: string): Promise<void> {
  await updateDoc(doc(db, APPROVALS_COL, approvalId), {
    status: 'rejected',
    processedAt: serverTimestamp(),
    processedBy: rejectedBy
  });
}

/** Count pending approvals for a supervisor */
export async function countPendingApprovals(supervisorId: string): Promise<number> {
  const approvals = await fetchPendingApprovals(supervisorId);
  return approvals.length;
}

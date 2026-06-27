/* ============================================================
   Varchaz — Plan Service
   ============================================================ */

import {
  doc, getDoc, setDoc, updateDoc, query, collection, where, getDocs, serverTimestamp
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type { MonthlyPlan } from '../types';

const PLANS_COL = 'monthlyPlans';

/** Get document ID for a plan: userId_YYYY-MM */
function planDocId(userId: string, month: string): string {
  return `${userId}_${month}`;
}

/** Fetch a user's plan for a specific month */
export async function fetchMonthlyPlan(userId: string, month: string): Promise<MonthlyPlan | null> {
  const docSnap = await getDoc(doc(db, PLANS_COL, planDocId(userId, month)));
  if (docSnap.exists()) {
    return docSnap.data() as MonthlyPlan;
  }
  return null;
}

/** Fetch plans for multiple months (for YTD) */
export async function fetchPlansForMonths(userId: string, months: string[]): Promise<MonthlyPlan[]> {
  const plans: MonthlyPlan[] = [];
  for (const month of months) {
    const plan = await fetchMonthlyPlan(userId, month);
    if (plan) plans.push(plan);
  }
  return plans;
}

/** Save or update a monthly plan */
export async function saveMonthlyPlan(
  userId: string,
  month: string,
  products: Record<string, number>,
  updatedBy: string
): Promise<void> {
  const id = planDocId(userId, month);
  const existing = await fetchMonthlyPlan(userId, month);

  if (existing) {
    await updateDoc(doc(db, PLANS_COL, id), {
      products,
      updatedAt: serverTimestamp(),
      updatedBy,
      status: 'submitted'
    });
  } else {
    const plan: MonthlyPlan = {
      userId,
      month,
      products,
      status: 'submitted',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      updatedBy,
      lockedAt: null
    };
    await setDoc(doc(db, PLANS_COL, id), plan);
  }
}

/** Fetch all plans for a user (for admin/supervisor views) */
export async function fetchAllPlansForUser(userId: string): Promise<MonthlyPlan[]> {
  const snap = await getDocs(query(collection(db, PLANS_COL), where('userId', '==', userId)));
  return snap.docs.map(d => d.data() as MonthlyPlan);
}

/** Fetch all plans for a set of users for a given month */
export async function fetchPlansForUsers(userIds: string[], month: string): Promise<MonthlyPlan[]> {
  if (userIds.length === 0) return [];
  const plans: MonthlyPlan[] = [];
  for (const uid of userIds) {
    const plan = await fetchMonthlyPlan(uid, month);
    if (plan) plans.push(plan);
  }
  return plans;
}

/** Fetch all plans for a set of users for multiple months (YTD consolidated) */
export async function fetchPlansForUsersMultiMonth(
  userIds: string[],
  months: string[]
): Promise<MonthlyPlan[]> {
  const plans: MonthlyPlan[] = [];
  for (const uid of userIds) {
    for (const month of months) {
      const plan = await fetchMonthlyPlan(uid, month);
      if (plan) plans.push(plan);
    }
  }
  return plans;
}

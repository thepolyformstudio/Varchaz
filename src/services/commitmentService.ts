/* ============================================================
   Varchaz — Daily Commitment Service
   ============================================================ */

import {
  doc, getDoc, setDoc, updateDoc, query, collection, where, getDocs, serverTimestamp
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type { DailyCommitment, DailyCommitmentItem, WeeklyCommitmentSummary } from '../types';

const COMMITMENTS_COL = 'dailyCommitments';

/** Get document ID: {userId}_{YYYY-MM-DD} */
export function commitmentDocId(userId: string, date: string): string {
  return `${userId}_${date}`;
}

/** Fetch daily commitment for a user on a specific date */
export async function fetchDailyCommitment(userId: string, date: string): Promise<DailyCommitment | null> {
  try {
    const docSnap = await getDoc(doc(db, COMMITMENTS_COL, commitmentDocId(userId, date)));
    if (docSnap.exists()) {
      return docSnap.data() as DailyCommitment;
    }
  } catch (err) {
    console.error('Error fetching daily commitment:', err);
  }
  return null;
}

/** Save a morning commitment (stores only products with committedValue > 0) */
export async function saveDailyCommitment(
  userId: string,
  userName: string,
  supervisorId: string,
  date: string,
  items: DailyCommitmentItem[]
): Promise<DailyCommitment> {
  const id = commitmentDocId(userId, date);
  const month = date.substring(0, 7);

  // Store only products that the rep actively committed to
  const activeItems = items.filter(item => Number(item.committedValue) > 0);
  const totalCommitted = activeItems.reduce((acc, curr) => acc + Number(curr.committedValue || 0), 0);

  const commitment: DailyCommitment = {
    id,
    userId,
    userName,
    supervisorId: supervisorId || '',
    date,
    month,
    committedAt: serverTimestamp(),
    items: activeItems,
    totalCommitted: Math.round(totalCommitted * 100) / 100,
    totalAchieved: 0,
    fulfillmentPct: 0,
    isFulfilled: false,
    eodReported: false,
    isLocked: true
  };

  await setDoc(doc(db, COMMITMENTS_COL, id), commitment);
  return commitment;
}

/** Synchronize EOD daily sales with morning commitment */
export async function syncCommitmentWithSales(
  userId: string,
  date: string,
  salesProducts: Record<string, number>
): Promise<void> {
  const id = commitmentDocId(userId, date);
  const existing = await fetchDailyCommitment(userId, date);
  if (!existing || !existing.items || existing.items.length === 0) return;

  let totalAchieved = 0;
  const updatedItems = existing.items.map(item => {
    const ach = Number(salesProducts[item.productId] || 0);
    totalAchieved += ach;
    const pct = item.committedValue > 0 ? (ach / item.committedValue) * 100 : 0;
    return {
      ...item,
      achievedValue: ach,
      fulfillmentPct: Math.round(pct * 10) / 10
    };
  });

  const roundedTotalAch = Math.round(totalAchieved * 100) / 100;
  const fulfillmentPct = existing.totalCommitted > 0
    ? Math.round((roundedTotalAch / existing.totalCommitted) * 1000) / 10
    : 0;

  const isFulfilled = roundedTotalAch >= existing.totalCommitted;

  await updateDoc(doc(db, COMMITMENTS_COL, id), {
    items: updatedItems,
    totalAchieved: roundedTotalAch,
    fulfillmentPct,
    isFulfilled,
    eodReported: true,
    eodReportedAt: serverTimestamp()
  });
}

/** Fetch user's commitments across a set of dates (e.g. week) */
export async function fetchUserWeeklyCommitments(userId: string, dates: string[]): Promise<DailyCommitment[]> {
  const results: DailyCommitment[] = [];
  for (const d of dates) {
    const c = await fetchDailyCommitment(userId, d);
    if (c) results.push(c);
  }
  return results;
}

/** Fetch team commitments for a supervisor on a specific date */
export async function fetchTeamDailyCommitments(supervisorId: string, date: string): Promise<DailyCommitment[]> {
  try {
    const snap = await getDocs(
      query(collection(db, COMMITMENTS_COL), where('supervisorId', '==', supervisorId), where('date', '==', date))
    );
    return snap.docs.map(d => d.data() as DailyCommitment);
  } catch (err) {
    console.error('Error fetching team daily commitments:', err);
    return [];
  }
}

/** Fetch team commitments for a supervisor across a week */
export async function fetchTeamWeeklyCommitments(supervisorId: string, dates: string[]): Promise<DailyCommitment[]> {
  const all: DailyCommitment[] = [];
  for (const d of dates) {
    const teamDaily = await fetchTeamDailyCommitments(supervisorId, d);
    all.push(...teamDaily);
  }
  return all;
}

/** Calculate weekly summary with 100% fulfillment cap for average consistency */
export function calcWeeklyCommitmentSummary(
  commitments: DailyCommitment[],
  weekStart: string,
  weekEnd: string
): WeeklyCommitmentSummary {
  let totalCommitted = 0;
  let totalAchieved = 0;
  let cappedFulfillmentSum = 0;
  let daysReported = 0;

  commitments.forEach(c => {
    totalCommitted += Number(c.totalCommitted || 0);
    const ach = Number(c.totalAchieved || 0);
    totalAchieved += ach;
    if (c.eodReported) {
      daysReported++;
      const rawPct = c.totalCommitted > 0 ? (ach / c.totalCommitted) * 100 : 0;
      // Cap at 100% for weekly consistency averages per user rule
      cappedFulfillmentSum += Math.min(100, Math.max(0, rawPct));
    }
  });

  const averageFulfillmentPct = daysReported > 0
    ? Math.round((cappedFulfillmentSum / daysReported) * 10) / 10
    : 0;

  return {
    weekStart,
    weekEnd,
    totalCommitted: Math.round(totalCommitted * 100) / 100,
    totalAchieved: Math.round(totalAchieved * 100) / 100,
    averageFulfillmentPct,
    daysCommitted: commitments.length,
    daysReported,
    commitments
  };
}

/** Fetch commitments for an explicit list of user IDs on a specific date */
export async function fetchCommitmentsForUsers(userIds: string[], date: string): Promise<DailyCommitment[]> {
  if (!userIds || userIds.length === 0) return [];
  const promises = userIds.map(uid => fetchDailyCommitment(uid, date));
  const results = await Promise.all(promises);
  return results.filter((c): c is DailyCommitment => c !== null);
}

/** Fetch commitments for an explicit list of user IDs across multiple dates */
export async function fetchWeeklyCommitmentsForUsers(userIds: string[], dates: string[]): Promise<DailyCommitment[]> {
  if (!userIds || userIds.length === 0 || !dates || dates.length === 0) return [];
  const all: DailyCommitment[] = [];
  for (const d of dates) {
    const daily = await fetchCommitmentsForUsers(userIds, d);
    all.push(...daily);
  }
  return all;
}

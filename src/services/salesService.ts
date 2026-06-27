/* ============================================================
   Varchaz — Sales Service (Daily Sales)
   ============================================================ */

import {
  doc, getDoc, setDoc, updateDoc, query, collection, where, getDocs, serverTimestamp, orderBy
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type { DailySales } from '../types';

const SALES_COL = 'dailySales';

/** Get document ID: userId_YYYY-MM-DD */
function salesDocId(userId: string, date: string): string {
  return `${userId}_${date}`;
}

/** Fetch daily sales for a user on a specific date */
export async function fetchDailySales(userId: string, date: string): Promise<DailySales | null> {
  const docSnap = await getDoc(doc(db, SALES_COL, salesDocId(userId, date)));
  if (docSnap.exists()) {
    return docSnap.data() as DailySales;
  }
  return null;
}

/** Save daily sales */
export async function saveDailySales(
  userId: string,
  date: string,
  products: Record<string, number>,
  supervisorId: string
): Promise<void> {
  const id = salesDocId(userId, date);
  const month = date.substring(0, 7);
  const existing = await fetchDailySales(userId, date);

  if (existing) {
    await updateDoc(doc(db, SALES_COL, id), {
      products,
      updatedAt: serverTimestamp()
    });
  } else {
    const sales: DailySales = {
      userId,
      date,
      month,
      products,
      supervisorId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    await setDoc(doc(db, SALES_COL, id), sales);
  }
}

/** Fetch all daily sales for a user in a given month */
export async function fetchMonthlySales(userId: string, month: string): Promise<DailySales[]> {
  const snap = await getDocs(
    query(collection(db, SALES_COL), where('userId', '==', userId), where('month', '==', month))
  );
  return snap.docs.map(d => d.data() as DailySales);
}

/** Fetch daily sales for a user for specific dates */
export async function fetchSalesForDates(userId: string, dates: string[]): Promise<DailySales[]> {
  const sales: DailySales[] = [];
  for (const date of dates) {
    const s = await fetchDailySales(userId, date);
    if (s) sales.push(s);
  }
  return sales;
}

/** Fetch all daily sales for multiple users for a given month */
export async function fetchSalesForUsers(userIds: string[], month: string): Promise<DailySales[]> {
  if (userIds.length === 0) return [];
  const allSales: DailySales[] = [];
  for (const uid of userIds) {
    const userSales = await fetchMonthlySales(uid, month);
    allSales.push(...userSales);
  }
  return allSales;
}

/** Fetch all daily sales for a user across multiple months (YTD) */
export async function fetchSalesMultiMonth(userId: string, months: string[]): Promise<DailySales[]> {
  const allSales: DailySales[] = [];
  for (const month of months) {
    const sales = await fetchMonthlySales(userId, month);
    allSales.push(...sales);
  }
  return allSales;
}

/** Fetch sales for multiple users across multiple months */
export async function fetchSalesForUsersMultiMonth(
  userIds: string[],
  months: string[]
): Promise<DailySales[]> {
  const allSales: DailySales[] = [];
  for (const uid of userIds) {
    for (const month of months) {
      const sales = await fetchMonthlySales(uid, month);
      allSales.push(...sales);
    }
  }
  return allSales;
}

/** Check if user has reported for today */
export async function hasReportedToday(userId: string): Promise<boolean> {
  const today = new Date().toISOString().split('T')[0];
  const sales = await fetchDailySales(userId, today);
  return sales !== null;
}

/** Fetch daily sales for all users under a supervisor on a specific date */
export async function fetchTeamDailySales(supervisorId: string, date: string): Promise<DailySales[]> {
  const snap = await getDocs(
    query(
      collection(db, SALES_COL),
      where('supervisorId', '==', supervisorId),
      where('date', '==', date)
    )
  );
  return snap.docs.map(d => d.data() as DailySales);
}

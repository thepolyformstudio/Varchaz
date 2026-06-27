/* ============================================================
   Varchaz — Audit Service
   ============================================================ */

import { collection, doc, setDoc, getDocs, query, orderBy, limit, where, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import type { AuditLog } from '../types';

const AUDIT_COL = 'auditLogs';

/** Create an audit log entry */
export async function createAuditLog(
  action: string,
  performedBy: string,
  performedByName: string,
  affectedRecord: string,
  affectedUserId: string | null,
  previousValue: any,
  newValue: any,
  metadata: Record<string, any> = {}
): Promise<void> {
  const docRef = doc(collection(db, AUDIT_COL));
  const log: AuditLog = {
    action,
    performedBy,
    performedByName,
    affectedRecord,
    affectedUserId,
    previousValue,
    newValue,
    timestamp: serverTimestamp(),
    metadata
  };
  await setDoc(docRef, log);
}

/** Fetch recent audit logs */
export async function fetchAuditLogs(maxResults = 100): Promise<AuditLog[]> {
  const snap = await getDocs(
    query(collection(db, AUDIT_COL), orderBy('timestamp', 'desc'), limit(maxResults))
  );
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as AuditLog));
}

/** Fetch audit logs for a specific user */
export async function fetchAuditLogsForUser(userId: string, maxResults = 50): Promise<AuditLog[]> {
  const snap = await getDocs(
    query(
      collection(db, AUDIT_COL),
      where('affectedUserId', '==', userId),
      orderBy('timestamp', 'desc'),
      limit(maxResults)
    )
  );
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as AuditLog));
}

/* ============================================================
   Varchaz — Daily Report Service
   ============================================================ */

import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../config/firebase';

export interface DailyReportConfig {
  recipientEmail: string;
  isEnabled: boolean;
  scheduleTime: string; // e.g. "20:00"
  lastSentAt?: any;
  lastStatus?: string;
}

const SETTINGS_DOC_ID = 'dailyReportConfig';

/** Get current daily report configuration */
export async function getDailyReportConfig(): Promise<DailyReportConfig> {
  try {
    const docSnap = await getDoc(doc(db, 'settings', SETTINGS_DOC_ID));
    if (docSnap.exists()) {
      const data = docSnap.data();
      return {
        recipientEmail: data.recipientEmail || '',
        isEnabled: data.isEnabled !== false,
        scheduleTime: data.scheduleTime || '20:00',
        lastSentAt: data.lastSentAt || null,
        lastStatus: data.lastStatus || ''
      };
    }
  } catch (err) {
    console.error('Error reading daily report config:', err);
  }

  return {
    recipientEmail: '',
    isEnabled: true,
    scheduleTime: '20:00'
  };
}

/** Save daily report configuration */
export async function saveDailyReportConfig(config: Partial<DailyReportConfig>): Promise<void> {
  await setDoc(doc(db, 'settings', SETTINGS_DOC_ID), {
    ...config,
    updatedAt: new Date()
  }, { merge: true });
}

/** Trigger daily report dispatch immediately */
export async function triggerDailyReportNow(recipientEmail?: string): Promise<{ success: boolean; message?: string }> {
  try {
    const functions = getFunctions();
    const sendDailyReportCallable = httpsCallable<{ recipientEmail?: string }, { success: boolean; recipient: string; date: string }>(
      functions,
      'sendDailyReportNow'
    );

    const res = await sendDailyReportCallable({ recipientEmail });
    return {
      success: true,
      message: `Daily report Excel sent successfully to ${res.data.recipient}`
    };
  } catch (err: any) {
    console.error('Error triggering daily report callable function:', err);
    throw new Error(err.message || 'Failed to dispatch daily report.');
  }
}

/* ============================================================
   Varchaz — WhatsApp Reminder Service
   ============================================================ */

import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../config/firebase';
import type { AppUser } from '../types';

export interface PendingUserReporting {
  user: AppUser;
  supervisorName?: string;
  hasPhone: boolean;
  formattedPhone?: string;
}

/** Format Indian / International phone numbers for WhatsApp API (e.g. +91 9876543210 -> 919876543210) */
export function formatWhatsAppPhone(phoneStr?: string): string {
  if (!phoneStr) return '';
  let cleaned = phoneStr.replace(/\D/g, ''); // keep only digits
  if (cleaned.length === 10) {
    cleaned = '91' + cleaned; // default to India (+91) if 10 digits
  }
  return cleaned;
}

/** Get list of approved sales reps who have NOT updated their daily sales report for today */
export async function getPendingReportingUsersForToday(): Promise<PendingUserReporting[]> {
  const todayStr = new Date().toISOString().split('T')[0];

  // 1. Fetch all approved users with role 'user'
  const usersSnap = await getDocs(query(collection(db, 'users'), where('status', '==', 'approved'), where('role', '==', 'user')));
  const users = usersSnap.docs.map(d => ({ uid: d.id, ...d.data() } as AppUser));

  // 2. Fetch all daily sales records for today's date
  const salesSnap = await getDocs(query(collection(db, 'dailySales'), where('date', '==', todayStr)));
  const reportedUserIds = new Set<string>();

  salesSnap.docs.forEach(doc => {
    const data = doc.data();
    if (data.userId) {
      reportedUserIds.add(data.userId);
    }
  });

  // 3. Fetch all supervisors map for displaying supervisor names
  const supervisorsSnap = await getDocs(query(collection(db, 'users'), where('role', '==', 'supervisor')));
  const supervisorMap = new Map<string, string>();
  supervisorsSnap.docs.forEach(d => {
    const data = d.data();
    supervisorMap.set(d.id, data.displayName || data.email);
  });

  // Filter pending users
  const pendingUsers = users.filter(u => !reportedUserIds.has(u.uid));

  return pendingUsers.map(u => {
    const cleanPhone = formatWhatsAppPhone(u.phone);
    return {
      user: u,
      supervisorName: u.supervisorId ? (supervisorMap.get(u.supervisorId) || 'Unassigned') : 'Unassigned',
      hasPhone: Boolean(cleanPhone && cleanPhone.length >= 10),
      formattedPhone: cleanPhone
    };
  });
}

/** Generate pre-filled 1-Click WhatsApp URL for a user */
export function generateWhatsAppReminderUrl(phone?: string, userName?: string, dateStr?: string): string {
  const formattedPhone = formatWhatsAppPhone(phone);
  const dateDisplay = dateStr || new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const text = `Hi ${userName || 'Team Member'},\n\n*Varchaz Daily Reporting Reminder* 🔔\nYour daily business report for today (${dateDisplay}) is currently pending.\n\nPlease log into Varchaz and update your daily sales report before 6:30 PM. Thank you!`;

  if (formattedPhone) {
    return `https://api.whatsapp.com/send?phone=${formattedPhone}&text=${encodeURIComponent(text)}`;
  }
  return `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
}

/** Automated WhatsApp Gateway dispatch helper (UltraMsg / WhatsApp Cloud API / Webhook) */
export async function dispatchAutomatedWhatsAppMessage(phone: string, text: string, gatewayUrl?: string, apiKey?: string): Promise<boolean> {
  const formattedPhone = formatWhatsAppPhone(phone);
  if (!formattedPhone) return false;

  const url = gatewayUrl || import.meta.env.VITE_WHATSAPP_GATEWAY_URL;
  const token = apiKey || import.meta.env.VITE_WHATSAPP_GATEWAY_TOKEN;

  if (!url) {
    console.warn('WhatsApp Gateway URL not configured. Use 1-Click reminder links.');
    return false;
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      body: JSON.stringify({
        to: formattedPhone,
        message: text
      })
    });
    return res.ok;
  } catch (err) {
    console.error('Error dispatching automated WhatsApp message:', err);
    return false;
  }
}

/* ============================================================
   Varchaz — Notification Service (Option A)
   ============================================================ */

import { fetchDailySales } from './salesService';

/** Request permission for web notifications */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) {
    return 'default';
  }
  return await Notification.requestPermission();
}

/** Show a browser notification immediately if permitted */
export function sendNotification(title: string, body: string) {
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return;
  }
  try {
    // Attempt to register via service worker if available, fallback to Notification constructor
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready.then(registration => {
        registration.showNotification(title, {
          body,
          icon: '/varchaz-logo-3d.png',
          badge: '/varchaz-logo-3d.png',
          tag: 'varchaz-reminder',
          renotify: true
        } as any);
      });
    } else {
      new Notification(title, {
        body,
        icon: '/varchaz-logo-3d.png'
      });
    }
  } catch (err) {
    console.error('Failed to show notification:', err);
  }
}

// Track days we have already triggered to prevent duplicate alerts within the target minute
const triggeredDays: Record<string, boolean> = {};

/**
 * Starts a background interval checking every 30 seconds.
 * Triggers a local notification at 5:45 PM if no daily sales report exists, excluding Sundays.
 */
export function startDailyReportScheduler(userId: string): () => void {
  if (!('Notification' in window)) {
    return () => {};
  }

  const intervalId = setInterval(async () => {
    if (Notification.permission !== 'granted') return;

    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday...

    // Target Time: 5:45 PM (17:45)
    if (currentHour === 17 && currentMinute === 45) {
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      
      // Skip if Sunday (0) or if already triggered today
      if (dayOfWeek === 0 || triggeredDays[todayStr]) {
        return;
      }

      try {
        triggeredDays[todayStr] = true;

        // Fetch sales for today
        const report = await fetchDailySales(userId, todayStr);
        if (!report) {
          sendNotification(
            'Daily Sales Reminder 📝',
            "You haven't submitted today's daily sales report yet. Please log in and report your numbers."
          );
        }
      } catch (err) {
        console.error('Error in daily report notification scheduler:', err);
      }
    }
  }, 30000); // Check every 30 seconds

  return () => clearInterval(intervalId);
}

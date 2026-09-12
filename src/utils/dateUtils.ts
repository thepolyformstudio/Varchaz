/* ============================================================
   Varchaz — Date Utilities
   ============================================================ */

import type { FinancialYear } from '../types';

/** Get today's date as YYYY-MM-DD */
export function getToday(): string {
  return formatDate(new Date());
}

/** Format a Date object to YYYY-MM-DD */
export function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Format a Date to YYYY-MM */
export function formatMonth(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/** Parse YYYY-MM-DD string to Date */
export function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Parse YYYY-MM string to Date (1st of that month) */
export function parseMonth(monthStr: string): Date {
  const [y, m] = monthStr.split('-').map(Number);
  return new Date(y, m - 1, 1);
}

/** Get display-friendly date: "Mon, 09 Jun 2026" */
export function displayDate(dateStr: string): string {
  const date = parseDate(dateStr);
  return date.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

/** Get display-friendly month: "June 2026" */
export function displayMonth(monthStr: string): string {
  const date = parseMonth(monthStr);
  return date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

/** Get current month string: "2026-06" */
export function getCurrentMonth(): string {
  return formatMonth(new Date());
}

/** Get previous month string */
export function getPreviousMonth(monthStr: string): string {
  const date = parseMonth(monthStr);
  date.setMonth(date.getMonth() - 1);
  return formatMonth(date);
}

/** Get next month string */
export function getNextMonth(monthStr: string): string {
  const date = parseMonth(monthStr);
  date.setMonth(date.getMonth() + 1);
  return formatMonth(date);
}

/** Get previous day string */
export function getPreviousDay(dateStr: string): string {
  const date = parseDate(dateStr);
  date.setDate(date.getDate() - 1);
  return formatDate(date);
}

/** Get next day string */
export function getNextDay(dateStr: string): string {
  const date = parseDate(dateStr);
  date.setDate(date.getDate() + 1);
  return formatDate(date);
}

/** Get day of month from date string */
export function getDayOfMonth(dateStr: string): number {
  return parseDate(dateStr).getDate();
}

/** Get total days in a given month */
export function getDaysInMonth(monthStr: string): number {
  const [y, m] = monthStr.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

/** Check if current day is within plan entry window (1st to 10th) */
export function isPlanEntryWindowOpen(windowStart = 1, windowEnd = 10): boolean {
  const today = new Date().getDate();
  return today >= windowStart && today <= windowEnd;
}

/** Get the financial year start month based on FY type */
export function getFYStartMonth(fy: FinancialYear, currentDate?: Date): string {
  const now = currentDate || new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1-indexed

  if (fy === 'apr-mar') {
    // FY starts in April
    if (month >= 4) {
      return `${year}-04`;
    } else {
      return `${year - 1}-04`;
    }
  } else {
    // Jan-Dec: FY starts in January
    return `${year}-01`;
  }
}

/** Get the financial year end month */
export function getFYEndMonth(fy: FinancialYear, currentDate?: Date): string {
  const now = currentDate || new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  if (fy === 'apr-mar') {
    if (month >= 4) {
      return `${year + 1}-03`;
    } else {
      return `${year}-03`;
    }
  } else {
    return `${year}-12`;
  }
}

/** Get all months from FY start to current month (inclusive) */
export function getYTDMonths(fy: FinancialYear, currentDate?: Date): string[] {
  const now = currentDate || new Date();
  const startMonth = getFYStartMonth(fy, now);
  const currentMonth = formatMonth(now);
  const months: string[] = [];

  let cursor = startMonth;
  while (cursor <= currentMonth) {
    months.push(cursor);
    cursor = getNextMonth(cursor);
  }

  return months;
}

/** Get the month string from a date string */
export function getMonthFromDate(dateStr: string): string {
  return dateStr.substring(0, 7);
}

/** Get all dates from month start to a given date */
export function getMTDDates(dateStr: string): string[] {
  const monthStart = dateStr.substring(0, 8) + '01';
  const dates: string[] = [];
  let cursor = monthStart;
  while (cursor <= dateStr) {
    dates.push(cursor);
    cursor = getNextDay(cursor);
  }
  return dates;
}

/** Get the FY label, e.g., "FY 2026-27" or "FY 2026" */
export function getFYLabel(fy: FinancialYear, currentDate?: Date): string {
  const now = currentDate || new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  if (fy === 'apr-mar') {
    if (month >= 4) {
      return `FY ${year}-${String(year + 1).slice(2)}`;
    } else {
      return `FY ${year - 1}-${String(year).slice(2)}`;
    }
  } else {
    return `FY ${year}`;
  }
}

/** Check if a date string is today */
export function isToday(dateStr: string): boolean {
  return dateStr === getToday();
}

/** Check if a date is in the future */
export function isFutureDate(dateStr: string): boolean {
  return dateStr > getToday();
}

/** Get time-based greeting */
export function getGreeting(): string {
  const hour = getISTHour();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/** Get current Date in Indian Standard Time (IST, UTC+5:30) */
export function getISTDate(date?: Date): Date {
  const target = date || new Date();
  const utc = target.getTime() + (target.getTimezoneOffset() * 60000);
  return new Date(utc + (3600000 * 5.5));
}

/** Get the current hour in IST (0 - 23) */
export function getISTHour(date?: Date): number {
  return getISTDate(date).getHours();
}

/** Check if date is a non-working day in IST (All Sundays, 2nd & 4th Saturdays of the month) */
export function isNonWorkingDay(dateObj: Date): { isExcluded: boolean; reason: string | null } {
  const dayOfWeek = dateObj.getDay(); // 0 = Sunday, 6 = Saturday
  if (dayOfWeek === 0) {
    return { isExcluded: true, reason: 'Sunday' };
  }
  if (dayOfWeek === 6) {
    const dateOfMonth = dateObj.getDate();
    const nthSaturday = Math.ceil(dateOfMonth / 7);
    if (nthSaturday === 2 || nthSaturday === 4) {
      return { isExcluded: true, reason: `${nthSaturday === 2 ? '2nd' : '4th'} Saturday` };
    }
  }
  return { isExcluded: false, reason: null };
}

/**
 * Check if date is the last working day of the week in IST.
 * - In 2nd and 4th weeks of the month (where Saturday is a non-working day), Friday is the last working day.
 * - Otherwise (1st, 3rd, 5th weeks), Saturday is the last working day.
 */
export function isLastWorkingDayOfWeek(dateObj: Date): { isLastWorkingDay: boolean; reason: string } {
  const dayOfWeek = dateObj.getDay(); // 0 = Sunday, 5 = Friday, 6 = Saturday
  
  if (dayOfWeek === 5) { // Friday
    // Check if tomorrow (Saturday) is a holiday (2nd or 4th Saturday)
    const tomorrow = new Date(dateObj.getTime() + (24 * 60 * 60 * 1000));
    const nthSaturday = Math.ceil(tomorrow.getDate() / 7);
    if (nthSaturday === 2 || nthSaturday === 4) {
      return { isLastWorkingDay: true, reason: `Friday before ${nthSaturday === 2 ? '2nd' : '4th'} Saturday holiday` };
    }
    return { isLastWorkingDay: false, reason: 'Friday (Saturday is a working day this week)' };
  }

  if (dayOfWeek === 6) { // Saturday
    const dateOfMonth = dateObj.getDate();
    const nthSaturday = Math.ceil(dateOfMonth / 7);
    if (nthSaturday === 2 || nthSaturday === 4) {
      return { isLastWorkingDay: false, reason: `${nthSaturday === 2 ? '2nd' : '4th'} Saturday is a non-working day` };
    }
    return { isLastWorkingDay: true, reason: `Working Saturday (${nthSaturday === 1 ? '1st' : nthSaturday === 3 ? '3rd' : '5th'} Saturday)` };
  }

  return { isLastWorkingDay: false, reason: 'Midweek day' };
}

/** Get Monday through Saturday dates for a given week offset (0 = current week, -1 = last week, etc.) */
export function getWeekDates(weekOffset = 0, refDate = new Date()): { weekStart: string; weekEnd: string; dates: string[]; workingDates: string[] } {
  const d = new Date(refDate);
  // Apply week offset
  d.setDate(d.getDate() + (weekOffset * 7));
  
  const day = d.getDay(); // 0 = Sunday, 1 = Monday ... 6 = Saturday
  const diffToMonday = (day === 0 ? -6 : 1) - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diffToMonday);

  const dates: string[] = [];
  const workingDates: string[] = [];

  for (let i = 0; i < 6; i++) { // Monday to Saturday
    const current = new Date(monday);
    current.setDate(monday.getDate() + i);
    const dateStr = formatDate(current);
    dates.push(dateStr);
    const holiday = isNonWorkingDay(current);
    if (!holiday.isExcluded) {
      workingDates.push(dateStr);
    }
  }

  return {
    weekStart: dates[0],
    weekEnd: dates[dates.length - 1],
    dates,
    workingDates
  };
}


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
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

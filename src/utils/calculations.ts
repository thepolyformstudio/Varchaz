/* ============================================================
   Varchaz — Calculation Utilities
   ============================================================
   All calculations are product-wise.
   ============================================================ */

import type { ProductPerformance, MonthlyPlan, DailySales, Product } from '../types';

/**
 * Calculate achievement percentage for a single product.
 * Returns { pct, hasNoPlan }
 */
export function calcAchievementPct(plan: number, achievement: number): { pct: number; hasNoPlan: boolean } {
  if (plan === 0 && achievement > 0) {
    return { pct: 100, hasNoPlan: true };
  }
  if (plan === 0 && achievement === 0) {
    return { pct: 0, hasNoPlan: true };
  }
  return { pct: Math.round((achievement / plan) * 10000) / 100, hasNoPlan: false };
}

/**
 * Get CSS class for achievement percentage coloring
 */
export function getPctClass(pct: number): string {
  if (pct >= 100) return 'pct-excellent';
  if (pct >= 80) return 'pct-good';
  if (pct >= 50) return 'pct-average';
  return 'pct-poor';
}

/**
 * Build product-wise performance array for MTD.
 * MTD Plan = current month's full plan per product (NO proration).
 * MTD Achievement = sum of daily sales from month start to selected date per product.
 */
export function buildMTDPerformance(
  products: Product[],
  plan: MonthlyPlan | null,
  dailySalesArr: DailySales[],
  activeProductIds: string[]
): ProductPerformance[] {
  return products
    .filter(p => activeProductIds.includes(p.productId))
    .map(product => {
      const planValue = plan?.products?.[product.productId] ?? 0;
      const achievementValue = dailySalesArr.reduce((sum, ds) => {
        return sum + (ds.products?.[product.productId] ?? 0);
      }, 0);
      const { pct, hasNoPlan } = calcAchievementPct(planValue, achievementValue);

      return {
        productId: product.productId,
        productName: product.name,
        category: product.category || 'General',
        plan: planValue,
        achievement: achievementValue,
        achievementPct: pct,
        hasNoPlan: planValue === 0
      };
    });
}

/**
 * Build product-wise performance array for YTD.
 * YTD Plan = sum of that product's full monthly plans from FY start to current month.
 * YTD Achievement = sum of that product's daily sales from FY start to selected date.
 */
export function buildYTDPerformance(
  products: Product[],
  monthlyPlans: MonthlyPlan[],
  dailySalesArr: DailySales[],
  activeProductIds: string[]
): ProductPerformance[] {
  return products
    .filter(p => activeProductIds.includes(p.productId))
    .map(product => {
      // Sum all monthly plans for this product across the YTD months
      const planValue = monthlyPlans.reduce((sum, mp) => {
        return sum + (mp.products?.[product.productId] ?? 0);
      }, 0);

      // Sum all daily sales for this product across the YTD period
      const achievementValue = dailySalesArr.reduce((sum, ds) => {
        return sum + (ds.products?.[product.productId] ?? 0);
      }, 0);

      const { pct, hasNoPlan } = calcAchievementPct(planValue, achievementValue);

      return {
        productId: product.productId,
        productName: product.name,
        category: product.category || 'General',
        plan: planValue,
        achievement: achievementValue,
        achievementPct: pct,
        hasNoPlan: planValue === 0
      };
    });
}

/**
 * Build selected-day business (no plan comparison — just shows achievement).
 */
export function buildDayPerformance(
  products: Product[],
  dailySales: DailySales | null,
  activeProductIds: string[]
): ProductPerformance[] {
  return products
    .filter(p => activeProductIds.includes(p.productId))
    .map(product => {
      const achievementValue = dailySales?.products?.[product.productId] ?? 0;
      return {
        productId: product.productId,
        productName: product.name,
        category: product.category || 'General',
        plan: 0,
        achievement: achievementValue,
        achievementPct: 0,
        hasNoPlan: true
      };
    });
}

/**
 * Calculate grand totals from a product performance array.
 */
export function calcGrandTotal(performances: ProductPerformance[]): {
  totalPlan: number;
  totalAchievement: number;
  totalPct: number;
} {
  const totalPlan = performances.reduce((sum, p) => sum + p.plan, 0);
  const totalAchievement = performances.reduce((sum, p) => sum + p.achievement, 0);
  const { pct } = calcAchievementPct(totalPlan, totalAchievement);
  return { totalPlan, totalAchievement, totalPct: pct };
}

/**
 * Get inactive products (zero achievement).
 * Excludes products added mid-period (addedDate after period start).
 */
export function getInactiveProducts(
  products: Product[],
  dailySalesArr: DailySales[],
  activeProductIds: string[],
  periodStartDate: string
): Product[] {
  const parseDateString = (ts: any): string => {
    if (!ts) return '1970-01-01';
    if (typeof ts.toDate === 'function') {
      return ts.toDate().toISOString().split('T')[0];
    }
    if (ts.seconds) {
      return new Date(ts.seconds * 1000).toISOString().split('T')[0];
    }
    if (ts instanceof Date) {
      return ts.toISOString().split('T')[0];
    }
    const str = String(ts);
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
      return str.substring(0, 10);
    }
    return '1970-01-01';
  };

  const todayStr = new Date().toISOString().split('T')[0];

  return products
    .filter(p => activeProductIds.includes(p.productId))
    .filter(p => {
      // Exclude only if the product was added in the future (after today)
      if (p.addedDate) {
        const addedStr = parseDateString(p.addedDate);
        if (addedStr > todayStr) return false;
      }

      // Check if total achievement is 0
      const totalAchievement = dailySalesArr.reduce((sum, ds) => {
        return sum + (ds.products?.[p.productId] ?? 0);
      }, 0);
      return totalAchievement === 0;
    });
}

/**
 * Aggregate product-wise data across multiple users (for supervisor consolidated view).
 */
export function aggregateUserPerformances(
  userPerformances: ProductPerformance[][]
): ProductPerformance[] {
  if (userPerformances.length === 0) return [];

  // Use first user's product list as base
  const productMap = new Map<string, ProductPerformance>();

  for (const userProducts of userPerformances) {
    for (const pp of userProducts) {
      const existing = productMap.get(pp.productId);
      if (existing) {
        existing.plan += pp.plan;
        existing.achievement += pp.achievement;
      } else {
        productMap.set(pp.productId, { ...pp });
      }
    }
  }

  // Recalculate percentages after aggregation
  return Array.from(productMap.values()).map(pp => {
    const { pct, hasNoPlan } = calcAchievementPct(pp.plan, pp.achievement);
    return { ...pp, achievementPct: pct, hasNoPlan };
  });
}

/**
 * Format number with commas (Indian numbering system).
 */
export function formatNumber(num: number): string {
  if (num === 0) return '0';
  return num.toLocaleString('en-IN');
}

/**
 * Format percentage display.
 */
export function formatPct(pct: number): string {
  return `${pct.toFixed(1)}%`;
}

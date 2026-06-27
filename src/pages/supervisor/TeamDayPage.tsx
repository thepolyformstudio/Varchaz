/* Varchaz — Supervisor consolidated MTD/YTD/Day/Inactive + User Drill-Down + Product Selection + Plan Override */
/* These are simplified implementations that reuse the same patterns as user pages but with team aggregation */

// ── TeamDayPage ──
import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { LoadingSpinner, PageHeader } from '../../components/shared';
import { PerformanceTable, DatePickerRow } from '../../components/dashboard';
import { getToday, displayDate } from '../../utils/dateUtils';
import { buildDayPerformance, aggregateUserPerformances } from '../../utils/calculations';
import { fetchActiveProducts, fetchSupervisorProducts } from '../../services/productService';
import { fetchUsersInHierarchy } from '../../services/userService';
import { fetchDailySales } from '../../services/salesService';
import type { Product, ProductPerformance, AppUser } from '../../types';

export default function TeamDayPage() {
  const { appUser } = useAuth();
  const [date, setDate] = useState(getToday());
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ProductPerformance[]>([]);

  useEffect(() => { if (appUser) load(); }, [appUser, date]);

  async function load() {
    if (!appUser) return;
    setLoading(true);
    try {
      const ids = await fetchSupervisorProducts(appUser.uid);
      const all = await fetchActiveProducts();
      const products = ids.length > 0 ? all.filter(p => ids.includes(p.productId)) : all;
      const activeIds = products.map(p => p.productId);
      const users = (await fetchUsersInHierarchy(appUser.uid)).filter(u => u.status === 'approved');

      const perfs: ProductPerformance[][] = [];
      for (const u of users) {
        const sales = await fetchDailySales(u.uid, date);
        perfs.push(buildDayPerformance(products, sales, activeIds));
      }
      setData(aggregateUserPerformances(perfs));
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  if (loading) return <LoadingSpinner text="Loading..." />;
  return (
    <div className="dashboard-page" id="team-day-page">
      <PageHeader title="Team Day View" subtitle={`Consolidated business on ${displayDate(date)}`} />
      <div className="filter-bar"><DatePickerRow date={date} onChange={setDate} /></div>
      <PerformanceTable data={data} viewType="day" title={`Team Business — ${displayDate(date)}`} exportFileName={`Team_Day_${date}`} />
    </div>
  );
}

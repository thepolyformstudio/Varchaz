/* Varchaz — Day View Page */
import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { LoadingSpinner, PageHeader } from '../../components/shared';
import { PerformanceTable, DatePickerRow } from '../../components/dashboard';
import { getToday, displayDate } from '../../utils/dateUtils';
import { buildDayPerformance } from '../../utils/calculations';
import { fetchActiveProducts, fetchSupervisorProducts } from '../../services/productService';
import { fetchDailySales } from '../../services/salesService';
import type { Product, ProductPerformance } from '../../types';

export default function DayViewPage() {
  const { appUser } = useAuth();
  const [date, setDate] = useState(getToday());
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ProductPerformance[]>([]);

  useEffect(() => { if (appUser) load(); }, [appUser, date]);

  async function load() {
    if (!appUser) return;
    setLoading(true);
    try {
      let products: Product[];
      if (appUser.supervisorId) {
        const ids = await fetchSupervisorProducts(appUser.supervisorId);
        const all = await fetchActiveProducts();
        products = ids.length > 0 ? all.filter(p => ids.includes(p.productId)) : all;
      } else {
        products = await fetchActiveProducts();
      }
      const activeIds = products.map(p => p.productId);
      const sales = await fetchDailySales(appUser.uid, date);
      setData(buildDayPerformance(products, sales, activeIds));
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  if (loading) return <LoadingSpinner text="Loading..." />;

  return (
    <div className="dashboard-page" id="day-view-page">
      <PageHeader title="Selected Day Business" subtitle={displayDate(date)} />
      <div className="filter-bar"><DatePickerRow date={date} onChange={setDate} /></div>
      <PerformanceTable data={data} viewType="day" title={`Business on ${displayDate(date)}`} exportFileName={`Day_${date}`} />
    </div>
  );
}

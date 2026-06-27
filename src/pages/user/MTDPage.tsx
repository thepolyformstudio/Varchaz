/* Varchaz — MTD Page */
import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { LoadingSpinner, PageHeader } from '../../components/shared';
import { PerformanceTable } from '../../components/dashboard';
import { getCurrentMonth, displayMonth, getToday } from '../../utils/dateUtils';
import { buildMTDPerformance } from '../../utils/calculations';
import { fetchActiveProducts, fetchSupervisorProducts } from '../../services/productService';
import { fetchMonthlyPlan } from '../../services/planService';
import { fetchMonthlySales } from '../../services/salesService';
import type { Product, ProductPerformance } from '../../types';

export default function MTDPage() {
  const { appUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ProductPerformance[]>([]);
  const month = getCurrentMonth();

  useEffect(() => { if (appUser) load(); }, [appUser]);

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
      const plan = await fetchMonthlyPlan(appUser.uid, month);
      const sales = await fetchMonthlySales(appUser.uid, month);
      setData(buildMTDPerformance(products, plan, sales, activeIds));
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  if (loading) return <LoadingSpinner text="Loading MTD data..." />;

  return (
    <div className="dashboard-page" id="mtd-page">
      <PageHeader title="Month-to-Date Performance" subtitle={`Your progress against ${displayMonth(month)} targets`} />
      <PerformanceTable data={data} viewType="mtd" title={`MTD Plan vs Achievement — ${displayMonth(month)}`} exportFileName={`MTD_${month}`} />
    </div>
  );
}

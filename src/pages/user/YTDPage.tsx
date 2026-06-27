/* Varchaz — YTD Page */
import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { LoadingSpinner, PageHeader } from '../../components/shared';
import { PerformanceTable } from '../../components/dashboard';
import { getYTDMonths, getFYLabel } from '../../utils/dateUtils';
import { buildYTDPerformance } from '../../utils/calculations';
import { fetchActiveProducts, fetchSupervisorProducts } from '../../services/productService';
import { fetchPlansForMonths } from '../../services/planService';
import { fetchSalesMultiMonth } from '../../services/salesService';
import type { Product, ProductPerformance } from '../../types';

export default function YTDPage() {
  const { appUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ProductPerformance[]>([]);

  useEffect(() => { if (appUser) load(); }, [appUser]);

  async function load() {
    if (!appUser) return;
    setLoading(true);
    try {
      const fy = appUser.financialYear || 'apr-mar';
      const ytdMonths = getYTDMonths(fy);
      let products: Product[];
      if (appUser.supervisorId) {
        const ids = await fetchSupervisorProducts(appUser.supervisorId);
        const all = await fetchActiveProducts();
        products = ids.length > 0 ? all.filter(p => ids.includes(p.productId)) : all;
      } else {
        products = await fetchActiveProducts();
      }
      const activeIds = products.map(p => p.productId);
      const plans = await fetchPlansForMonths(appUser.uid, ytdMonths);
      const sales = await fetchSalesMultiMonth(appUser.uid, ytdMonths);
      setData(buildYTDPerformance(products, plans, sales, activeIds));
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  if (loading) return <LoadingSpinner text="Loading YTD data..." />;

  const fyLabel = getFYLabel(appUser?.financialYear || 'apr-mar');

  return (
    <div className="dashboard-page" id="ytd-page">
      <PageHeader title="Year-to-Date Performance" subtitle={`Cumulative performance for ${fyLabel}`} />
      <PerformanceTable data={data} viewType="ytd" title={`YTD Plan vs Achievement — ${fyLabel}`} exportFileName={`YTD_${fyLabel}`} />
    </div>
  );
}

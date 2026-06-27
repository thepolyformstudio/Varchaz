/* Varchaz — YTD Inactive Products Page */
import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { LoadingSpinner, PageHeader, EmptyState } from '../../components/shared';
import { getYTDMonths, getFYLabel, getFYStartMonth } from '../../utils/dateUtils';
import { getInactiveProducts } from '../../utils/calculations';
import { fetchActiveProducts, fetchSupervisorProducts } from '../../services/productService';
import { fetchSalesMultiMonth } from '../../services/salesService';
import type { Product } from '../../types';
import { AlertTriangle, CheckCircle } from 'lucide-react';

export default function YTDInactivePage() {
  const { appUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [inactive, setInactive] = useState<Product[]>([]);

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
      const sales = await fetchSalesMultiMonth(appUser.uid, ytdMonths);
      const periodStart = `${getFYStartMonth(fy)}-01`;
      setInactive(getInactiveProducts(products, sales, activeIds, periodStart));
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  if (loading) return <LoadingSpinner text="Loading..." />;

  const fyLabel = getFYLabel(appUser?.financialYear || 'apr-mar');

  return (
    <div className="dashboard-page" id="ytd-inactive-page">
      <PageHeader title="YTD Inactive Products" subtitle={`Products with zero achievement in ${fyLabel}`} />
      {inactive.length === 0 ? (
        <EmptyState icon={<CheckCircle size={32} />} title="All products are active!" text={`You have reported sales for all products in ${fyLabel}.`} />
      ) : (
        <div className="data-table-wrapper">
          <table className="data-table">
            <thead><tr><th>#</th><th>Product</th><th>Status</th></tr></thead>
            <tbody>
              {inactive.map((p, i) => (
                <tr key={p.productId}>
                  <td>{i + 1}</td>
                  <td>{p.name}</td>
                  <td><span className="badge badge-danger">No Sales</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

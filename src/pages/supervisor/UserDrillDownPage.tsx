/* Varchaz — User Drill-Down Page (supervisor views individual user performance) */
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { LoadingSpinner, PageHeader, BackButton } from '../../components/shared';
import { PerformanceTable } from '../../components/dashboard';
import { getCurrentMonth, displayMonth, getYTDMonths, getFYLabel } from '../../utils/dateUtils';
import { buildMTDPerformance, buildYTDPerformance } from '../../utils/calculations';
import { fetchActiveProducts, fetchSupervisorProducts } from '../../services/productService';
import { fetchUser } from '../../services/userService';
import { fetchMonthlyPlan, fetchPlansForMonths } from '../../services/planService';
import { fetchMonthlySales, fetchSalesMultiMonth } from '../../services/salesService';
import type { AppUser, Product, ProductPerformance } from '../../types';
import { getInitials, formatRole } from '../../utils/formatters';

export default function UserDrillDownPage() {
  const { uid } = useParams<{ uid: string }>();
  const { appUser } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [targetUser, setTargetUser] = useState<AppUser | null>(null);
  const [mtdData, setMtdData] = useState<ProductPerformance[]>([]);
  const [ytdData, setYtdData] = useState<ProductPerformance[]>([]);
  const [tab, setTab] = useState<'mtd' | 'ytd'>('mtd');

  useEffect(() => { if (uid && appUser) load(); }, [uid, appUser]);

  async function load() {
    if (!uid || !appUser) return;
    setLoading(true);
    try {
      const user = await fetchUser(uid);
      setTargetUser(user);
      if (!user) return;

      const month = getCurrentMonth();
      const fy = user.financialYear || appUser.financialYear || 'apr-mar';
      const ytdMonths = getYTDMonths(fy);

      const ids = await fetchSupervisorProducts(appUser.uid);
      const all = await fetchActiveProducts();
      const products = ids.length > 0 ? all.filter(p => ids.includes(p.productId)) : all;
      const activeIds = products.map(p => p.productId);

      const plan = await fetchMonthlyPlan(uid, month);
      const sales = await fetchMonthlySales(uid, month);
      setMtdData(buildMTDPerformance(products, plan, sales, activeIds));

      const ytdPlans = await fetchPlansForMonths(uid, ytdMonths);
      const ytdSales = await fetchSalesMultiMonth(uid, ytdMonths);
      setYtdData(buildYTDPerformance(products, ytdPlans, ytdSales, activeIds));
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  if (loading) return <LoadingSpinner text="Loading user data..." />;
  if (!targetUser) return <PageHeader title="User not found" />;

  return (
    <div className="dashboard-page" id="user-drilldown-page">
      <BackButton onClick={() => navigate(-1)} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--v-space-4)', marginBottom: 'var(--v-space-6)' }}>
        <div className="avatar avatar-lg">{getInitials(targetUser.displayName)}</div>
        <div>
          <h1 style={{ fontSize: 'var(--v-text-xl)', fontWeight: 700 }}>{targetUser.displayName}</h1>
          <div style={{ fontSize: 'var(--v-text-sm)', color: 'var(--v-text-secondary)' }}>{targetUser.email}</div>
          <span className="badge badge-primary" style={{ marginTop: 4 }}>{formatRole(targetUser.role)}</span>
        </div>
      </div>

      <div className="tabs" style={{ marginBottom: 'var(--v-space-4)' }}>
        <button className={`tab-item ${tab === 'mtd' ? 'active' : ''}`} onClick={() => setTab('mtd')}>MTD</button>
        <button className={`tab-item ${tab === 'ytd' ? 'active' : ''}`} onClick={() => setTab('ytd')}>YTD</button>
      </div>

      {tab === 'mtd' && (
        <PerformanceTable data={mtdData} viewType="mtd" title={`MTD — ${displayMonth(getCurrentMonth())}`} exportFileName={`${targetUser.displayName}_MTD`} />
      )}
      {tab === 'ytd' && (
        <PerformanceTable data={ytdData} viewType="ytd" title={`YTD — ${getFYLabel(targetUser.financialYear || 'apr-mar')}`} exportFileName={`${targetUser.displayName}_YTD`} />
      )}
    </div>
  );
}

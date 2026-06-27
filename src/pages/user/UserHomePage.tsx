/* ============================================================
   Varchaz — User Home Dashboard
   ============================================================ */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { SummaryCard, MissingReportAlert, PerformanceTable } from '../../components/dashboard';
import { LoadingSpinner, PageHeader } from '../../components/shared';
import { getToday, getCurrentMonth, getGreeting, getYTDMonths, displayMonth } from '../../utils/dateUtils';
import { buildMTDPerformance, buildYTDPerformance, calcGrandTotal } from '../../utils/calculations';
import { formatIndianNumber, formatPercent } from '../../utils/formatters';
import { fetchActiveProducts, fetchSupervisorProducts } from '../../services/productService';
import { fetchMonthlyPlan, fetchPlansForMonths } from '../../services/planService';
import { fetchMonthlySales, fetchSalesMultiMonth, hasReportedToday } from '../../services/salesService';
import { Target, TrendingUp, BarChart3, Calendar, FileText, AlertTriangle } from 'lucide-react';
import type { Product, ProductPerformance } from '../../types';

export default function UserHomePage() {
  const { appUser } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [reported, setReported] = useState(true);
  const [mtdData, setMtdData] = useState<ProductPerformance[]>([]);
  const [ytdData, setYtdData] = useState<ProductPerformance[]>([]);

  useEffect(() => {
    if (!appUser) return;
    loadDashboard();
  }, [appUser]);

  async function loadDashboard() {
    if (!appUser) return;
    setLoading(true);
    try {
      const today = getToday();
      const month = getCurrentMonth();
      const fy = appUser.financialYear || 'apr-mar';
      const ytdMonths = getYTDMonths(fy);

      // Fetch products
      let products: Product[];
      if (appUser.supervisorId) {
        const activeIds = await fetchSupervisorProducts(appUser.supervisorId);
        const allProducts = await fetchActiveProducts();
        products = activeIds.length > 0 ? allProducts.filter(p => activeIds.includes(p.productId)) : allProducts;
      } else {
        products = await fetchActiveProducts();
      }
      const activeIds = products.map(p => p.productId);

      // Check if reported today
      const hasReported = await hasReportedToday(appUser.uid);
      setReported(hasReported);

      // MTD
      const plan = await fetchMonthlyPlan(appUser.uid, month);
      const monthlySales = await fetchMonthlySales(appUser.uid, month);
      const mtd = buildMTDPerformance(products, plan, monthlySales, activeIds);
      setMtdData(mtd);

      // YTD
      const ytdPlans = await fetchPlansForMonths(appUser.uid, ytdMonths);
      const ytdSales = await fetchSalesMultiMonth(appUser.uid, ytdMonths);
      const ytd = buildYTDPerformance(products, ytdPlans, ytdSales, activeIds);
      setYtdData(ytd);
    } catch (err) {
      console.error('Dashboard load error:', err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <LoadingSpinner text="Loading dashboard..." />;
  if (!appUser) return null;

  const mtdTotals = calcGrandTotal(mtdData);
  const ytdTotals = calcGrandTotal(ytdData);

  return (
    <div className="dashboard-page" id="user-home">
      <PageHeader
        title={`${getGreeting()}, ${appUser.displayName.split(' ')[0]}`}
        subtitle="Here's your performance snapshot"
      />

      {!reported && (
        <MissingReportAlert date={getToday()} onAction={() => navigate('/report')} />
      )}

      {/* Summary Cards */}
      <div className="summary-grid">
        <SummaryCard
          icon={<Target size={20} />}
          label={`MTD Plan — ${displayMonth(getCurrentMonth())}`}
          value={formatIndianNumber(mtdTotals.totalPlan)}
          onClick={() => navigate('/mtd')}
        />
        <SummaryCard
          icon={<TrendingUp size={20} />}
          label="MTD Achievement"
          value={formatIndianNumber(mtdTotals.totalAchievement)}
          trend={{ value: formatPercent(mtdTotals.totalPct), direction: mtdTotals.totalPct >= 50 ? 'up' : 'down' }}
          onClick={() => navigate('/mtd')}
        />
        <SummaryCard
          icon={<BarChart3 size={20} />}
          label="YTD Achievement"
          value={formatIndianNumber(ytdTotals.totalAchievement)}
          trend={{ value: formatPercent(ytdTotals.totalPct), direction: ytdTotals.totalPct >= 50 ? 'up' : 'down' }}
          onClick={() => navigate('/ytd')}
        />
        <SummaryCard
          icon={<AlertTriangle size={20} />}
          label="MTD Inactive Products"
          value={mtdData.filter(p => p.achievement === 0).length}
          onClick={() => navigate('/mtd-inactive')}
        />
      </div>

      {/* Quick Actions */}
      <div className="quick-actions">
        <a className="quick-action-btn" onClick={() => navigate('/report')}>
          <div className="action-icon"><FileText size={20} /></div>
          <span className="action-label">Daily Report</span>
        </a>
        <a className="quick-action-btn" onClick={() => navigate('/plan')}>
          <div className="action-icon"><Calendar size={20} /></div>
          <span className="action-label">Monthly Plan</span>
        </a>
        <a className="quick-action-btn" onClick={() => navigate('/day-view')}>
          <div className="action-icon"><BarChart3 size={20} /></div>
          <span className="action-label">Day View</span>
        </a>
        <a className="quick-action-btn" onClick={() => navigate('/mtd')}>
          <div className="action-icon"><TrendingUp size={20} /></div>
          <span className="action-label">MTD</span>
        </a>
      </div>

      {/* MTD Table */}
      <div className="dashboard-section">
        <PerformanceTable
          data={mtdData}
          viewType="mtd"
          title={`MTD Performance — ${displayMonth(getCurrentMonth())}`}
          exportFileName={`MTD_${getCurrentMonth()}`}
        />
      </div>
    </div>
  );
}

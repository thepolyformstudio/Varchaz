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
import { Target, TrendingUp, BarChart3, Calendar, FileText, AlertTriangle, CheckCircle2, HelpCircle, Sparkles } from 'lucide-react';
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

  const goodProducts = mtdData.filter(p => p.achievement > 0);
  const inactiveProducts = mtdData.filter(p => p.achievement === 0);

  return (
    <div className="dashboard-page" id="user-home">
      <PageHeader
        title={`${getGreeting()}, ${appUser.displayName.split(' ')[0]}`}
        subtitle="Here's your performance snapshot"
      />

      {!reported && (
        <MissingReportAlert date={getToday()} onAction={() => navigate('/report')} />
      )}

      {/* Dynamic Product Performance Banners (Team Members / Users Only) */}
      {appUser.role === 'user' && (goodProducts.length > 0 || inactiveProducts.length > 0) && (
        <div className="user-insights-container">
          {/* Good Performance Banner */}
          {goodProducts.length > 0 && (
            <div className="user-insight-banner good-performance">
              <div className="insight-banner-header">
                <Sparkles size={20} />
                <span>Great Progress! You are doing good on these products</span>
              </div>
              <div className="insight-banner-desc">
                Keep up the strong momentum to complete 100% of your target on these active products:
              </div>
              <div className="insight-product-chips">
                {goodProducts.map(p => (
                  <span key={p.productId} className="insight-chip">
                    <CheckCircle2 size={14} />
                    {p.productName}: {formatIndianNumber(p.achievement)} ({formatPercent(p.achievementPct)})
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Inactive Products Banner & Supervisor Reflection Prompt */}
          {inactiveProducts.length > 0 && (
            <div className="user-insight-banner inactive-performance">
              <div className="insight-banner-header">
                <AlertTriangle size={20} />
                <span>Attention Required: Inactive Products MTD ({inactiveProducts.length})</span>
              </div>
              <div className="insight-banner-desc">
                You have zero sales reported so far this month for the following products:
              </div>
              <div className="insight-product-chips">
                {inactiveProducts.map(p => (
                  <span key={p.productId} className="insight-chip">
                    <AlertTriangle size={14} />
                    {p.productName} (Plan: {formatIndianNumber(p.plan)})
                  </span>
                ))}
              </div>

              <div className="supervisor-questions-box">
                <div className="supervisor-questions-title">
                  <HelpCircle size={15} />
                  <span>Supervisor Check-In & Action Plan</span>
                </div>
                <ol className="supervisor-questions-list">
                  <li><strong>What actions are you taking</strong> to get active on these products?</li>
                  <li><strong>What support do you require</strong> from your supervisor or team?</li>
                  <li><strong>How many active leads</strong> do you currently have for each of these products?</li>
                  <li><strong>If leads are none or low:</strong> How many customer engagements have you carried out to generate new leads?</li>
                </ol>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Summary Cards */}
      <div className="summary-grid">
        <SummaryCard
          icon={<Target size={20} />}
          label={`Active Products (MTD)`}
          value={mtdData.filter(p => p.achievement > 0).length}
          onClick={() => navigate('/mtd')}
        />
        <SummaryCard
          icon={<AlertTriangle size={20} />}
          label="Inactive Products (MTD)"
          value={mtdData.filter(p => p.achievement === 0).length}
          onClick={() => navigate('/mtd-inactive')}
        />
        <SummaryCard
          icon={<TrendingUp size={20} />}
          label="Active Products (YTD)"
          value={ytdData.filter(p => p.achievement > 0).length}
          onClick={() => navigate('/ytd')}
        />
        <SummaryCard
          icon={<AlertTriangle size={20} />}
          label="Inactive Products (YTD)"
          value={ytdData.filter(p => p.achievement === 0).length}
          onClick={() => navigate('/ytd-inactive')}
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

/* ============================================================
   Varchaz — User Home Dashboard
   ============================================================ */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { SummaryCard, MissingReportAlert, PerformanceTable } from '../../components/dashboard';
import { LoadingSpinner, PageHeader } from '../../components/shared';
import { getToday, getCurrentMonth, getGreeting, getYTDMonths, displayMonth, getISTHour, isNonWorkingDay, getISTDate } from '../../utils/dateUtils';
import { buildMTDPerformance, buildYTDPerformance, calcGrandTotal } from '../../utils/calculations';
import { formatIndianNumber, formatPercent } from '../../utils/formatters';
import { fetchActiveProducts, fetchSupervisorProducts } from '../../services/productService';
import { fetchMonthlyPlan, fetchPlansForMonths } from '../../services/planService';
import { fetchMonthlySales, fetchSalesMultiMonth, hasReportedToday } from '../../services/salesService';
import { fetchDailyCommitment } from '../../services/commitmentService';
import { DailyCommitmentModal } from '../../components/dashboard';
import { Target, TrendingUp, BarChart3, Calendar, FileText, AlertTriangle, CheckCircle2, HelpCircle, Sparkles } from 'lucide-react';
import type { Product, ProductPerformance, DailyCommitment } from '../../types';

export default function UserHomePage() {
  const { appUser } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [reported, setReported] = useState(true);
  const [mtdData, setMtdData] = useState<ProductPerformance[]>([]);
  const [ytdData, setYtdData] = useState<ProductPerformance[]>([]);
  const [todayCommitment, setTodayCommitment] = useState<DailyCommitment | null>(null);
  const [commitmentModalOpen, setCommitmentModalOpen] = useState(false);
  const [activeProductList, setActiveProductList] = useState<Product[]>([]);

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
      setActiveProductList(products);

      // Check if reported today
      const hasReported = await hasReportedToday(appUser.uid);
      setReported(hasReported);

      // Fetch today's commitment
      const commitment = await fetchDailyCommitment(appUser.uid, today);
      setTodayCommitment(commitment);

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

  // Time-gated scheduling in IST:
  // - 8:00 AM to 5:00 PM IST: Product activation banners reflect.
  // - After 5:00 PM IST: Pending daily business report banner reflects (replacing product activation banners completely).
  const istHour = getISTHour();
  const isProductActivationWindow = istHour >= 8 && istHour < 17;
  const isPendingReportWindow = istHour >= 17;

  return (
    <div className="dashboard-page" id="user-home">
      <PageHeader
        title={`${getGreeting()}, ${appUser.displayName.split(' ')[0]}`}
        subtitle="Here's your performance snapshot"
      />

      {/* Commitment for the Day Banner (Working days only) */}
      {!isNonWorkingDay(getISTDate()).isExcluded && appUser.role === 'user' && (
        <div 
          className="user-insight-banner"
          onClick={() => setCommitmentModalOpen(true)}
          style={{ 
            cursor: 'pointer',
            backgroundColor: todayCommitment ? 'var(--v-bg-primary)' : 'var(--v-primary-50)',
            border: `1px solid ${todayCommitment ? 'var(--v-success-500)' : 'var(--v-primary-300)'}`,
            marginBottom: 'var(--v-space-4)',
            padding: 'var(--v-space-4)',
            borderRadius: 'var(--v-radius-lg)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 'var(--v-space-3)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--v-space-3)' }}>
            <div style={{ 
              padding: 10, 
              borderRadius: 'var(--v-radius-md)', 
              backgroundColor: todayCommitment ? 'var(--v-success-50)' : 'var(--v-primary-100)', 
              color: todayCommitment ? 'var(--v-success-700)' : 'var(--v-primary-700)' 
            }}>
              <Target size={24} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--v-space-2)', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 700, fontSize: 'var(--v-text-base)', color: 'var(--v-text-primary)' }}>
                  {todayCommitment ? "Today's Commitment" : "Daily Commitment: Set Your Targets"}
                </span>
                {todayCommitment ? (
                  <span className="badge badge-success" style={{ fontSize: '11px', fontWeight: 700 }}>
                    {todayCommitment.items.length} Products (₹{formatIndianNumber(todayCommitment.totalCommitted)})
                  </span>
                ) : (
                  <span className="badge badge-warning" style={{ fontSize: '11px', fontWeight: 700 }}>
                    Pending Morning Commitment
                  </span>
                )}
              </div>
              <p style={{ margin: '4px 0 0 0', fontSize: 'var(--v-text-xs)', color: 'var(--v-text-secondary)' }}>
                {todayCommitment 
                  ? (todayCommitment.eodReported 
                      ? `EOD Achievement: ₹${formatIndianNumber(todayCommitment.totalAchieved || 0)} (${todayCommitment.fulfillmentPct || 0}% fulfilled). Click to view details.` 
                      : "Locked and active. Click to view your committed products.")
                  : "Pick at least 5 products and commit numbers to power your sales focus for the day!"}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--v-space-2)' }}>
            <button className={`btn ${todayCommitment ? 'btn-secondary' : 'btn-primary'} btn-sm`}>
              {todayCommitment ? "View Commitment" : "🎯 Commit for Today"}
            </button>
          </div>
        </div>
      )}

      {/* After 5:00 PM IST: Pending Business Update Banner */}
      {isPendingReportWindow && !reported && (
        <MissingReportAlert date={getToday()} onAction={() => navigate('/report')} />
      )}

      {/* 8:00 AM to 5:00 PM IST: Dynamic Product Performance Banners (Team Members / Users Only) */}
      {isProductActivationWindow && appUser.role === 'user' && (goodProducts.length > 0 || inactiveProducts.length > 0) && (
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

      {/* Daily Commitment Modal */}
      <DailyCommitmentModal
        isOpen={commitmentModalOpen}
        onClose={() => setCommitmentModalOpen(false)}
        onSaved={(c) => {
          setTodayCommitment(c);
        }}
        existingCommitment={todayCommitment}
        products={activeProductList}
        mtdData={mtdData}
        userId={appUser.uid}
        userName={appUser.displayName}
        supervisorId={appUser.supervisorId || ''}
        date={getToday()}
      />
    </div>
  );
}

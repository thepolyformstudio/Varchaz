/* ============================================================
   Varchaz — Supervisor Home Dashboard
   ============================================================ */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { SummaryCard, PerformanceTable } from '../../components/dashboard';
import { LoadingSpinner, PageHeader } from '../../components/shared';
import { getCurrentMonth, displayMonth, getYTDMonths, getFYLabel, getGreeting } from '../../utils/dateUtils';
import { buildMTDPerformance, calcGrandTotal, aggregateUserPerformances } from '../../utils/calculations';
import { formatIndianNumber, formatPercent, getInitials } from '../../utils/formatters';
import { fetchActiveProducts, fetchSupervisorProducts } from '../../services/productService';
import { fetchUsersInHierarchy } from '../../services/userService';
import { fetchMonthlyPlan } from '../../services/planService';
import { fetchMonthlySales } from '../../services/salesService';
import { countPendingApprovals } from '../../services/approvalService';
import { Users, Target, TrendingUp, UserCheck, BarChart3, AlertTriangle, ClipboardList, Package, CheckSquare } from 'lucide-react';
import type { AppUser, Product, ProductPerformance } from '../../types';

export default function SupervisorHomePage() {
  const { appUser } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [teamUsers, setTeamUsers] = useState<AppUser[]>([]);
  const [consolidatedMTD, setConsolidatedMTD] = useState<ProductPerformance[]>([]);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => { if (appUser) load(); }, [appUser]);

  async function load() {
    if (!appUser) return;
    setLoading(true);
    try {
      const month = getCurrentMonth();

      // Fetch team users (recursive hierarchy)
      const users = await fetchUsersInHierarchy(appUser.uid);
      const approvedUsers = users.filter(u => u.status === 'approved');
      setTeamUsers(approvedUsers);

      // Pending approvals
      const pending = await countPendingApprovals(appUser.uid);
      setPendingCount(pending);

      // Products
      const activeIds = await fetchSupervisorProducts(appUser.uid);
      const allProducts = await fetchActiveProducts();
      const products = activeIds.length > 0 ? allProducts.filter(p => activeIds.includes(p.productId)) : allProducts;
      const productIds = products.map(p => p.productId);

      // Consolidated MTD: aggregate all users' performance
      const userPerformances: ProductPerformance[][] = [];
      for (const user of approvedUsers) {
        const plan = await fetchMonthlyPlan(user.uid, month);
        const sales = await fetchMonthlySales(user.uid, month);
        const perf = buildMTDPerformance(products, plan, sales, productIds);
        userPerformances.push(perf);
      }

      const consolidated = aggregateUserPerformances(userPerformances);
      setConsolidatedMTD(consolidated);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <LoadingSpinner text="Loading team dashboard..." />;
  if (!appUser) return null;

  const mtdTotals = calcGrandTotal(consolidatedMTD);

  return (
    <div className="dashboard-page" id="supervisor-home">
      <PageHeader
        title={`${getGreeting()}, ${appUser.displayName.split(' ')[0]}`}
        subtitle="Team performance overview"
      />

      {/* Summary Cards */}
      <div className="summary-grid">
        <SummaryCard icon={<Users size={20} />} label="Team Members" value={teamUsers.length} onClick={() => navigate('/supervisor/team')} />
        <SummaryCard icon={<Target size={20} />} label={`MTD Plan — ${displayMonth(getCurrentMonth())}`} value={formatIndianNumber(mtdTotals.totalPlan)} onClick={() => navigate('/supervisor/mtd')} />
        <SummaryCard
          icon={<TrendingUp size={20} />}
          label="MTD Achievement"
          value={formatIndianNumber(mtdTotals.totalAchievement)}
          trend={{ value: formatPercent(mtdTotals.totalPct), direction: mtdTotals.totalPct >= 50 ? 'up' : 'down' }}
          onClick={() => navigate('/supervisor/mtd')}
        />
        <SummaryCard
          icon={<UserCheck size={20} />}
          label="Pending Approvals"
          value={pendingCount}
          onClick={() => navigate('/supervisor/approvals')}
        />
      </div>

      {/* Quick Actions */}
      <div className="quick-actions">
        <a className="quick-action-btn" onClick={() => navigate('/supervisor/day')}>
          <div className="action-icon"><BarChart3 size={20} /></div>
          <span className="action-label">Day View</span>
        </a>
        <a className="quick-action-btn" onClick={() => navigate('/supervisor/mtd')}>
          <div className="action-icon"><TrendingUp size={20} /></div>
          <span className="action-label">MTD</span>
        </a>
        <a className="quick-action-btn" onClick={() => navigate('/supervisor/ytd')}>
          <div className="action-icon"><TrendingUp size={20} /></div>
          <span className="action-label">YTD</span>
        </a>
        <a className="quick-action-btn" onClick={() => navigate('/supervisor/reporting-tracker')}>
          <div className="action-icon"><CheckSquare size={20} /></div>
          <span className="action-label">Reporting Tracker</span>
        </a>
        <a className="quick-action-btn" onClick={() => navigate('/supervisor/approvals')}>
          <div className="action-icon"><UserCheck size={20} /></div>
          <span className="action-label">Approvals</span>
        </a>
      </div>

      {/* Team User Drill-Down */}
      <div className="dashboard-section">
        <div className="section-header">
          <h3 className="section-title">Team Members</h3>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/supervisor/team')}>View All</button>
        </div>
        <div className="drill-down-list">
          {teamUsers.slice(0, 5).map(user => (
            <a
              key={user.uid}
              className="drill-down-item"
              onClick={() => navigate(`/supervisor/user/${user.uid}`)}
            >
              <div className="avatar avatar-sm">{getInitials(user.displayName)}</div>
              <div className="user-info">
                <div className="user-name">{user.displayName}</div>
                <div className="user-meta">{user.email}</div>
              </div>
            </a>
          ))}
          {teamUsers.length === 0 && (
            <div style={{ padding: 'var(--v-space-4)', textAlign: 'center', color: 'var(--v-text-tertiary)', fontSize: 'var(--v-text-sm)' }}>
              No team members yet
            </div>
          )}
        </div>
      </div>

      {/* Consolidated MTD Table */}
      <div className="dashboard-section">
        <PerformanceTable
          data={consolidatedMTD}
          viewType="mtd"
          title={`Consolidated MTD — ${displayMonth(getCurrentMonth())}`}
          exportFileName={`Team_MTD_${getCurrentMonth()}`}
        />
      </div>
    </div>
  );
}

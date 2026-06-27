/* Varchaz — Viewer Supervisor Drill-Down Page
   Shows a supervisor's team consolidated performance (read-only) */
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { LoadingSpinner, PageHeader, BackButton } from '../../components/shared';
import { PerformanceTable } from '../../components/dashboard';
import { getCurrentMonth, displayMonth, getYTDMonths, getFYLabel } from '../../utils/dateUtils';
import { buildMTDPerformance, buildYTDPerformance, aggregateUserPerformances, calcGrandTotal, getPctClass } from '../../utils/calculations';
import { formatIndianNumber, formatPercent, getInitials, formatRole } from '../../utils/formatters';
import { fetchActiveProducts, fetchSupervisorProducts } from '../../services/productService';
import { fetchUser, fetchUsersInHierarchy } from '../../services/userService';
import { fetchMonthlyPlan, fetchPlansForMonths } from '../../services/planService';
import { fetchMonthlySales, fetchSalesMultiMonth } from '../../services/salesService';
import type { AppUser, Product, ProductPerformance } from '../../types';

export default function ViewerSupervisorPage() {
  const { supervisorId } = useParams<{ supervisorId: string }>();
  const { appUser } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [supervisor, setSupervisor] = useState<AppUser | null>(null);
  const [tab, setTab] = useState<'mtd' | 'ytd'>('mtd');
  const [mtdData, setMtdData] = useState<ProductPerformance[]>([]);
  const [ytdData, setYtdData] = useState<ProductPerformance[]>([]);
  const [userPerfs, setUserPerfs] = useState<{ user: AppUser; performances: ProductPerformance[] }[]>([]);

  useEffect(() => { if (supervisorId && appUser) load(); }, [supervisorId, appUser, tab]);

  async function load() {
    if (!supervisorId || !appUser) return;
    setLoading(true);
    try {
      const sup = await fetchUser(supervisorId);
      setSupervisor(sup);
      if (!sup) return;

      const fy = sup.financialYear || appUser.financialYear || 'apr-mar';
      const month = getCurrentMonth();
      const ytdMonths = getYTDMonths(fy);

      const ids = await fetchSupervisorProducts(supervisorId);
      const all = await fetchActiveProducts();
      const products = ids.length > 0 ? all.filter(p => ids.includes(p.productId)) : all;
      const activeIds = products.map(p => p.productId);

      const users = (await fetchUsersInHierarchy(supervisorId)).filter(u => u.status === 'approved');
      const userPerfsList: typeof userPerfs = [];

      if (tab === 'mtd') {
        const perfs: ProductPerformance[][] = [];
        for (const u of users) {
          const plan = await fetchMonthlyPlan(u.uid, month);
          const sales = await fetchMonthlySales(u.uid, month);
          const perf = buildMTDPerformance(products, plan, sales, activeIds);
          perfs.push(perf);
          userPerfsList.push({ user: u, performances: perf });
        }
        setMtdData(aggregateUserPerformances(perfs));
      } else {
        const perfs: ProductPerformance[][] = [];
        for (const u of users) {
          const plans = await fetchPlansForMonths(u.uid, ytdMonths);
          const sales = await fetchSalesMultiMonth(u.uid, ytdMonths);
          const perf = buildYTDPerformance(products, plans, sales, activeIds);
          perfs.push(perf);
          userPerfsList.push({ user: u, performances: perf });
        }
        setYtdData(aggregateUserPerformances(perfs));
      }
      setUserPerfs(userPerfsList);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  if (loading) return <LoadingSpinner text="Loading team data..." />;
  if (!supervisor) return <PageHeader title="Supervisor not found" />;

  const fy = supervisor.financialYear || 'apr-mar';
  const fyLabel = getFYLabel(fy);

  return (
    <div className="dashboard-page" id="viewer-supervisor-page">
      <BackButton onClick={() => navigate('/viewer')} label="Back to Supervisors" />

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--v-space-4)', marginBottom: 'var(--v-space-6)' }}>
        <div className="avatar avatar-lg">{getInitials(supervisor.displayName)}</div>
        <div>
          <h1 style={{ fontSize: 'var(--v-text-xl)', fontWeight: 700 }}>{supervisor.displayName}'s Team</h1>
          <div style={{ fontSize: 'var(--v-text-sm)', color: 'var(--v-text-secondary)' }}>{supervisor.email}</div>
          <span className="badge badge-primary" style={{ marginTop: 4 }}>{formatRole(supervisor.role)}</span>
        </div>
      </div>

      <div className="tabs" style={{ marginBottom: 'var(--v-space-4)' }}>
        <button className={`tab-item ${tab === 'mtd' ? 'active' : ''}`} onClick={() => setTab('mtd')}>MTD</button>
        <button className={`tab-item ${tab === 'ytd' ? 'active' : ''}`} onClick={() => setTab('ytd')}>YTD</button>
      </div>

      {tab === 'mtd' && (
        <PerformanceTable
          data={mtdData}
          viewType="mtd"
          title={`Consolidated MTD — ${displayMonth(getCurrentMonth())}`}
          exportFileName={`Viewer_${supervisor.displayName}_MTD`}
        />
      )}
      {tab === 'ytd' && (
        <PerformanceTable
          data={ytdData}
          viewType="ytd"
          title={`Consolidated YTD — ${fyLabel}`}
          exportFileName={`Viewer_${supervisor.displayName}_YTD`}
        />
      )}

      {/* User-level summary */}
      <div className="dashboard-section" style={{ marginTop: 'var(--v-space-6)' }}>
        <h3 className="section-title">User-Level Product-Wise Summary</h3>
        <div className="data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Product</th>
                <th className="text-right">Plan</th>
                <th className="text-right">Achievement</th>
                <th className="text-right">Ach. %</th>
              </tr>
            </thead>
            <tbody>
              {userPerfs.map(({ user, performances }) => (
                <React.Fragment key={user.uid}>
                  {performances.map((perf, index) => (
                    <tr 
                      key={`${user.uid}-${perf.productId}`} 
                      style={{ cursor: 'pointer' }} 
                      onClick={() => navigate(`/supervisor/user/${user.uid}`)}
                    >
                      {index === 0 ? (
                        <td rowSpan={performances.length} style={{ verticalAlign: 'middle', borderRight: '1px solid var(--v-border-primary)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--v-space-2)' }}>
                            <div className="avatar avatar-sm">{getInitials(user.displayName)}</div>
                            <strong>{user.displayName}</strong>
                          </div>
                        </td>
                      ) : null}
                      <td>{perf.productName}</td>
                      <td className="text-right num-cell">
                        {perf.hasNoPlan ? <span className="no-plan-label">No Plan</span> : formatIndianNumber(perf.plan)}
                      </td>
                      <td className="text-right num-cell">{formatIndianNumber(perf.achievement)}</td>
                      <td className={`text-right pct-cell ${getPctClass(perf.achievementPct)}`}>
                        {formatPercent(perf.achievementPct)}
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

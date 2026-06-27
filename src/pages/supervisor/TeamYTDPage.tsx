/* Varchaz — Team YTD Page */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { LoadingSpinner, PageHeader } from '../../components/shared';
import { PerformanceTable } from '../../components/dashboard';
import { getYTDMonths, getFYLabel } from '../../utils/dateUtils';
import { buildYTDPerformance, aggregateUserPerformances, calcGrandTotal, getPctClass } from '../../utils/calculations';
import { formatIndianNumber, formatPercent, getInitials } from '../../utils/formatters';
import { fetchActiveProducts, fetchSupervisorProducts } from '../../services/productService';
import { fetchUsersInHierarchy } from '../../services/userService';
import { fetchPlansForMonths } from '../../services/planService';
import { fetchSalesMultiMonth } from '../../services/salesService';
import type { Product, ProductPerformance, AppUser } from '../../types';

export default function TeamYTDPage() {
  const { appUser } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ProductPerformance[]>([]);
  const [userPerfs, setUserPerfs] = useState<{ user: AppUser; performances: ProductPerformance[] }[]>([]);

  useEffect(() => { if (appUser) load(); }, [appUser]);

  async function load() {
    if (!appUser) return;
    setLoading(true);
    try {
      const fy = appUser.financialYear || 'apr-mar';
      const ytdMonths = getYTDMonths(fy);
      const ids = await fetchSupervisorProducts(appUser.uid);
      const all = await fetchActiveProducts();
      const products = ids.length > 0 ? all.filter(p => ids.includes(p.productId)) : all;
      const activeIds = products.map(p => p.productId);
      const users = (await fetchUsersInHierarchy(appUser.uid)).filter(u => u.status === 'approved');

      const perfs: ProductPerformance[][] = [];
      const userPerfsList: typeof userPerfs = [];
      for (const u of users) {
        const plans = await fetchPlansForMonths(u.uid, ytdMonths);
        const sales = await fetchSalesMultiMonth(u.uid, ytdMonths);
        const perf = buildYTDPerformance(products, plans, sales, activeIds);
        perfs.push(perf);
        userPerfsList.push({ user: u, performances: perf });
      }
      setData(aggregateUserPerformances(perfs));
      setUserPerfs(userPerfsList);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  if (loading) return <LoadingSpinner text="Loading..." />;
  const fyLabel = getFYLabel(appUser?.financialYear || 'apr-mar');

  return (
    <div className="dashboard-page" id="team-ytd-page">
      <PageHeader title="Team YTD Performance" subtitle={`Consolidated for ${fyLabel}`} />
      <PerformanceTable data={data} viewType="ytd" title={`Consolidated YTD — ${fyLabel}`} exportFileName={`Team_YTD_${fyLabel}`} />
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

/* Varchaz — Supervisor Team YTD Inactive Page */
import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { LoadingSpinner, PageHeader, EmptyState } from '../../components/shared';
import { getYTDMonths, getFYLabel, getFYStartMonth } from '../../utils/dateUtils';
import { getInactiveProducts } from '../../utils/calculations';
import { getInitials } from '../../utils/formatters';
import { fetchActiveProducts, fetchSupervisorProducts } from '../../services/productService';
import { fetchUsersInHierarchy } from '../../services/userService';
import { fetchSalesMultiMonth } from '../../services/salesService';
import type { AppUser, Product } from '../../types';
import { CheckCircle, AlertTriangle } from 'lucide-react';

interface UserInactiveInfo {
  user: AppUser;
  inactiveProducts: Product[];
}

export default function TeamYTDInactivePage() {
  const { appUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<UserInactiveInfo[]>([]);

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
      const periodStart = `${getFYStartMonth(fy)}-01`;

      const results: UserInactiveInfo[] = [];
      for (const user of users) {
        const sales = await fetchSalesMultiMonth(user.uid, ytdMonths);
        const inactive = getInactiveProducts(products, sales, activeIds, periodStart);
        if (inactive.length > 0) {
          results.push({ user, inactiveProducts: inactive });
        }
      }
      setData(results);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  if (loading) return <LoadingSpinner text="Analyzing YTD inactivity..." />;

  const fyLabel = getFYLabel(appUser?.financialYear || 'apr-mar');
  const totalInactive = data.reduce((s, d) => s + d.inactiveProducts.length, 0);

  return (
    <div className="dashboard-page" id="team-ytd-inactive-page">
      <PageHeader
        title="Team YTD Inactive Products"
        subtitle={`${totalInactive} inactive product–user combination(s) in ${fyLabel}`}
      />

      {data.length === 0 ? (
        <EmptyState
          icon={<CheckCircle size={32} />}
          title="All team members are active!"
          text={`Every user has reported sales for all assigned products in ${fyLabel}.`}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--v-space-4)' }}>
          {data.map(({ user, inactiveProducts }) => (
            <div key={user.uid} className="card" style={{ padding: 0 }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 'var(--v-space-3)',
                padding: 'var(--v-space-3) var(--v-space-4)',
                borderBottom: '1px solid var(--v-border-primary)'
              }}>
                <div className="avatar avatar-sm">{getInitials(user.displayName)}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 'var(--v-text-sm)' }}>{user.displayName}</div>
                  <div style={{ fontSize: 'var(--v-text-xs)', color: 'var(--v-text-tertiary)' }}>{user.email}</div>
                </div>
                <span className="badge badge-danger">
                  <AlertTriangle size={12} style={{ marginRight: 4 }} />
                  {inactiveProducts.length} inactive
                </span>
              </div>
              <div style={{ padding: 'var(--v-space-2) var(--v-space-4)' }}>
                {inactiveProducts.map(p => (
                  <div key={p.productId} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: 'var(--v-space-2) 0',
                    borderBottom: '1px solid var(--v-border-primary)',
                    fontSize: 'var(--v-text-sm)'
                  }}>
                    <span>{p.name}</span>
                    <span className="badge badge-danger" style={{ fontSize: '10px' }}>No Sales</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

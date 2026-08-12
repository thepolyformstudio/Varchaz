/* Varchaz — Team YTD Page */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { LoadingSpinner, PageHeader } from '../../components/shared';
import { PerformanceTable, UserPerformanceList } from '../../components/dashboard';
import { getYTDMonths, getFYLabel } from '../../utils/dateUtils';
import { buildYTDPerformance, aggregateUserPerformances, calcGrandTotal, getPctClass } from '../../utils/calculations';
import { formatIndianNumber, formatPercent, getInitials } from '../../utils/formatters';
import { fetchActiveProducts, fetchSupervisorProducts } from '../../services/productService';
import { fetchUsersInHierarchy } from '../../services/userService';
import { fetchPlansForMonths } from '../../services/planService';
import { fetchSalesMultiMonth } from '../../services/salesService';
import type { Product, ProductPerformance, AppUser } from '../../types';
import { MessageCircle } from 'lucide-react';

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

  const handleWhatsApp = () => {
    if (!appUser) return;
    let text = `*Varchaz Team Summary* 🏆\n`;
    text += `*Supervisor:* ${appUser.displayName}\n`;
    text += `*Type:* YTD - ${fyLabel}\n\n`;

    const categoriesMap: Record<string, ProductPerformance[]> = {};
    data.forEach(p => {
      const cat = p.category || 'General';
      if (!categoriesMap[cat]) categoriesMap[cat] = [];
      categoriesMap[cat].push(p);
    });

    const sortedCategories = Object.keys(categoriesMap).sort();
    let grandTotalPlan = 0;
    let grandTotalAchievement = 0;

    sortedCategories.forEach(catName => {
      text += `*${catName}*\n`;
      const catProducts = categoriesMap[catName];
      catProducts.forEach(p => {
        grandTotalPlan += p.plan;
        grandTotalAchievement += p.achievement;
        const pctStr = p.hasNoPlan ? (p.achievement > 0 ? '100% (No Plan)' : '0%') : `${p.achievementPct.toFixed(1)}%`;
        text += `🔹 ${p.productName}: Target ${p.plan.toLocaleString('en-IN')} | Achieved ${p.achievement.toLocaleString('en-IN')} (${pctStr})\n`;
      });
      text += `\n`;
    });

    if (data.length > 0) {
      const grandPct = grandTotalPlan > 0 ? (grandTotalAchievement / grandTotalPlan) * 100 : 0;
      text += `*GRAND TOTAL:* Target ${grandTotalPlan.toLocaleString('en-IN')} | Achieved ${grandTotalAchievement.toLocaleString('en-IN')} (${grandPct.toFixed(1)}%)\n`;
    }

    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  return (
    <div className="dashboard-page" id="team-ytd-page">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--v-space-4)' }}>
        <PageHeader title="Team YTD Performance" subtitle={`Consolidated for ${fyLabel}`} />
        <button 
          className="btn btn-outline"
          onClick={handleWhatsApp}
          style={{ display: 'flex', alignItems: 'center', gap: 'var(--v-space-2)' }}
          title="Send via WhatsApp"
        >
          <MessageCircle size={16} /> WhatsApp Summary
        </button>
      </div>
      <PerformanceTable data={data} viewType="ytd" title={`Consolidated YTD — ${fyLabel}`} exportFileName={`Team_YTD_${fyLabel}`} />
      <div className="dashboard-section" style={{ marginTop: 'var(--v-space-6)' }}>
        <h3 className="section-title">User-Level Product-Wise Summary</h3>
        <UserPerformanceList 
          userPerfs={userPerfs} 
          viewType="ytd" 
          onUserClick={(uid) => navigate(`/supervisor/user/${uid}`)} 
        />
      </div>
    </div>
  );
}

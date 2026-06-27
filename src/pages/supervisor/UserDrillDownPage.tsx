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
import { Mail } from 'lucide-react';
import { db } from '../../config/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

export default function UserDrillDownPage() {
  const { uid } = useParams<{ uid: string }>();
  const { appUser } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [targetUser, setTargetUser] = useState<AppUser | null>(null);
  const [mtdData, setMtdData] = useState<ProductPerformance[]>([]);
  const [ytdData, setYtdData] = useState<ProductPerformance[]>([]);
  const [tab, setTab] = useState<'mtd' | 'ytd'>('mtd');

  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [remarks, setRemarks] = useState('');
  const [emailSending, setEmailSending] = useState(false);

  useEffect(() => {
    if (appUser && !recipientEmail) {
      setRecipientEmail(appUser.email || '');
    }
  }, [appUser]);

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

  const handleSendEmail = async () => {
    if (!recipientEmail || !targetUser || !appUser) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
      alert('Please enter a valid email address.');
      return;
    }

    setEmailSending(true);
    try {
      const isMtd = tab === 'mtd';
      const performanceData = isMtd ? mtdData : ytdData;
      const title = isMtd ? `MTD Performance — ${displayMonth(getCurrentMonth())}` : `YTD Performance`;

      // Group by category
      const categoriesMap: Record<string, ProductPerformance[]> = {};
      performanceData.forEach(p => {
        const cat = p.category || 'General';
        if (!categoriesMap[cat]) {
          categoriesMap[cat] = [];
        }
        categoriesMap[cat].push(p);
      });

      const sortedCategories = Object.keys(categoriesMap).sort();
      let tableRows = '';
      let grandTotalPlan = 0;
      let grandTotalAchievement = 0;

      sortedCategories.forEach(catName => {
        const catProducts = categoriesMap[catName];
        const catPlan = catProducts.reduce((s, p) => s + p.plan, 0);
        const catAchievement = catProducts.reduce((s, p) => s + p.achievement, 0);
        const catPct = catPlan > 0 ? (catAchievement / catPlan) * 100 : 0;

        grandTotalPlan += catPlan;
        grandTotalAchievement += catAchievement;

        // Category Header Row
        tableRows += `
          <tr style="background-color: #f8fafc; font-weight: bold; border-bottom: 2px solid #cbd5e1;">
            <td colspan="4" style="padding: 8px 12px; color: #2563eb; font-size: 11px; text-transform: uppercase; text-align: left;">${catName}</td>
          </tr>
        `;

        // Product Rows
        catProducts.forEach(p => {
          const achievementStr = p.achievement.toLocaleString('en-IN');
          const planStr = p.plan.toLocaleString('en-IN');
          const pctStr = p.hasNoPlan ? (p.achievement > 0 ? '100% (No Plan)' : '0%') : `${p.achievementPct.toFixed(1)}%`;
          
          tableRows += `
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 10px 12px 10px 24px; font-weight: 500; color: #1e293b; text-align: left;">${p.productName}</td>
              <td style="padding: 10px 12px; text-align: right; color: #475569;">${planStr}</td>
              <td style="padding: 10px 12px; text-align: right; color: #0f172a; font-weight: 600;">${achievementStr}</td>
              <td style="padding: 10px 12px; text-align: right; font-weight: 600; color: ${p.achievementPct >= 100 ? '#10b981' : p.achievementPct >= 80 ? '#3b82f6' : p.achievementPct >= 50 ? '#f59e0b' : '#ef4444'};">${pctStr}</td>
            </tr>
          `;
        });

        // Category Subtotal Row
        tableRows += `
          <tr style="border-bottom: 2px solid #cbd5e1; font-style: italic; background-color: #fcfcfc;">
            <td style="padding: 8px 12px 8px 24px; color: #64748b; font-weight: 600; text-align: left;">Sub-total (${catName})</td>
            <td style="padding: 8px 12px; text-align: right; color: #64748b; font-weight: 600;">${catPlan.toLocaleString('en-IN')}</td>
            <td style="padding: 8px 12px; text-align: right; color: #64748b; font-weight: 600;">${catAchievement.toLocaleString('en-IN')}</td>
            <td style="padding: 8px 12px; text-align: right; font-weight: 600; color: ${catPct >= 100 ? '#10b981' : catPct >= 80 ? '#3b82f6' : catPct >= 50 ? '#f59e0b' : '#ef4444'};">${catPct.toFixed(1)}%</td>
          </tr>
        `;
      });

      // Grand Total Row
      if (performanceData.length > 0) {
        const grandPct = grandTotalPlan > 0 ? (grandTotalAchievement / grandTotalPlan) * 100 : 0;
        tableRows += `
          <tr style="font-weight: bold; background-color: #f1f5f9; border-top: 2px solid #94a3b8;">
            <td style="padding: 12px; color: #0f172a; text-align: left;">GRAND TOTAL</td>
            <td style="padding: 12px; text-align: right; color: #0f172a;">${grandTotalPlan.toLocaleString('en-IN')}</td>
            <td style="padding: 12px; text-align: right; color: #0f172a;">${grandTotalAchievement.toLocaleString('en-IN')}</td>
            <td style="padding: 12px; text-align: right; color: ${grandPct >= 100 ? '#10b981' : grandPct >= 80 ? '#3b82f6' : grandPct >= 50 ? '#f59e0b' : '#ef4444'};">${grandPct.toFixed(1)}%</td>
          </tr>
        `;
      }

      const remarksHtml = remarks.trim() 
        ? `
          <div style="background-color: #f8fafc; border-left: 4px solid #3b82f6; padding: 16px; margin-bottom: 24px; border-radius: 4px; text-align: left;">
            <h4 style="margin: 0 0 8px 0; color: #1e293b; font-size: 14px; font-weight: 600;">Supervisor Comments & Remarks</h4>
            <p style="margin: 0; color: #475569; font-size: 13px; white-space: pre-wrap; line-height: 1.5;">${remarks}</p>
          </div>
        ` 
        : '';

      const htmlBody = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #ffffff;">
          <div style="border-bottom: 2px solid #3b82f6; padding-bottom: 16px; margin-bottom: 24px; text-align: left;">
            <h2 style="margin: 0; color: #0f172a; font-size: 20px; font-weight: 700;">Varchaz Performance Summary</h2>
          </div>
          
          <div style="margin-bottom: 24px;">
            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
              <tr>
                <td style="padding: 4px 0; color: #64748b; width: 120px; text-align: left;">Team Member:</td>
                <td style="padding: 4px 0; color: #0f172a; font-weight: 600; text-align: left;">${targetUser.displayName} (${targetUser.email})</td>
              </tr>
              <tr>
                <td style="padding: 4px 0; color: #64748b; text-align: left;">Supervisor:</td>
                <td style="padding: 4px 0; color: #0f172a; font-weight: 600; text-align: left;">${appUser.displayName} (${appUser.email})</td>
              </tr>
              <tr>
                <td style="padding: 4px 0; color: #64748b; text-align: left;">Report Type:</td>
                <td style="padding: 4px 0; color: #0f172a; font-weight: 600; text-align: left;">${title}</td>
              </tr>
              <tr>
                <td style="padding: 4px 0; color: #64748b; text-align: left;">Date Generated:</td>
                <td style="padding: 4px 0; color: #0f172a; text-align: left;">${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
              </tr>
            </table>
          </div>

          ${remarksHtml}

          <div style="margin-bottom: 24px;">
            <table style="width: 100%; border-collapse: collapse; font-size: 13px; border: 1px solid #e2e8f0;">
              <thead>
                <tr style="background-color: #f8fafc; border-bottom: 2px solid #e2e8f0;">
                  <th style="padding: 12px; text-align: left; color: #475569; font-weight: 600;">Product</th>
                  <th style="padding: 12px; text-align: right; color: #475569; font-weight: 600;">Target</th>
                  <th style="padding: 12px; text-align: right; color: #475569; font-weight: 600;">Achievement</th>
                  <th style="padding: 12px; text-align: right; color: #475569; font-weight: 600;">% Ach.</th>
                </tr>
              </thead>
              <tbody>
                ${tableRows}
              </tbody>
            </table>
          </div>

          <div style="border-top: 1px solid #e2e8f0; padding-top: 16px; text-align: center; color: #94a3b8; font-size: 11px;">
            <p style="margin: 0;">This email was sent on behalf of ${appUser.displayName} from the Varchaz app.</p>
            <p style="margin: 4px 0 0 0;">© ${new Date().getFullYear()} Varchaz. All rights reserved.</p>
          </div>
        </div>
      `;

      await addDoc(collection(db, 'mail'), {
        to: recipientEmail,
        message: {
          subject: `[Varchaz] Performance Summary - ${targetUser.displayName} (${isMtd ? 'MTD' : 'YTD'})`,
          html: htmlBody,
          text: `Performance Summary for ${targetUser.displayName}. Sent by ${appUser.displayName}.`
        },
        createdAt: serverTimestamp(),
        createdBy: appUser.uid
      });

      alert('Email summary request queued successfully!');
      setEmailModalOpen(false);
      setRemarks('');
    } catch (err) {
      console.error(err);
      alert('Failed to send email summary. Please check your connection or permissions.');
    } finally {
      setEmailSending(false);
    }
  };

  if (loading) return <LoadingSpinner text="Loading user data..." />;
  if (!targetUser) return <PageHeader title="User not found" />;

  return (
    <div className="dashboard-page" id="user-drilldown-page">
      <BackButton onClick={() => navigate(-1)} />
      
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--v-space-6)', flexWrap: 'wrap', gap: 'var(--v-space-4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--v-space-4)' }}>
          <div className="avatar avatar-lg">{getInitials(targetUser.displayName)}</div>
          <div>
            <h1 style={{ fontSize: 'var(--v-text-xl)', fontWeight: 700 }}>{targetUser.displayName}</h1>
            <div style={{ fontSize: 'var(--v-text-sm)', color: 'var(--v-text-secondary)' }}>{targetUser.email}</div>
            <span className="badge badge-primary" style={{ marginTop: 4 }}>{formatRole(targetUser.role)}</span>
          </div>
        </div>
        <button 
          className="btn btn-primary"
          onClick={() => setEmailModalOpen(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 'var(--v-space-2)' }}
        >
          <Mail size={16} /> Email Summary
        </button>
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

      {/* Email Summary Modal */}
      {emailModalOpen && (
        <div className="modal-overlay" style={{ zIndex: 1000 }}>
          <div className="modal-content" style={{ maxWidth: 480, width: '90%' }}>
            <div className="modal-header">
              <h3 className="modal-title">Email Performance Summary</h3>
              <button className="btn btn-icon btn-ghost" onClick={() => setEmailModalOpen(false)}>&times;</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--v-space-4)' }}>
              <p style={{ fontSize: 'var(--v-text-xs)', color: 'var(--v-text-secondary)', marginBottom: 'var(--v-space-1)' }}>
                This will send a clean HTML report of <strong>{targetUser.displayName}'s {tab === 'mtd' ? 'MTD' : 'YTD'} performance</strong> to the email below.
              </p>
              
              <div className="input-group">
                <label className="input-label" htmlFor="recipient-email">Recipient Email Address</label>
                <input
                  id="recipient-email"
                  type="email"
                  className="input-field"
                  placeholder="manager@company.com"
                  value={recipientEmail}
                  onChange={e => setRecipientEmail(e.target.value)}
                  required
                />
              </div>

              <div className="input-group">
                <label className="input-label" htmlFor="email-remarks">Comments & Remarks</label>
                <textarea
                  id="email-remarks"
                  className="input-field"
                  placeholder="Add your remarks or feedback about this performance (optional)..."
                  style={{ minHeight: 100, resize: 'vertical' }}
                  value={remarks}
                  onChange={e => setRemarks(e.target.value)}
                />
              </div>
            </div>
            <div className="modal-actions" style={{ marginTop: 'var(--v-space-4)' }}>
              <button 
                className="btn btn-ghost" 
                onClick={() => setEmailModalOpen(false)}
                disabled={emailSending}
              >
                Cancel
              </button>
              <button 
                className="btn btn-primary" 
                onClick={handleSendEmail}
                disabled={emailSending || !recipientEmail}
              >
                {emailSending ? 'Sending...' : 'Send Email'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

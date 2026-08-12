/* Varchaz — Supervisor Team MTD Activity Matrix Page */
import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { LoadingSpinner, PageHeader, EmptyState, BackButton } from '../../components/shared';
import { getCurrentMonth, displayMonth } from '../../utils/dateUtils';
import { getInactiveProducts } from '../../utils/calculations';
import { getInitials } from '../../utils/formatters';
import { fetchActiveProducts, fetchSupervisorProducts } from '../../services/productService';
import { fetchUsersInHierarchy } from '../../services/userService';
import { fetchMonthlySales } from '../../services/salesService';
import type { AppUser, Product } from '../../types';
import { CheckCircle, AlertTriangle, X, Mail, MessageCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface MatrixData {
  users: AppUser[];
  products: Product[];
  categories: string[];
  activityMap: Record<string, Record<string, boolean>>; // userId -> productId -> isActive
}

export default function TeamMTDInactivePage() {
  const { appUser } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<MatrixData | null>(null);
  const month = getCurrentMonth();

  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [remarks, setRemarks] = useState('');
  const [emailSending, setEmailSending] = useState(false);

  useEffect(() => {
    if (appUser && !recipientEmail) {
      setRecipientEmail(appUser.email || '');
    }
  }, [appUser]);

  useEffect(() => { if (appUser) load(); }, [appUser]);

  async function load() {
    if (!appUser) return;
    setLoading(true);
    try {
      const ids = await fetchSupervisorProducts(appUser.uid);
      const all = await fetchActiveProducts();
      const products = ids.length > 0 ? all.filter(p => ids.includes(p.productId)) : all;
      const activeIds = products.map(p => p.productId);
      const users = (await fetchUsersInHierarchy(appUser.uid)).filter(u => u.status === 'approved');
      const periodStart = `${month}-01`;

      const activityMap: Record<string, Record<string, boolean>> = {};
      
      // Get unique categories
      const categoriesSet = new Set<string>();
      products.forEach(p => categoriesSet.add(p.category || 'General'));
      const categories = Array.from(categoriesSet).sort();

      for (const user of users) {
        activityMap[user.uid] = {};
        const sales = await fetchMonthlySales(user.uid, month);
        const inactive = getInactiveProducts(products, sales, activeIds, periodStart);
        const inactiveIds = new Set(inactive.map(p => p.productId));
        
        for (const p of products) {
          activityMap[user.uid][p.productId] = !inactiveIds.has(p.productId);
        }
      }
      
      setData({ users, products, categories, activityMap });
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  const handleSendEmail = async () => {
    if (!recipientEmail || !data || !appUser) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
      alert('Please enter a valid email address.');
      return;
    }

    setEmailSending(true);
    try {
      const title = `Team MTD Activity Matrix — ${displayMonth(month)}`;

      let tableRows = '';
      
      // Table Header for Email
      let headerCells = `<th style="padding: 12px; text-align: left; color: #475569; font-weight: 600; min-width: 150px;">Category & Product</th>`;
      data.users.forEach(u => {
        headerCells += `<th style="padding: 12px; text-align: center; color: #475569; font-weight: 600;">${u.displayName.split(' ')[0]}</th>`;
      });
      
      // Table Body for Email
      data.categories.forEach(cat => {
        const catProducts = data.products.filter(p => (p.category || 'General') === cat);
        
        // Category Header Row
        tableRows += `
          <tr style="background-color: #f8fafc; font-weight: bold; border-bottom: 2px solid #cbd5e1;">
            <td colspan="${data.users.length + 1}" style="padding: 8px 12px; color: #2563eb; font-size: 11px; text-transform: uppercase; text-align: left;">${cat}</td>
          </tr>
        `;
        
        // Product Rows
        catProducts.forEach(p => {
          let userCells = '';
          data.users.forEach(u => {
            const isActive = data.activityMap[u.uid]?.[p.productId];
            if (isActive) {
              userCells += `<td style="padding: 8px; text-align: center; color: #10b981; font-weight: bold; font-size: 16px;">✓</td>`;
            } else {
              userCells += `<td style="padding: 8px; text-align: center; color: #ef4444; font-weight: bold; font-size: 16px;">✗</td>`;
            }
          });

          tableRows += `
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 8px 12px 8px 24px; font-weight: 500; color: #1e293b; text-align: left;">${p.name}</td>
              ${userCells}
            </tr>
          `;
        });
      });

      const remarksHtml = remarks.trim() 
        ? `
          <div style="background-color: #f8fafc; border-left: 4px solid #3b82f6; padding: 16px; margin-bottom: 24px; border-radius: 4px; text-align: left;">
            <h4 style="margin: 0 0 8px 0; color: #1e293b; font-size: 14px; font-weight: 600;">Supervisor Comments & Remarks</h4>
            <p style="margin: 0; color: #475569; font-size: 13px; white-space: pre-wrap; line-height: 1.5;">${remarks}</p>
          </div>
        ` 
        : '';

      const htmlBody = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 900px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #ffffff;">
          <div style="border-bottom: 2px solid #3b82f6; padding-bottom: 16px; margin-bottom: 24px; text-align: left;">
            <h2 style="margin: 0; color: #0f172a; font-size: 20px; font-weight: 700;">Varchaz Team Activity Matrix</h2>
          </div>
          
          <div style="margin-bottom: 24px;">
            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
              <tr>
                <td style="padding: 4px 0; color: #64748b; width: 120px; text-align: left;">Supervisor:</td>
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

          <div style="margin-bottom: 24px; overflow-x: auto;">
            <table style="width: 100%; border-collapse: collapse; font-size: 12px; border: 1px solid #e2e8f0; min-width: 600px;">
              <thead>
                <tr style="background-color: #f1f5f9; border-bottom: 2px solid #cbd5e1;">
                  ${headerCells}
                </tr>
              </thead>
              <tbody>
                ${tableRows}
              </tbody>
            </table>
          </div>
          
          <div style="background-color: #f8fafc; padding: 12px; border-radius: 4px; font-size: 12px; color: #64748b; margin-bottom: 24px;">
             <strong>Legend:</strong> <span style="color: #10b981; font-weight: bold;">✓</span> = Active (Sales \> 0) &nbsp;|&nbsp; <span style="color: #ef4444; font-weight: bold;">✗</span> = Inactive (No Sales)
          </div>

          <div style="border-top: 1px solid #e2e8f0; padding-top: 16px; text-align: center; color: #94a3b8; font-size: 11px;">
            <p style="margin: 0;">This email was sent on behalf of ${appUser.displayName} from the Varchaz app.</p>
            <p style="margin: 4px 0 0 0;">© ${new Date().getFullYear()} Varchaz. All rights reserved.</p>
          </div>
        </div>
      `;

      const apiUrl = import.meta.env.VITE_EMAIL_API_URL || 'https://varchaz-email-api-sigma.vercel.app/send';
      const apiKey = import.meta.env.VITE_EMAIL_API_KEY || 'your_super_secret_api_key_here';

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey
        },
        body: JSON.stringify({
          to: recipientEmail,
          subject: `[Varchaz] ${title} - ${appUser.displayName}`,
          html: htmlBody,
          text: `Team Activity Matrix generated by ${appUser.displayName}.`
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to send email via microservice');
      }

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

  const handleWhatsApp = () => {
    if (!appUser || !data) return;
    
    let text = `*Varchaz Activity Matrix* 🚨\n`;
    text += `*Type:* MTD - ${displayMonth(month)}\n\n`;

    data.users.forEach(u => {
      text += `👤 *${u.displayName}*\n`;
      let activeCount = 0;
      const inactiveNames: string[] = [];

      data.products.forEach(p => {
        const isActive = data.activityMap[u.uid]?.[p.productId];
        if (isActive) {
          activeCount++;
        } else {
          inactiveNames.push(p.name);
        }
      });

      text += `✅ Active: ${activeCount} products\n`;
      if (inactiveNames.length === 0) {
        text += `🌟 Perfect! No inactive products.\n\n`;
      } else {
        text += `❌ Inactive (0 Sales): ${inactiveNames.join(', ')}\n\n`;
      }
    });

    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  if (loading) return <LoadingSpinner text="Analyzing matrix..." />;
  if (!data) return <PageHeader title="No Data Found" />;

  return (
    <div className="dashboard-page" id="team-mtd-inactive-page">
      <BackButton onClick={() => navigate(-1)} />
      
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--v-space-4)', flexWrap: 'wrap', gap: 'var(--v-space-4)' }}>
        <PageHeader
          title="Team MTD Activity Matrix"
          subtitle={`Active vs Inactive products per team member in ${displayMonth(month)}`}
        />
        
        <div style={{ display: 'flex', gap: 'var(--v-space-2)' }}>
          <button 
            className="btn btn-outline"
            onClick={handleWhatsApp}
            style={{ display: 'flex', alignItems: 'center', gap: 'var(--v-space-2)' }}
            title="Send via WhatsApp"
          >
            <MessageCircle size={16} /> WhatsApp Matrix
          </button>
          <button 
            className="btn btn-primary"
            onClick={() => setEmailModalOpen(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 'var(--v-space-2)' }}
          >
            <Mail size={16} /> Email Matrix
          </button>
        </div>
      </div>

      {data.users.length === 0 ? (
        <EmptyState
          icon={<AlertTriangle size={32} />}
          title="No Team Members"
          text="You don't have any active users reporting to you."
        />
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-container data-table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ minWidth: 200 }}>Category & Product</th>
                  {data.users.map(u => (
                    <th key={u.uid} style={{ textAlign: 'center', minWidth: 80, verticalAlign: 'bottom' }}>
                      <div className="avatar avatar-sm" style={{ margin: '0 auto 8px', width: 28, height: 28, fontSize: 11 }}>
                        {getInitials(u.displayName)}
                      </div>
                      <div style={{ fontSize: '11px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 80 }}>
                        {u.displayName.split(' ')[0]}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.categories.map(cat => {
                  const catProducts = data.products.filter(p => (p.category || 'General') === cat);
                  return (
                    <React.Fragment key={cat}>
                      {/* Category Header Row */}
                      <tr style={{ backgroundColor: 'var(--v-blue-50)' }}>
                        <td colSpan={data.users.length + 1} style={{ fontWeight: 600, color: 'var(--v-blue-600)', fontSize: '11px', textTransform: 'uppercase' }}>
                          {cat}
                        </td>
                      </tr>
                      {/* Product Rows */}
                      {catProducts.map(p => (
                        <tr key={p.productId}>
                          <td style={{ paddingLeft: 'var(--v-space-6)', fontWeight: 500, color: 'var(--v-text-primary)' }}>
                            {p.name}
                          </td>
                          {data.users.map(u => {
                            const isActive = data.activityMap[u.uid]?.[p.productId];
                            return (
                              <td key={u.uid} style={{ textAlign: 'center' }}>
                                {isActive ? (
                                  <CheckCircle size={18} color="#10b981" style={{ margin: '0 auto' }} />
                                ) : (
                                  <X size={18} color="#ef4444" style={{ margin: '0 auto' }} />
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ padding: 'var(--v-space-3) var(--v-space-4)', borderTop: '1px solid var(--v-border-primary)', fontSize: 'var(--v-text-xs)', color: 'var(--v-text-secondary)', display: 'flex', gap: 'var(--v-space-4)' }}>
             <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><CheckCircle size={14} color="#10b981" /> Active (Sales &gt; 0)</span>
             <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><X size={14} color="#ef4444" /> Inactive (Zero Sales)</span>
          </div>
        </div>
      )}

      {/* Email Summary Modal */}
      {emailModalOpen && (
        <div className="modal-overlay" style={{ zIndex: 1000 }}>
          <div className="modal-content" style={{ maxWidth: 480, width: '90%' }}>
            <div className="modal-header">
              <h3 className="modal-title">Email Activity Matrix</h3>
              <button className="btn btn-icon btn-ghost" onClick={() => setEmailModalOpen(false)}>&times;</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--v-space-4)' }}>
              <p style={{ fontSize: 'var(--v-text-xs)', color: 'var(--v-text-secondary)', marginBottom: 'var(--v-space-1)' }}>
                This will send the cross-tabulated HTML matrix of <strong>Team MTD Activity</strong> to the email below.
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

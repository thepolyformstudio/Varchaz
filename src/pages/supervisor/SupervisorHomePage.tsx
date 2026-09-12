/* ============================================================
   Varchaz — Supervisor Home Dashboard
   ============================================================ */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { SummaryCard, PerformanceTable } from '../../components/dashboard';
import { LoadingSpinner, PageHeader } from '../../components/shared';
import { getCurrentMonth, displayMonth, getYTDMonths, getFYLabel, getGreeting, getToday, isNonWorkingDay } from '../../utils/dateUtils';
import { buildMTDPerformance, calcGrandTotal, aggregateUserPerformances } from '../../utils/calculations';
import { formatIndianNumber, formatPercent, getInitials } from '../../utils/formatters';
import { fetchActiveProducts, fetchSupervisorProducts } from '../../services/productService';
import { fetchUsersInHierarchy } from '../../services/userService';
import { fetchMonthlyPlan } from '../../services/planService';
import { fetchMonthlySales } from '../../services/salesService';
import { countPendingApprovals } from '../../services/approvalService';
import { fetchCommitmentsForUsers } from '../../services/commitmentService';
import { generateWhatsAppCommitmentAppreciationUrl } from '../../services/whatsappService';
import { Users, Target, TrendingUp, UserCheck, BarChart3, AlertTriangle, ClipboardList, Package, CheckSquare, MessageCircle, CheckCircle2, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import type { AppUser, Product, ProductPerformance, DailyCommitment } from '../../types';
import { PendingWhatsAppReminders } from '../../components/dashboard/PendingWhatsAppReminders';

export default function SupervisorHomePage() {
  const { appUser } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [teamUsers, setTeamUsers] = useState<AppUser[]>([]);
  const [consolidatedMTD, setConsolidatedMTD] = useState<ProductPerformance[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [todayCommitments, setTodayCommitments] = useState<DailyCommitment[]>([]);
  const [expandedUserCommitment, setExpandedUserCommitment] = useState<string | null>(null);
  const [commitmentViewMode, setCommitmentViewMode] = useState<'consolidated' | 'userLevel'>('consolidated');

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

      // Fetch today's commitments
      const todayStr = getToday();
      const commitments = await fetchCommitmentsForUsers(approvedUsers.map(u => u.uid), todayStr);
      setTodayCommitments(commitments);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <LoadingSpinner text="Loading team dashboard..." />;
  if (!appUser) return null;

  const mtdTotals = calcGrandTotal(consolidatedMTD);
  const todayHoliday = isNonWorkingDay(new Date());
  const fulfilledCommitments = todayCommitments.filter(c => c.isFulfilled);
  const totalTeamCommitted = todayCommitments.reduce((acc, c) => acc + (c.totalCommitted || 0), 0);
  const totalTeamAchieved = todayCommitments.reduce((acc, c) => acc + (c.totalAchieved || 0), 0);

  // Consolidated products calculation (omitting products with 0 committed)
  const consolidatedProductsMap = new Map<string, { productName: string; committed: number; achieved: number }>();
  todayCommitments.forEach(c => {
    (c.items || []).forEach(item => {
      if (item.committedValue > 0) {
        const existing = consolidatedProductsMap.get(item.productId) || {
          productName: item.productName,
          committed: 0,
          achieved: 0
        };
        existing.committed += item.committedValue;
        existing.achieved += (item.achievedValue || 0);
        consolidatedProductsMap.set(item.productId, existing);
      }
    });
  });
  const consolidatedCommitmentProducts = Array.from(consolidatedProductsMap.entries()).map(([productId, data]) => ({
    productId,
    ...data,
    fulfillmentPct: data.committed > 0 ? Math.round((data.achieved / data.committed) * 1000) / 10 : 0
  })).sort((a, b) => b.committed - a.committed);

  return (
    <div className="dashboard-page" id="supervisor-home">
      <PageHeader
        title={`${getGreeting()}, ${appUser.displayName.split(' ')[0]}`}
        subtitle="Team performance overview"
      />

      <PendingWhatsAppReminders />

      {/* Summary Cards */}
      <div className="summary-grid">
        <SummaryCard icon={<Users size={20} />} label="Team Members" value={teamUsers.length} onClick={() => navigate('/supervisor/team')} />
        <SummaryCard 
          icon={<Target size={20} />} 
          label={`Active Products (MTD)`} 
          value={consolidatedMTD.filter(p => p.achievement > 0).length} 
          onClick={() => navigate('/supervisor/mtd')} 
        />
        <SummaryCard
          icon={<AlertTriangle size={20} />}
          label="Inactive Products (MTD)"
          value={consolidatedMTD.filter(p => p.achievement === 0).length}
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
        <a className="quick-action-btn" onClick={() => navigate('/supervisor/commitments')}>
          <div className="action-icon"><Target size={20} /></div>
          <span className="action-label">Commitments</span>
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

      {/* Today's Commitments Section */}
      <div className="dashboard-section" style={{ marginTop: 'var(--v-space-4)' }}>
        <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--v-space-2)' }}>
          <div>
            <h3 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 'var(--v-space-2)' }}>
              <Target size={20} style={{ color: 'var(--v-primary)' }} />
              Today's Team Commitments
              {todayHoliday.isExcluded && (
                <span className="badge badge-warning" style={{ fontSize: 'var(--v-text-xs)' }}>
                  Non-Working Day ({todayHoliday.reason})
                </span>
              )}
            </h3>
            <p style={{ margin: 0, fontSize: 'var(--v-text-xs)', color: 'var(--v-text-secondary)' }}>
              Morning product commitments and real-time EOD achievement tracking
            </p>
          </div>
          <div style={{ display: 'flex', gap: 'var(--v-space-2)', alignItems: 'center' }}>
            <div className="btn-group" style={{ display: 'inline-flex', background: 'var(--v-gray-100)', padding: 2, borderRadius: 'var(--v-radius-md)' }}>
              <button
                className={`btn btn-xs ${commitmentViewMode === 'consolidated' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setCommitmentViewMode('consolidated')}
              >
                Consolidated
              </button>
              <button
                className={`btn btn-xs ${commitmentViewMode === 'userLevel' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setCommitmentViewMode('userLevel')}
              >
                User-Level ({todayCommitments.length})
              </button>
            </div>
            <button
              className="btn btn-secondary btn-xs"
              onClick={() => navigate('/supervisor/commitments')}
            >
              Weekly Report →
            </button>
          </div>
        </div>

        {/* Highlight cards: Total Committed vs Achieved & Fulfilled Reps Celebration */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--v-space-3)', margin: 'var(--v-space-3) 0' }}>
          <div className="card" style={{ padding: 'var(--v-space-3)', background: 'var(--v-surface-raised)' }}>
            <div style={{ fontSize: 'var(--v-text-xs)', color: 'var(--v-text-tertiary)' }}>Commitments Submitted</div>
            <div style={{ fontSize: 'var(--v-text-lg)', fontWeight: 700, color: 'var(--v-text-primary)', marginTop: 4 }}>
              {todayCommitments.length} / {teamUsers.length} <span style={{ fontSize: 'var(--v-text-xs)', fontWeight: 'normal', color: 'var(--v-text-secondary)' }}>team reps</span>
            </div>
          </div>
          <div className="card" style={{ padding: 'var(--v-space-3)', background: 'var(--v-surface-raised)' }}>
            <div style={{ fontSize: 'var(--v-text-xs)', color: 'var(--v-text-tertiary)' }}>Total Committed Value</div>
            <div style={{ fontSize: 'var(--v-text-lg)', fontWeight: 700, color: 'var(--v-primary)', marginTop: 4 }}>
              ₹{formatIndianNumber(totalTeamCommitted)}
            </div>
          </div>
          <div className="card" style={{ padding: 'var(--v-space-3)', background: 'var(--v-surface-raised)' }}>
            <div style={{ fontSize: 'var(--v-text-xs)', color: 'var(--v-text-tertiary)' }}>Total Achieved (EOD)</div>
            <div style={{ fontSize: 'var(--v-text-lg)', fontWeight: 700, color: totalTeamAchieved >= totalTeamCommitted && totalTeamCommitted > 0 ? 'var(--v-green-600)' : 'var(--v-text-primary)', marginTop: 4 }}>
              ₹{formatIndianNumber(totalTeamAchieved)}
              {totalTeamCommitted > 0 && (
                <span style={{ fontSize: 'var(--v-text-xs)', marginLeft: 6, fontWeight: 600, color: totalTeamAchieved >= totalTeamCommitted ? 'var(--v-green-600)' : 'var(--v-amber-600)' }}>
                  ({Math.round((totalTeamAchieved / totalTeamCommitted) * 100)}%)
                </span>
              )}
            </div>
          </div>
          <div className="card" style={{ padding: 'var(--v-space-3)', background: 'var(--v-surface-raised)' }}>
            <div style={{ fontSize: 'var(--v-text-xs)', color: 'var(--v-text-tertiary)' }}>Fulfilled Targets</div>
            <div style={{ fontSize: 'var(--v-text-lg)', fontWeight: 700, color: 'var(--v-green-600)', marginTop: 4 }}>
              {fulfilledCommitments.length} <span style={{ fontSize: 'var(--v-text-xs)', fontWeight: 'normal', color: 'var(--v-text-secondary)' }}>completed</span>
            </div>
          </div>
        </div>

        {/* 1-Click WhatsApp Appreciation for Fulfilled Team Members */}
        {fulfilledCommitments.length > 0 && (
          <div style={{
            background: 'rgba(34, 197, 94, 0.08)',
            border: '1px solid rgba(34, 197, 94, 0.25)',
            borderRadius: 'var(--v-radius-lg)',
            padding: 'var(--v-space-3) var(--v-space-4)',
            marginBottom: 'var(--v-space-3)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--v-space-2)', marginBottom: 'var(--v-space-2)' }}>
              <Sparkles size={16} style={{ color: 'var(--v-green-600)' }} />
              <strong style={{ fontSize: 'var(--v-text-sm)', color: 'var(--v-green-700)' }}>
                Target Achievers Today ({fulfilledCommitments.length})
              </strong>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--v-space-2)' }}>
              {fulfilledCommitments.map(fc => {
                const repUser = teamUsers.find(u => u.uid === fc.userId);
                const waUrl = generateWhatsAppCommitmentAppreciationUrl(
                  repUser?.phone,
                  fc.userName,
                  fc.totalCommitted,
                  fc.totalAchieved,
                  fc.fulfillmentPct
                );
                return (
                  <div
                    key={fc.id}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 'var(--v-space-2)',
                      background: 'var(--v-surface)',
                      padding: '4px 10px',
                      borderRadius: 'var(--v-radius-md)',
                      border: '1px solid rgba(34, 197, 94, 0.2)'
                    }}
                  >
                    <CheckCircle2 size={14} style={{ color: 'var(--v-green-600)' }} />
                    <span style={{ fontSize: 'var(--v-text-xs)', fontWeight: 600 }}>{fc.userName}</span>
                    <span style={{ fontSize: 'var(--v-text-xs)', color: 'var(--v-green-600)', fontWeight: 600 }}>
                      ₹{formatIndianNumber(Number(fc.totalAchieved || 0))} / ₹{formatIndianNumber(Number(fc.totalCommitted || 0))} ({fc.fulfillmentPct}%)
                    </span>
                    <a
                      href={waUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-xs btn-success"
                      title="Send WhatsApp Appreciation"
                      style={{ padding: '2px 6px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                    >
                      <MessageCircle size={12} /> Appreciate
                    </a>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Consolidated View (omitting empty products) */}
        {commitmentViewMode === 'consolidated' && (
          <div className="table-responsive" style={{ border: '1px solid var(--v-border)', borderRadius: 'var(--v-radius-md)' }}>
            <table className="data-table" style={{ width: '100%', fontSize: 'var(--v-text-sm)' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: 'var(--v-space-2)' }}>Product</th>
                  <th style={{ textAlign: 'right', padding: 'var(--v-space-2)' }}>Total Committed</th>
                  <th style={{ textAlign: 'right', padding: 'var(--v-space-2)' }}>Total Achieved</th>
                  <th style={{ textAlign: 'right', padding: 'var(--v-space-2)' }}>Fulfillment %</th>
                </tr>
              </thead>
              <tbody>
                {consolidatedCommitmentProducts.map(p => (
                  <tr key={p.productId}>
                    <td style={{ fontWeight: 600, padding: 'var(--v-space-2)' }}>{p.productName}</td>
                    <td style={{ textAlign: 'right', padding: 'var(--v-space-2)' }}>₹{formatIndianNumber(p.committed)}</td>
                    <td style={{ textAlign: 'right', padding: 'var(--v-space-2)' }}>₹{formatIndianNumber(p.achieved)}</td>
                    <td style={{ textAlign: 'right', padding: 'var(--v-space-2)', fontWeight: 600, color: p.fulfillmentPct >= 100 ? 'var(--v-green-600)' : p.fulfillmentPct > 0 ? 'var(--v-amber-600)' : 'var(--v-text-tertiary)' }}>
                      {p.fulfillmentPct}%
                    </td>
                  </tr>
                ))}
                {consolidatedCommitmentProducts.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', padding: 'var(--v-space-4)', color: 'var(--v-text-tertiary)' }}>
                      {todayHoliday.isExcluded
                        ? 'Today is a non-working day. No commitments entered.'
                        : 'No team members have submitted commitments for today yet.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* User-Level View (omitting empty products) */}
        {commitmentViewMode === 'userLevel' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--v-space-2)' }}>
            {todayCommitments.map(c => {
              const isExpanded = expandedUserCommitment === c.userId;
              const activeCommittedItems = (c.items || []).filter(item => item.committedValue > 0);
              const repUser = teamUsers.find(u => u.uid === c.userId);

              return (
                <div key={c.id} style={{ border: '1px solid var(--v-border)', borderRadius: 'var(--v-radius-md)', background: 'var(--v-surface)' }}>
                  <div
                    onClick={() => setExpandedUserCommitment(isExpanded ? null : c.userId)}
                    style={{
                      padding: 'var(--v-space-3)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      flexWrap: 'wrap',
                      gap: 'var(--v-space-2)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--v-space-2)' }}>
                      <div className="avatar avatar-xs">{getInitials(c.userName)}</div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 'var(--v-text-sm)' }}>{c.userName}</div>
                        <div style={{ fontSize: 'var(--v-text-xs)', color: 'var(--v-text-tertiary)' }}>
                          {activeCommittedItems.length} products committed
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--v-space-3)' }}>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 'var(--v-text-xs)', color: 'var(--v-text-secondary)' }}>
                          ₹{formatIndianNumber(Number(c.totalAchieved || 0))} / ₹{formatIndianNumber(Number(c.totalCommitted || 0))}
                        </div>
                        <span className={`badge ${c.isFulfilled ? 'badge-success' : c.eodReported ? 'badge-warning' : 'badge-info'}`} style={{ fontSize: '10px' }}>
                          {c.isFulfilled ? 'Fulfilled' : c.eodReported ? `${c.fulfillmentPct}% Achieved` : 'Committed (Pending EOD)'}
                        </span>
                      </div>
                      {c.isFulfilled && (
                        <a
                          href={generateWhatsAppCommitmentAppreciationUrl(repUser?.phone, c.userName, c.totalCommitted, c.totalAchieved, c.fulfillmentPct)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-xs btn-success"
                          onClick={(e) => e.stopPropagation()}
                          style={{ padding: '3px 8px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                        >
                          <MessageCircle size={12} /> Appreciate
                        </a>
                      )}
                      {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </div>
                  </div>

                  {isExpanded && (
                    <div style={{ padding: '0 var(--v-space-3) var(--v-space-3) var(--v-space-3)', borderTop: '1px dashed var(--v-border)' }}>
                      <table className="data-table" style={{ width: '100%', fontSize: 'var(--v-text-xs)', marginTop: 'var(--v-space-2)' }}>
                        <thead>
                          <tr>
                            <th style={{ textAlign: 'left', padding: '4px 8px' }}>Product</th>
                            <th style={{ textAlign: 'right', padding: '4px 8px' }}>Committed</th>
                            <th style={{ textAlign: 'right', padding: '4px 8px' }}>Achieved</th>
                            <th style={{ textAlign: 'right', padding: '4px 8px' }}>Fulfillment %</th>
                          </tr>
                        </thead>
                        <tbody>
                          {activeCommittedItems.map(item => (
                            <tr key={item.productId}>
                              <td style={{ padding: '4px 8px', fontWeight: 500 }}>{item.productName}</td>
                              <td style={{ textAlign: 'right', padding: '4px 8px' }}>₹{formatIndianNumber(Number(item.committedValue || 0))}</td>
                              <td style={{ textAlign: 'right', padding: '4px 8px' }}>₹{formatIndianNumber(Number(item.achievedValue || 0))}</td>
                              <td style={{ textAlign: 'right', padding: '4px 8px', fontWeight: 600, color: (item.fulfillmentPct || 0) >= 100 ? 'var(--v-green-600)' : (item.fulfillmentPct || 0) > 0 ? 'var(--v-amber-600)' : 'var(--v-text-tertiary)' }}>
                                {item.fulfillmentPct || 0}%
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
            {todayCommitments.length === 0 && (
              <div style={{ padding: 'var(--v-space-4)', textAlign: 'center', color: 'var(--v-text-tertiary)', fontSize: 'var(--v-text-sm)', border: '1px dashed var(--v-border)', borderRadius: 'var(--v-radius-md)' }}>
                {todayHoliday.isExcluded
                  ? 'Today is a non-working day. Daily commitments are not tracked today.'
                  : 'No team members have submitted commitments for today yet.'}
              </div>
            )}
          </div>
        )}
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

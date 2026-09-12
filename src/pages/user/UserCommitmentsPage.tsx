/* ============================================================
   Varchaz — User Weekly Commitments Page
   ============================================================ */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { PageHeader, LoadingSpinner } from '../../components/shared';
import { DailyCommitmentModal } from '../../components/dashboard';
import {
  getWeekDates, displayDate, isNonWorkingDay, getToday, getCurrentMonth
} from '../../utils/dateUtils';
import { formatIndianNumber } from '../../utils/formatters';
import {
  fetchDailyCommitment, fetchUserWeeklyCommitments, calcWeeklyCommitmentSummary
} from '../../services/commitmentService';
import { fetchActiveProducts, fetchSupervisorProducts } from '../../services/productService';
import { fetchMonthlyPlan } from '../../services/planService';
import { fetchMonthlySales } from '../../services/salesService';
import { buildMTDPerformance } from '../../utils/calculations';
import {
  Target, ChevronLeft, ChevronRight, CheckCircle2, AlertCircle,
  Calendar, Award, Sparkles, ChevronDown, ChevronUp, ArrowLeft
} from 'lucide-react';
import type { DailyCommitment, Product, ProductPerformance, WeeklyCommitmentSummary } from '../../types';

export default function UserCommitmentsPage() {
  const { appUser } = useAuth();
  const navigate = useNavigate();
  const [weekOffset, setWeekOffset] = useState(0); // 0 = this week, -1 = last week
  const [loading, setLoading] = useState(true);
  const [commitments, setCommitments] = useState<DailyCommitment[]>([]);
  const [summary, setSummary] = useState<WeeklyCommitmentSummary | null>(null);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  // For commitment modal
  const [modalOpen, setModalOpen] = useState(false);
  const [todayCommitment, setTodayCommitment] = useState<DailyCommitment | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [mtdData, setMtdData] = useState<ProductPerformance[]>([]);

  const todayStr = getToday();
  const { weekStart, weekEnd, dates, workingDates } = getWeekDates(weekOffset);

  useEffect(() => {
    if (appUser) loadData();
  }, [appUser, weekOffset]);

  async function loadData() {
    if (!appUser) return;
    setLoading(true);
    try {
      // 1. Fetch commitments for this week's dates
      const fetched = await fetchUserWeeklyCommitments(appUser.uid, dates);
      setCommitments(fetched);
      const summ = calcWeeklyCommitmentSummary(fetched, weekStart, weekEnd);
      setSummary(summ);

      // 2. Load today's commitment if in current week
      const todayComm = fetched.find(c => c.date === todayStr) || await fetchDailyCommitment(appUser.uid, todayStr);
      setTodayCommitment(todayComm);

      // 3. Load products & MTD data for commitment modal if needed
      const currentMonth = getCurrentMonth();
      const supervisorId = appUser.supervisorId || '';
      let activeProductIds: string[] = [];
      if (supervisorId) {
        activeProductIds = await fetchSupervisorProducts(supervisorId);
      }
      const allActive = await fetchActiveProducts();
      const filtered = activeProductIds.length > 0
        ? allActive.filter(p => activeProductIds.includes(p.productId))
        : allActive;
      setProducts(filtered);

      const plan = await fetchMonthlyPlan(appUser.uid, currentMonth);
      const sales = await fetchMonthlySales(appUser.uid, currentMonth);
      const mtd = buildMTDPerformance(filtered, plan, sales, filtered.map(p => p.productId));
      setMtdData(mtd);
    } catch (err) {
      console.error('Error loading weekly commitments:', err);
    } finally {
      setLoading(false);
    }
  }

  if (!appUser) return null;
  if (loading) return <LoadingSpinner text="Loading commitment report..." />;

  const todayHoliday = isNonWorkingDay(new Date());
  const canCommitToday = !todayHoliday.isExcluded && !todayCommitment && weekOffset === 0;

  return (
    <div className="dashboard-page" id="user-commitments-page">
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--v-space-2)', marginBottom: 'var(--v-space-2)' }}>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => navigate('/')}
          style={{ padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 4 }}
        >
          <ArrowLeft size={16} /> Back to Dashboard
        </button>
      </div>

      <PageHeader
        title="Weekly Commitments & Fulfillment"
        subtitle="Track your daily morning targets and EOD achievements"
      />

      {/* Week Navigator */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'var(--v-surface)',
        padding: 'var(--v-space-3) var(--v-space-4)',
        borderRadius: 'var(--v-radius-lg)',
        border: '1px solid var(--v-border)',
        marginBottom: 'var(--v-space-4)',
        flexWrap: 'wrap',
        gap: 'var(--v-space-2)'
      }}>
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => setWeekOffset(o => o - 1)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
        >
          <ChevronLeft size={16} /> Previous Week
        </button>

        <div style={{ textAlign: 'center' }}>
          <strong style={{ fontSize: 'var(--v-text-md)', display: 'block' }}>
            {displayDate(weekStart)} – {displayDate(weekEnd)}
          </strong>
          <span style={{ fontSize: 'var(--v-text-xs)', color: 'var(--v-text-tertiary)' }}>
            {weekOffset === 0 ? 'Current Week' : `${Math.abs(weekOffset)} week${Math.abs(weekOffset) > 1 ? 's' : ''} ago`}
          </span>
        </div>

        <button
          className="btn btn-secondary btn-sm"
          onClick={() => setWeekOffset(o => o + 1)}
          disabled={weekOffset >= 0}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
        >
          Next Week <ChevronRight size={16} />
        </button>
      </div>

      {/* Today's Commitment Prompt (if in current week and not entered yet) */}
      {canCommitToday && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.08) 0%, rgba(99, 102, 241, 0.08) 100%)',
          border: '1px solid rgba(37, 99, 235, 0.25)',
          borderRadius: 'var(--v-radius-lg)',
          padding: 'var(--v-space-4)',
          marginBottom: 'var(--v-space-4)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 'var(--v-space-3)'
        }}>
          <div>
            <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--v-primary)' }}>
              <Target size={20} />
              Set Today's Morning Commitment
            </h4>
            <p style={{ margin: '4px 0 0', fontSize: 'var(--v-text-sm)', color: 'var(--v-text-secondary)' }}>
              Select minimum 5 products (inactive MTD prioritised) and declare your daily target.
            </p>
          </div>
          <button
            className="btn btn-primary"
            onClick={() => setModalOpen(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Sparkles size={16} /> Make Commitment Now
          </button>
        </div>
      )}

      {/* Weekly Summary Cards */}
      {summary && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 'var(--v-space-3)',
          marginBottom: 'var(--v-space-4)'
        }}>
          <div className="card" style={{ padding: 'var(--v-space-4)' }}>
            <div style={{ fontSize: 'var(--v-text-xs)', color: 'var(--v-text-tertiary)' }}>Total Committed</div>
            <div style={{ fontSize: 'var(--v-text-xl)', fontWeight: 700, color: 'var(--v-primary)', marginTop: 4 }}>
              ₹{formatIndianNumber(summary.totalCommitted)}
            </div>
            <div style={{ fontSize: 'var(--v-text-xs)', color: 'var(--v-text-tertiary)', marginTop: 2 }}>
              Across {summary.daysCommitted} working day{summary.daysCommitted !== 1 ? 's' : ''}
            </div>
          </div>

          <div className="card" style={{ padding: 'var(--v-space-4)' }}>
            <div style={{ fontSize: 'var(--v-text-xs)', color: 'var(--v-text-tertiary)' }}>Total Achieved (EOD)</div>
            <div style={{
              fontSize: 'var(--v-text-xl)',
              fontWeight: 700,
              color: summary.totalAchieved >= summary.totalCommitted && summary.totalCommitted > 0 ? 'var(--v-green-600)' : 'var(--v-text-primary)',
              marginTop: 4
            }}>
              ₹{formatIndianNumber(summary.totalAchieved)}
            </div>
            <div style={{ fontSize: 'var(--v-text-xs)', color: 'var(--v-text-tertiary)', marginTop: 2 }}>
              Reported in EOD sales
            </div>
          </div>

          <div className="card" style={{ padding: 'var(--v-space-4)' }}>
            <div style={{ fontSize: 'var(--v-text-xs)', color: 'var(--v-text-tertiary)' }}>
              Weekly Consistency Score
            </div>
            <div style={{
              fontSize: 'var(--v-text-xl)',
              fontWeight: 700,
              color: summary.averageFulfillmentPct >= 80 ? 'var(--v-green-600)' : summary.averageFulfillmentPct >= 50 ? 'var(--v-amber-600)' : 'var(--v-text-primary)',
              marginTop: 4
            }}>
              {summary.averageFulfillmentPct}%
            </div>
            <div style={{ fontSize: '11px', color: 'var(--v-text-tertiary)', marginTop: 2 }}>
              Avg daily fulfillment (capped at 100%/day)
            </div>
          </div>

          <div className="card" style={{ padding: 'var(--v-space-4)' }}>
            <div style={{ fontSize: 'var(--v-text-xs)', color: 'var(--v-text-tertiary)' }}>Fulfilled Days</div>
            <div style={{ fontSize: 'var(--v-text-xl)', fontWeight: 700, color: 'var(--v-green-600)', marginTop: 4 }}>
              {commitments.filter(c => c.isFulfilled).length} / {workingDates.length}
            </div>
            <div style={{ fontSize: 'var(--v-text-xs)', color: 'var(--v-text-tertiary)', marginTop: 2 }}>
              Working days target achieved
            </div>
          </div>
        </div>
      )}

      {/* Day by Day Breakdown */}
      <div className="dashboard-section">
        <h3 className="section-title" style={{ marginBottom: 'var(--v-space-3)' }}>
          Daily Breakdown (Mon – Sat)
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--v-space-3)' }}>
          {dates.map(dateStr => {
            const dateObj = new Date(dateStr + 'T12:00:00');
            const holiday = isNonWorkingDay(dateObj);
            const comm = commitments.find(c => c.date === dateStr);
            const isTodayDate = dateStr === todayStr;
            const isExpanded = expandedDay === dateStr;

            // Only committed products (omitting empty products)
            const activeItems = (comm?.items || []).filter(item => item.committedValue > 0);

            return (
              <div
                key={dateStr}
                style={{
                  border: isTodayDate ? '2px solid var(--v-primary)' : '1px solid var(--v-border)',
                  borderRadius: 'var(--v-radius-lg)',
                  background: 'var(--v-surface)',
                  overflow: 'hidden'
                }}
              >
                {/* Header row */}
                <div
                  onClick={() => comm && setExpandedDay(isExpanded ? null : dateStr)}
                  style={{
                    padding: 'var(--v-space-3) var(--v-space-4)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: comm ? 'pointer' : 'default',
                    background: isTodayDate ? 'rgba(37, 99, 235, 0.03)' : 'inherit',
                    flexWrap: 'wrap',
                    gap: 'var(--v-space-2)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--v-space-2)' }}>
                    <Calendar size={18} style={{ color: isTodayDate ? 'var(--v-primary)' : 'var(--v-text-tertiary)' }} />
                    <div>
                      <strong style={{ fontSize: 'var(--v-text-sm)' }}>
                        {displayDate(dateStr)} {isTodayDate && <span style={{ color: 'var(--v-primary)', marginLeft: 4 }}>(Today)</span>}
                      </strong>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--v-space-3)' }}>
                    {holiday.isExcluded ? (
                      <span className="badge badge-warning" style={{ fontSize: '11px' }}>
                        Non-Working Day ({holiday.reason})
                      </span>
                    ) : comm ? (
                      <>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 'var(--v-text-xs)', fontWeight: 600 }}>
                            ₹{formatIndianNumber(Number(comm.totalAchieved || 0))} / ₹{formatIndianNumber(Number(comm.totalCommitted || 0))}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--v-text-secondary)' }}>
                            {activeItems.length} products
                          </div>
                        </div>

                        <span
                          className={`badge ${comm.isFulfilled ? 'badge-success' : comm.eodReported ? 'badge-warning' : 'badge-info'}`}
                          style={{ fontSize: '11px' }}
                        >
                          {comm.isFulfilled ? 'Fulfilled (100%+)' : comm.eodReported ? `${comm.fulfillmentPct}% Achieved` : 'Committed (Pending EOD)'}
                        </span>

                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </>
                    ) : isTodayDate ? (
                      <button
                        className="btn btn-primary btn-xs"
                        onClick={(e) => { e.stopPropagation(); setModalOpen(true); }}
                      >
                        Commit Now
                      </button>
                    ) : dateStr < todayStr ? (
                      <span style={{ fontSize: 'var(--v-text-xs)', color: 'var(--v-text-tertiary)', fontStyle: 'italic' }}>
                        No commitment entered
                      </span>
                    ) : (
                      <span style={{ fontSize: 'var(--v-text-xs)', color: 'var(--v-text-tertiary)' }}>
                        Upcoming
                      </span>
                    )}
                  </div>
                </div>

                {/* Expanded Products Table (strictly committed products only) */}
                {isExpanded && comm && (
                  <div style={{ padding: '0 var(--v-space-4) var(--v-space-4) var(--v-space-4)', borderTop: '1px solid var(--v-border)' }}>
                    <div style={{ margin: 'var(--v-space-2) 0', fontSize: 'var(--v-text-xs)', color: 'var(--v-text-secondary)' }}>
                      Selected Products ({activeItems.length})
                    </div>
                    <div className="table-responsive">
                      <table className="data-table" style={{ width: '100%', fontSize: 'var(--v-text-xs)' }}>
                        <thead>
                          <tr>
                            <th style={{ textAlign: 'left', padding: '6px 8px' }}>Product</th>
                            <th style={{ textAlign: 'right', padding: '6px 8px' }}>Committed Value</th>
                            <th style={{ textAlign: 'right', padding: '6px 8px' }}>EOD Achieved</th>
                            <th style={{ textAlign: 'right', padding: '6px 8px' }}>Fulfillment %</th>
                          </tr>
                        </thead>
                        <tbody>
                          {activeItems.map(item => (
                            <tr key={item.productId}>
                              <td style={{ padding: '6px 8px', fontWeight: 500 }}>{item.productName}</td>
                              <td style={{ textAlign: 'right', padding: '6px 8px' }}>₹{formatIndianNumber(Number(item.committedValue || 0))}</td>
                              <td style={{ textAlign: 'right', padding: '6px 8px' }}>₹{formatIndianNumber(Number(item.achievedValue || 0))}</td>
                              <td style={{
                                textAlign: 'right',
                                padding: '6px 8px',
                                fontWeight: 600,
                                color: (item.fulfillmentPct || 0) >= 100 ? 'var(--v-green-600)' : (item.fulfillmentPct || 0) > 0 ? 'var(--v-amber-600)' : 'var(--v-text-tertiary)'
                              }}>
                                {item.fulfillmentPct || 0}%
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Daily Commitment Modal */}
      <DailyCommitmentModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={(c) => {
          setTodayCommitment(c);
          setModalOpen(false);
          loadData();
        }}
        existingCommitment={todayCommitment}
        products={products}
        mtdData={mtdData}
        userId={appUser.uid}
        userName={appUser.displayName}
        supervisorId={appUser.supervisorId || ''}
        date={todayStr}
      />
    </div>
  );
}

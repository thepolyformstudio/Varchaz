/* ============================================================
   Varchaz — Supervisor Weekly Team Commitments Page
   ============================================================ */

import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { PageHeader, LoadingSpinner } from '../../components/shared';
import {
  getWeekDates, displayDate, isNonWorkingDay, getToday
} from '../../utils/dateUtils';
import { formatIndianNumber } from '../../utils/formatters';
import {
  fetchWeeklyCommitmentsForUsers, calcWeeklyCommitmentSummary
} from '../../services/commitmentService';
import { fetchUsersInHierarchy } from '../../services/userService';
import { generateWhatsAppCommitmentAppreciationUrl } from '../../services/whatsappService';
import { exportToExcel } from '../../services/exportService';
import {
  Target, ChevronLeft, ChevronRight, CheckCircle2, AlertCircle,
  Calendar, Award, Sparkles, ChevronDown, ChevronUp, ArrowLeft,
  FileSpreadsheet, MessageCircle, Users, Search
} from 'lucide-react';
import type { AppUser, DailyCommitment, WeeklyCommitmentSummary } from '../../types';

export default function SupervisorCommitmentsPage() {
  const { appUser } = useAuth();
  const navigate = useNavigate();
  const [weekOffset, setWeekOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [teamUsers, setTeamUsers] = useState<AppUser[]>([]);
  const [teamCommitments, setTeamCommitments] = useState<DailyCommitment[]>([]);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const todayStr = getToday();
  const { weekStart, weekEnd, dates, workingDates } = getWeekDates(weekOffset);

  useEffect(() => {
    if (appUser) loadData();
  }, [appUser, weekOffset]);

  async function loadData() {
    if (!appUser) return;
    setLoading(true);
    try {
      // 1. Fetch team users (recursive hierarchy)
      const users = await fetchUsersInHierarchy(appUser.uid);
      const approvedUsers = users.filter(u => u.status === 'approved');
      setTeamUsers(approvedUsers);

      // 2. Fetch commitments for this week
      const commitments = await fetchWeeklyCommitmentsForUsers(approvedUsers.map(u => u.uid), dates);
      setTeamCommitments(commitments);
    } catch (err) {
      console.error('Error loading team weekly commitments:', err);
    } finally {
      setLoading(false);
    }
  }

  // Calculate per-user weekly summaries
  const userSummaries = useMemo(() => {
    const map = new Map<string, {
      user: AppUser;
      summary: WeeklyCommitmentSummary;
      commitments: DailyCommitment[];
      fulfilledDaysCount: number;
    }>();

    teamUsers.forEach(u => {
      const userComms = teamCommitments.filter(c => c.userId === u.uid);
      const summ = calcWeeklyCommitmentSummary(userComms, weekStart, weekEnd);
      const fulfilled = userComms.filter(c => c.isFulfilled).length;
      map.set(u.uid, {
        user: u,
        summary: summ,
        commitments: userComms,
        fulfilledDaysCount: fulfilled
      });
    });

    return Array.from(map.values());
  }, [teamUsers, teamCommitments, weekStart, weekEnd]);

  // Filtered by search
  const filteredUserSummaries = useMemo(() => {
    if (!searchQuery.trim()) return userSummaries;
    const q = searchQuery.toLowerCase();
    return userSummaries.filter(item =>
      item.user.displayName.toLowerCase().includes(q) ||
      item.user.email.toLowerCase().includes(q)
    );
  }, [userSummaries, searchQuery]);

  // Overall Team Aggregations
  const overallTeamSummary = useMemo(() => {
    let totalCommitted = 0;
    let totalAchieved = 0;
    let sumConsistency = 0;
    let usersWithReports = 0;

    userSummaries.forEach(item => {
      totalCommitted += item.summary.totalCommitted;
      totalAchieved += item.summary.totalAchieved;
      if (item.summary.daysReported > 0) {
        sumConsistency += item.summary.averageFulfillmentPct;
        usersWithReports++;
      }
    });

    const teamAverageConsistency = usersWithReports > 0
      ? Math.round((sumConsistency / usersWithReports) * 10) / 10
      : 0;

    return {
      totalCommitted: Math.round(totalCommitted * 100) / 100,
      totalAchieved: Math.round(totalAchieved * 100) / 100,
      teamAverageConsistency
    };
  }, [userSummaries]);

  // Excel Export
  const handleExportExcel = () => {
    const data = userSummaries.map(item => ({
      'Rep Name': item.user.displayName,
      'Email': item.user.email,
      'Days Committed': `${item.summary.daysCommitted} / ${workingDates.length}`,
      'Days Fulfilled': item.fulfilledDaysCount,
      'Total Committed (₹)': item.summary.totalCommitted,
      'Total Achieved (₹)': item.summary.totalAchieved,
      'Weekly Consistency % (Capped 100%)': `${item.summary.averageFulfillmentPct}%`,
      'Status': item.summary.averageFulfillmentPct >= 80 ? 'Target Master' : item.summary.averageFulfillmentPct >= 50 ? 'Consistent' : 'Developing'
    }));

    exportToExcel({
      format: 'excel',
      data,
      fileName: `Team_Weekly_Commitments_${weekStart}_to_${weekEnd}`,
      title: `Team Weekly Commitments (${weekStart} to ${weekEnd})`,
      columns: [
        { header: 'Rep Name', key: 'Rep Name' },
        { header: 'Email', key: 'Email' },
        { header: 'Days Committed', key: 'Days Committed' },
        { header: 'Days Fulfilled', key: 'Days Fulfilled' },
        { header: 'Total Committed (₹)', key: 'Total Committed (₹)' },
        { header: 'Total Achieved (₹)', key: 'Total Achieved (₹)' },
        { header: 'Weekly Consistency %', key: 'Weekly Consistency % (Capped 100%)' },
        { header: 'Status', key: 'Status' }
      ]
    });
  };

  if (!appUser) return null;
  if (loading) return <LoadingSpinner text="Loading team commitment reports..." />;

  return (
    <div className="dashboard-page" id="supervisor-commitments-page">
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--v-space-2)', marginBottom: 'var(--v-space-2)' }}>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => navigate('/supervisor')}
          style={{ padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 4 }}
        >
          <ArrowLeft size={16} /> Back to Dashboard
        </button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--v-space-3)' }}>
        <PageHeader
          title="Team Weekly Commitments & Consistency"
          subtitle="Consolidated and individual fulfillment tracking across working days"
        />

        <button
          className="btn btn-secondary btn-sm"
          onClick={handleExportExcel}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 'var(--v-space-2)' }}
        >
          <FileSpreadsheet size={16} /> Export to Excel
        </button>
      </div>

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

      {/* Overall Team Summary Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 'var(--v-space-3)',
        marginBottom: 'var(--v-space-4)'
      }}>
        <div className="card" style={{ padding: 'var(--v-space-4)' }}>
          <div style={{ fontSize: 'var(--v-text-xs)', color: 'var(--v-text-tertiary)' }}>Total Team Committed</div>
          <div style={{ fontSize: 'var(--v-text-xl)', fontWeight: 700, color: 'var(--v-primary)', marginTop: 4 }}>
            ₹{formatIndianNumber(overallTeamSummary.totalCommitted)}
          </div>
          <div style={{ fontSize: 'var(--v-text-xs)', color: 'var(--v-text-tertiary)', marginTop: 2 }}>
            Declared across working days
          </div>
        </div>

        <div className="card" style={{ padding: 'var(--v-space-4)' }}>
          <div style={{ fontSize: 'var(--v-text-xs)', color: 'var(--v-text-tertiary)' }}>Total Team Achieved</div>
          <div style={{
            fontSize: 'var(--v-text-xl)',
            fontWeight: 700,
            color: overallTeamSummary.totalAchieved >= overallTeamSummary.totalCommitted && overallTeamSummary.totalCommitted > 0 ? 'var(--v-green-600)' : 'var(--v-text-primary)',
            marginTop: 4
          }}>
            ₹{formatIndianNumber(overallTeamSummary.totalAchieved)}
          </div>
          <div style={{ fontSize: 'var(--v-text-xs)', color: 'var(--v-text-tertiary)', marginTop: 2 }}>
            EOD sales reported
          </div>
        </div>

        <div className="card" style={{ padding: 'var(--v-space-4)' }}>
          <div style={{ fontSize: 'var(--v-text-xs)', color: 'var(--v-text-tertiary)' }}>
            Team Weekly Consistency
          </div>
          <div style={{
            fontSize: 'var(--v-text-xl)',
            fontWeight: 700,
            color: overallTeamSummary.teamAverageConsistency >= 80 ? 'var(--v-green-600)' : overallTeamSummary.teamAverageConsistency >= 50 ? 'var(--v-amber-600)' : 'var(--v-text-primary)',
            marginTop: 4
          }}>
            {overallTeamSummary.teamAverageConsistency}%
          </div>
          <div style={{ fontSize: '11px', color: 'var(--v-text-tertiary)', marginTop: 2 }}>
            Team average (capped at 100%/day)
          </div>
        </div>

        <div className="card" style={{ padding: 'var(--v-space-4)' }}>
          <div style={{ fontSize: 'var(--v-text-xs)', color: 'var(--v-text-tertiary)' }}>Top Performers (≥80%)</div>
          <div style={{ fontSize: 'var(--v-text-xl)', fontWeight: 700, color: 'var(--v-green-600)', marginTop: 4 }}>
            {userSummaries.filter(item => item.summary.averageFulfillmentPct >= 80).length} / {teamUsers.length}
          </div>
          <div style={{ fontSize: 'var(--v-text-xs)', color: 'var(--v-text-tertiary)', marginTop: 2 }}>
            High consistency reps
          </div>
        </div>
      </div>

      {/* Team Leaderboard / Table */}
      <div className="dashboard-section">
        <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--v-space-2)' }}>
          <h3 className="section-title">Team Member Performance Breakdown</h3>
          <div style={{ position: 'relative', width: '220px' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--v-text-tertiary)' }} />
            <input
              type="text"
              placeholder="Search rep..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="form-input"
              style={{ paddingLeft: 28, fontSize: 'var(--v-text-xs)', height: 32 }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--v-space-3)' }}>
          {filteredUserSummaries.map(({ user, summary, commitments: userComms, fulfilledDaysCount }) => {
            const isExpanded = expandedUser === user.uid;
            const waUrl = generateWhatsAppCommitmentAppreciationUrl(
              user.phone,
              user.displayName,
              summary.totalCommitted,
              summary.totalAchieved,
              summary.averageFulfillmentPct
            );

            return (
              <div
                key={user.uid}
                style={{
                  border: '1px solid var(--v-border)',
                  borderRadius: 'var(--v-radius-lg)',
                  background: 'var(--v-surface)',
                  overflow: 'hidden'
                }}
              >
                {/* Summary Row */}
                <div
                  onClick={() => setExpandedUser(isExpanded ? null : user.uid)}
                  style={{
                    padding: 'var(--v-space-3) var(--v-space-4)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    flexWrap: 'wrap',
                    gap: 'var(--v-space-3)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--v-space-3)' }}>
                    <div style={{
                      width: 38,
                      height: 38,
                      borderRadius: '50%',
                      background: 'var(--v-primary)',
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: 'var(--v-text-sm)'
                    }}>
                      {user.displayName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 'var(--v-text-sm)' }}>
                        {user.displayName}
                      </div>
                      <div style={{ fontSize: 'var(--v-text-xs)', color: 'var(--v-text-tertiary)' }}>
                        {user.email} • {summary.daysCommitted} / {workingDates.length} days entered
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--v-space-4)', flexWrap: 'wrap' }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 'var(--v-text-xs)', color: 'var(--v-text-tertiary)' }}>Committed / Achieved</div>
                      <div style={{ fontSize: 'var(--v-text-sm)', fontWeight: 600 }}>
                        ₹{formatIndianNumber(summary.totalAchieved)} / ₹{formatIndianNumber(summary.totalCommitted)}
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 'var(--v-text-xs)', color: 'var(--v-text-tertiary)' }}>Consistency Score</div>
                      <div style={{
                        fontSize: 'var(--v-text-sm)',
                        fontWeight: 700,
                        color: summary.averageFulfillmentPct >= 80 ? 'var(--v-green-600)' : summary.averageFulfillmentPct >= 50 ? 'var(--v-amber-600)' : 'var(--v-text-primary)'
                      }}>
                        {summary.averageFulfillmentPct}%
                      </div>
                    </div>

                    <span className={`badge ${fulfilledDaysCount > 0 ? 'badge-success' : 'badge-info'}`} style={{ fontSize: '11px' }}>
                      {fulfilledDaysCount} day{fulfilledDaysCount !== 1 ? 's' : ''} target met
                    </span>

                    {/* 1-Click WhatsApp Appreciation */}
                    <a
                      href={waUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-xs btn-success"
                      onClick={(e) => e.stopPropagation()}
                      title="Send WhatsApp Appreciation"
                      style={{ padding: '4px 10px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                    >
                      <MessageCircle size={12} /> Appreciate
                    </a>

                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>
                </div>

                {/* Expanded Daily & Product Breakdown for User */}
                {isExpanded && (
                  <div style={{ padding: 'var(--v-space-3) var(--v-space-4)', borderTop: '1px solid var(--v-border)', background: 'var(--v-surface-raised)' }}>
                    <h4 style={{ fontSize: 'var(--v-text-xs)', fontWeight: 600, color: 'var(--v-text-secondary)', marginBottom: 'var(--v-space-2)' }}>
                      Daily Fulfillment for {user.displayName} (Mon – Sat)
                    </h4>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--v-space-2)' }}>
                      {dates.map(dateStr => {
                        const dateObj = new Date(dateStr + 'T12:00:00');
                        const holiday = isNonWorkingDay(dateObj);
                        const comm = userComms.find(c => c.date === dateStr);
                        const activeItems = (comm?.items || []).filter(item => item.committedValue > 0);

                        return (
                          <div
                            key={dateStr}
                            style={{
                              background: 'var(--v-surface)',
                              border: '1px solid var(--v-border)',
                              borderRadius: 'var(--v-radius-md)',
                              padding: 'var(--v-space-2) var(--v-space-3)'
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                              <div>
                                <strong style={{ fontSize: 'var(--v-text-xs)' }}>{displayDate(dateStr)}</strong>
                              </div>

                              <div>
                                {holiday.isExcluded ? (
                                  <span className="badge badge-warning" style={{ fontSize: '10px' }}>
                                    Non-Working Day ({holiday.reason})
                                  </span>
                                ) : comm ? (
                                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ fontSize: 'var(--v-text-xs)' }}>
                                      ₹{formatIndianNumber(Number(comm.totalAchieved || 0))} / ₹{formatIndianNumber(Number(comm.totalCommitted || 0))}
                                    </span>
                                    <span className={`badge ${comm.isFulfilled ? 'badge-success' : comm.eodReported ? 'badge-warning' : 'badge-info'}`} style={{ fontSize: '10px' }}>
                                      {comm.isFulfilled ? 'Fulfilled' : comm.eodReported ? `${comm.fulfillmentPct}%` : 'Pending EOD'}
                                    </span>
                                  </div>
                                ) : (
                                  <span style={{ fontSize: '11px', color: 'var(--v-text-tertiary)', fontStyle: 'italic' }}>
                                    No commitment
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Committed Products Only (omitting empty products) */}
                            {comm && activeItems.length > 0 && (
                              <div style={{ marginTop: 'var(--v-space-2)', borderTop: '1px dashed var(--v-border)', paddingTop: 'var(--v-space-2)' }}>
                                <table className="data-table" style={{ width: '100%', fontSize: '11px' }}>
                                  <thead>
                                    <tr>
                                      <th style={{ textAlign: 'left', padding: '2px 4px' }}>Product</th>
                                      <th style={{ textAlign: 'right', padding: '2px 4px' }}>Committed</th>
                                      <th style={{ textAlign: 'right', padding: '2px 4px' }}>Achieved</th>
                                      <th style={{ textAlign: 'right', padding: '2px 4px' }}>Fulfillment %</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {activeItems.map(item => (
                                      <tr key={item.productId}>
                                        <td style={{ padding: '2px 4px' }}>{item.productName}</td>
                                        <td style={{ textAlign: 'right', padding: '2px 4px' }}>₹{formatIndianNumber(Number(item.committedValue || 0))}</td>
                                        <td style={{ textAlign: 'right', padding: '2px 4px' }}>₹{formatIndianNumber(Number(item.achievedValue || 0))}</td>
                                        <td style={{
                                          textAlign: 'right',
                                          padding: '2px 4px',
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
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {filteredUserSummaries.length === 0 && (
            <div style={{ textAlign: 'center', padding: 'var(--v-space-6)', color: 'var(--v-text-tertiary)' }}>
              No team members found matching your search.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

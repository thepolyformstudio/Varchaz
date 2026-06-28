/* ============================================================
   Varchaz — Reporting Tracker Page
   ============================================================ */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { LoadingSpinner, PageHeader, BackButton } from '../../components/shared';
import { DatePickerRow } from '../../components/dashboard';
import { fetchUsersInHierarchy } from '../../services/userService';
import { fetchDailySales } from '../../services/salesService';
import { getToday, displayDate } from '../../utils/dateUtils';
import { getInitials } from '../../utils/formatters';
import type { AppUser } from '../../types';
import { CheckCircle, AlertCircle } from 'lucide-react';

export default function ReportingTrackerPage() {
  const { supervisorId } = useParams<{ supervisorId?: string }>();
  const { appUser } = useAuth();
  const navigate = useNavigate();
  const [date, setDate] = useState(getToday());
  const [loading, setLoading] = useState(true);
  const [teamUsers, setTeamUsers] = useState<AppUser[]>([]);
  const [submissions, setSubmissions] = useState<Record<string, { submitted: boolean; totalUnits?: number; updatedAt?: any }>>({});

  // Supervisors track their own team; Viewers can specify a supervisorId from URL params
  const targetSupervisorId = supervisorId || appUser?.uid;

  useEffect(() => {
    if (targetSupervisorId) {
      loadTeam();
    }
  }, [targetSupervisorId]);

  useEffect(() => {
    if (teamUsers.length > 0) {
      loadStatuses();
    } else {
      setLoading(false);
    }
  }, [teamUsers, date]);

  async function loadTeam() {
    try {
      const users = await fetchUsersInHierarchy(targetSupervisorId!);
      // Only track active users who have the 'user' role
      const approved = users.filter(u => u.status === 'approved' && u.role === 'user');
      setTeamUsers(approved);
    } catch (err) {
      console.error('Failed to load team users:', err);
    }
  }

  async function loadStatuses() {
    setLoading(true);
    try {
      const statusMap: typeof submissions = {};
      const salesPromises = teamUsers.map(u => fetchDailySales(u.uid, date));
      const salesDocs = await Promise.all(salesPromises);

      teamUsers.forEach((user, i) => {
        const sales = salesDocs[i];
        if (sales) {
          const totalUnits = Object.values(sales.products || {}).reduce((sum, val) => sum + val, 0);
          statusMap[user.uid] = {
            submitted: true,
            totalUnits,
            updatedAt: sales.updatedAt
          };
        } else {
          statusMap[user.uid] = {
            submitted: false
          };
        }
      });

      setSubmissions(statusMap);
    } catch (err) {
      console.error('Failed to load daily reporting statuses:', err);
    } finally {
      setLoading(false);
    }
  }

  function formatSubmitTime(timestamp: any): string {
    if (!timestamp) return 'N/A';
    try {
      const dateObj = typeof timestamp.toDate === 'function' ? timestamp.toDate() : new Date(timestamp);
      return dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (err) {
      console.error(err);
      return 'N/A';
    }
  }

  return (
    <div className="dashboard-page" id="reporting-tracker-page">
      {supervisorId && (
        <BackButton onClick={() => navigate(-1)} label="Back" />
      )}
      <PageHeader
        title="Reporting Tracker"
        subtitle={`Daily sales submission status for team members on ${displayDate(date)}`}
      />

      <div className="filter-bar" style={{ marginBottom: 'var(--v-space-6)' }}>
        <DatePickerRow date={date} onChange={setDate} />
      </div>

      {loading ? (
        <LoadingSpinner text="Checking reporting status..." />
      ) : teamUsers.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 'var(--v-space-8)' }}>
          <p style={{ color: 'var(--v-text-secondary)', margin: 0 }}>No active users under this team hierarchy.</p>
        </div>
      ) : (
        <div className="data-table-wrapper card" style={{ padding: 0 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Teammate</th>
                <th>Reporting Status</th>
                <th>Units Reported</th>
                <th>Submission Time</th>
              </tr>
            </thead>
            <tbody>
              {teamUsers.map(user => {
                const sub = submissions[user.uid];
                return (
                  <tr key={user.uid}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--v-space-3)' }}>
                        <div className="avatar avatar-sm">{getInitials(user.displayName)}</div>
                        <div>
                          <div style={{ fontWeight: 600 }}>{user.displayName}</div>
                          <div style={{ fontSize: 'var(--v-text-xs)', color: 'var(--v-text-secondary)' }}>{user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      {sub?.submitted ? (
                        <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 8px' }}>
                          <CheckCircle size={12} /> Submitted
                        </span>
                      ) : (
                        <span className="badge badge-danger" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 8px' }}>
                          <AlertCircle size={12} /> Pending
                        </span>
                      )}
                    </td>
                    <td>
                      <span style={{ fontWeight: sub?.submitted ? 600 : 400, color: sub?.submitted ? 'var(--v-text-primary)' : 'var(--v-text-tertiary)' }}>
                        {sub?.submitted ? `${sub.totalUnits} Units` : '—'}
                      </span>
                    </td>
                    <td>
                      <span style={{ color: 'var(--v-text-secondary)', fontSize: 'var(--v-text-sm)' }}>
                        {sub?.submitted ? formatSubmitTime(sub.updatedAt) : '—'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

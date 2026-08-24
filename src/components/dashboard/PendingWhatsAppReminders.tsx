/* ============================================================
   Varchaz — Pending Daily Reporting WhatsApp Reminders Component
   ============================================================ */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { getPendingReportingUsersForToday, generateWhatsAppReminderUrl, type PendingUserReporting } from '../../services/whatsappService';
import { updateUserProfile } from '../../services/userService';
import { showToast, LoadingSpinner } from '../shared';
import { MessageSquare, Phone, CheckCircle, AlertTriangle, RefreshCw, Send, Save } from 'lucide-react';

export function PendingWhatsAppReminders() {
  const { appUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [pendingList, setPendingList] = useState<PendingUserReporting[]>([]);
  const [phoneEditMap, setPhoneEditMap] = useState<Record<string, string>>({});
  const [savingUser, setSavingUser] = useState<string | null>(null);

  useEffect(() => {
    loadPendingReps();
  }, [appUser]);

  async function loadPendingReps() {
    setLoading(true);
    try {
      const list = await getPendingReportingUsersForToday(appUser);
      setPendingList(list);
      
      const initialMap: Record<string, string> = {};
      list.forEach(item => {
        initialMap[item.user.uid] = item.user.phone || '';
      });
      setPhoneEditMap(initialMap);
    } catch (err) {
      console.error(err);
      showToast('error', 'Failed to load pending daily report users');
    } finally {
      setLoading(false);
    }
  }

  async function handleSavePhone(uid: string) {
    const newPhone = phoneEditMap[uid];
    setSavingUser(uid);
    try {
      await updateUserProfile(uid, { phone: newPhone });
      showToast('success', 'Phone number updated successfully! ✓');
      loadPendingReps();
    } catch (err) {
      console.error(err);
      showToast('error', 'Failed to update phone number');
    } finally {
      setSavingUser(null);
    }
  }

  if (loading) return <LoadingSpinner text="Checking today's daily reporting status..." />;

  const todayStr = new Date().toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });

  const isSupervisor = appUser?.role === 'supervisor';

  return (
    <div className="card" style={{ marginBottom: '20px' }} id="pending-whatsapp-reminders-card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', marginBottom: '16px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '17px', display: 'flex', alignItems: 'center', gap: '8px', color: '#1e293b' }}>
            <MessageSquare size={20} color="#25D366" />
            5:30 PM WhatsApp Reporting Reminders ({todayStr})
          </h3>
          <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>
            Reps who have not updated their daily business report for today.
          </p>
        </div>

        <button className="btn btn-ghost btn-sm" onClick={loadPendingReps} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <RefreshCw size={14} /> Refresh List
        </button>
      </div>

      {pendingList.length === 0 ? (
        <div style={{ padding: '24px', textAlign: 'center', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', color: '#166534' }}>
          <CheckCircle size={32} style={{ margin: '0 auto 8px auto', display: 'block' }} />
          <strong>Great news! All sales reps have submitted today's daily report.</strong>
        </div>
      ) : (
        <>
          <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <AlertTriangle size={20} color="#d97706" />
            <div style={{ fontSize: '13px', color: '#92400e' }}>
              <strong>{pendingList.length} Sales Rep{pendingList.length > 1 ? 's' : ''} Pending:</strong> Send a WhatsApp reminder to prompt them before the 6:30 PM deadline.
            </div>
          </div>

          <div className="data-table-wrapper" style={{ margin: 0 }}>
            <div className="data-table-scroll">
              <table className="data-table" style={{ fontSize: '13px' }}>
                <thead>
                  <tr>
                    <th className="data-table-sticky-col" style={{ minWidth: 160 }}>Sales Rep Name</th>
                    {!isSupervisor && <th style={{ minWidth: 140 }}>Supervisor</th>}
                    {!isSupervisor && <th style={{ minWidth: 200 }}>WhatsApp Number</th>}
                    <th className="text-right" style={{ minWidth: 180 }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingList.map(item => {
                    const u = item.user;
                    const waUrl = generateWhatsAppReminderUrl(phoneEditMap[u.uid] || u.phone, u.displayName);
                    const isSaving = savingUser === u.uid;

                    return (
                      <tr key={u.uid}>
                        <td className="data-table-sticky-col" style={{ fontWeight: 600, color: 'var(--v-text-primary)' }}>
                          {u.displayName}
                          <div style={{ fontSize: '11px', color: 'var(--v-text-secondary)', fontWeight: 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 160 }}>
                            {u.email}
                          </div>
                        </td>

                        {!isSupervisor && (
                          <td style={{ color: 'var(--v-text-secondary)' }}>
                            {item.supervisorName || 'Unassigned'}
                          </td>
                        )}

                        {!isSupervisor && (
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <Phone size={14} color="#64748b" />
                              <input
                                type="text"
                                className="input-field"
                                style={{ padding: '4px 8px', fontSize: '12px', width: '130px' }}
                                placeholder="e.g. 9876543210"
                                value={phoneEditMap[u.uid] ?? ''}
                                onChange={(e) => setPhoneEditMap({ ...phoneEditMap, [u.uid]: e.target.value })}
                              />
                              <button
                                className="table-action-btn"
                                onClick={() => handleSavePhone(u.uid)}
                                disabled={isSaving}
                                title="Save Phone Number"
                              >
                                <Save size={14} />
                              </button>
                            </div>
                          </td>
                        )}

                        <td className="text-right">
                          <a
                            href={waUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-sm"
                            style={{
                              background: '#25D366',
                              borderColor: '#25D366',
                              color: '#ffffff',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              textDecoration: 'none',
                              fontWeight: 600,
                              whiteSpace: 'nowrap'
                            }}
                          >
                            <Send size={13} /> Send WhatsApp Reminder
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

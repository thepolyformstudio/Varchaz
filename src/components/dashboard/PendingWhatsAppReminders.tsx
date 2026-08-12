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

          <div className="table-responsive">
            <table className="table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', textAlign: 'left' }}>
                  <th style={{ padding: '10px 12px' }}>Sales Rep Name</th>
                  {!isSupervisor && <th style={{ padding: '10px 12px' }}>Supervisor</th>}
                  {!isSupervisor && <th style={{ padding: '10px 12px' }}>WhatsApp Number</th>}
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {pendingList.map(item => {
                  const u = item.user;
                  const waUrl = generateWhatsAppReminderUrl(phoneEditMap[u.uid] || u.phone, u.displayName);
                  const isSaving = savingUser === u.uid;

                  return (
                    <tr key={u.uid} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '10px 12px', fontWeight: 600, color: '#0f172a' }}>
                        {u.displayName}
                        <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 400 }}>{u.email}</div>
                      </td>

                      {!isSupervisor && (
                        <td style={{ padding: '10px 12px', color: '#475569' }}>
                          {item.supervisorName || 'Unassigned'}
                        </td>
                      )}

                      {!isSupervisor && (
                        <td style={{ padding: '10px 12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Phone size={14} color="#64748b" />
                            <input
                              type="text"
                              className="input"
                              style={{ padding: '4px 8px', fontSize: '12px', width: '140px' }}
                              placeholder="e.g. 9876543210"
                              value={phoneEditMap[u.uid] ?? ''}
                              onChange={(e) => setPhoneEditMap({ ...phoneEditMap, [u.uid]: e.target.value })}
                            />
                            <button
                              className="btn btn-ghost btn-xs"
                              onClick={() => handleSavePhone(u.uid)}
                              disabled={isSaving}
                              title="Save Phone Number"
                            >
                              <Save size={14} />
                            </button>
                          </div>
                        </td>
                      )}

                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                        <a
                          href={waUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-success btn-sm"
                          style={{
                            background: '#25D366',
                            borderColor: '#25D366',
                            color: '#ffffff',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            textDecoration: 'none',
                            fontWeight: 600
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
        </>
      )}
    </div>
  );
}

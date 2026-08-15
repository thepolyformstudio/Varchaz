/* Varchaz — Team Management Page */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { LoadingSpinner, PageHeader, EmptyState, showToast, ConfirmDialog } from '../../components/shared';
import { fetchUsersInHierarchy, softDeleteUser, updateUserAutomailerEmail, fetchUser } from '../../services/userService';
import { getInitials, formatStatus, getStatusBadgeClass } from '../../utils/formatters';
import type { AppUser } from '../../types';
import { Users, Eye, UserMinus, Mail, Edit2, Save, X, CheckCircle2 } from 'lucide-react';

export default function TeamManagementPage() {
  const { appUser, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<AppUser | null>(null);

  // Automailer email modal / inline edit state
  const [editingTarget, setEditingTarget] = useState<AppUser | null>(null);
  const [automailerInput, setAutomailerInput] = useState('');
  const [savingEmail, setSavingEmail] = useState(false);

  // Supervisor self automailer email state
  const [supervisorSelfEmail, setSupervisorSelfEmail] = useState('');
  const [editingSelf, setEditingSelf] = useState(false);
  const [selfInput, setSelfInput] = useState('');

  useEffect(() => {
    if (appUser) load();
  }, [appUser]);

  async function load() {
    if (!appUser) return;
    setLoading(true);
    try {
      const data = await fetchUsersInHierarchy(appUser.uid);
      setUsers(data);

      // Reload fresh supervisor profile for self automailer email
      const freshSup = await fetchUser(appUser.uid);
      if (freshSup) {
        setSupervisorSelfEmail(freshSup.automailerEmail || freshSup.email || '');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const handleDisable = async () => {
    if (!deleteTarget || !appUser) return;
    try {
      await softDeleteUser(deleteTarget.uid, appUser.uid);
      showToast('success', `${deleteTarget.displayName} has been disabled`);
      setUsers(prev => prev.map(u => u.uid === deleteTarget.uid ? { ...u, status: 'disabled' as const } : u));
    } catch {
      showToast('error', 'Failed to disable user');
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleSaveAutomailerEmail = async () => {
    if (!editingTarget) return;
    if (automailerInput && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(automailerInput)) {
      showToast('error', 'Please enter a valid email address.');
      return;
    }

    setSavingEmail(true);
    try {
      await updateUserAutomailerEmail(editingTarget.uid, automailerInput);
      showToast('success', `Automailer email updated for ${editingTarget.displayName}`);
      setUsers(prev => prev.map(u => u.uid === editingTarget.uid ? { ...u, automailerEmail: automailerInput } : u));
      setEditingTarget(null);
    } catch (err) {
      console.error(err);
      showToast('error', 'Failed to update automailer email.');
    } finally {
      setSavingEmail(false);
    }
  };

  const handleSaveSupervisorSelfEmail = async () => {
    if (!appUser) return;
    if (selfInput && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(selfInput)) {
      showToast('error', 'Please enter a valid email address.');
      return;
    }

    setSavingEmail(true);
    try {
      await updateUserAutomailerEmail(appUser.uid, selfInput);
      showToast('success', 'Your supervisor automailer email updated successfully!');
      setSupervisorSelfEmail(selfInput);
      setEditingSelf(false);
      refreshUser();
    } catch (err) {
      console.error(err);
      showToast('error', 'Failed to update your automailer email.');
    } finally {
      setSavingEmail(false);
    }
  };

  if (loading) return <LoadingSpinner text="Loading team..." />;

  return (
    <div className="dashboard-page" id="team-management-page">
      <PageHeader title="Team Management" subtitle={`${users.length} member(s) in your team`} />

      {/* Supervisor Self Automailer Email Card */}
      <div style={{
        background: 'var(--v-bg-card, #ffffff)',
        borderRadius: 'var(--v-radius-lg, 12px)',
        padding: '18px 24px',
        marginBottom: '24px',
        border: '1px solid var(--v-border-color, #e2e8f0)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '16px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '10px',
            background: 'rgba(37, 99, 235, 0.1)',
            color: '#2563eb',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Mail size={22} />
          </div>
          <div>
            <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: 'var(--v-text-main, #0f172a)' }}>
              Supervisor Automailer Target Email
            </h4>
            <p style={{ margin: '2px 0 0 0', fontSize: '13px', color: 'var(--v-text-muted, #64748b)' }}>
              Target email ID for receiving consolidated team reports and CC copies of rep reports.
            </p>
          </div>
        </div>

        {editingSelf ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="email"
              className="input-field"
              style={{ padding: '6px 12px', fontSize: '14px', width: '260px' }}
              value={selfInput}
              onChange={e => setSelfInput(e.target.value)}
              placeholder="e.g. supervisor@company.com"
            />
            <button className="btn btn-sm btn-primary" onClick={handleSaveSupervisorSelfEmail} disabled={savingEmail}>
              <Save size={14} style={{ marginRight: '4px' }} /> Save
            </button>
            <button className="btn btn-sm btn-ghost" onClick={() => setEditingSelf(false)}>
              <X size={14} />
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{
              fontWeight: 600,
              fontSize: '14px',
              padding: '4px 12px',
              borderRadius: '6px',
              background: 'var(--v-bg-muted, #f1f5f9)',
              color: '#0f172a'
            }}>
              {supervisorSelfEmail || appUser?.email}
            </span>
            <button className="btn btn-sm btn-outline" onClick={() => { setSelfInput(supervisorSelfEmail || appUser?.email || ''); setEditingSelf(true); }}>
              <Edit2 size={14} style={{ marginRight: '4px' }} /> Edit
            </button>
          </div>
        )}
      </div>

      {users.length === 0 ? (
        <EmptyState icon={<Users size={32} />} title="No team members" text="Users who register and select you as their supervisor will appear here." />
      ) : (
        <div className="data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Login Email</th>
                <th>Automailer Target Email</th>
                <th>Status</th>
                <th className="text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.uid}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--v-space-2)' }}>
                      <div className="avatar avatar-sm">{getInitials(u.displayName)}</div>
                      {u.displayName}
                    </div>
                  </td>
                  <td style={{ color: 'var(--v-text-muted, #64748b)' }}>{u.email}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{
                        fontSize: '13px',
                        fontWeight: u.automailerEmail ? 600 : 400,
                        color: u.automailerEmail ? '#2563eb' : 'var(--v-text-secondary, #475569)'
                      }}>
                        {u.automailerEmail || `${u.email} (default)`}
                      </span>
                      <button
                        className="table-action-btn"
                        style={{ padding: '2px 6px' }}
                        onClick={() => { setEditingTarget(u); setAutomailerInput(u.automailerEmail || u.email); }}
                        title="Edit Automailer Email (Supervisor Only)"
                      >
                        <Edit2 size={13} />
                      </button>
                    </div>
                  </td>
                  <td><span className={`badge ${getStatusBadgeClass(u.status)}`}>{formatStatus(u.status)}</span></td>
                  <td className="text-center">
                    <div className="table-actions" style={{ justifyContent: 'center' }}>
                      <button className="table-action-btn" onClick={() => navigate(`/supervisor/user/${u.uid}`)} title="View performance">
                        <Eye size={16} />
                      </button>
                      {u.status !== 'disabled' && (
                        <button className="table-action-btn danger" onClick={() => setDeleteTarget(u)} title="Disable user">
                          <UserMinus size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit Automailer Email Modal */}
      {editingTarget && (
        <div className="modal-backdrop" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div className="modal-card" style={{
            background: 'var(--v-bg-card, #ffffff)',
            borderRadius: '12px',
            padding: '24px',
            width: '100%',
            maxWidth: '440px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.15)'
          }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 600 }}>
              Edit Automailer Target Email
            </h3>
            <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: 'var(--v-text-muted, #64748b)' }}>
              Set the destination email address for <strong>{editingTarget.displayName}</strong>'s daily performance auto-mailer reports.
            </p>

            <div style={{ marginBottom: '16px' }}>
              <label className="input-label" style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 500 }}>
                Automailer Target Email Address
              </label>
              <input
                type="email"
                className="input-field"
                style={{ width: '100%' }}
                value={automailerInput}
                onChange={e => setAutomailerInput(e.target.value)}
                placeholder="e.g. user@company.com"
              />
              <span style={{ fontSize: '11px', color: 'var(--v-text-muted, #94a3b8)', marginTop: '4px', display: 'block' }}>
                Note: Visible and editable by Supervisor only. Default falls back to login email if blank.
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button className="btn btn-ghost" onClick={() => setEditingTarget(null)} disabled={savingEmail}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleSaveAutomailerEmail} disabled={savingEmail}>
                {savingEmail ? 'Saving...' : 'Save Target Email'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Disable User?"
        message={`This will disable ${deleteTarget?.displayName}'s account. Their data will be retained until the end of the financial year. They won't be able to log in.`}
        confirmLabel="Disable"
        danger
        onConfirm={handleDisable}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

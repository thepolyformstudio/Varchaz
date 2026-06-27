/* Varchaz — Team Management Page */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { LoadingSpinner, PageHeader, EmptyState, showToast, ConfirmDialog } from '../../components/shared';
import { fetchUsersInHierarchy, softDeleteUser } from '../../services/userService';
import { getInitials, formatStatus, getStatusBadgeClass } from '../../utils/formatters';
import type { AppUser } from '../../types';
import { Users, Eye, UserMinus } from 'lucide-react';

export default function TeamManagementPage() {
  const { appUser } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<AppUser | null>(null);

  useEffect(() => { if (appUser) load(); }, [appUser]);

  async function load() {
    if (!appUser) return;
    setLoading(true);
    try {
      const data = await fetchUsersInHierarchy(appUser.uid);
      setUsers(data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
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

  if (loading) return <LoadingSpinner text="Loading team..." />;

  return (
    <div className="dashboard-page" id="team-management-page">
      <PageHeader title="Team Management" subtitle={`${users.length} member(s) in your team`} />
      {users.length === 0 ? (
        <EmptyState icon={<Users size={32} />} title="No team members" text="Users who register and select you as their supervisor will appear here." />
      ) : (
        <div className="data-table-wrapper">
          <table className="data-table">
            <thead><tr><th>Name</th><th>Email</th><th>Status</th><th className="text-center">Actions</th></tr></thead>
            <tbody>
              {users.map(u => (
                <tr key={u.uid}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--v-space-2)' }}>
                      <div className="avatar avatar-sm">{getInitials(u.displayName)}</div>
                      {u.displayName}
                    </div>
                  </td>
                  <td>{u.email}</td>
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

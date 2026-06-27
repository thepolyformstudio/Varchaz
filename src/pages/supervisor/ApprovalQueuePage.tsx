/* Varchaz — Approval Queue Page */
import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { LoadingSpinner, PageHeader, EmptyState, showToast, ConfirmDialog } from '../../components/shared';
import { fetchPendingApprovals, approveUser, rejectUser } from '../../services/approvalService';
import { formatRole } from '../../utils/formatters';
import { timeAgo } from '../../utils/formatters';
import type { Approval } from '../../types';
import { UserCheck, UserX, CheckCircle } from 'lucide-react';

export default function ApprovalQueuePage() {
  const { appUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [processing, setProcessing] = useState<string | null>(null);
  const [rejectConfirm, setRejectConfirm] = useState<Approval | null>(null);

  useEffect(() => { if (appUser) load(); }, [appUser]);

  async function load() {
    if (!appUser) return;
    setLoading(true);
    try {
      const data = await fetchPendingApprovals(appUser.uid);
      setApprovals(data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  const handleApprove = async (approval: Approval) => {
    setProcessing(approval.id!);
    try {
      await approveUser(approval.id!, approval.userId, appUser!.uid);
      showToast('success', `${approval.userName || 'User'} approved`);
      setApprovals(prev => prev.filter(a => a.id !== approval.id));
    } catch {
      showToast('error', 'Failed to approve');
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async () => {
    if (!rejectConfirm) return;
    setProcessing(rejectConfirm.id!);
    try {
      await rejectUser(rejectConfirm.id!, rejectConfirm.userId, appUser!.uid);
      showToast('info', `${rejectConfirm.userName || 'User'} rejected`);
      setApprovals(prev => prev.filter(a => a.id !== rejectConfirm.id));
    } catch {
      showToast('error', 'Failed to reject');
    } finally {
      setProcessing(null);
      setRejectConfirm(null);
    }
  };

  if (loading) return <LoadingSpinner text="Loading approvals..." />;

  return (
    <div className="dashboard-page" id="approval-queue-page">
      <PageHeader title="Pending Approvals" subtitle={`${approvals.length} registration(s) awaiting your approval`} />
      {approvals.length === 0 ? (
        <EmptyState icon={<CheckCircle size={32} />} title="No pending approvals" text="All registrations have been processed." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--v-space-3)' }}>
          {approvals.map(a => (
            <div key={a.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 'var(--v-space-4)', flexWrap: 'wrap' }}>
              <div className="avatar">{(a.userName || 'U')[0].toUpperCase()}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 'var(--v-text-sm)' }}>{a.userName || 'Unknown'}</div>
                <div style={{ fontSize: 'var(--v-text-xs)', color: 'var(--v-text-tertiary)' }}>{a.userEmail}</div>
                <div style={{ marginTop: 4 }}>
                  <span className="badge badge-primary">{formatRole(a.role)}</span>
                  <span style={{ fontSize: 'var(--v-text-xs)', color: 'var(--v-text-tertiary)', marginLeft: 8 }}>
                    {a.requestedAt?.toDate ? timeAgo(a.requestedAt.toDate()) : ''}
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 'var(--v-space-2)' }}>
                <button className="btn btn-success btn-sm" onClick={() => handleApprove(a)} disabled={processing === a.id} id={`approve-${a.id}`}>
                  <UserCheck size={14} /> Approve
                </button>
                <button className="btn btn-danger btn-sm" onClick={() => setRejectConfirm(a)} disabled={processing === a.id}>
                  <UserX size={14} /> Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <ConfirmDialog
        open={!!rejectConfirm}
        title="Reject Registration?"
        message={`Are you sure you want to reject ${rejectConfirm?.userName || 'this user'}? They won't be able to access the app.`}
        confirmLabel="Reject"
        danger
        onConfirm={handleReject}
        onCancel={() => setRejectConfirm(null)}
      />
    </div>
  );
}

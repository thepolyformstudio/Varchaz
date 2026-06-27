/* Varchaz — Approval Pending Page */
import React from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Clock, RefreshCw, LogOut } from 'lucide-react';

export default function ApprovalPendingPage() {
  const { appUser, logout, refreshUser } = useAuth();
  const navigate = useNavigate();

  const handleRefresh = async () => {
    await refreshUser();
    if (appUser?.status === 'approved') {
      navigate('/');
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="pending-page">
      <div className="pending-container">
        <div className="pending-icon">
          <Clock size={36} />
        </div>
        <h1>Almost There!</h1>
        <p>
          Your account is pending approval from your supervisor.
          You'll get full access once your registration is approved.
        </p>
        <div style={{ display: 'flex', gap: 'var(--v-space-3)', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={handleRefresh} id="check-status-btn">
            <RefreshCw size={16} /> Check Status
          </button>
          <button className="btn btn-secondary" onClick={handleLogout}>
            <LogOut size={16} /> Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}

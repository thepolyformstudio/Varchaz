/* Varchaz — Viewer Home Page */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { LoadingSpinner, PageHeader, EmptyState } from '../../components/shared';
import { fetchUser } from '../../services/userService';
import { getInitials } from '../../utils/formatters';
import type { AppUser } from '../../types';
import { Eye } from 'lucide-react';

export default function ViewerHomePage() {
  const { appUser } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [supervisors, setSupervisors] = useState<AppUser[]>([]);

  useEffect(() => { if (appUser) load(); }, [appUser]);

  async function load() {
    if (!appUser) return;
    setLoading(true);
    try {
      const sups: AppUser[] = [];
      for (const sid of appUser.assignedSupervisors || []) {
        const s = await fetchUser(sid);
        if (s) sups.push(s);
      }
      setSupervisors(sups);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  if (loading) return <LoadingSpinner />;

  return (
    <div className="dashboard-page" id="viewer-home">
      <PageHeader title="Viewer Dashboard" subtitle="Select a supervisor to view their team performance" />
      {supervisors.length === 0 ? (
        <EmptyState icon={<Eye size={32} />} title="No supervisors assigned" text="Ask your admin to assign supervisors to your account." />
      ) : (
        <div className="drill-down-list">
          {supervisors.map(s => (
            <a key={s.uid} className="drill-down-item" onClick={() => navigate(`/viewer/supervisor/${s.uid}`)}>
              <div className="avatar">{getInitials(s.displayName)}</div>
              <div className="user-info">
                <div className="user-name">{s.displayName}</div>
                <div className="user-meta">{s.email}</div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

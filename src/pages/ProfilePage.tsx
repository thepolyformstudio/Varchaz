/* Varchaz — Profile Page */
import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { PageHeader, showToast } from '../components/shared';
import { updateUserProfile } from '../services/userService';
import { formatRole, getInitials, formatStatus, getStatusBadgeClass } from '../utils/formatters';
import { Save } from 'lucide-react';
import { requestNotificationPermission, sendNotification } from '../services/notificationService';

export default function ProfilePage() {
  const { appUser, refreshUser } = useAuth();
  const [displayName, setDisplayName] = useState(appUser?.displayName || '');
  const [phone, setPhone] = useState(appUser?.phone || '');
  const [saving, setSaving] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(
    'Notification' in window ? Notification.permission : 'default'
  );

  if (!appUser) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateUserProfile(appUser.uid, { displayName, phone });
      await refreshUser();
      showToast('success', 'Profile updated');
    } catch {
      showToast('error', 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handleRequestPermission = async () => {
    const perm = await requestNotificationPermission();
    setNotificationPermission(perm);
    if (perm === 'granted') {
      sendNotification('Notifications Enabled! 🔔', 'You will now receive daily reporting reminders at 5:45 PM.');
      showToast('success', 'Notifications enabled');
    } else if (perm === 'denied') {
      showToast('error', 'Notification permission blocked in browser settings');
    }
  };

  return (
    <div className="form-page" id="profile-page">
      <PageHeader title="Profile & Settings" />

      <div className="card" style={{ maxWidth: 560, marginBottom: 'var(--v-space-6)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--v-space-4)', marginBottom: 'var(--v-space-6)' }}>
          <div className="avatar avatar-xl">{getInitials(appUser.displayName)}</div>
          <div>
            <div style={{ fontSize: 'var(--v-text-lg)', fontWeight: 600 }}>{appUser.displayName}</div>
            <div style={{ fontSize: 'var(--v-text-sm)', color: 'var(--v-text-secondary)' }}>{appUser.email}</div>
            <div style={{ marginTop: 'var(--v-space-2)', display: 'flex', gap: 'var(--v-space-2)' }}>
              <span className="badge badge-primary">{formatRole(appUser.role)}</span>
              <span className={`badge ${getStatusBadgeClass(appUser.status)}`}>{formatStatus(appUser.status)}</span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--v-space-4)' }}>
          <div className="input-group">
            <label className="input-label" htmlFor="profile-name">Display Name</label>
            <input id="profile-name" type="text" className="input-field" value={displayName} onChange={e => setDisplayName(e.target.value)} />
          </div>
          <div className="input-group">
            <label className="input-label" htmlFor="profile-email">Email</label>
            <input id="profile-email" type="email" className="input-field" value={appUser.email} disabled style={{ opacity: 0.6 }} />
            <span className="input-hint">Email cannot be changed</span>
          </div>
          <div className="input-group">
            <label className="input-label" htmlFor="profile-phone">Phone (optional)</label>
            <input id="profile-phone" type="tel" className="input-field" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+91 9876543210" />
          </div>
          <div className="input-group">
            <label className="input-label">Financial Year</label>
            <input className="input-field" value={appUser.financialYear === 'apr-mar' ? 'April to March' : 'January to December'} disabled style={{ opacity: 0.6 }} />
            <span className="input-hint">Set by your supervisor</span>
          </div>
        </div>

        <div style={{ marginTop: 'var(--v-space-6)', display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving} id="save-profile">
            <Save size={16} /> {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>

        <hr style={{ border: 0, borderTop: '1px solid var(--v-border-primary)', margin: 'var(--v-space-6) 0' }} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--v-space-3)' }}>
          <h3 style={{ fontSize: 'var(--v-text-md)', fontWeight: 600 }}>Web Notifications</h3>
          <p style={{ fontSize: 'var(--v-text-xs)', color: 'var(--v-text-secondary)', margin: 0 }}>
            Receive browser notifications and daily reporting reminders on this device.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--v-space-3)', backgroundColor: 'var(--v-bg-secondary)', borderRadius: 'var(--v-r-md)', border: '1px solid var(--v-border-primary)' }}>
            <div style={{ flex: 1, paddingRight: 'var(--v-space-3)' }}>
              <div style={{ fontSize: 'var(--v-text-sm)', fontWeight: 500 }}>
                {notificationPermission === 'granted' ? '🔔 Notifications Enabled' : notificationPermission === 'denied' ? '🚫 Notifications Blocked' : '📢 Enable Notifications'}
              </div>
              <div style={{ fontSize: '10px', color: 'var(--v-text-tertiary)', marginTop: 4 }}>
                {notificationPermission === 'granted'
                  ? 'You will receive reminders at 5:45 PM (Mon–Sat) if you forget to report sales.'
                  : notificationPermission === 'denied'
                  ? 'Please unblock notifications in your browser address bar settings to receive alerts.'
                  : 'Click to enable local daily reminders and updates.'}
              </div>
            </div>
            {notificationPermission !== 'granted' && (
              <button className="btn btn-secondary btn-sm" onClick={handleRequestPermission}>
                Enable
              </button>
            )}
            {notificationPermission === 'granted' && (
              <span className="badge badge-success" style={{ fontSize: 'var(--v-text-xs)', padding: '4px 8px' }}>Active</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

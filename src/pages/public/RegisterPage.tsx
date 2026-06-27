/* ============================================================
   Varchaz — Register Page
   ============================================================ */

import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { BarChart3, User, Shield } from 'lucide-react';
import { isValidEmail, isValidPassword, isValidName } from '../../utils/validators';
import { fetchAllSupervisors } from '../../services/userService';
import type { AppUser, UserRole } from '../../types';

export default function RegisterPage() {
  const { register, error, clearError } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<UserRole>('user');
  const [supervisorId, setSupervisorId] = useState('');
  const [supervisors, setSupervisors] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchAllSupervisors().then(setSupervisors).catch(() => {});
  }, []);

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!isValidName(displayName)) errs.name = 'Name must be at least 2 characters';
    if (!isValidEmail(email)) errs.email = 'Invalid email address';
    const pwCheck = isValidPassword(password);
    if (!pwCheck.valid) errs.password = pwCheck.message;
    if (role === 'user' && !supervisorId) errs.supervisor = 'Please select a supervisor';
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    if (!validate()) return;
    setLoading(true);
    try {
      await register(email, password, displayName, role, supervisorId || undefined);
      navigate('/pending');
    } catch {
      // error set in context
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-logo">
          <img src="/varchaz-logo-3d.png" alt="Varchaz Logo" style={{ width: 80, height: 80, marginBottom: 'var(--v-space-3)', borderRadius: 'var(--v-radius-lg)', boxShadow: '0 8px 30px rgba(0,0,0,0.15)' }} />
          <h1>Join Varchaz</h1>
          <p>Create your account to start reporting</p>
        </div>

        <div className="auth-card">
          <h2>Create Account</h2>
          <p className="auth-subtitle">Choose your role and fill in your details</p>

          {error && (
            <div className="missing-report-alert" style={{ marginBottom: 'var(--v-space-4)' }}>
              <div className="alert-text"><div className="alert-title">{error}</div></div>
            </div>
          )}

          <form className="auth-form" onSubmit={handleSubmit} id="register-form">
            {/* Role Selection */}
            <div className="input-group">
              <label className="input-label">I am a</label>
              <div className="role-selector">
                <div
                  className={`role-option ${role === 'user' ? 'selected' : ''}`}
                  onClick={() => setRole('user')}
                  id="role-user"
                >
                  <div className="role-option-icon"><User size={20} /></div>
                  <div className="role-option-label">Sales User</div>
                  <div className="role-option-desc">Report daily sales</div>
                </div>
                <div
                  className={`role-option ${role === 'supervisor' ? 'selected' : ''}`}
                  onClick={() => setRole('supervisor')}
                  id="role-supervisor"
                >
                  <div className="role-option-icon"><Shield size={20} /></div>
                  <div className="role-option-label">Supervisor</div>
                  <div className="role-option-desc">Manage a team</div>
                </div>
              </div>
            </div>

            <div className="input-group">
              <label className="input-label" htmlFor="reg-name">Full Name</label>
              <input
                id="reg-name"
                type="text"
                className={`input-field ${fieldErrors.name ? 'error' : ''}`}
                placeholder="Your full name"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                required
              />
              {fieldErrors.name && <span className="input-error">{fieldErrors.name}</span>}
            </div>

            <div className="input-group">
              <label className="input-label" htmlFor="reg-email">Email</label>
              <input
                id="reg-email"
                type="email"
                className={`input-field ${fieldErrors.email ? 'error' : ''}`}
                placeholder="name@company.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
              {fieldErrors.email && <span className="input-error">{fieldErrors.email}</span>}
            </div>

            <div className="input-group">
              <label className="input-label" htmlFor="reg-password">Password</label>
              <input
                id="reg-password"
                type="password"
                className={`input-field ${fieldErrors.password ? 'error' : ''}`}
                placeholder="Min 8 chars, 1 uppercase, 1 number"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="new-password"
              />
              {fieldErrors.password && <span className="input-error">{fieldErrors.password}</span>}
            </div>

            {/* Supervisor Selection */}
            {(role === 'user' || role === 'supervisor') && (
              <div className="input-group">
                <label className="input-label" htmlFor="reg-supervisor">
                  {role === 'user' ? 'Select Supervisor' : 'Parent Supervisor (optional)'}
                </label>
                <select
                  id="reg-supervisor"
                  className={`input-field ${fieldErrors.supervisor ? 'error' : ''}`}
                  value={supervisorId}
                  onChange={e => setSupervisorId(e.target.value)}
                  required={role === 'user'}
                >
                  <option value="">
                    {role === 'user' ? 'Choose your supervisor' : 'None (top-level supervisor)'}
                  </option>
                  {supervisors
                    .filter(s => s.status === 'approved')
                    .map(s => (
                      <option key={s.uid} value={s.uid}>{s.displayName}</option>
                    ))
                  }
                </select>
                {fieldErrors.supervisor && <span className="input-error">{fieldErrors.supervisor}</span>}
                {role === 'user' && (
                  <span className="input-hint">Your account will need supervisor approval</span>
                )}
              </div>
            )}

            <div className="auth-actions">
              <button
                type="submit"
                className="btn btn-primary btn-block"
                disabled={loading}
                id="register-submit"
              >
                {loading ? 'Creating account...' : 'Create Account'}
              </button>
            </div>
          </form>
        </div>

        <div className="auth-footer">
          Already have an account? <Link to="/login">Sign In</Link>
        </div>
      </div>
    </div>
  );
}

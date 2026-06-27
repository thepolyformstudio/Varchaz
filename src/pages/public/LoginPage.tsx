/* ============================================================
   Varchaz — Login Page
   ============================================================ */

import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { BarChart3 } from 'lucide-react';

export default function LoginPage() {
  const { login, error, clearError } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch {
      // error is set in context
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-logo">
          <img src="/varchaz-logo-3d.png" alt="Varchaz Logo" style={{ width: 80, height: 80, marginBottom: 'var(--v-space-3)', borderRadius: 'var(--v-radius-lg)', boxShadow: '0 8px 30px rgba(0,0,0,0.15)' }} />
          <h1>Varchaz</h1>
          <p>Daily Sales Reporting & Performance</p>
        </div>

        <div className="auth-card">
          <h2>Welcome back</h2>
          <p className="auth-subtitle">Sign in to access your dashboard</p>

          {error && (
            <div className="missing-report-alert" style={{ marginBottom: 'var(--v-space-4)' }}>
              <div className="alert-text">
                <div className="alert-title">{error}</div>
              </div>
            </div>
          )}

          <form className="auth-form" onSubmit={handleSubmit} id="login-form">
            <div className="input-group">
              <label className="input-label" htmlFor="login-email">Email</label>
              <input
                id="login-email"
                type="email"
                className="input-field"
                placeholder="name@company.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>

            <div className="input-group">
              <label className="input-label" htmlFor="login-password">Password</label>
              <input
                id="login-password"
                type="password"
                className="input-field"
                placeholder="Enter your password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>

            <div className="auth-links">
              <span />
              <Link to="/forgot-password">Forgot password?</Link>
            </div>

            <div className="auth-actions">
              <button
                type="submit"
                className="btn btn-primary btn-block"
                disabled={loading}
                id="login-submit"
              >
                {loading ? 'Signing in...' : 'Sign In'}
              </button>
            </div>
          </form>
        </div>

        <div className="auth-footer" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--v-space-2)', alignItems: 'center' }}>
          <div>Don't have an account? <Link to="/register">Register</Link></div>
          <div style={{ marginTop: '4px', fontSize: 'var(--v-text-xs)' }}><Link to="/about" style={{ opacity: 0.7 }}>About Varchaz & Support</Link></div>
        </div>
      </div>
    </div>
  );
}

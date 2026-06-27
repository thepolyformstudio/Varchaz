/* Varchaz — Forgot Password Page */
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { BarChart3, Mail } from 'lucide-react';

export default function ForgotPasswordPage() {
  const { resetPassword, error, clearError } = useAuth();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setLoading(true);
    try {
      await resetPassword(email);
      setSent(true);
    } catch {} finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-logo">
          <img src="/varchaz-logo-3d.png" alt="Varchaz Logo" style={{ width: 80, height: 80, marginBottom: 'var(--v-space-3)', borderRadius: 'var(--v-radius-lg)', boxShadow: '0 8px 30px rgba(0,0,0,0.15)' }} />
          <h1>Varchaz</h1>
        </div>
        <div className="auth-card">
          {sent ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: 64, height: 64, margin: '0 auto var(--v-space-4)', background: 'var(--v-success-light)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--v-success)' }}>
                <Mail size={28} />
              </div>
              <h2>Check your email</h2>
              <p className="auth-subtitle">We've sent a password reset link to <strong>{email}</strong></p>
              <Link to="/login" className="btn btn-primary btn-block" style={{ marginTop: 'var(--v-space-4)' }}>Back to Sign In</Link>
            </div>
          ) : (
            <>
              <h2>Reset Password</h2>
              <p className="auth-subtitle">Enter your email to receive a reset link</p>
              {error && (
                <div className="missing-report-alert" style={{ marginBottom: 'var(--v-space-4)' }}>
                  <div className="alert-text"><div className="alert-title">{error}</div></div>
                </div>
              )}
              <form className="auth-form" onSubmit={handleSubmit} id="forgot-password-form">
                <div className="input-group">
                  <label className="input-label" htmlFor="fp-email">Email</label>
                  <input id="fp-email" type="email" className="input-field" placeholder="name@company.com" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" />
                </div>
                <div className="auth-actions">
                  <button type="submit" className="btn btn-primary btn-block" disabled={loading} id="fp-submit">
                    {loading ? 'Sending...' : 'Send Reset Link'}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
        <div className="auth-footer"><Link to="/login">Back to Sign In</Link></div>
      </div>
    </div>
  );
}

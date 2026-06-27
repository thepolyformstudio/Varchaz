/* Varchaz — About Page */
import React from 'react';
import { BarChart3, Target, Users, TrendingUp, Shield } from 'lucide-react';

export default function AboutPage() {
  return (
    <div className="auth-page" style={{ alignItems: 'flex-start', paddingTop: '4rem' }}>
      <div className="auth-container" style={{ maxWidth: 560 }}>
        <div className="auth-logo">
          <img src="/varchaz-logo-3d.png" alt="Varchaz Logo" style={{ width: 80, height: 80, marginBottom: 'var(--v-space-3)', borderRadius: 'var(--v-radius-lg)', boxShadow: '0 8px 30px rgba(0,0,0,0.15)' }} />
          <h1>Varchaz</h1>
          <p>Daily Sales Reporting & Performance Tracking</p>
        </div>

        <div className="auth-card">
          <h2>About Varchaz</h2>
          <p style={{ color: 'var(--v-text-secondary)', fontSize: 'var(--v-text-sm)', lineHeight: 'var(--v-leading-relaxed)', marginBottom: 'var(--v-space-6)' }}>
            Varchaz is a mobile-first daily sales reporting platform designed for sales teams, supervisors, and managers.
            It enables daily reporting against a configurable product list, stores monthly plans and daily achievements,
            and provides real-time visibility into selected-day, month-to-date, and year-to-date performance against plan
            — at both individual and consolidated hierarchy levels.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--v-space-4)' }}>
            {[
              { icon: <Target size={20} />, title: 'Plan vs Achievement', desc: 'Product-wise MTD and YTD performance tracking against monthly targets' },
              { icon: <Users size={20} />, title: 'Team Hierarchy', desc: 'Unlimited nesting of supervisor hierarchies with consolidated rollup reporting' },
              { icon: <TrendingUp size={20} />, title: 'Real-Time Dashboards', desc: 'Selected-day, MTD, and YTD dashboards with drill-down capabilities' },
              { icon: <Shield size={20} />, title: 'Role-Based Access', desc: 'Four roles — User, Supervisor, Viewer, Admin — with granular permissions' },
            ].map((feature, i) => (
              <div key={i} style={{ display: 'flex', gap: 'var(--v-space-3)', alignItems: 'flex-start' }}>
                <div style={{ width: 40, height: 40, borderRadius: 'var(--v-radius-md)', background: 'var(--v-blue-50)', color: 'var(--v-blue-600)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {feature.icon}
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 'var(--v-text-sm)' }}>{feature.title}</div>
                  <div style={{ fontSize: 'var(--v-text-xs)', color: 'var(--v-text-secondary)', marginTop: 2 }}>{feature.desc}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="divider" />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--v-space-3)' }}>
            <h3 style={{ fontSize: 'var(--v-text-sm)', fontWeight: 600, marginBottom: 'var(--v-space-1)' }}>Legal & Compliance</h3>
            
            <details className="card" style={{ padding: 'var(--v-space-3)', background: 'var(--v-bg-secondary)', cursor: 'pointer' }}>
              <summary style={{ fontWeight: 500, fontSize: 'var(--v-text-xs)', userSelect: 'none' }}>Privacy Policy</summary>
              <div style={{ fontSize: 'var(--v-text-xs)', color: 'var(--v-text-secondary)', marginTop: 'var(--v-space-2)', lineHeight: '1.5', cursor: 'default' }} onClick={e => e.stopPropagation()}>
                <p><strong>Varchaz</strong> takes your privacy seriously. All daily sales numbers, targets, and user profiles are stored securely in Google Cloud Firestore.</p>
                <p style={{ marginTop: 4 }}>We do not sell, trade, or share your data with any third parties. Access to sales targets and achievements is strictly restricted based on the supervisor-user hierarchy.</p>
              </div>
            </details>

            <details className="card" style={{ padding: 'var(--v-space-3)', background: 'var(--v-bg-secondary)', cursor: 'pointer' }}>
              <summary style={{ fontWeight: 500, fontSize: 'var(--v-text-xs)', userSelect: 'none' }}>Terms of Service</summary>
              <div style={{ fontSize: 'var(--v-text-xs)', color: 'var(--v-text-secondary)', marginTop: 'var(--v-space-2)', lineHeight: '1.5', cursor: 'default' }} onClick={e => e.stopPropagation()}>
                <p>By creating an account on Varchaz, you agree to report accurate daily sales achievements for your assigned products.</p>
                <p style={{ marginTop: 4 }}>Unauthorized use, collection of private sales data, or attempting to bypass security checks will result in immediate account suspension by the system administrator.</p>
              </div>
            </details>

            <details className="card" style={{ padding: 'var(--v-space-3)', background: 'var(--v-bg-secondary)', cursor: 'pointer' }}>
              <summary style={{ fontWeight: 500, fontSize: 'var(--v-text-xs)', userSelect: 'none' }}>Contact & Support</summary>
              <div style={{ fontSize: 'var(--v-text-xs)', color: 'var(--v-text-secondary)', marginTop: 'var(--v-space-2)', lineHeight: '1.5', cursor: 'default' }} onClick={e => e.stopPropagation()}>
                <p>For support, account reactivation, or hierarchy updates, please contact your administrator:</p>
                <p style={{ marginTop: 4 }}>📧 <strong>thepolyformstudio@gmail.com</strong></p>
              </div>
            </details>
          </div>

          <div className="divider" />

          <div style={{ textAlign: 'center', fontSize: 'var(--v-text-xs)', color: 'var(--v-text-tertiary)' }}>
            <p>Developed with ❤️</p>
            <p style={{ marginTop: 4 }}>Version 1.0.0</p>
          </div>
        </div>
      </div>
    </div>
  );
}

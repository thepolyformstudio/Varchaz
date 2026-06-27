/* ============================================================
   Varchaz — Shared UI Components
   ============================================================ */

import React, { type ReactNode, useState, useEffect } from 'react';
import { X, AlertCircle, CheckCircle, AlertTriangle, Info, Inbox, ArrowLeft, Wifi, WifiOff } from 'lucide-react';

// ─── Loading Spinner ────────────────────────────────────────
export function LoadingSpinner({ size = 'md', text }: { size?: 'sm' | 'md' | 'lg'; text?: string }) {
  const cls = size === 'lg' ? 'spinner spinner-lg' : size === 'sm' ? 'spinner' : 'spinner';
  return (
    <div className="loading-screen" id="loading-spinner">
      <div className={cls} />
      {text && <p>{text}</p>}
    </div>
  );
}

// ─── Empty State ────────────────────────────────────────────
export function EmptyState({
  icon,
  title,
  text,
  action
}: {
  icon?: ReactNode;
  title: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state" id="empty-state">
      <div className="empty-state-icon">
        {icon || <Inbox size={32} />}
      </div>
      <h3 className="empty-state-title">{title}</h3>
      {text && <p className="empty-state-text">{text}</p>}
      {action && <div style={{ marginTop: '1rem' }}>{action}</div>}
    </div>
  );
}

// ─── Error Boundary ─────────────────────────────────────────
interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="empty-state" id="error-boundary">
          <div className="empty-state-icon" style={{ background: 'var(--v-danger-light)', color: 'var(--v-danger)' }}>
            <AlertCircle size={32} />
          </div>
          <h3 className="empty-state-title">Something went wrong</h3>
          <p className="empty-state-text">{this.state.error?.message || 'An unexpected error occurred'}</p>
          <button
            className="btn btn-primary"
            style={{ marginTop: '1rem' }}
            onClick={() => this.setState({ hasError: false })}
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Toast System ───────────────────────────────────────────
type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
}

let toastListeners: ((toasts: ToastItem[]) => void)[] = [];
let toasts: ToastItem[] = [];

function notifyListeners() {
  toastListeners.forEach(fn => fn([...toasts]));
}

export function showToast(type: ToastType, message: string, duration = 4000) {
  const id = `toast-${Date.now()}-${Math.random()}`;
  toasts = [...toasts, { id, type, message }];
  notifyListeners();
  setTimeout(() => {
    toasts = toasts.filter(t => t.id !== id);
    notifyListeners();
  }, duration);
}

export function ToastContainer() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    toastListeners.push(setItems);
    return () => {
      toastListeners = toastListeners.filter(fn => fn !== setItems);
    };
  }, []);

  if (items.length === 0) return null;

  const icons: Record<ToastType, ReactNode> = {
    success: <CheckCircle size={18} color="var(--v-success)" />,
    error: <AlertCircle size={18} color="var(--v-danger)" />,
    warning: <AlertTriangle size={18} color="var(--v-warning)" />,
    info: <Info size={18} color="var(--v-info)" />
  };

  return (
    <div className="toast-container" id="toast-container">
      {items.map(toast => (
        <div key={toast.id} className={`toast toast-${toast.type}`}>
          {icons[toast.type]}
          <span className="toast-message">{toast.message}</span>
          <button
            className="toast-close"
            onClick={() => {
              toasts = toasts.filter(t => t.id !== toast.id);
              notifyListeners();
            }}
          >
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}

// ─── Confirm Dialog ─────────────────────────────────────────
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  onConfirm,
  onCancel
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;

  return (
    <div className="modal-overlay" id="confirm-dialog" onClick={onCancel}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="btn btn-icon btn-ghost" onClick={onCancel}>
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">
          <p style={{ color: 'var(--v-text-secondary)', fontSize: 'var(--v-text-sm)' }}>{message}</p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onCancel}>{cancelLabel}</button>
          <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Badge ──────────────────────────────────────────────────
export function Badge({
  variant = 'primary',
  children
}: {
  variant?: 'primary' | 'success' | 'warning' | 'danger' | 'neutral';
  children: ReactNode;
}) {
  return <span className={`badge badge-${variant}`}>{children}</span>;
}

// ─── Count Badge ────────────────────────────────────────────
export function CountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return <span className="count-badge">{count > 99 ? '99+' : count}</span>;
}

// ─── Back Button ────────────────────────────────────────────
export function BackButton({ onClick, label = 'Back' }: { onClick: () => void; label?: string }) {
  return (
    <button className="page-back-btn" onClick={onClick} id="back-button">
      <ArrowLeft size={16} />
      {label}
    </button>
  );
}

// ─── Offline Banner ─────────────────────────────────────────
export function OfflineBanner() {
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (online) return null;

  return (
    <div className="offline-banner" id="offline-banner">
      <WifiOff size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
      You're offline. Some features may be limited.
    </div>
  );
}

// ─── Page Header ────────────────────────────────────────────
export function PageHeader({
  title,
  subtitle,
  actions
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="dashboard-header" id="page-header">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h1>{title}</h1>
          {subtitle && <p className="subtitle">{subtitle}</p>}
        </div>
        {actions && <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>{actions}</div>}
      </div>
    </div>
  );
}

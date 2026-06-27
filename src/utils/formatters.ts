/* ============================================================
   Varchaz — Formatters
   ============================================================ */

/** Format large numbers with Indian numbering (e.g., 12,34,567) */
export function formatIndianNumber(num: number): string {
  if (num === 0) return '0';
  return num.toLocaleString('en-IN');
}

/** Short format: 1.2K, 12.3L, 1.5Cr */
export function formatCompact(num: number): string {
  if (num >= 10000000) return `${(num / 10000000).toFixed(1)}Cr`;
  if (num >= 100000) return `${(num / 100000).toFixed(1)}L`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}

/** Format percentage */
export function formatPercent(pct: number): string {
  if (pct === 0) return '0%';
  return `${pct.toFixed(1)}%`;
}

/** Get initials from name */
export function getInitials(name: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Capitalize first letter */
export function capitalize(str: string): string {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/** Format role for display */
export function formatRole(role: string): string {
  const map: Record<string, string> = {
    user: 'User',
    supervisor: 'Supervisor',
    viewer: 'Viewer',
    admin: 'Admin'
  };
  return map[role] || capitalize(role);
}

/** Format status for display */
export function formatStatus(status: string): string {
  const map: Record<string, string> = {
    pending: 'Pending',
    approved: 'Approved',
    disabled: 'Disabled',
    rejected: 'Rejected'
  };
  return map[status] || capitalize(status);
}

/** Get status badge class */
export function getStatusBadgeClass(status: string): string {
  switch (status) {
    case 'approved': return 'badge-success';
    case 'pending': return 'badge-warning';
    case 'disabled':
    case 'rejected': return 'badge-danger';
    default: return 'badge-neutral';
  }
}

/** Truncate text */
export function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.substring(0, maxLen) + '…';
}

/** Relative time (e.g., "2 hours ago") */
export function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

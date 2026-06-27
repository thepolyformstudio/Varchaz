/* ============================================================
   Varchaz — TypeScript Type Definitions
   ============================================================ */

// ─── Roles ────────────────────────────────────────────────
export type UserRole = 'user' | 'supervisor' | 'viewer' | 'admin';
export type UserStatus = 'pending' | 'approved' | 'disabled';
export type FinancialYear = 'apr-mar' | 'jan-dec';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';
export type PlanStatus = 'draft' | 'submitted';

// ─── User ─────────────────────────────────────────────────
export interface AppUser {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  status: UserStatus;
  supervisorId: string | null;
  parentSupervisorId: string | null;
  financialYear: FinancialYear;
  assignedSupervisors: string[];
  createdAt: any;
  updatedAt: any;
  disabledAt: any | null;
  disabledBy: string | null;
  profileComplete: boolean;
  phone?: string;
  avatarUrl?: string;
}

// ─── Product ──────────────────────────────────────────────
export interface Product {
  productId: string;
  name: string;
  description: string;
  isActive: boolean;
  createdAt: any;
  updatedAt: any;
  createdBy: string;
  addedDate: any;
}

// ─── Supervisor Products ──────────────────────────────────
export interface SupervisorProducts {
  supervisorId: string;
  activeProductIds: string[];
  updatedAt: any;
}

// ─── Monthly Plan ─────────────────────────────────────────
export interface MonthlyPlan {
  userId: string;
  month: string; // "2026-06"
  products: Record<string, number>; // productId -> planValue
  status: PlanStatus;
  createdAt: any;
  updatedAt: any;
  updatedBy: string;
  lockedAt: any | null;
}

// ─── Daily Sales ──────────────────────────────────────────
export interface DailySales {
  userId: string;
  date: string; // "2026-06-09"
  month: string; // "2026-06"
  products: Record<string, number>; // productId -> salesValue
  supervisorId: string;
  createdAt: any;
  updatedAt: any;
}

// ─── Aggregates ───────────────────────────────────────────
export interface Aggregate {
  supervisorId: string;
  month: string;
  totalPlan: Record<string, number>;
  totalAchievement: Record<string, number>;
  userCount: number;
  lastUpdated: any;
  userBreakdown: Record<string, { plan: Record<string, number>; achievement: Record<string, number> }>;
}

// ─── Approvals ────────────────────────────────────────────
export interface Approval {
  id?: string;
  userId: string;
  supervisorId: string;
  status: ApprovalStatus;
  requestedAt: any;
  processedAt: any | null;
  processedBy: string | null;
  role: UserRole;
  userName?: string;
  userEmail?: string;
}

// ─── Audit Log ────────────────────────────────────────────
export interface AuditLog {
  id?: string;
  action: string;
  performedBy: string;
  performedByName?: string;
  affectedRecord: string;
  affectedUserId: string | null;
  previousValue: any;
  newValue: any;
  timestamp: any;
  metadata: Record<string, any>;
}

// ─── Settings ─────────────────────────────────────────────
export interface AppSettings {
  defaultFinancialYear: FinancialYear;
  planEntryWindowStart: number;
  planEntryWindowEnd: number;
  appName: string;
  updatedAt: any;
}

// ─── Dashboard Types ──────────────────────────────────────
export interface ProductPerformance {
  productId: string;
  productName: string;
  plan: number;
  achievement: number;
  achievementPct: number;
  hasNoPlan: boolean;
}

export interface UserPerformance {
  userId: string;
  userName: string;
  products: ProductPerformance[];
  totalPlan: number;
  totalAchievement: number;
  totalAchievementPct: number;
}

export interface TeamPerformance {
  supervisorId: string;
  supervisorName: string;
  products: ProductPerformance[];
  totalPlan: number;
  totalAchievement: number;
  totalAchievementPct: number;
  userCount: number;
  users: UserPerformance[];
}

export interface InactiveProduct {
  productId: string;
  productName: string;
  userId?: string;
  userName?: string;
  period: 'mtd' | 'ytd';
}

// ─── Navigation ───────────────────────────────────────────
export interface NavItem {
  label: string;
  path: string;
  icon: string;
  roles: UserRole[];
  badge?: number;
}

// ─── Filter State ─────────────────────────────────────────
export interface FilterState {
  date: string;
  dateFrom?: string;
  dateTo?: string;
  supervisorId?: string;
  userId?: string;
  productId?: string;
}

// ─── Export ───────────────────────────────────────────────
export type ExportFormat = 'pdf' | 'excel';
export interface ExportOptions {
  format: ExportFormat;
  title: string;
  data: any[];
  columns: { header: string; key: string }[];
  fileName: string;
}

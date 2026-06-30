/* ============================================================
   Varchaz — Main App with Routing
   ============================================================ */

import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { AppShell } from './components/layout/AppShell';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { LoadingSpinner } from './components/shared';
import { lazyWithRetry } from './utils/lazyWithRetry';

// ─── Lazy-loaded pages ──────────────────────────────────────
// Public
const LoginPage = lazyWithRetry(() => import('./pages/public/LoginPage'));
const RegisterPage = lazyWithRetry(() => import('./pages/public/RegisterPage'));
const ForgotPasswordPage = lazyWithRetry(() => import('./pages/public/ForgotPasswordPage'));
const ApprovalPendingPage = lazyWithRetry(() => import('./pages/public/ApprovalPendingPage'));
const AboutPage = lazyWithRetry(() => import('./pages/public/AboutPage'));

// User
const UserHomePage = lazyWithRetry(() => import('./pages/user/UserHomePage'));
const DailyReportPage = lazyWithRetry(() => import('./pages/user/DailyReportPage'));
const MonthlyPlanPage = lazyWithRetry(() => import('./pages/user/MonthlyPlanPage'));
const DayViewPage = lazyWithRetry(() => import('./pages/user/DayViewPage'));
const MTDPage = lazyWithRetry(() => import('./pages/user/MTDPage'));
const YTDPage = lazyWithRetry(() => import('./pages/user/YTDPage'));
const MTDInactivePage = lazyWithRetry(() => import('./pages/user/MTDInactivePage'));
const YTDInactivePage = lazyWithRetry(() => import('./pages/user/YTDInactivePage'));

// Supervisor
const SupervisorHomePage = lazyWithRetry(() => import('./pages/supervisor/SupervisorHomePage'));
const TeamDayPage = lazyWithRetry(() => import('./pages/supervisor/TeamDayPage'));
const TeamMTDPage = lazyWithRetry(() => import('./pages/supervisor/TeamMTDPage'));
const TeamYTDPage = lazyWithRetry(() => import('./pages/supervisor/TeamYTDPage'));
const UserDrillDownPage = lazyWithRetry(() => import('./pages/supervisor/UserDrillDownPage'));
const ApprovalQueuePage = lazyWithRetry(() => import('./pages/supervisor/ApprovalQueuePage'));
const TeamManagementPage = lazyWithRetry(() => import('./pages/supervisor/TeamManagementPage'));
const ProductSelectionPage = lazyWithRetry(() => import('./pages/supervisor/ProductSelectionPage'));
const PlanOverridePage = lazyWithRetry(() => import('./pages/supervisor/PlanOverridePage'));
const TeamMTDInactivePage = lazyWithRetry(() => import('./pages/supervisor/TeamMTDInactivePage'));
const TeamYTDInactivePage = lazyWithRetry(() => import('./pages/supervisor/TeamYTDInactivePage'));
const ReportingTrackerPage = lazyWithRetry(() => import('./pages/supervisor/ReportingTrackerPage'));

// Viewer
const ViewerHomePage = lazyWithRetry(() => import('./pages/viewer/ViewerHomePage'));
const ViewerSupervisorPage = lazyWithRetry(() => import('./pages/viewer/ViewerSupervisorPage'));

// Admin
const AdminHomePage = lazyWithRetry(() => import('./pages/admin/AdminHomePage'));

// Profile
const ProfilePage = lazyWithRetry(() => import('./pages/ProfilePage'));

// Admin sub-pages (named exports)
import {
  UserMgmtPage,
  SupervisorMgmtPage,
  ViewerMgmtPage,
  ProductMasterPage,
  AuditLogPage,
  SoftDeleteMgmtPage,
  AdminSettingsPage,
  HierarchyMgmtPage,
  PlanCorrectionPage
} from './pages/admin/AdminPages';

function AppRoutes() {
  const { firebaseUser, appUser, loading } = useAuth();

  if (loading) {
    return <LoadingSpinner text="Loading Varchaz..." />;
  }

  // Determine home route based on role
  const getHomeRedirect = () => {
    if (!appUser) return '/login';
    if (appUser.status === 'pending') return '/pending';
    switch (appUser.role) {
      case 'user': return '/';
      case 'supervisor': return '/supervisor';
      case 'viewer': return '/viewer';
      case 'admin': return '/admin';
      default: return '/login';
    }
  };

  return (
    <Suspense fallback={<LoadingSpinner text="Loading page..." />}>
      <Routes>
        {/* ── Public Routes ── */}
        <Route path="/login" element={firebaseUser ? <Navigate to={getHomeRedirect()} /> : <LoginPage />} />
        <Route path="/register" element={firebaseUser ? <Navigate to={getHomeRedirect()} /> : <RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/pending" element={<ApprovalPendingPage />} />
        {!firebaseUser && <Route path="/about" element={<AboutPage />} />}

        {/* ── Authenticated Layout ── */}
        <Route element={
          <ProtectedRoute allowedRoles={['user', 'supervisor', 'viewer', 'admin']}>
            <AppShell />
          </ProtectedRoute>
        }>
          {/* ── Common Authenticated Routes ── */}
          <Route path="/about" element={<AboutPage />} />

          {/* ── User Routes ── */}
          <Route path="/" element={
            <ProtectedRoute allowedRoles={['user']}>
              <UserHomePage />
            </ProtectedRoute>
          } />
          <Route path="/report" element={
            <ProtectedRoute allowedRoles={['user']}>
              <DailyReportPage />
            </ProtectedRoute>
          } />
          <Route path="/plan" element={
            <ProtectedRoute allowedRoles={['user']}>
              <MonthlyPlanPage />
            </ProtectedRoute>
          } />
          <Route path="/day-view" element={
            <ProtectedRoute allowedRoles={['user']}>
              <DayViewPage />
            </ProtectedRoute>
          } />
          <Route path="/mtd" element={
            <ProtectedRoute allowedRoles={['user']}>
              <MTDPage />
            </ProtectedRoute>
          } />
          <Route path="/ytd" element={
            <ProtectedRoute allowedRoles={['user']}>
              <YTDPage />
            </ProtectedRoute>
          } />
          <Route path="/mtd-inactive" element={
            <ProtectedRoute allowedRoles={['user']}>
              <MTDInactivePage />
            </ProtectedRoute>
          } />
          <Route path="/ytd-inactive" element={
            <ProtectedRoute allowedRoles={['user']}>
              <YTDInactivePage />
            </ProtectedRoute>
          } />

          {/* ── Supervisor Routes ── */}
          <Route path="/supervisor" element={
            <ProtectedRoute allowedRoles={['supervisor']}>
              <SupervisorHomePage />
            </ProtectedRoute>
          } />
          <Route path="/supervisor/day" element={
            <ProtectedRoute allowedRoles={['supervisor']}>
              <TeamDayPage />
            </ProtectedRoute>
          } />
          <Route path="/supervisor/mtd" element={
            <ProtectedRoute allowedRoles={['supervisor']}>
              <TeamMTDPage />
            </ProtectedRoute>
          } />
          <Route path="/supervisor/ytd" element={
            <ProtectedRoute allowedRoles={['supervisor']}>
              <TeamYTDPage />
            </ProtectedRoute>
          } />
          <Route path="/supervisor/user/:uid" element={
            <ProtectedRoute allowedRoles={['supervisor', 'viewer', 'admin']}>
              <UserDrillDownPage />
            </ProtectedRoute>
          } />
          <Route path="/supervisor/approvals" element={
            <ProtectedRoute allowedRoles={['supervisor']}>
              <ApprovalQueuePage />
            </ProtectedRoute>
          } />
          <Route path="/supervisor/team" element={
            <ProtectedRoute allowedRoles={['supervisor']}>
              <TeamManagementPage />
            </ProtectedRoute>
          } />
          <Route path="/supervisor/products" element={
            <ProtectedRoute allowedRoles={['supervisor']}>
              <ProductSelectionPage />
            </ProtectedRoute>
          } />
          <Route path="/supervisor/plans" element={
            <ProtectedRoute allowedRoles={['supervisor']}>
              <PlanOverridePage />
            </ProtectedRoute>
          } />
          <Route path="/supervisor/mtd-inactive" element={
            <ProtectedRoute allowedRoles={['supervisor']}>
              <TeamMTDInactivePage />
            </ProtectedRoute>
          } />
          <Route path="/supervisor/ytd-inactive" element={
            <ProtectedRoute allowedRoles={['supervisor']}>
              <TeamYTDInactivePage />
            </ProtectedRoute>
          } />
          <Route path="/supervisor/reporting-tracker" element={
            <ProtectedRoute allowedRoles={['supervisor']}>
              <ReportingTrackerPage />
            </ProtectedRoute>
          } />

          {/* ── Viewer Routes ── */}
          <Route path="/viewer" element={
            <ProtectedRoute allowedRoles={['viewer']}>
              <ViewerHomePage />
            </ProtectedRoute>
          } />
          <Route path="/viewer/supervisor/:supervisorId" element={
            <ProtectedRoute allowedRoles={['viewer']}>
              <ViewerSupervisorPage />
            </ProtectedRoute>
          } />
          <Route path="/viewer/reporting-tracker/:supervisorId" element={
            <ProtectedRoute allowedRoles={['viewer']}>
              <ReportingTrackerPage />
            </ProtectedRoute>
          } />

          {/* ── Admin Routes ── */}
          <Route path="/admin" element={
            <ProtectedRoute allowedRoles={['admin']}>
              <AdminHomePage />
            </ProtectedRoute>
          } />
          <Route path="/admin/users" element={
            <ProtectedRoute allowedRoles={['admin']}>
              <UserMgmtPage />
            </ProtectedRoute>
          } />
          <Route path="/admin/supervisors" element={
            <ProtectedRoute allowedRoles={['admin']}>
              <SupervisorMgmtPage />
            </ProtectedRoute>
          } />
          <Route path="/admin/viewers" element={
            <ProtectedRoute allowedRoles={['admin']}>
              <ViewerMgmtPage />
            </ProtectedRoute>
          } />
          <Route path="/admin/hierarchy" element={
            <ProtectedRoute allowedRoles={['admin']}>
              <HierarchyMgmtPage />
            </ProtectedRoute>
          } />
          <Route path="/admin/products" element={
            <ProtectedRoute allowedRoles={['admin']}>
              <ProductMasterPage />
            </ProtectedRoute>
          } />
          <Route path="/admin/audit" element={
            <ProtectedRoute allowedRoles={['admin']}>
              <AuditLogPage />
            </ProtectedRoute>
          } />
          <Route path="/admin/plans" element={
            <ProtectedRoute allowedRoles={['admin']}>
              <PlanCorrectionPage />
            </ProtectedRoute>
          } />
          <Route path="/admin/disabled" element={
            <ProtectedRoute allowedRoles={['admin']}>
              <SoftDeleteMgmtPage />
            </ProtectedRoute>
          } />
          <Route path="/admin/settings" element={
            <ProtectedRoute allowedRoles={['admin']}>
              <AdminSettingsPage />
            </ProtectedRoute>
          } />

          {/* ── Shared Routes ── */}
          <Route path="/profile" element={<ProfilePage />} />
        </Route>

        {/* ── Catch-all ── */}
        <Route path="*" element={<Navigate to={firebaseUser ? getHomeRedirect() : '/login'} replace />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}

/* ============================================================
   Varchaz — Main App with Routing
   ============================================================ */

import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { AppShell } from './components/layout/AppShell';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { LoadingSpinner } from './components/shared';

// ─── Static Imports of Pages (No Route Splitting for reliability) ───
// Public
import LoginPage from './pages/public/LoginPage';
import RegisterPage from './pages/public/RegisterPage';
import ForgotPasswordPage from './pages/public/ForgotPasswordPage';
import ApprovalPendingPage from './pages/public/ApprovalPendingPage';
import AboutPage from './pages/public/AboutPage';

// User
import UserHomePage from './pages/user/UserHomePage';
import DailyReportPage from './pages/user/DailyReportPage';
import MonthlyPlanPage from './pages/user/MonthlyPlanPage';
import DayViewPage from './pages/user/DayViewPage';
import MTDPage from './pages/user/MTDPage';
import YTDPage from './pages/user/YTDPage';
import MTDInactivePage from './pages/user/MTDInactivePage';
import YTDInactivePage from './pages/user/YTDInactivePage';

// Supervisor
import SupervisorHomePage from './pages/supervisor/SupervisorHomePage';
import TeamDayPage from './pages/supervisor/TeamDayPage';
import TeamMTDPage from './pages/supervisor/TeamMTDPage';
import TeamYTDPage from './pages/supervisor/TeamYTDPage';
import UserDrillDownPage from './pages/supervisor/UserDrillDownPage';
import ApprovalQueuePage from './pages/supervisor/ApprovalQueuePage';
import TeamManagementPage from './pages/supervisor/TeamManagementPage';
import ProductSelectionPage from './pages/supervisor/ProductSelectionPage';
import PlanOverridePage from './pages/supervisor/PlanOverridePage';
import TeamMTDInactivePage from './pages/supervisor/TeamMTDInactivePage';
import TeamYTDInactivePage from './pages/supervisor/TeamYTDInactivePage';
import ReportingTrackerPage from './pages/supervisor/ReportingTrackerPage';

// Viewer
import ViewerHomePage from './pages/viewer/ViewerHomePage';
import ViewerSupervisorPage from './pages/viewer/ViewerSupervisorPage';

// Admin
import AdminHomePage from './pages/admin/AdminHomePage';

// Profile
import ProfilePage from './pages/ProfilePage';

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

/* ============================================================
   Varchaz — Protected Route Component
   ============================================================ */

import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { LoadingSpinner } from '../shared';
import type { UserRole } from '../../types';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
  requireApproval?: boolean;
}

export function ProtectedRoute({
  children,
  allowedRoles,
  requireApproval = true
}: ProtectedRouteProps) {
  const { firebaseUser, appUser, loading } = useAuth();

  if (loading) {
    return <LoadingSpinner text="Loading..." />;
  }

  // Not authenticated
  if (!firebaseUser) {
    return <Navigate to="/login" replace />;
  }

  // No Firestore profile yet
  if (!appUser) {
    return (
      <div className="empty-state" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100dvh' }}>
        <h3 className="empty-state-title">Profile Not Found</h3>
        <p className="empty-state-text" style={{ maxWidth: 400, textAlign: 'center', marginBottom: 'var(--v-space-4)' }}>
          We authenticated your account, but couldn't find your profile in the database.
          Please make sure you have initialized your Cloud Firestore database in the Firebase Console.
        </p>
        <button 
          className="btn btn-secondary" 
          onClick={async () => {
            const { auth } = await import('../../config/firebase');
            await auth.signOut();
            window.location.reload();
          }}
        >
          Sign Out / Register Again
        </button>
      </div>
    );
  }

  // Account disabled
  if (appUser.status === 'disabled') {
    return <Navigate to="/login" replace />;
  }

  // Pending approval
  if (requireApproval && appUser.status === 'pending') {
    return <Navigate to="/pending" replace />;
  }

  // Role check
  if (allowedRoles && !allowedRoles.includes(appUser.role)) {
    // Redirect to appropriate home
    switch (appUser.role) {
      case 'user': return <Navigate to="/" replace />;
      case 'supervisor': return <Navigate to="/supervisor" replace />;
      case 'viewer': return <Navigate to="/viewer" replace />;
      case 'admin': return <Navigate to="/admin" replace />;
      default: return <Navigate to="/login" replace />;
    }
  }

  return <>{children}</>;
}

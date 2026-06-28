/* ============================================================
   Varchaz — App Shell (Layout wrapper)
   ============================================================ */

import React, { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { getInitials, formatRole } from '../../utils/formatters';
import {
  Home, FileText, Calendar, TrendingUp, BarChart3, AlertTriangle,
  Users, CheckSquare, Package, Settings, LogOut, Menu, X,
  Sun, Moon, ChevronLeft, ChevronRight, Eye, Shield, ClipboardList,
  UserCheck, Layers, FileBarChart, Archive, BookOpen, Smartphone
} from 'lucide-react';
import { CountBadge } from '../shared';
import { startDailyReportScheduler } from '../../services/notificationService';

export function AppShell() {
  const { appUser, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallBtn, setShowInstallBtn] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallBtn(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    if (window.matchMedia('(display-mode: standalone)').matches) {
      setShowInstallBtn(false);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  useEffect(() => {
    if (appUser && appUser.role === 'user') {
      const stopScheduler = startDailyReportScheduler(appUser.uid);
      return () => stopScheduler();
    }
  }, [appUser]);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`PWA install outcome: ${outcome}`);
    setDeferredPrompt(null);
    setShowInstallBtn(false);
  };

  if (!appUser) return null;

  const role = appUser.role;

  // Navigation items by role
  const navItems = getNavItems(role);
  const bottomNavItems = getBottomNavItems(role);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="app-shell">
      {/* Sidebar Overlay (mobile) */}
      <div
        className={`sidebar-overlay ${sidebarOpen ? 'visible' : ''}`}
        onClick={() => setSidebarOpen(false)}
      />

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''} ${sidebarCollapsed ? 'collapsed' : ''}`} id="main-sidebar">
        <div 
          className="sidebar-header" 
          onClick={() => {
            const homeRoute = appUser.role === 'admin' ? '/admin' : appUser.role === 'supervisor' ? '/supervisor' : appUser.role === 'viewer' ? '/viewer' : '/';
            navigate(homeRoute);
            setSidebarOpen(false);
          }}
          style={{ cursor: 'pointer' }}
        >
          <img src="/varchaz-logo-3d.png" alt="V" style={{ width: 28, height: 28, borderRadius: 'var(--v-radius-md)' }} />
          <span className="sidebar-brand">Varchaz</span>
          <button
            className="btn btn-icon btn-ghost"
            style={{ marginLeft: 'auto', color: 'var(--v-sidebar-text)', display: sidebarOpen ? 'flex' : 'none' }}
            onClick={(e) => { e.stopPropagation(); setSidebarOpen(false); }}
          >
            <X size={18} />
          </button>
        </div>

        <nav className="sidebar-nav">
          {navItems.map((section, si) => (
            <React.Fragment key={si}>
              {section.label && (
                <div className="sidebar-section-label">{section.label}</div>
              )}
              {section.items.map(item => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.path === '/' || item.path === '/supervisor' || item.path === '/viewer' || item.path === '/admin'}
                  className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                  onClick={() => setSidebarOpen(false)}
                  id={`nav-${item.path.replace(/\//g, '-').replace(/^-/, '')}`}
                >
                  <span className="sidebar-link-icon">{item.icon}</span>
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </React.Fragment>
          ))}
          {showInstallBtn && (
            <div style={{ padding: 'var(--v-space-2) var(--v-space-4)', marginTop: 'var(--v-space-2)' }}>
              <button
                className="btn btn-primary btn-block btn-sm"
                onClick={handleInstallClick}
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  gap: 'var(--v-space-2)',
                  fontSize: 'var(--v-text-xs)',
                  padding: 'var(--v-space-2)',
                  borderRadius: 'var(--v-radius-md)'
                }}
              >
                <Smartphone size={14} />
                <span>Install Varchaz App</span>
              </button>
            </div>
          )}
        </nav>

        <div className="sidebar-footer">
          <button
            className="sidebar-collapse-btn"
            onClick={() => setSidebarCollapsed(c => !c)}
            style={{ display: 'none' }}
          >
            {sidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
            {!sidebarCollapsed && <span>Collapse</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className={`app-main ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        {/* Top Bar */}
        <header className="topbar" id="main-topbar">
          <div className="topbar-left">
            <button
              className="topbar-menu-btn"
              onClick={() => setSidebarOpen(true)}
              id="sidebar-toggle"
            >
              <Menu size={20} />
            </button>
            <span className="topbar-title" style={{ display: 'none' }}>
              {/* Page title goes here dynamically if needed */}
            </span>
          </div>
          <div className="topbar-right">
            {showInstallBtn && (
              <button
                className="topbar-icon-btn"
                onClick={handleInstallClick}
                title="Install Varchaz App"
                style={{ color: 'var(--v-blue-500)' }}
                id="pwa-install-btn"
              >
                <Smartphone size={18} />
              </button>
            )}
            <button
              className="topbar-icon-btn"
              onClick={toggleTheme}
              title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
              id="theme-toggle"
            >
              {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
            </button>

            <div style={{ position: 'relative' }}>
              <button
                className="user-menu-trigger"
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                id="user-menu-trigger"
              >
                <div className="avatar avatar-sm">
                  {getInitials(appUser.displayName)}
                </div>
                <span className="user-menu-name">{appUser.displayName}</span>
              </button>

              {userMenuOpen && (
                <>
                  <div
                    style={{ position: 'fixed', inset: 0, zIndex: 99 }}
                    onClick={() => setUserMenuOpen(false)}
                  />
                  <div className="user-menu-dropdown" id="user-menu-dropdown">
                    <div className="user-menu-header">
                      <div className="name">{appUser.displayName}</div>
                      <div className="email">{appUser.email}</div>
                      <span className={`badge badge-primary role-badge`}>
                        {formatRole(appUser.role)}
                      </span>
                    </div>
                    <button
                      className="user-menu-item"
                      onClick={() => { navigate('/profile'); setUserMenuOpen(false); }}
                    >
                      <Settings size={16} />
                      Profile & Settings
                    </button>
                    <button
                      className="user-menu-item"
                      onClick={() => { navigate('/about'); setUserMenuOpen(false); }}
                    >
                      <BookOpen size={16} />
                      About
                    </button>
                    <div className="user-menu-divider" />
                    <button
                      className="user-menu-item danger"
                      onClick={handleLogout}
                    >
                      <LogOut size={16} />
                      Sign Out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="app-content">
          <Outlet />
        </main>
      </div>

      {/* Bottom Nav (mobile) */}
      <nav className="bottom-nav" id="bottom-nav">
        {bottomNavItems.map(item => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/' || item.path === '/supervisor' || item.path === '/viewer' || item.path === '/admin'}
            className={({ isActive }) => `bottom-nav-item ${isActive ? 'active' : ''}`}
            id={`bnav-${item.path.replace(/\//g, '-').replace(/^-/, '') || 'home'}`}
          >
            <span className="nav-icon">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

// ─── Navigation Configs ─────────────────────────────────────

interface NavSection {
  label?: string;
  items: { label: string; path: string; icon: React.ReactNode }[];
}

function getNavItems(role: string): NavSection[] {
  switch (role) {
    case 'user':
      return [
        {
          label: 'Dashboard',
          items: [
            { label: 'Home', path: '/', icon: <Home size={18} /> },
            { label: 'Daily Report', path: '/report', icon: <FileText size={18} /> },
            { label: 'Monthly Plan', path: '/plan', icon: <Calendar size={18} /> },
          ]
        },
        {
          label: 'Performance',
          items: [
            { label: 'Day View', path: '/day-view', icon: <BarChart3 size={18} /> },
            { label: 'MTD', path: '/mtd', icon: <TrendingUp size={18} /> },
            { label: 'YTD', path: '/ytd', icon: <TrendingUp size={18} /> },
            { label: 'MTD Inactive', path: '/mtd-inactive', icon: <AlertTriangle size={18} /> },
            { label: 'YTD Inactive', path: '/ytd-inactive', icon: <AlertTriangle size={18} /> },
          ]
        },
        {
          items: [
            { label: 'Profile', path: '/profile', icon: <Settings size={18} /> },
            { label: 'About Us', path: '/about', icon: <BookOpen size={18} /> },
          ]
        }
      ];

    case 'supervisor':
      return [
        {
          label: 'Dashboard',
          items: [
            { label: 'Home', path: '/supervisor', icon: <Home size={18} /> },
            { label: 'Day View', path: '/supervisor/day', icon: <BarChart3 size={18} /> },
            { label: 'MTD', path: '/supervisor/mtd', icon: <TrendingUp size={18} /> },
            { label: 'YTD', path: '/supervisor/ytd', icon: <TrendingUp size={18} /> },
          ]
        },
        {
          label: 'Inactivity',
          items: [
            { label: 'MTD Inactive', path: '/supervisor/mtd-inactive', icon: <AlertTriangle size={18} /> },
            { label: 'YTD Inactive', path: '/supervisor/ytd-inactive', icon: <AlertTriangle size={18} /> },
          ]
        },
        {
          label: 'Management',
          items: [
            { label: 'Approvals', path: '/supervisor/approvals', icon: <UserCheck size={18} /> },
            { label: 'Team', path: '/supervisor/team', icon: <Users size={18} /> },
            { label: 'Products', path: '/supervisor/products', icon: <Package size={18} /> },
            { label: 'Plans', path: '/supervisor/plans', icon: <ClipboardList size={18} /> },
            { label: 'Reporting Tracker', path: '/supervisor/reporting-tracker', icon: <CheckSquare size={18} /> },
          ]
        },
        {
          items: [
            { label: 'Profile', path: '/profile', icon: <Settings size={18} /> },
            { label: 'About Us', path: '/about', icon: <BookOpen size={18} /> },
          ]
        }
      ];

    case 'viewer':
      return [
        {
          label: 'Dashboard',
          items: [
            { label: 'Home', path: '/viewer', icon: <Home size={18} /> },
          ]
        },
        {
          items: [
            { label: 'Profile', path: '/profile', icon: <Settings size={18} /> },
            { label: 'About Us', path: '/about', icon: <BookOpen size={18} /> },
          ]
        }
      ];

    case 'admin':
      return [
        {
          label: 'Dashboard',
          items: [
            { label: 'Home', path: '/admin', icon: <Home size={18} /> },
          ]
        },
        {
          label: 'Management',
          items: [
            { label: 'Users', path: '/admin/users', icon: <Users size={18} /> },
            { label: 'Supervisors', path: '/admin/supervisors', icon: <Shield size={18} /> },
            { label: 'Viewers', path: '/admin/viewers', icon: <Eye size={18} /> },
            { label: 'Hierarchy', path: '/admin/hierarchy', icon: <Layers size={18} /> },
            { label: 'Products', path: '/admin/products', icon: <Package size={18} /> },
          ]
        },
        {
          label: 'Tools',
          items: [
            { label: 'Audit Log', path: '/admin/audit', icon: <FileBarChart size={18} /> },
            { label: 'Plan Corrections', path: '/admin/plans', icon: <ClipboardList size={18} /> },
            { label: 'Disabled Accounts', path: '/admin/disabled', icon: <Archive size={18} /> },
            { label: 'Settings', path: '/admin/settings', icon: <Settings size={18} /> },
            { label: 'About Us', path: '/about', icon: <BookOpen size={18} /> },
          ]
        }
      ];

    default:
      return [];
  }
}

function getBottomNavItems(role: string): { label: string; path: string; icon: React.ReactNode }[] {
  switch (role) {
    case 'user':
      return [
        { label: 'Home', path: '/', icon: <Home size={20} /> },
        { label: 'Report', path: '/report', icon: <FileText size={20} /> },
        { label: 'MTD', path: '/mtd', icon: <TrendingUp size={20} /> },
        { label: 'YTD', path: '/ytd', icon: <TrendingUp size={20} /> },
        { label: 'Plan', path: '/plan', icon: <Calendar size={20} /> },
      ];
    case 'supervisor':
      return [
        { label: 'Home', path: '/supervisor', icon: <Home size={20} /> },
        { label: 'Day', path: '/supervisor/day', icon: <BarChart3 size={20} /> },
        { label: 'MTD', path: '/supervisor/mtd', icon: <TrendingUp size={20} /> },
        { label: 'YTD', path: '/supervisor/ytd', icon: <TrendingUp size={20} /> },
        { label: 'Team', path: '/supervisor/team', icon: <Users size={20} /> },
      ];
    case 'viewer':
      return [
        { label: 'Home', path: '/viewer', icon: <Home size={20} /> },
        { label: 'Profile', path: '/profile', icon: <Settings size={20} /> },
      ];
    case 'admin':
      return [
        { label: 'Home', path: '/admin', icon: <Home size={20} /> },
        { label: 'Users', path: '/admin/users', icon: <Users size={20} /> },
        { label: 'Products', path: '/admin/products', icon: <Package size={20} /> },
        { label: 'Audit', path: '/admin/audit', icon: <FileBarChart size={20} /> },
        { label: 'Settings', path: '/admin/settings', icon: <Settings size={20} /> },
      ];
    default:
      return [];
  }
}

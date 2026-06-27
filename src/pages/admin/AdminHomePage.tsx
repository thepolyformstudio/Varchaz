/* Varchaz — Admin Home Page */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { LoadingSpinner, PageHeader } from '../../components/shared';
import { countUsersByStatus, fetchAllSupervisors, fetchAllViewers } from '../../services/userService';
import { fetchAllProducts } from '../../services/productService';
import { Users, Shield, Eye, Package, Layers, FileBarChart, ClipboardList, Archive, Settings } from 'lucide-react';

export default function AdminHomePage() {
  const { appUser } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, pending: 0, approved: 0, disabled: 0, supervisors: 0, viewers: 0, products: 0 });

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const counts = await countUsersByStatus();
      const sups = await fetchAllSupervisors();
      const viewers = await fetchAllViewers();
      const prods = await fetchAllProducts();
      setStats({
        total: counts.total,
        pending: counts.pending || 0,
        approved: counts.approved || 0,
        disabled: counts.disabled || 0,
        supervisors: sups.length,
        viewers: viewers.length,
        products: prods.length
      });
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  if (loading) return <LoadingSpinner />;

  return (
    <div className="admin-page" id="admin-home">
      <PageHeader title="Admin Panel" subtitle="System overview and management" />

      <div className="admin-stats-grid">
        <div className="admin-stat-card">
          <div className="admin-stat-icon blue"><Users size={22} /></div>
          <div><div className="admin-stat-value">{stats.total}</div><div className="admin-stat-label">Total Users</div></div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-icon amber"><Users size={22} /></div>
          <div><div className="admin-stat-value">{stats.pending}</div><div className="admin-stat-label">Pending Approvals</div></div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-icon green"><Shield size={22} /></div>
          <div><div className="admin-stat-value">{stats.supervisors}</div><div className="admin-stat-label">Supervisors</div></div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-icon blue"><Package size={22} /></div>
          <div><div className="admin-stat-value">{stats.products}</div><div className="admin-stat-label">Products</div></div>
        </div>
      </div>

      <div className="admin-nav-grid">
        {[
          { label: 'User Management', desc: 'View and manage all users', icon: <Users size={20} />, path: '/admin/users' },
          { label: 'Supervisors', desc: 'Manage supervisor accounts', icon: <Shield size={20} />, path: '/admin/supervisors' },
          { label: 'Viewers', desc: 'Manage viewer accounts', icon: <Eye size={20} />, path: '/admin/viewers' },
          { label: 'Hierarchy', desc: 'Role and team mappings', icon: <Layers size={20} />, path: '/admin/hierarchy' },
          { label: 'Product Master', desc: 'Global product list', icon: <Package size={20} />, path: '/admin/products' },
          { label: 'Audit Log', desc: 'Activity trail', icon: <FileBarChart size={20} />, path: '/admin/audit' },
          { label: 'Plan Corrections', desc: 'Override any plan', icon: <ClipboardList size={20} />, path: '/admin/plans' },
          { label: 'Disabled Accounts', desc: 'Soft-deleted users', icon: <Archive size={20} />, path: '/admin/disabled' },
          { label: 'Settings', desc: 'System configuration', icon: <Settings size={20} />, path: '/admin/settings' },
        ].map(item => (
          <a key={item.path} className="admin-nav-card" onClick={() => navigate(item.path)}>
            <div className="nav-icon">{item.icon}</div>
            <div><div className="nav-label">{item.label}</div><div className="nav-desc">{item.desc}</div></div>
          </a>
        ))}
      </div>
    </div>
  );
}

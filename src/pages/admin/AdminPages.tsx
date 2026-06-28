/* Varchaz — Admin sub-pages (User/Supervisor/Viewer Mgmt, Products, Audit, Settings, etc.) */
/* These are exported as individual components for routing */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { LoadingSpinner, PageHeader, EmptyState, showToast, ConfirmDialog } from '../../components/shared';
import { fetchAllUsers, fetchAllSupervisors, fetchAllViewers, softDeleteUser, reactivateUser, updateUserProfile } from '../../services/userService';
import { fetchAllProducts, createProduct, updateProduct } from '../../services/productService';
import { fetchAuditLogs } from '../../services/auditService';
import { getInitials, formatRole, formatStatus, getStatusBadgeClass, timeAgo } from '../../utils/formatters';
import type { AppUser, Product, AuditLog } from '../../types';
import { Search, Plus, UserMinus, RotateCcw, Save, X } from 'lucide-react';

// ── User Management ──
export function UserMgmtPage() {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => { load(); }, []);
  async function load() { setLoading(true); try { setUsers(await fetchAllUsers()); } catch {} finally { setLoading(false); } }

  if (loading) return <LoadingSpinner />;
  const filtered = users.filter(u => u.role === 'user' && (u.displayName.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase())));

  return (
    <div className="admin-page" id="user-mgmt-page">
      <PageHeader title="User Management" subtitle={`${filtered.length} user(s)`} />
      <div className="crud-toolbar">
        <div className="crud-search">
          <Search size={16} className="search-icon" />
          <input className="input-field" placeholder="Search users..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 36 }} />
        </div>
      </div>
      <div className="data-table-wrapper">
        <table className="data-table">
          <thead><tr><th>Name</th><th>Email</th><th>Supervisor</th><th>Status</th></tr></thead>
          <tbody>
            {filtered.map(u => (
              <tr key={u.uid}>
                <td><div style={{display:'flex',alignItems:'center',gap:'var(--v-space-2)'}}><div className="avatar avatar-sm">{getInitials(u.displayName)}</div>{u.displayName}</div></td>
                <td>{u.email}</td>
                <td style={{fontSize:'var(--v-text-xs)',color:'var(--v-text-tertiary)'}}>{u.supervisorId || '—'}</td>
                <td><span className={`badge ${getStatusBadgeClass(u.status)}`}>{formatStatus(u.status)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Supervisor Management ──
export function SupervisorMgmtPage() {
  const [loading, setLoading] = useState(true);
  const [supervisors, setSupervisors] = useState<AppUser[]>([]);
  useEffect(() => { load(); }, []);
  async function load() { setLoading(true); try { setSupervisors(await fetchAllSupervisors()); } catch {} finally { setLoading(false); } }
  if (loading) return <LoadingSpinner />;
  return (
    <div className="admin-page" id="supervisor-mgmt-page">
      <PageHeader title="Supervisor Management" subtitle={`${supervisors.length} supervisor(s)`} />
      <div className="data-table-wrapper">
        <table className="data-table">
          <thead><tr><th>Name</th><th>Email</th><th>Parent Supervisor</th><th>Status</th></tr></thead>
          <tbody>
            {supervisors.map(s => (
              <tr key={s.uid}>
                <td><div style={{display:'flex',alignItems:'center',gap:'var(--v-space-2)'}}><div className="avatar avatar-sm">{getInitials(s.displayName)}</div>{s.displayName}</div></td>
                <td>{s.email}</td>
                <td style={{fontSize:'var(--v-text-xs)',color:'var(--v-text-tertiary)'}}>{s.parentSupervisorId || 'Top-level'}</td>
                <td><span className={`badge ${getStatusBadgeClass(s.status)}`}>{formatStatus(s.status)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Viewer Management ──
import { Settings as SettingsIcon } from 'lucide-react';

export function ViewerMgmtPage() {
  const [loading, setLoading] = useState(true);
  const [viewers, setViewers] = useState<AppUser[]>([]);
  const [supervisors, setSupervisors] = useState<AppUser[]>([]);
  const [editingViewer, setEditingViewer] = useState<AppUser | null>(null);
  const [selectedSupervisors, setSelectedSupervisors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const vData = await fetchAllViewers();
      setViewers(vData);
      const sData = await fetchAllSupervisors();
      setSupervisors(sData.filter(s => s.status === 'approved'));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const handleOpenEdit = (viewer: AppUser) => {
    setEditingViewer(viewer);
    setSelectedSupervisors(viewer.assignedSupervisors || []);
  };

  const handleToggleSupervisor = (sid: string) => {
    setSelectedSupervisors(prev =>
      prev.includes(sid) ? prev.filter(id => id !== sid) : [...prev, sid]
    );
  };

  const handleSave = async () => {
    if (!editingViewer) return;
    setSaving(true);
    try {
      await updateUserProfile(editingViewer.uid, { assignedSupervisors: selectedSupervisors });
      showToast('success', 'Assigned supervisors updated');
      setViewers(prev => prev.map(v => v.uid === editingViewer.uid ? { ...v, assignedSupervisors: selectedSupervisors } : v));
      setEditingViewer(null);
    } catch (err) {
      showToast('error', 'Failed to update supervisors');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="admin-page" id="viewer-mgmt-page">
      <PageHeader title="Viewer Management" subtitle={`${viewers.length} viewer(s)`} />
      <div className="data-table-wrapper">
        <table className="data-table">
          <thead><tr><th>Name</th><th>Email</th><th>Assigned Supervisors</th><th>Status</th><th className="text-center">Actions</th></tr></thead>
          <tbody>
            {viewers.map(v => (
              <tr key={v.uid}>
                <td>{v.displayName}</td>
                <td>{v.email}</td>
                <td style={{fontSize:'var(--v-text-xs)'}}>{v.assignedSupervisors?.length || 0} assigned</td>
                <td><span className={`badge ${getStatusBadgeClass(v.status)}`}>{formatStatus(v.status)}</span></td>
                <td className="text-center">
                  <div className="table-actions" style={{ justifyContent: 'center' }}>
                    <button className="table-action-btn" onClick={() => handleOpenEdit(v)} title="Manage supervisors">
                      <SettingsIcon size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editingViewer && (
        <div className="modal-overlay" onClick={() => setEditingViewer(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <h2>Assign Supervisors</h2>
              <button className="btn btn-icon btn-ghost" onClick={() => setEditingViewer(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body" style={{ maxHeight: '320px', overflowY: 'auto' }}>
              <p style={{ color: 'var(--v-text-secondary)', fontSize: 'var(--v-text-sm)', marginBottom: 'var(--v-space-4)' }}>
                Select the supervisor teams that <strong>{editingViewer.displayName}</strong> is permitted to view:
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--v-space-2)' }}>
                {supervisors.map(s => (
                  <label key={s.uid} style={{ display: 'flex', alignItems: 'center', gap: 'var(--v-space-3)', padding: 'var(--v-space-3)', backgroundColor: 'var(--v-bg-secondary)', borderRadius: 'var(--v-radius-md)', border: '1px solid var(--v-border-primary)', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={selectedSupervisors.includes(s.uid)}
                      onChange={() => handleToggleSupervisor(s.uid)}
                      style={{ width: 18, height: 18, cursor: 'pointer' }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 'var(--v-text-sm)', fontWeight: 600 }}>{s.displayName}</div>
                      <div style={{ fontSize: 'var(--v-text-xs)', color: 'var(--v-text-secondary)' }}>{s.email}</div>
                    </div>
                  </label>
                ))}
                {supervisors.length === 0 && (
                  <div style={{ textAlign: 'center', color: 'var(--v-text-tertiary)', padding: 'var(--v-space-4)' }}>
                    No active supervisors found in the system.
                  </div>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setEditingViewer(null)} disabled={saving}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : 'Save Assignments'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Product Master ──
import { Edit2 } from 'lucide-react';

export function ProductMasterPage() {
  const { appUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [adding, setAdding] = useState(false);

  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);
  async function load() { setLoading(true); try { setProducts(await fetchAllProducts()); } catch {} finally { setLoading(false); } }

  const handleAdd = async () => {
    if (!newName.trim() || !appUser) return;
    setAdding(true);
    try {
      await createProduct(newName.trim(), newDesc.trim(), newCategory.trim() || 'General', appUser.uid);
      showToast('success', `Product "${newName}" added`);
      setNewName(''); setNewDesc(''); setNewCategory(''); setShowAdd(false);
      load();
    } catch { showToast('error', 'Failed to add product'); }
    finally { setAdding(false); }
  };

  const startEdit = (p: Product) => {
    setEditingProduct(p);
    setEditName(p.name);
    setEditDesc(p.description || '');
    setEditCategory(p.category || 'General');
  };

  const handleEditSave = async () => {
    if (!editingProduct || !editName.trim()) return;
    setSaving(true);
    try {
      await updateProduct(editingProduct.productId, {
        name: editName.trim(),
        description: editDesc.trim(),
        category: editCategory.trim() || 'General'
      });
      showToast('success', 'Product updated successfully');
      setEditingProduct(null);
      load();
    } catch {
      showToast('error', 'Failed to update product');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (p: Product) => {
    try {
      await updateProduct(p.productId, { isActive: !p.isActive });
      setProducts(prev => prev.map(pr => pr.productId === p.productId ? { ...pr, isActive: !pr.isActive } : pr));
      showToast('success', `${p.name} ${!p.isActive ? 'activated' : 'deactivated'}`);
    } catch { showToast('error', 'Failed to update'); }
  };

  if (loading) return <LoadingSpinner />;
  return (
    <div className="admin-page" id="product-master-page">
      <PageHeader title="Product Master" subtitle={`${products.length} product(s)`} actions={
        <button className="btn btn-primary btn-sm" onClick={() => { setShowAdd(true); setEditingProduct(null); }} id="add-product-btn"><Plus size={16} /> Add Product</button>
      } />

      {showAdd && (
        <div className="card" style={{ marginBottom: 'var(--v-space-4)', maxWidth: 480 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--v-space-3)' }}>
            <h3 style={{ fontSize: 'var(--v-text-md)', fontWeight: 600 }}>New Product</h3>
            <button className="btn btn-ghost btn-icon" onClick={() => setShowAdd(false)}><X size={16} /></button>
          </div>
          <div className="product-form">
            <div className="input-group">
              <label className="input-label">Product Name</label>
              <input className="input-field" value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g., Product A" />
            </div>
            <div className="input-group">
              <label className="input-label">Category</label>
              <input className="input-field" value={newCategory} onChange={e => setNewCategory(e.target.value)} placeholder="e.g., Tablets, Syrups" />
            </div>
            <div className="input-group">
              <label className="input-label">Description</label>
              <input className="input-field" value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Optional description" />
            </div>
            <button className="btn btn-primary" onClick={handleAdd} disabled={adding || !newName.trim()}>
              <Save size={16} /> {adding ? 'Adding...' : 'Add Product'}
            </button>
          </div>
        </div>
      )}

      {editingProduct && (
        <div className="card" style={{ marginBottom: 'var(--v-space-4)', maxWidth: 480 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--v-space-3)' }}>
            <h3 style={{ fontSize: 'var(--v-text-md)', fontWeight: 600 }}>Edit Product</h3>
            <button className="btn btn-ghost btn-icon" onClick={() => setEditingProduct(null)}><X size={16} /></button>
          </div>
          <div className="product-form">
            <div className="input-group">
              <label className="input-label">Product Name</label>
              <input className="input-field" value={editName} onChange={e => setEditName(e.target.value)} placeholder="e.g., Product A" />
            </div>
            <div className="input-group">
              <label className="input-label">Category</label>
              <input className="input-field" value={editCategory} onChange={e => setEditCategory(e.target.value)} placeholder="e.g., Tablets, Syrups" />
            </div>
            <div className="input-group">
              <label className="input-label">Description</label>
              <input className="input-field" value={editDesc} onChange={e => setEditDesc(e.target.value)} placeholder="Optional description" />
            </div>
            <button className="btn btn-primary" onClick={handleEditSave} disabled={saving || !editName.trim()}>
              <Save size={16} /> {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}

      <div className="data-table-wrapper">
        <table className="data-table">
          <thead><tr><th>#</th><th>Product Name</th><th>Category</th><th>Description</th><th>Status</th><th>Toggle</th><th className="text-center">Edit</th></tr></thead>
          <tbody>
            {products.map((p, i) => (
              <tr key={p.productId}>
                <td>{i + 1}</td>
                <td style={{ fontWeight: 500 }}>{p.name}</td>
                <td><span className="badge badge-neutral" style={{ fontSize: 'var(--v-text-xs)' }}>{p.category || 'General'}</span></td>
                <td style={{ color: 'var(--v-text-secondary)', fontSize: 'var(--v-text-xs)' }}>{p.description || '—'}</td>
                <td><span className={`badge ${p.isActive ? 'badge-success' : 'badge-neutral'}`}>{p.isActive ? 'Active' : 'Inactive'}</span></td>
                <td>
                  <div className={`toggle ${p.isActive ? 'active' : ''}`} onClick={() => toggleActive(p)} style={{ display: 'inline-block' }} />
                </td>
                <td className="text-center">
                  <button className="table-action-btn" onClick={() => startEdit(p)} title="Edit name & description">
                    <Edit2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Audit Log ──
export function AuditLogPage() {
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  useEffect(() => { load(); }, []);
  async function load() { setLoading(true); try { setLogs(await fetchAuditLogs(100)); } catch {} finally { setLoading(false); } }
  if (loading) return <LoadingSpinner />;
  return (
    <div className="admin-page" id="audit-log-page">
      <PageHeader title="Audit Log" subtitle="Activity trail for all critical actions" />
      {logs.length === 0 ? <EmptyState title="No audit entries" text="System actions will appear here." /> : (
        <div className="card">
          {logs.map((log, i) => (
            <div key={log.id || i} className="audit-log-entry">
              <div className="audit-dot" />
              <div className="audit-content">
                <div className="audit-action">{log.action}</div>
                <div className="audit-meta">
                  By {log.performedByName || log.performedBy} • {log.timestamp?.toDate ? timeAgo(log.timestamp.toDate()) : ''} • Record: {log.affectedRecord}
                </div>
                {(log.previousValue || log.newValue) && (
                  <div className="audit-values">
                    {log.previousValue && <span className="audit-old">Old: {JSON.stringify(log.previousValue)}</span>}
                    {log.newValue && <span className="audit-new">New: {JSON.stringify(log.newValue)}</span>}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Disabled Accounts ──
export function SoftDeleteMgmtPage() {
  const [loading, setLoading] = useState(true);
  const [disabled, setDisabled] = useState<AppUser[]>([]);
  useEffect(() => { load(); }, []);
  async function load() {
    setLoading(true);
    try {
      const all = await fetchAllUsers();
      setDisabled(all.filter(u => u.status === 'disabled'));
    } catch {} finally { setLoading(false); }
  }
  const handleReactivate = async (uid: string) => {
    try {
      await reactivateUser(uid);
      showToast('success', 'User reactivated');
      setDisabled(prev => prev.filter(u => u.uid !== uid));
    } catch { showToast('error', 'Failed to reactivate'); }
  };
  if (loading) return <LoadingSpinner />;
  return (
    <div className="admin-page" id="disabled-accounts-page">
      <PageHeader title="Disabled Accounts" subtitle={`${disabled.length} disabled account(s)`} />
      {disabled.length === 0 ? <EmptyState title="No disabled accounts" /> : (
        <div className="data-table-wrapper">
          <table className="data-table">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th className="text-center">Actions</th></tr></thead>
            <tbody>
              {disabled.map(u => (
                <tr key={u.uid}>
                  <td>{u.displayName}</td><td>{u.email}</td>
                  <td><span className="badge badge-neutral">{formatRole(u.role)}</span></td>
                  <td className="text-center">
                    <button className="btn btn-success btn-sm" onClick={() => handleReactivate(u.uid)}>
                      <RotateCcw size={14} /> Reactivate
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Admin Settings ──
export function AdminSettingsPage() {
  return (
    <div className="admin-page" id="admin-settings-page">
      <PageHeader title="Settings" subtitle="System configuration" />
      <div className="card" style={{ maxWidth: 560 }}>
        <div className="settings-section">
          <h3 className="settings-section-title">General</h3>
          <div className="settings-row">
            <div><div className="settings-row-label">Default Financial Year</div><div className="settings-row-desc">Applied to new supervisors</div></div>
            <span className="badge badge-primary">April – March</span>
          </div>
          <div className="settings-row">
            <div><div className="settings-row-label">Plan Entry Window</div><div className="settings-row-desc">Days when users can edit plans</div></div>
            <span className="badge badge-primary">1st – 10th</span>
          </div>
        </div>
        <div className="settings-section">
          <h3 className="settings-section-title">App Info</h3>
          <div className="settings-row">
            <div className="settings-row-label">Version</div><span>1.0.0</span>
          </div>
          <div className="settings-row">
            <div className="settings-row-label">Environment</div><span className="badge badge-success">Production</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Hierarchy Page (Placeholder) ──
export function HierarchyMgmtPage() {
  return (
    <div className="admin-page" id="hierarchy-mgmt-page">
      <PageHeader title="Hierarchy Mapping" subtitle="Manage supervisor-user relationships" />
      <EmptyState title="Hierarchy Viewer" text="Hierarchy relationships are managed through user and supervisor management pages. Users select supervisors during registration, and supervisors can reassign users." />
    </div>
  );
}

// ── Plan Correction (reuse PlanOverridePage concept for admin) ──
export function PlanCorrectionPage() {
  return (
    <div className="admin-page" id="plan-correction-page">
      <PageHeader title="Plan Corrections" subtitle="Override any user's plan for any month" />
      <EmptyState title="Admin Plan Override" text="Use the supervisor plan override tool to correct any user's plan. As admin, you have access to all plans regardless of hierarchy." />
    </div>
  );
}

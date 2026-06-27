/* Varchaz — Product Selection Page (supervisor selects active products for team) */
import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { LoadingSpinner, PageHeader, showToast } from '../../components/shared';
import { fetchAllProducts, fetchSupervisorProducts, setSupervisorProducts } from '../../services/productService';
import type { Product } from '../../types';
import { Save, Package } from 'lucide-react';

export default function ProductSelectionPage() {
  const { appUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (appUser) load(); }, [appUser]);

  async function load() {
    if (!appUser) return;
    setLoading(true);
    try {
      const all = await fetchAllProducts();
      setProducts(all.filter(p => p.isActive));
      const active = await fetchSupervisorProducts(appUser.uid);
      setSelected(new Set(active.length > 0 ? active : all.filter(p => p.isActive).map(p => p.productId)));
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    if (!appUser) return;
    setSaving(true);
    try {
      await setSupervisorProducts(appUser.uid, Array.from(selected));
      showToast('success', 'Product selection saved');
    } catch { showToast('error', 'Failed to save'); }
    finally { setSaving(false); }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="form-page" id="product-selection-page">
      <PageHeader title="Active Products for Team" subtitle={`Select which products your team reports against (${selected.size} of ${products.length} selected)`} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--v-space-2)' }}>
        {products.map(p => (
          <label key={p.productId} className="plan-form-row" style={{ cursor: 'pointer', gridTemplateColumns: 'auto 1fr' }}>
            <input type="checkbox" checked={selected.has(p.productId)} onChange={() => toggle(p.productId)} style={{ width: 18, height: 18, accentColor: 'var(--v-blue-600)' }} />
            <span className="product-label">{p.name}</span>
          </label>
        ))}
      </div>
      <div className="form-footer">
        <span style={{ fontSize: 'var(--v-text-sm)', color: 'var(--v-text-secondary)' }}>{selected.size} products selected</span>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving} id="save-product-selection">
          <Save size={16} /> {saving ? 'Saving...' : 'Save Selection'}
        </button>
      </div>
    </div>
  );
}

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

  // Group products by category
  const categoriesMap: Record<string, Product[]> = {};
  products.forEach(p => {
    const cat = p.category || 'General';
    if (!categoriesMap[cat]) {
      categoriesMap[cat] = [];
    }
    categoriesMap[cat].push(p);
  });

  const sortedCategories = Object.keys(categoriesMap).sort();

  if (loading) return <LoadingSpinner />;

  return (
    <div className="form-page" id="product-selection-page">
      <PageHeader title="Active Products for Team" subtitle={`Select which products your team reports against (${selected.size} of ${products.length} selected)`} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--v-space-4)' }}>
        {sortedCategories.map(catName => {
          const catProducts = categoriesMap[catName];
          return (
            <div key={catName} className="category-group-container" style={{ border: '1px solid var(--v-border-primary)', borderRadius: 'var(--v-r-md)', overflow: 'hidden', backgroundColor: 'var(--v-bg-primary)' }}>
              <div className="category-group-header" style={{ backgroundColor: 'var(--v-bg-secondary)', padding: 'var(--v-space-2) var(--v-space-3)', borderBottom: '1px solid var(--v-border-primary)', color: 'var(--v-blue-600)', fontWeight: 600, fontSize: 'var(--v-text-xs)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {catName}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {catProducts.map(p => (
                  <label key={p.productId} className="plan-form-row" style={{ cursor: 'pointer', gridTemplateColumns: 'auto 1fr', borderBottom: '1px solid var(--v-border-primary)', margin: 0, borderRadius: 0, borderTop: 0, paddingLeft: 'var(--v-space-3)' }}>
                    <input type="checkbox" checked={selected.has(p.productId)} onChange={() => toggle(p.productId)} style={{ width: 18, height: 18, accentColor: 'var(--v-blue-600)' }} />
                    <span className="product-label" style={{ fontWeight: 500 }}>{p.name}</span>
                  </label>
                ))}
              </div>
            </div>
          );
        })}
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

/* ============================================================
   Varchaz — Monthly Plan Entry Page
   ============================================================ */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { LoadingSpinner, PageHeader, showToast, ConfirmDialog } from '../../components/shared';
import { getCurrentMonth, getPreviousMonth, displayMonth, isPlanEntryWindowOpen } from '../../utils/dateUtils';
import { parseNumericInput } from '../../utils/validators';
import { formatIndianNumber } from '../../utils/formatters';
import { fetchActiveProducts, fetchSupervisorProducts } from '../../services/productService';
import { fetchMonthlyPlan, saveMonthlyPlan } from '../../services/planService';
import type { Product } from '../../types';
import { Save, Copy, Info } from 'lucide-react';
import { sendNotification } from '../../services/notificationService';

export default function MonthlyPlanPage() {
  const { appUser } = useAuth();
  const [month] = useState(getCurrentMonth());
  const [products, setProducts] = useState<Product[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showRepeat, setShowRepeat] = useState(false);
  const [lastMonthPlan, setLastMonthPlan] = useState<Record<string, number> | null>(null);

  const windowOpen = isPlanEntryWindowOpen();

  useEffect(() => {
    if (appUser) loadData();
  }, [appUser]);

  async function loadData() {
    if (!appUser) return;
    setLoading(true);
    try {
      let prods: Product[];
      if (appUser.supervisorId) {
        const activeIds = await fetchSupervisorProducts(appUser.supervisorId);
        const all = await fetchActiveProducts();
        prods = activeIds.length > 0 ? all.filter(p => activeIds.includes(p.productId)) : all;
      } else {
        prods = await fetchActiveProducts();
      }
      setProducts(prods);

      const existing = await fetchMonthlyPlan(appUser.uid, month);
      const vals: Record<string, string> = {};
      prods.forEach(p => {
        vals[p.productId] = existing?.products?.[p.productId]?.toString() || '';
      });
      setValues(vals);

      // Load last month's plan for repeat feature
      const prevMonth = getPreviousMonth(month);
      const prev = await fetchMonthlyPlan(appUser.uid, prevMonth);
      if (prev) setLastMonthPlan(prev.products);
    } catch (err) {
      showToast('error', 'Failed to load plan data');
    } finally {
      setLoading(false);
    }
  }

  const handleChange = (productId: string, val: string) => {
    if (val === '' || /^\d+$/.test(val)) {
      setValues(v => ({ ...v, [productId]: val }));
    }
  };

  const handleSave = async () => {
    if (!appUser) return;
    setSaving(true);
    try {
      const productsMap: Record<string, number> = {};
      Object.entries(values).forEach(([pid, val]) => {
        productsMap[pid] = parseNumericInput(val);
      });
      await saveMonthlyPlan(appUser.uid, month, productsMap, appUser.uid);
      showToast('success', `Plan saved for ${displayMonth(month)}`);
      sendNotification('Monthly Plan Saved ✓', `Your monthly target plan for ${displayMonth(month)} has been updated.`);
    } catch {
      showToast('error', 'Failed to save plan');
    } finally {
      setSaving(false);
    }
  };

  const handleRepeat = () => {
    if (!lastMonthPlan) return;
    const vals: Record<string, string> = {};
    products.forEach(p => {
      vals[p.productId] = (lastMonthPlan[p.productId] || 0).toString();
    });
    setValues(vals);
    setShowRepeat(false);
    showToast('info', `Copied plan from ${displayMonth(getPreviousMonth(month))}`);
  };

  const total = Object.values(values).reduce((s, v) => s + parseNumericInput(v), 0);

  if (loading) return <LoadingSpinner text="Loading plan..." />;

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

  return (
    <div className="form-page" id="monthly-plan-page">
      <PageHeader
        title={`Monthly Plan — ${displayMonth(month)}`}
        subtitle="Set your monthly targets by product"
        actions={
          lastMonthPlan ? (
            <button className="btn btn-secondary" onClick={() => setShowRepeat(true)} id="repeat-plan-btn">
              <Copy size={16} /> Repeat Last Month
            </button>
          ) : undefined
        }
      />

      {!windowOpen && (
        <div className="plan-window-alert">
          <Info size={18} />
          Plan entry window is closed (1st–10th of each month). Only your supervisor or admin can modify plans after the 10th.
        </div>
      )}

      <div className="plan-form" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--v-space-4)' }}>
        {sortedCategories.map(catName => {
          const catProducts = categoriesMap[catName];
          return (
            <div key={catName} className="category-group-container" style={{ border: '1px solid var(--v-border-primary)', borderRadius: 'var(--v-r-md)', overflow: 'hidden', backgroundColor: 'var(--v-bg-primary)' }}>
              <div className="category-group-header" style={{ backgroundColor: 'var(--v-bg-secondary)', padding: 'var(--v-space-2) var(--v-space-3)', borderBottom: '1px solid var(--v-border-primary)', color: 'var(--v-blue-600)', fontWeight: 600, fontSize: 'var(--v-text-xs)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {catName}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {catProducts.map(product => (
                  <div className={`plan-form-row ${!windowOpen ? 'locked' : ''}`} key={product.productId} style={{ borderBottom: '1px solid var(--v-border-primary)', margin: 0, borderRadius: 0, borderTop: 0 }}>
                    <span className="product-label" style={{ paddingLeft: 'var(--v-space-3)' }}>{product.name}</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      className="plan-input"
                      placeholder="0"
                      value={values[product.productId] || ''}
                      onChange={e => handleChange(product.productId, e.target.value)}
                      disabled={!windowOpen}
                      id={`plan-${product.productId}`}
                    />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="form-footer">
        <div className="form-total">
          Total Plan: <strong>{formatIndianNumber(total)}</strong>
        </div>
        <button
          className="btn btn-primary"
          onClick={handleSave}
          disabled={saving || !windowOpen}
          id="save-plan"
        >
          <Save size={16} />
          {saving ? 'Saving...' : 'Save Plan'}
        </button>
      </div>

      {/* Repeat Plan Dialog */}
      <ConfirmDialog
        open={showRepeat}
        title="Repeat Last Month's Plan?"
        message={`This will copy your ${displayMonth(getPreviousMonth(month))} plan values into ${displayMonth(month)}. You can still edit individual values before saving.`}
        confirmLabel="Copy Plan"
        onConfirm={handleRepeat}
        onCancel={() => setShowRepeat(false)}
      />
    </div>
  );
}

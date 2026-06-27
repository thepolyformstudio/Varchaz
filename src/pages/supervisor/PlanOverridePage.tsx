/* Varchaz — Plan Override Page (supervisor edits user plans) */
import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { LoadingSpinner, PageHeader, showToast } from '../../components/shared';
import { getCurrentMonth, displayMonth } from '../../utils/dateUtils';
import { parseNumericInput } from '../../utils/validators';
import { formatIndianNumber, getInitials } from '../../utils/formatters';
import { fetchActiveProducts, fetchSupervisorProducts } from '../../services/productService';
import { fetchUsersInHierarchy } from '../../services/userService';
import { fetchMonthlyPlan, saveMonthlyPlan } from '../../services/planService';
import type { AppUser, Product } from '../../types';
import { Save, ChevronDown, ChevronRight } from 'lucide-react';

export default function PlanOverridePage() {
  const { appUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, Record<string, string>>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const month = getCurrentMonth();

  useEffect(() => { if (appUser) load(); }, [appUser]);

  async function load() {
    if (!appUser) return;
    setLoading(true);
    try {
      const teamUsers = (await fetchUsersInHierarchy(appUser.uid)).filter(u => u.status === 'approved');
      setUsers(teamUsers);
      const ids = await fetchSupervisorProducts(appUser.uid);
      const all = await fetchActiveProducts();
      const prods = ids.length > 0 ? all.filter(p => ids.includes(p.productId)) : all;
      setProducts(prods);

      const vals: Record<string, Record<string, string>> = {};
      for (const u of teamUsers) {
        const plan = await fetchMonthlyPlan(u.uid, month);
        vals[u.uid] = {};
        prods.forEach(p => { vals[u.uid][p.productId] = plan?.products?.[p.productId]?.toString() || ''; });
      }
      setValues(vals);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  const handleChange = (uid: string, pid: string, val: string) => {
    if (val === '' || /^\d+$/.test(val)) {
      setValues(v => ({ ...v, [uid]: { ...v[uid], [pid]: val } }));
    }
  };

  const handleSave = async (uid: string) => {
    if (!appUser) return;
    setSaving(uid);
    try {
      const prodMap: Record<string, number> = {};
      Object.entries(values[uid] || {}).forEach(([pid, val]) => { prodMap[pid] = parseNumericInput(val); });
      await saveMonthlyPlan(uid, month, prodMap, appUser.uid);
      showToast('success', 'Plan updated');
    } catch { showToast('error', 'Failed to update plan'); }
    finally { setSaving(null); }
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

  if (loading) return <LoadingSpinner text="Loading plans..." />;

  return (
    <div className="form-page" id="plan-override-page">
      <PageHeader title="Plan Override" subtitle={`Edit user plans for ${displayMonth(month)}`} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--v-space-3)' }}>
        {users.map(u => (
          <div key={u.uid} className="card" style={{ padding: 0 }}>
            <div
              style={{ display: 'flex', alignItems: 'center', gap: 'var(--v-space-3)', padding: 'var(--v-space-4)', cursor: 'pointer' }}
              onClick={() => setExpandedUser(expandedUser === u.uid ? null : u.uid)}
            >
              <div className="avatar avatar-sm">{getInitials(u.displayName)}</div>
              <span style={{ flex: 1, fontWeight: 500, fontSize: 'var(--v-text-sm)' }}>{u.displayName}</span>
              {expandedUser === u.uid ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </div>
            {expandedUser === u.uid && (
              <div style={{ padding: 'var(--v-space-4)', borderTop: '1px solid var(--v-border-primary)' }}>
                <div className="plan-form" style={{ marginTop: 0, display: 'flex', flexDirection: 'column', gap: 'var(--v-space-3)' }}>
                  {sortedCategories.map(catName => {
                    const catProducts = categoriesMap[catName];
                    return (
                      <div key={catName} style={{ border: '1px solid var(--v-border-primary)', borderRadius: 'var(--v-r-md)', overflow: 'hidden', backgroundColor: 'var(--v-bg-primary)' }}>
                        <div style={{ backgroundColor: 'var(--v-bg-secondary)', padding: 'var(--v-space-2) var(--v-space-3)', borderBottom: '1px solid var(--v-border-primary)', color: 'var(--v-blue-600)', fontWeight: 600, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          {catName}
                        </div>
                        <div>
                          {catProducts.map(p => (
                            <div className="plan-form-row" key={p.productId} style={{ borderBottom: '1px solid var(--v-border-primary)', margin: 0, borderRadius: 0, borderTop: 0 }}>
                              <span className="product-label" style={{ paddingLeft: 'var(--v-space-3)' }}>{p.name}</span>
                              <input type="text" inputMode="numeric" className="plan-input" placeholder="0"
                                value={values[u.uid]?.[p.productId] || ''} onChange={e => handleChange(u.uid, p.productId, e.target.value)} />
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--v-space-3)' }}>
                  <button className="btn btn-primary btn-sm" onClick={() => handleSave(u.uid)} disabled={saving === u.uid}>
                    <Save size={14} /> {saving === u.uid ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

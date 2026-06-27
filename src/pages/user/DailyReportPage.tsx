/* ============================================================
   Varchaz — Daily Report Page
   ============================================================ */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { LoadingSpinner, PageHeader, showToast } from '../../components/shared';
import { DatePickerRow } from '../../components/dashboard';
import { getToday, isFutureDate, displayDate } from '../../utils/dateUtils';
import { parseNumericInput } from '../../utils/validators';
import { formatIndianNumber } from '../../utils/formatters';
import { fetchActiveProducts, fetchSupervisorProducts } from '../../services/productService';
import { fetchDailySales, saveDailySales } from '../../services/salesService';
import type { Product } from '../../types';
import { Save } from 'lucide-react';

export default function DailyReportPage() {
  const { appUser } = useAuth();
  const [date, setDate] = useState(getToday());
  const [products, setProducts] = useState<Product[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (appUser) loadData();
  }, [appUser, date]);

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

      const existing = await fetchDailySales(appUser.uid, date);
      const vals: Record<string, string> = {};
      prods.forEach(p => {
        vals[p.productId] = existing?.products?.[p.productId]?.toString() || '';
      });
      setValues(vals);
    } catch (err) {
      console.error(err);
      showToast('error', 'Failed to load products');
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
    if (!appUser || isFutureDate(date)) return;
    setSaving(true);
    try {
      const productsMap: Record<string, number> = {};
      Object.entries(values).forEach(([pid, val]) => {
        productsMap[pid] = parseNumericInput(val);
      });
      await saveDailySales(appUser.uid, date, productsMap, appUser.supervisorId || '');
      showToast('success', `Daily report saved for ${displayDate(date)}`);
    } catch (err) {
      console.error('Failed to save daily report:', err);
      showToast('error', 'Failed to save daily report');
    } finally {
      setSaving(false);
    }
  };

  const total = Object.values(values).reduce((s, v) => s + parseNumericInput(v), 0);

  if (loading) return <LoadingSpinner text="Loading products..." />;

  return (
    <div className="form-page" id="daily-report-page">
      <PageHeader
        title="Daily Sales Entry"
        subtitle={`Enter your sales numbers for ${displayDate(date)}`}
      />

      <div className="filter-bar">
        <DatePickerRow date={date} onChange={setDate} />
      </div>

      {isFutureDate(date) && (
        <div className="plan-window-alert">
          ⚠️ Cannot report for a future date.
        </div>
      )}

      <div className="sales-form">
        {products.map(product => (
          <div className="sales-form-row" key={product.productId}>
            <div className="product-name">
              <span className="truncate">{product.name}</span>
            </div>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              className="sales-input"
              placeholder="0"
              value={values[product.productId] || ''}
              onChange={e => handleChange(product.productId, e.target.value)}
              disabled={isFutureDate(date)}
              id={`sales-${product.productId}`}
            />
          </div>
        ))}
      </div>

      <div className="form-footer">
        <div className="form-total">
          Total: <strong>{formatIndianNumber(total)}</strong>
        </div>
        <button
          className="btn btn-primary"
          onClick={handleSave}
          disabled={saving || isFutureDate(date)}
          id="save-daily-report"
        >
          <Save size={16} />
          {saving ? 'Saving...' : 'Save Report'}
        </button>
      </div>
    </div>
  );
}

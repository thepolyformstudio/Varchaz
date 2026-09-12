/* ============================================================
   Varchaz — Daily Commitment Modal Component
   ============================================================ */

import React, { useState, useEffect, useMemo } from 'react';
import { X, Target, CheckCircle2, Lock, Sparkles, AlertCircle, AlertTriangle } from 'lucide-react';
import { formatIndianNumber, formatPercent } from '../../utils/formatters';
import { saveDailyCommitment } from '../../services/commitmentService';
import type { Product, ProductPerformance, DailyCommitment, DailyCommitmentItem } from '../../types';

interface DailyCommitmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: (commitment: DailyCommitment) => void;
  existingCommitment: DailyCommitment | null;
  products: Product[];
  mtdData: ProductPerformance[];
  userId: string;
  userName: string;
  supervisorId: string;
  date: string;
}

export function DailyCommitmentModal({
  isOpen,
  onClose,
  onSaved,
  existingCommitment,
  products,
  mtdData,
  userId,
  userName,
  supervisorId,
  date
}: DailyCommitmentModalProps) {
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [committedValues, setCommittedValues] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Map MTD data by productId
  const mtdMap = useMemo(() => {
    const map = new Map<string, ProductPerformance>();
    mtdData.forEach(p => map.set(p.productId, p));
    return map;
  }, [mtdData]);

  // Order products: Inactive products (ach == 0) first, then active products sorted by MTD % smallest to largest
  const sortedProducts = useMemo(() => {
    const inactive: Product[] = [];
    const active: Product[] = [];

    products.forEach(p => {
      const perf = mtdMap.get(p.productId);
      const ach = perf ? perf.achievement : 0;
      if (ach === 0) {
        inactive.push(p);
      } else {
        active.push(p);
      }
    });

    active.sort((a, b) => {
      const perfA = mtdMap.get(a.productId);
      const perfB = mtdMap.get(b.productId);
      const pctA = perfA ? perfA.achievementPct : 0;
      const pctB = perfB ? perfB.achievementPct : 0;
      return pctA - pctB; // Smallest to largest %
    });

    return [...inactive, ...active];
  }, [products, mtdMap]);

  // Reset or initialize state
  useEffect(() => {
    if (isOpen) {
      setError(null);
      if (existingCommitment) {
        // In view mode, populate existing committed values
        const ids: string[] = [];
        const vals: Record<string, number> = {};
        existingCommitment.items.forEach(item => {
          ids.push(item.productId);
          vals[item.productId] = item.committedValue;
        });
        setSelectedProductIds(ids);
        setCommittedValues(vals);
      } else {
        setSelectedProductIds([]);
        setCommittedValues({});
      }
    }
  }, [isOpen, existingCommitment]);

  if (!isOpen) return null;

  const isViewMode = Boolean(existingCommitment);

  const toggleSelect = (pId: string) => {
    if (isViewMode) return;
    setSelectedProductIds(prev => {
      if (prev.includes(pId)) {
        const next = prev.filter(id => id !== pId);
        const nextVals = { ...committedValues };
        delete nextVals[pId];
        setCommittedValues(nextVals);
        return next;
      } else {
        return [...prev, pId];
      }
    });
  };

  const handleValueChange = (pId: string, val: string) => {
    const num = Math.max(0, parseFloat(val) || 0);
    setCommittedValues(prev => ({ ...prev, [pId]: num }));
  };

  const validItemsCount = selectedProductIds.filter(id => (committedValues[id] || 0) > 0).length;
  const totalCommitted = selectedProductIds.reduce((sum, id) => sum + (committedValues[id] || 0), 0);

  const handleSave = async () => {
    if (validItemsCount < 5) {
      setError('Please commit a positive target on at least 5 products.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const items: DailyCommitmentItem[] = selectedProductIds
        .filter(id => (committedValues[id] || 0) > 0)
        .map(id => {
          const prod = products.find(p => p.productId === id);
          const perf = mtdMap.get(id);
          return {
            productId: id,
            productName: prod?.name || 'Product',
            category: prod?.category || 'General',
            mtdPlan: perf ? perf.plan : 0,
            mtdAch: perf ? perf.achievement : 0,
            mtdPct: perf ? perf.achievementPct : 0,
            committedValue: committedValues[id] || 0,
            achievedValue: 0,
            fulfillmentPct: 0
          };
        });

      const saved = await saveDailyCommitment(userId, userName, supervisorId, date, items);
      onSaved(saved);
      onClose();
    } catch (err: any) {
      console.error('Failed to save commitment:', err);
      setError('Failed to save commitment. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div 
        className="modal-content" 
        onClick={e => e.stopPropagation()} 
        style={{ maxWidth: 620, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
      >
        {/* Modal Header */}
        <div className="modal-header" style={{ paddingBottom: 'var(--v-space-3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--v-space-2)' }}>
            <div style={{ padding: 6, borderRadius: 'var(--v-radius-md)', backgroundColor: 'var(--v-primary-50)', color: 'var(--v-primary-600)' }}>
              <Target size={22} />
            </div>
            <div>
              <h2 style={{ fontSize: 'var(--v-text-lg)', fontWeight: 700, margin: 0 }}>
                {isViewMode ? "Today's Commitment" : "Commitment for the Day"}
              </h2>
              <p style={{ fontSize: 'var(--v-text-xs)', color: 'var(--v-text-secondary)', margin: '2px 0 0 0' }}>
                Date: {date} | {userName}
              </p>
            </div>
          </div>
          <button className="btn btn-icon btn-ghost" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {/* Modal Subheader / Status Bar */}
        <div style={{ padding: 'var(--v-space-3) var(--v-space-6)', backgroundColor: 'var(--v-bg-secondary)', borderBottom: '1px solid var(--v-border-primary)' }}>
          {isViewMode && existingCommitment ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--v-space-3)' }}>
              <div>
                <div style={{ fontSize: 'var(--v-text-xs)', color: 'var(--v-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
                  Total Committed
                </div>
                <div style={{ fontSize: 'var(--v-text-xl)', fontWeight: 800, color: 'var(--v-text-primary)' }}>
                  ₹{formatIndianNumber(existingCommitment.totalCommitted)}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 'var(--v-text-xs)', color: 'var(--v-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
                  EOD Achieved
                </div>
                <div style={{ fontSize: 'var(--v-text-xl)', fontWeight: 800, color: existingCommitment.eodReported ? 'var(--v-primary-600)' : 'var(--v-text-tertiary)' }}>
                  {existingCommitment.eodReported ? `₹${formatIndianNumber(existingCommitment.totalAchieved || 0)}` : 'Pending EOD'}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 'var(--v-text-xs)', color: 'var(--v-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
                  Fulfillment %
                </div>
                {existingCommitment.eodReported ? (
                  <span className={`badge ${(existingCommitment.fulfillmentPct || 0) >= 100 ? 'badge-success' : (existingCommitment.fulfillmentPct || 0) >= 80 ? 'badge-warning' : 'badge-danger'}`} style={{ fontSize: 'var(--v-text-sm)', fontWeight: 700, padding: '4px 10px' }}>
                    {(existingCommitment.fulfillmentPct || 0)}%
                  </span>
                ) : (
                  <span className="badge badge-neutral" style={{ fontSize: 'var(--v-text-xs)' }}>
                    Awaiting EOD
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 'var(--v-text-xs)', color: 'var(--v-text-tertiary)' }}>
                <Lock size={12} />
                <span>Locked</span>
              </div>
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--v-space-2)', marginBottom: 'var(--v-space-2)' }}>
                <span style={{ fontSize: 'var(--v-text-xs)', color: 'var(--v-text-secondary)' }}>
                  Pick <strong>at least 5 products</strong> and commit to targets for today. Focus on inactive & lagging items.
                </span>
                <span className={`badge ${validItemsCount >= 5 ? 'badge-success' : 'badge-warning'}`} style={{ fontWeight: 700 }}>
                  {validItemsCount} / 5 Selected
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 'var(--v-text-xs)', fontWeight: 600, color: 'var(--v-text-primary)' }}>
                  Total Planned FTD: <strong style={{ color: 'var(--v-primary-600)', fontSize: 'var(--v-text-sm)' }}>₹{formatIndianNumber(totalCommitted)}</strong>
                </span>
                <span style={{ fontSize: '11px', color: 'var(--v-text-tertiary)' }}>
                  Sorted: Inactive 1st → Lowest MTD %
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Modal Scrollable Body */}
        <div className="modal-body" style={{ flex: 1, overflowY: 'auto', padding: 'var(--v-space-4) var(--v-space-6)' }}>
          {error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--v-space-2)', padding: 'var(--v-space-3)', backgroundColor: 'var(--v-danger-50)', color: 'var(--v-danger-700)', borderRadius: 'var(--v-radius-md)', fontSize: 'var(--v-text-xs)', marginBottom: 'var(--v-space-3)' }}>
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {isViewMode && existingCommitment ? (
            /* VIEW MODE: Only display the selected/committed products (empty products omitted) */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--v-space-2)' }}>
              <div style={{ fontSize: 'var(--v-text-xs)', color: 'var(--v-text-secondary)', marginBottom: 'var(--v-space-1)', fontWeight: 600 }}>
                Committed Products ({existingCommitment.items.length}):
              </div>
              {existingCommitment.items.map(item => {
                const itemPct = item.fulfillmentPct ?? (item.committedValue > 0 && item.achievedValue !== undefined ? Math.round((item.achievedValue / item.committedValue) * 1000) / 10 : 0);
                return (
                  <div 
                    key={item.productId}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 'var(--v-space-3)',
                      padding: 'var(--v-space-3) var(--v-space-4)',
                      borderRadius: 'var(--v-radius-md)',
                      backgroundColor: 'var(--v-bg-primary)',
                      border: '1px solid var(--v-border-primary)'
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 'var(--v-text-sm)' }}>{item.productName}</div>
                      <div style={{ fontSize: 'var(--v-text-xs)', color: 'var(--v-text-secondary)' }}>{item.category}</div>
                    </div>

                    <div style={{ textAlign: 'right', minWidth: 90 }}>
                      <div style={{ fontSize: '11px', color: 'var(--v-text-tertiary)' }}>Committed FTD</div>
                      <div style={{ fontWeight: 700, fontSize: 'var(--v-text-sm)', color: 'var(--v-text-primary)' }}>
                        ₹{formatIndianNumber(item.committedValue)}
                      </div>
                    </div>

                    {existingCommitment.eodReported && (
                      <div style={{ textAlign: 'right', minWidth: 90 }}>
                        <div style={{ fontSize: '11px', color: 'var(--v-text-tertiary)' }}>Achieved FTD</div>
                        <div style={{ fontWeight: 700, fontSize: 'var(--v-text-sm)', color: 'var(--v-primary-600)' }}>
                          ₹{formatIndianNumber(item.achievedValue || 0)}
                        </div>
                      </div>
                    )}

                    {existingCommitment.eodReported && (
                      <div style={{ minWidth: 65, textAlign: 'right' }}>
                        <span className={`badge ${itemPct >= 100 ? 'badge-success' : itemPct >= 80 ? 'badge-warning' : 'badge-danger'}`} style={{ fontSize: '11px', fontWeight: 700 }}>
                          {itemPct}%
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            /* INPUT MODE: Full scrollable catalog ordered by Inactive 1st -> Lowest MTD % */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--v-space-2)' }}>
              {sortedProducts.map(prod => {
                const perf = mtdMap.get(prod.productId);
                const ach = perf ? perf.achievement : 0;
                const pct = perf ? perf.achievementPct : 0;
                const isInactive = ach === 0;
                const isSelected = selectedProductIds.includes(prod.productId);

                return (
                  <div
                    key={prod.productId}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--v-space-3)',
                      padding: 'var(--v-space-3) var(--v-space-4)',
                      borderRadius: 'var(--v-radius-md)',
                      backgroundColor: isSelected ? 'var(--v-primary-50)' : isInactive ? '#fff1f2' : 'var(--v-bg-primary)',
                      border: `1px solid ${isSelected ? 'var(--v-primary-300)' : isInactive ? '#fecdd3' : 'var(--v-border-primary)'}`,
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {/* Checkbox */}
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(prod.productId)}
                      style={{ width: 18, height: 18, cursor: 'pointer', accentColor: 'var(--v-primary-600)' }}
                      id={`commit-check-${prod.productId}`}
                    />

                    {/* Product Info */}
                    <label 
                      htmlFor={`commit-check-${prod.productId}`} 
                      style={{ flex: 1, cursor: 'pointer', margin: 0 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--v-space-2)', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 600, fontSize: 'var(--v-text-sm)' }}>{prod.name}</span>
                        {isInactive ? (
                          <span className="badge badge-danger" style={{ fontSize: '10px', padding: '1px 6px' }}>
                            Inactive MTD (0 sales)
                          </span>
                        ) : (
                          <span className="badge badge-neutral" style={{ fontSize: '10px', padding: '1px 6px' }}>
                            {pct}% MTD
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 'var(--v-text-xs)', color: 'var(--v-text-secondary)', marginTop: 2 }}>
                        {prod.category} | Plan: {formatIndianNumber(perf?.plan || 0)} | Ach: {formatIndianNumber(ach)}
                      </div>
                    </label>

                    {/* Planned FTD Number Input */}
                    {isSelected ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 'var(--v-text-xs)', color: 'var(--v-text-secondary)' }}>FTD ₹</span>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          placeholder="Target"
                          value={committedValues[prod.productId] || ''}
                          onChange={e => handleValueChange(prod.productId, e.target.value)}
                          className="input-field"
                          style={{ width: 100, padding: '6px 8px', fontSize: 'var(--v-text-sm)', fontWeight: 600, textAlign: 'right' }}
                          autoFocus
                        />
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => toggleSelect(prod.productId)}
                        style={{ fontSize: 'var(--v-text-xs)', color: 'var(--v-text-tertiary)' }}
                      >
                        + Select
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="modal-footer" style={{ borderTop: '1px solid var(--v-border-primary)', padding: 'var(--v-space-3) var(--v-space-6)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {isViewMode ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--v-text-xs)', color: 'var(--v-text-secondary)' }}>
                <CheckCircle2 size={16} color="var(--v-success-600)" />
                <span>Your commitment for today is recorded and active.</span>
              </div>
              <button className="btn btn-secondary" onClick={onClose}>Close</button>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--v-text-xs)', color: 'var(--v-text-tertiary)' }}>
                <Lock size={14} />
                <span>Locked once submitted for the day.</span>
              </div>
              <div style={{ display: 'flex', gap: 'var(--v-space-2)' }}>
                <button className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
                <button 
                  className="btn btn-primary" 
                  onClick={handleSave} 
                  disabled={saving || validItemsCount < 5}
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <Sparkles size={16} />
                  <span>{saving ? 'Saving...' : `Lock & Submit (${validItemsCount}/5)`}</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

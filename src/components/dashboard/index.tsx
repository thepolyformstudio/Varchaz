/* ============================================================
   Varchaz — Dashboard Components
   ============================================================ */

import React from 'react';
import { formatIndianNumber, formatPercent } from '../../utils/formatters';
import { getPctClass } from '../../utils/calculations';
import type { ProductPerformance } from '../../types';
import { AlertCircle, ChevronLeft, ChevronRight, Download, FileSpreadsheet, Mail } from 'lucide-react';
import { exportToPDF, exportToExcel, performanceToExportData } from '../../services/exportService';

// ─── Summary Card ───────────────────────────────────────────
export function SummaryCard({
  icon,
  label,
  value,
  trend,
  onClick
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  trend?: { value: string; direction: 'up' | 'down' };
  onClick?: () => void;
}) {
  return (
    <div
      className="summary-card animate-fade-in-up"
      onClick={onClick}
      style={onClick ? { cursor: 'pointer' } : undefined}
    >
      <div className="card-icon">{icon}</div>
      <div className="card-value">{typeof value === 'number' ? formatIndianNumber(value) : value}</div>
      <div className="card-label">{label}</div>
      {trend && (
        <div className={`card-trend ${trend.direction}`}>
          {trend.direction === 'up' ? '↑' : '↓'} {trend.value}
        </div>
      )}
    </div>
  );
}

// ─── Performance Table (Product-wise) ───────────────────────
export function PerformanceTable({
  data,
  viewType = 'mtd',
  title,
  exportFileName = 'report'
}: {
  data: ProductPerformance[];
  viewType?: 'mtd' | 'ytd' | 'day';
  title?: string;
  exportFileName?: string;
}) {
  const grandTotalPlan = data.reduce((s, p) => s + p.plan, 0);
  const grandTotalAchievement = data.reduce((s, p) => s + p.achievement, 0);
  const grandTotalPct = grandTotalPlan > 0 ? (grandTotalAchievement / grandTotalPlan) * 100 : 0;

  const handleExport = async (format: 'pdf' | 'excel' | 'email') => {
    const { data: exportData, columns } = performanceToExportData(data, viewType);
    const options = {
      format,
      title: title || `${viewType.toUpperCase()} Performance Report`,
      data: exportData,
      columns,
      fileName: exportFileName
    };
    if (format === 'pdf') {
      await exportToPDF(options);
    } else if (format === 'excel') {
      await exportToExcel(options);
    } else if (format === 'email') {
      const subject = encodeURIComponent(options.title);
      let bodyText = `${options.title}\\n\\n`;
      
      exportData.forEach(row => {
        const isHeader = row.product.startsWith('CATEGORY:') || row.product === 'GRAND TOTAL' || row.product.includes('Sub-total');
        if (isHeader) {
          bodyText += `\\n[ ${row.product.trim()} ]\\n`;
          if (row.product.startsWith('CATEGORY:')) return; // No numbers on category header itself
        } else {
          bodyText += `- ${row.product.trim()}: `;
        }

        if (viewType !== 'day') {
          if (isHeader) bodyText += `  `;
          bodyText += `Plan: ${row.plan} | Ach: ${row.achievement} (${row.pct})\\n`;
        } else {
          if (isHeader) bodyText += `  `;
          bodyText += `Ach: ${row.achievement}\\n`;
        }
      });
      
      const body = encodeURIComponent(bodyText);
      window.location.href = `mailto:?subject=${subject}&body=${body}`;
    }
  };

  // Group products by category
  const categoriesMap: Record<string, ProductPerformance[]> = {};
  data.forEach(p => {
    const cat = p.category || 'General';
    if (!categoriesMap[cat]) {
      categoriesMap[cat] = [];
    }
    categoriesMap[cat].push(p);
  });

  const sortedCategories = Object.keys(categoriesMap).sort();

  return (
    <div className="data-table-wrapper animate-fade-in">
      {title && (
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: 'var(--v-space-3) var(--v-space-4)', borderBottom: '1px solid var(--v-border-primary)'
        }}>
          <h3 style={{ fontSize: 'var(--v-text-sm)', fontWeight: 600 }}>{title}</h3>
          <div style={{ display: 'flex', gap: 'var(--v-space-1)' }}>
            <button className="btn btn-ghost btn-sm" onClick={() => handleExport('email')} title="Send Email Summary">
              <Mail size={14} /> Email
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => handleExport('pdf')} title="Export PDF">
              <Download size={14} /> PDF
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => handleExport('excel')} title="Export Excel">
              <FileSpreadsheet size={14} /> Excel
            </button>
          </div>
        </div>
      )}
      <div className="data-table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Product</th>
              {viewType !== 'day' && <th className="text-right">Plan</th>}
              <th className="text-right">Achievement</th>
              {viewType !== 'day' && <th className="text-right">Ach. %</th>}
            </tr>
          </thead>
          <tbody>
            {sortedCategories.map(catName => {
              const catProducts = categoriesMap[catName];
              const catTotalPlan = catProducts.reduce((s, p) => s + p.plan, 0);
              const catTotalAchievement = catProducts.reduce((s, p) => s + p.achievement, 0);
              const catTotalPct = catTotalPlan > 0 ? (catTotalAchievement / catTotalPlan) * 100 : 0;

              return (
                <React.Fragment key={catName}>
                  {/* Category Header Row */}
                  <tr className="category-header-row" style={{ backgroundColor: 'var(--v-bg-secondary)', fontWeight: 600 }}>
                    <td colSpan={viewType === 'day' ? 2 : 4} style={{ color: 'var(--v-blue-600)', padding: 'var(--v-space-2) var(--v-space-3)', fontSize: 'var(--v-text-xs)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {catName}
                    </td>
                  </tr>

                  {/* Product Rows in this Category */}
                  {catProducts.map(row => (
                    <tr key={row.productId}>
                      <td style={{ paddingLeft: 'var(--v-space-6)' }}>{row.productName}</td>
                      {viewType !== 'day' && (
                        <td className="text-right num-cell">
                          {row.hasNoPlan ? (
                            <span className="no-plan-label">No Plan</span>
                          ) : (
                            formatIndianNumber(row.plan)
                          )}
                        </td>
                      )}
                      <td className="text-right num-cell">{formatIndianNumber(row.achievement)}</td>
                      {viewType !== 'day' && (
                        <td className={`text-right pct-cell ${getPctClass(row.achievementPct)}`}>
                          {formatPercent(row.achievementPct)}
                        </td>
                      )}
                    </tr>
                  ))}

                  {/* Category Subtotal Row */}
                  <tr className="category-subtotal-row" style={{ borderBottom: '2px solid var(--v-border-primary)', fontStyle: 'italic' }}>
                    <td style={{ paddingLeft: 'var(--v-space-6)', color: 'var(--v-text-secondary)', fontWeight: 500 }}>
                      Sub-total ({catName})
                    </td>
                    {viewType !== 'day' && (
                      <td className="text-right num-cell" style={{ color: 'var(--v-text-secondary)' }}>
                        {formatIndianNumber(catTotalPlan)}
                      </td>
                    )}
                    <td className="text-right num-cell" style={{ color: 'var(--v-text-secondary)', fontWeight: 600 }}>
                      {formatIndianNumber(catTotalAchievement)}
                    </td>
                    {viewType !== 'day' && (
                      <td className={`text-right pct-cell ${getPctClass(catTotalPct)}`}>
                        {formatPercent(catTotalPct)}
                      </td>
                    )}
                  </tr>
                </React.Fragment>
              );
            })}

            {data.length > 0 && viewType !== 'day' && (
              <tr className="grand-total" style={{ borderTop: '2px solid var(--v-border-primary)' }}>
                <td><strong>Grand Total</strong></td>
                <td className="text-right num-cell"><strong>{formatIndianNumber(grandTotalPlan)}</strong></td>
                <td className="text-right num-cell"><strong>{formatIndianNumber(grandTotalAchievement)}</strong></td>
                <td className={`text-right pct-cell ${getPctClass(grandTotalPct)}`}>
                  <strong>{formatPercent(grandTotalPct)}</strong>
                </td>
              </tr>
            )}
            {data.length > 0 && viewType === 'day' && (
              <tr className="grand-total" style={{ borderTop: '2px solid var(--v-border-primary)' }}>
                <td><strong>Grand Total</strong></td>
                <td className="text-right num-cell"><strong>{formatIndianNumber(grandTotalAchievement)}</strong></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {data.length === 0 && (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--v-text-tertiary)', fontSize: 'var(--v-text-sm)' }}>
          No data available
        </div>
      )}
    </div>
  );
}

// ─── Missing Report Alert ───────────────────────────────────
export function MissingReportAlert({
  date,
  onAction
}: {
  date: string;
  onAction?: () => void;
}) {
  return (
    <div className="missing-report-alert" id="missing-report-alert">
      <div className="alert-icon">
        <AlertCircle size={18} />
      </div>
      <div className="alert-text">
        <div className="alert-title">Daily report missing</div>
        <div className="alert-desc">You haven't submitted today's sales report yet</div>
      </div>
      {onAction && (
        <button className="btn btn-sm btn-primary" onClick={onAction}>Report Now</button>
      )}
    </div>
  );
}

// ─── Date Picker Row ────────────────────────────────────────
export function DatePickerRow({
  date,
  onChange,
  label = 'Date'
}: {
  date: string;
  onChange: (d: string) => void;
  label?: string;
}) {
  const handlePrev = () => {
    const d = new Date(date);
    d.setDate(d.getDate() - 1);
    onChange(d.toISOString().split('T')[0]);
  };
  const handleNext = () => {
    const d = new Date(date);
    d.setDate(d.getDate() + 1);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (d < tomorrow) {
      onChange(d.toISOString().split('T')[0]);
    }
  };

  return (
    <div className="date-picker-row" id="date-picker">
      <button className="date-nav-btn" onClick={handlePrev} title="Previous day">
        <ChevronLeft size={16} />
      </button>
      <input
        type="date"
        className="input-field"
        value={date}
        onChange={e => onChange(e.target.value)}
        max={new Date().toISOString().split('T')[0]}
        style={{ maxWidth: 180 }}
      />
      <button className="date-nav-btn" onClick={handleNext} title="Next day">
        <ChevronRight size={16} />
      </button>
      <span style={{ fontSize: 'var(--v-text-sm)', color: 'var(--v-text-secondary)', marginLeft: 'var(--v-space-2)' }}>
        {new Date(date).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}
      </span>
    </div>
  );
}

// ─── User Performance List (Mobile Friendly Drill Down) ───
export function UserPerformanceList({ 
  userPerfs, 
  viewType = 'mtd', 
  onUserClick 
}: { 
  userPerfs: { user: import('../../types').AppUser; performances: ProductPerformance[] }[];
  viewType?: 'mtd' | 'ytd' | 'day';
  onUserClick?: (userId: string) => void;
}) {
  const [expandedUsers, setExpandedUsers] = React.useState<Record<string, boolean>>({});

  const toggleUser = (uid: string) => {
    setExpandedUsers(prev => ({ ...prev, [uid]: !prev[uid] }));
  };

  if (userPerfs.length === 0) return null;

  return (
    <div className="user-perf-list">
      {userPerfs.map(({ user, performances }) => {
        const totalPlan = performances.reduce((s, p) => s + p.plan, 0);
        const totalAch = performances.reduce((s, p) => s + p.achievement, 0);
        const totalPct = totalPlan > 0 ? (totalAch / totalPlan) * 100 : 0;
        const isExpanded = !!expandedUsers[user.uid];

        return (
          <div key={user.uid} className="user-perf-card animate-fade-in-up">
            <div className="user-perf-card-header" onClick={() => toggleUser(user.uid)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--v-space-3)' }}>
                <div className="avatar avatar-sm">{user.displayName.charAt(0).toUpperCase()}</div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 'var(--v-text-sm)' }}>{user.displayName}</div>
                  <div style={{ fontSize: 'var(--v-text-xs)', color: 'var(--v-text-secondary)' }}>
                    Achieved: {formatIndianNumber(totalAch)} 
                    {viewType !== 'day' && ` / ${formatIndianNumber(totalPlan)} (${formatPercent(totalPct)})`}
                  </div>
                </div>
              </div>
              <ChevronRight 
                size={16} 
                style={{ 
                  color: 'var(--v-text-tertiary)',
                  transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                  transition: 'transform var(--v-transition-fast)'
                }} 
              />
            </div>
            
            {isExpanded && (
              <div className="data-table-wrapper animate-fade-in" style={{ margin: 0, border: 'none', borderRadius: 0 }}>
                <div className="data-table-scroll">
                  <table className="data-table" style={{ fontSize: 'var(--v-text-xs)' }}>
                    <thead>
                      <tr>
                        <th>Product</th>
                        {viewType !== 'day' && <th className="text-right">Plan</th>}
                        <th className="text-right">Ach</th>
                        {viewType !== 'day' && <th className="text-right">%</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {performances.map(p => (
                        <tr key={p.productId}>
                          <td>{p.productName}</td>
                          {viewType !== 'day' && (
                            <td className="text-right num-cell">{p.hasNoPlan ? '-' : formatIndianNumber(p.plan)}</td>
                          )}
                          <td className="text-right num-cell">{formatIndianNumber(p.achievement)}</td>
                          {viewType !== 'day' && (
                            <td className={`text-right pct-cell ${getPctClass(p.achievementPct)}`}>
                              {formatPercent(p.achievementPct)}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {onUserClick && (
                  <div style={{ padding: 'var(--v-space-3)', borderTop: '1px solid var(--v-border-primary)', textAlign: 'center', background: 'var(--v-bg-secondary)' }}>
                     <button className="btn btn-secondary btn-sm" onClick={() => onUserClick(user.uid)}>
                       View Full Report
                     </button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

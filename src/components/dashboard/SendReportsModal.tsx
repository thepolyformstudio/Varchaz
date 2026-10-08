/* ============================================================
   Varchaz — Send Reports Manual Trigger Modal Component
   ============================================================ */

import React, { useState, useEffect } from 'react';
import { 
  X, 
  Mail, 
  Send, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  Users, 
  FileSpreadsheet, 
  Loader2, 
  ShieldCheck, 
  Layers 
} from 'lucide-react';
import { getReportingCutoffInfo } from '../../utils/dateUtils';
import { trigger4Plus1ReportsManual, type TriggerReportsResult } from '../../services/reportService';

interface SendReportsModalProps {
  isOpen: boolean;
  onClose: () => void;
  supervisorUser: {
    uid: string;
    displayName: string;
    email: string;
    automailerEmail?: string;
  };
  teamMembersCount: number;
}

export function SendReportsModal({
  isOpen,
  onClose,
  supervisorUser,
  teamMembersCount
}: SendReportsModalProps) {
  const [cutoffInfo, setCutoffInfo] = useState(() => getReportingCutoffInfo());
  const [isSending, setIsSending] = useState(false);
  const [progressStep, setProgressStep] = useState<string>('');
  const [progressCurrent, setProgressCurrent] = useState<number>(0);
  const [progressTotal, setProgressTotal] = useState<number>(5);
  const [result, setResult] = useState<TriggerReportsResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Refresh cutoff info when modal opens
  useEffect(() => {
    if (isOpen) {
      setCutoffInfo(getReportingCutoffInfo());
      setIsSending(false);
      setProgressStep('');
      setProgressCurrent(0);
      setResult(null);
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSend = async () => {
    setIsSending(true);
    setError(null);
    setResult(null);
    setProgressStep('Initializing report generation...');
    setProgressCurrent(0);

    try {
      const res = await trigger4Plus1ReportsManual(supervisorUser, (step, cur, tot) => {
        setProgressStep(step);
        setProgressCurrent(cur);
        setProgressTotal(tot);
      });
      setResult(res);
    } catch (err: any) {
      console.error('Failed to trigger manual reports:', err);
      setError(err?.message || 'Failed to dispatch email reports. Please check connectivity and try again.');
    } finally {
      setIsSending(false);
    }
  };

  const handleModalClose = () => {
    if (isSending) return; // Prevent closing while in flight
    onClose();
  };

  const formattedIstTime = `${String(cutoffInfo.istHour).padStart(2, '0')}:${String(cutoffInfo.istMinute).padStart(2, '0')} IST`;

  return (
    <div className="modal-overlay" onClick={handleModalClose} style={{ zIndex: 9999 }}>
      <div 
        className="modal-content" 
        onClick={e => e.stopPropagation()} 
        style={{ 
          maxWidth: 600, 
          maxHeight: '92vh', 
          display: 'flex', 
          flexDirection: 'column',
          borderRadius: 'var(--v-radius-lg)',
          overflow: 'hidden',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.08)'
        }}
      >
        {/* Modal Header */}
        <div 
          className="modal-header" 
          style={{ 
            padding: 'var(--v-space-4) var(--v-space-6)',
            background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #334155'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--v-space-3)' }}>
            <div style={{ 
              padding: 8, 
              borderRadius: 'var(--v-radius-md)', 
              background: 'linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)', 
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Mail size={22} />
            </div>
            <div>
              <h2 style={{ fontSize: 'var(--v-text-lg)', fontWeight: 700, margin: 0, color: '#ffffff' }}>
                Send Reports
              </h2>
              <p style={{ fontSize: 'var(--v-text-xs)', color: '#94a3b8', margin: '2px 0 0 0' }}>
                Single-Click Manual Trigger &bull; 4+1 Daily MIS Emails
              </p>
            </div>
          </div>
          {!isSending && (
            <button 
              className="btn btn-icon btn-ghost" 
              onClick={handleModalClose} 
              aria-label="Close"
              style={{ color: '#94a3b8' }}
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* Modal Body */}
        <div className="modal-body" style={{ flex: 1, overflowY: 'auto', padding: 'var(--v-space-5) var(--v-space-6)' }}>
          {/* Time & Cutoff Rule Banner */}
          <div 
            style={{ 
              padding: 'var(--v-space-4)',
              borderRadius: 'var(--v-radius-md)',
              border: cutoffInfo.isPriorWorkingDay ? '1px solid #fed7aa' : '1px solid #bbf7d0',
              backgroundColor: cutoffInfo.isPriorWorkingDay ? '#fff7ed' : '#f0fdf4',
              marginBottom: 'var(--v-space-4)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--v-space-3)' }}>
              <div style={{ 
                marginTop: 2, 
                color: cutoffInfo.isPriorWorkingDay ? '#ea580c' : '#16a34a' 
              }}>
                {cutoffInfo.isPriorWorkingDay ? <Clock size={20} /> : <CheckCircle2 size={20} />}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 4,
                  marginBottom: 4 
                }}>
                  <strong style={{ 
                    fontSize: 'var(--v-text-sm)', 
                    color: cutoffInfo.isPriorWorkingDay ? '#9a3412' : '#166534' 
                  }}>
                    {cutoffInfo.isPriorWorkingDay 
                      ? '⚡ Early Dispatch Mode (< 6:00 PM IST)' 
                      : '✅ End-of-Day Dispatch Mode (≥ 6:00 PM IST)'}
                  </strong>
                  <span style={{ 
                    fontSize: '11px', 
                    padding: '2px 8px', 
                    borderRadius: 4, 
                    fontWeight: 600,
                    backgroundColor: cutoffInfo.isPriorWorkingDay ? '#ffedd5' : '#dcfce7',
                    color: cutoffInfo.isPriorWorkingDay ? '#c2410c' : '#15803d'
                  }}>
                    Current: {formattedIstTime}
                  </span>
                </div>

                <p style={{ 
                  margin: 0, 
                  fontSize: 'var(--v-text-xs)', 
                  color: cutoffInfo.isPriorWorkingDay ? '#7c2d12' : '#14532d',
                  lineHeight: 1.5 
                }}>
                  {cutoffInfo.isPriorWorkingDay ? (
                    <>
                      Triggering before 6:00 PM IST sends data <strong>up till previous working day ({cutoffInfo.effectiveDateDisplay})</strong>. 
                      Today's numbers ({cutoffInfo.todayStr}) are <strong>strictly excluded</strong> to prevent incomplete reporting.
                    </>
                  ) : (
                    <>
                      Triggering after 6:00 PM IST compiles full Month-to-Date performance <strong>including today ({cutoffInfo.effectiveDateDisplay})</strong>.
                    </>
                  )}
                </p>
              </div>
            </div>
          </div>

          {/* 4+1 Email Package Breakdown */}
          <div style={{ marginBottom: 'var(--v-space-4)' }}>
            <div style={{ 
              fontSize: 'var(--v-text-xs)', 
              fontWeight: 700, 
              color: 'var(--v-text-secondary)', 
              textTransform: 'uppercase', 
              letterSpacing: '0.05em',
              marginBottom: 'var(--v-space-2)',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}>
              <Layers size={14} />
              <span>Emails Dispatched in This Trigger (5 Total)</span>
            </div>

            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', 
              gap: 'var(--v-space-2)' 
            }}>
              {[
                { title: '1. Liabilities MIS', sub: 'CA, SA, Term Deposits, IP/RFD' },
                { title: '2. Assets MIS', sub: 'Retail + Wholesale Assets combined' },
                { title: '3. TPP MIS', sub: 'LI, GI/HI, Mutual Funds, SIP' },
                { title: '4. Others MIS', sub: 'Credit Card, Demat, Payzapp, SSS' },
                { title: '5. Active Products Tracker', sub: 'Consolidated 7-day rep active products' }
              ].map((item, idx) => (
                <div 
                  key={idx} 
                  style={{
                    padding: '8px 12px',
                    borderRadius: 'var(--v-radius-sm)',
                    backgroundColor: 'var(--v-bg-secondary)',
                    border: '1px solid var(--v-border-primary)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8
                  }}
                >
                  <FileSpreadsheet size={16} style={{ color: 'var(--v-primary)' }} />
                  <div>
                    <div style={{ fontSize: 'var(--v-text-xs)', fontWeight: 600 }}>{item.title}</div>
                    <div style={{ fontSize: '11px', color: 'var(--v-text-tertiary)' }}>{item.sub}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Distribution Policy & Preview */}
          <div style={{ 
            padding: 'var(--v-space-3) var(--v-space-4)', 
            borderRadius: 'var(--v-radius-md)', 
            backgroundColor: 'var(--v-bg-primary)', 
            border: '1px solid var(--v-border-primary)',
            marginBottom: 'var(--v-space-4)'
          }}>
            <div style={{ 
              fontSize: 'var(--v-text-xs)', 
              fontWeight: 700, 
              color: 'var(--v-text-secondary)', 
              display: 'flex', 
              alignItems: 'center', 
              gap: 6,
              marginBottom: 6
            }}>
              <ShieldCheck size={14} style={{ color: '#16a34a' }} />
              <span>Strict Recipient Routing (Policy Compliant)</span>
            </div>

            <div style={{ fontSize: 'var(--v-text-xs)', color: 'var(--v-text-secondary)', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div>
                <strong>TO:</strong> {teamMembersCount} Active Team Members (sent to their configured Automailer Email)
              </div>
              <div>
                <strong>CC:</strong> {supervisorUser.displayName} ({supervisorUser.automailerEmail || supervisorUser.email})
              </div>
              <div style={{ fontSize: '11px', color: 'var(--v-text-tertiary)', fontStyle: 'italic', marginTop: 2 }}>
                * Admins and Viewers are strictly excluded from all recipient lists.
              </div>
            </div>
          </div>

          {/* Progress State */}
          {isSending && (
            <div style={{ 
              padding: 'var(--v-space-4)', 
              borderRadius: 'var(--v-radius-md)', 
              backgroundColor: '#eff6ff', 
              border: '1px solid #bfdbfe',
              marginBottom: 'var(--v-space-3)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <Loader2 size={18} className="spin" style={{ color: '#2563eb' }} />
                <span style={{ fontSize: 'var(--v-text-sm)', fontWeight: 600, color: '#1e40af' }}>
                  {progressStep}
                </span>
              </div>
              <div style={{ 
                width: '100%', 
                height: 6, 
                backgroundColor: '#dbeafe', 
                borderRadius: 3, 
                overflow: 'hidden' 
              }}>
                <div style={{ 
                  width: `${(progressCurrent / progressTotal) * 100}%`, 
                  height: '100%', 
                  backgroundColor: '#2563eb', 
                  transition: 'width 0.3s ease' 
                }} />
              </div>
              <div style={{ textAlign: 'right', fontSize: '11px', color: '#3b82f6', marginTop: 4 }}>
                {progressCurrent} of {progressTotal} Completed
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div style={{ 
              padding: 'var(--v-space-3) var(--v-space-4)', 
              borderRadius: 'var(--v-radius-md)', 
              backgroundColor: 'var(--v-danger-50)', 
              border: '1px solid var(--v-danger-200)',
              color: 'var(--v-danger-700)',
              fontSize: 'var(--v-text-xs)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 'var(--v-space-3)'
            }}>
              <AlertTriangle size={16} />
              <span>{error}</span>
            </div>
          )}

          {/* Success Result */}
          {result && (
            <div style={{ 
              padding: 'var(--v-space-4)', 
              borderRadius: 'var(--v-radius-md)', 
              backgroundColor: '#f0fdf4', 
              border: '1px solid #bbf7d0',
              color: '#166534',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              marginBottom: 'var(--v-space-3)'
            }}>
              <CheckCircle2 size={20} style={{ color: '#16a34a', marginTop: 2 }} />
              <div>
                <strong style={{ fontSize: 'var(--v-text-sm)' }}>
                  All 5 Reports Dispatched Successfully!
                </strong>
                <p style={{ margin: '4px 0 0 0', fontSize: 'var(--v-text-xs)', lineHeight: 1.4 }}>
                  {result.message}
                </p>
                <div style={{ marginTop: 6, fontSize: '11px', color: '#15803d' }}>
                  Effective Data Date: <strong>{result.effectiveDateDisplay}</strong> {result.isPriorWorkingDay ? '(Previous Working Day)' : '(Today)'}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div 
          className="modal-footer" 
          style={{ 
            padding: 'var(--v-space-3) var(--v-space-6)', 
            borderTop: '1px solid var(--v-border-primary)',
            backgroundColor: 'var(--v-bg-secondary)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 'var(--v-space-3)'
          }}
        >
          {result ? (
            <button className="btn btn-primary" onClick={handleModalClose}>
              Done
            </button>
          ) : (
            <>
              <button 
                className="btn btn-ghost" 
                onClick={handleModalClose}
                disabled={isSending}
              >
                Cancel
              </button>
              <button 
                className="btn btn-primary" 
                onClick={handleSend}
                disabled={isSending}
                style={{ 
                  display: 'inline-flex', 
                  alignItems: 'center', 
                  gap: 8,
                  minWidth: 140,
                  justifyContent: 'center'
                }}
              >
                {isSending ? (
                  <>
                    <Loader2 size={16} className="spin" />
                    <span>Sending...</span>
                  </>
                ) : (
                  <>
                    <Send size={16} />
                    <span>Send Reports</span>
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

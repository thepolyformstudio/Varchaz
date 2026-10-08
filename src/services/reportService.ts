/* ============================================================
   Varchaz — Daily Report Service
   ============================================================ */

import { doc, getDoc, setDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../config/firebase';
import { getReportingCutoffInfo, isNonWorkingDay } from '../utils/dateUtils';

export interface DailyReportConfig {
  recipientEmail: string;
  isEnabled: boolean;
  scheduleTime: string; // e.g. "20:00"
  lastSentAt?: any;
  lastStatus?: string;
}

const SETTINGS_DOC_ID = 'dailyReportConfig';

/** Get current daily report configuration */
export async function getDailyReportConfig(): Promise<DailyReportConfig> {
  try {
    const docSnap = await getDoc(doc(db, 'settings', SETTINGS_DOC_ID));
    if (docSnap.exists()) {
      const data = docSnap.data();
      return {
        recipientEmail: data.recipientEmail || '',
        isEnabled: data.isEnabled === true,
        scheduleTime: data.scheduleTime || '20:00',
        lastSentAt: data.lastSentAt || null,
        lastStatus: data.lastStatus || ''
      };
    }
  } catch (err) {
    console.error('Error reading daily report config:', err);
  }

  return {
    recipientEmail: '',
    isEnabled: false,
    scheduleTime: '20:00'
  };
}

/** Save daily report configuration */
export async function saveDailyReportConfig(config: Partial<DailyReportConfig>): Promise<void> {
  await setDoc(doc(db, 'settings', SETTINGS_DOC_ID), {
    ...config,
    updatedAt: new Date()
  }, { merge: true });
}

/** Trigger daily report dispatch immediately */
export async function triggerDailyReportNow(recipientEmail?: string): Promise<{ success: boolean; message?: string }> {
  // 1. Try Cloud Function first if available
  try {
    const functions = getFunctions();
    const sendDailyReportCallable = httpsCallable<{ recipientEmail?: string }, { success: boolean; recipient: string; date: string }>(
      functions,
      'sendDailyReportNow'
    );
    const res = await sendDailyReportCallable({ recipientEmail });
    return {
      success: true,
      message: `Daily report Excel sent successfully to ${res.data.recipient}`
    };
  } catch (callableErr) {
    console.warn('Cloud Function unavailable, executing client-side Excel report generator:', callableErr);
  }

  // 2. Client-side report builder & microservice sender
  const targetEmail = recipientEmail || (await getDailyReportConfig()).recipientEmail;
  if (!targetEmail || !targetEmail.includes('@')) {
    throw new Error('Please enter a valid recipient email address.');
  }

  const XLSX = await import('xlsx');

  const now = new Date();
  const todayStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
  const currentMonthStr = todayStr.substring(0, 7); // YYYY-MM

  // Determine FY start month (Apr-Mar)
  const currentYear = now.getFullYear();
  const currentMonthNum = now.getMonth() + 1; // 1-12
  const fyStartYear = currentMonthNum >= 4 ? currentYear : currentYear - 1;

  // Get YTD month strings array
  const ytdMonths: string[] = [];
  let mYear = fyStartYear;
  let mMonth = 4;
  while (true) {
    const mStr = `${mYear}-${String(mMonth).padStart(2, '0')}`;
    ytdMonths.push(mStr);
    if (mStr === currentMonthStr) break;
    mMonth++;
    if (mMonth > 12) {
      mMonth = 1;
      mYear++;
    }
  }

function getCategoryRank(category?: string): number {
  const cat = (category || '').toLowerCase().trim();
  if (cat.includes('liabilit')) return 1;
  if (cat.includes('retail asset') || cat === 'retail assets') return 2;
  if (cat.includes('tpp')) return 3;
  if (cat.includes('asset')) return 4;
  if (cat.includes('other')) return 5;
  return 6;
}

function sortProductsByCategoryPriority(productsList: any[]): any[] {
  return [...productsList].sort((a, b) => {
    const rankA = getCategoryRank(a.category);
    const rankB = getCategoryRank(b.category);

    if (rankA !== rankB) {
      return rankA - rankB;
    }
    const catComp = (a.category || '').localeCompare(b.category || '');
    if (catComp !== 0) return catComp;
    const nameA = a.name || a.productName || '';
    const nameB = b.name || b.productName || '';
    return nameA.localeCompare(nameB);
  });
}

  // Fetch Firestore Collections
  const productsSnap = await getDocs(collection(db, 'products'));
  const rawProducts = productsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const products = sortProductsByCategoryPriority(rawProducts);

  const usersSnap = await getDocs(query(collection(db, 'users'), where('status', '==', 'approved')));
  const rawUsers = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const users = rawUsers.filter((u: any) => u.role === 'user' || u.role === 'supervisor');

  const monthlyPlansSnap = await getDocs(collection(db, 'monthlyPlans'));
  const allMonthlyPlans = monthlyPlansSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const dailySalesSnap = await getDocs(collection(db, 'dailySales'));
  const allDailySales = dailySalesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  // Helper maps
  const mtdPlansByUser: Record<string, Record<string, number>> = {};
  const ytdPlansByUser: Record<string, Record<string, number>> = {};

  allMonthlyPlans.forEach((mp: any) => {
    const userId = mp.userId;
    const month = mp.month;
    if (!userId || !month) return;

    if (month === currentMonthStr) {
      if (!mtdPlansByUser[userId]) mtdPlansByUser[userId] = {};
      Object.entries(mp.products || {}).forEach(([pId, val]) => {
        mtdPlansByUser[userId][pId] = (mtdPlansByUser[userId][pId] || 0) + Number(val || 0);
      });
    }

    if (ytdMonths.includes(month)) {
      if (!ytdPlansByUser[userId]) ytdPlansByUser[userId] = {};
      Object.entries(mp.products || {}).forEach(([pId, val]) => {
        ytdPlansByUser[userId][pId] = (ytdPlansByUser[userId][pId] || 0) + Number(val || 0);
      });
    }
  });

  const mtdSalesByUser: Record<string, Record<string, number>> = {};
  const ytdSalesByUser: Record<string, Record<string, number>> = {};

  allDailySales.forEach((ds: any) => {
    const userId = ds.userId;
    const date = ds.date;
    if (!userId || !date) return;

    const month = date.substring(0, 7);

    if (month === currentMonthStr && date <= todayStr) {
      if (!mtdSalesByUser[userId]) mtdSalesByUser[userId] = {};
      Object.entries(ds.products || {}).forEach(([pId, val]) => {
        mtdSalesByUser[userId][pId] = (mtdSalesByUser[userId][pId] || 0) + Number(val || 0);
      });
    }

    if (ytdMonths.includes(month) && date <= todayStr) {
      if (!ytdSalesByUser[userId]) ytdSalesByUser[userId] = {};
      Object.entries(ds.products || {}).forEach(([pId, val]) => {
        ytdSalesByUser[userId][pId] = (ytdSalesByUser[userId][pId] || 0) + Number(val || 0);
      });
    }
  });

  function formatNum(num: number): number {
    return Math.round((num || 0) * 100) / 100;
  }

  function calcPct(plan: number, ach: number): number {
    if (!plan || plan === 0) return ach > 0 ? 100 : 0;
    return Math.round((ach / plan) * 10000) / 100;
  }

  // Sheet 1: Consolidated MTD
  const consolidatedMtdRows: any[] = [];
  let grandTotalMtdPlan = 0;
  let grandTotalMtdAch = 0;

  products.forEach((prod: any) => {
    const pId = prod.productId || prod.id;
    let pPlan = 0;
    let pAch = 0;
    users.forEach((u: any) => {
      pPlan += mtdPlansByUser[u.id]?.[pId] || 0;
      pAch += mtdSalesByUser[u.id]?.[pId] || 0;
    });

    grandTotalMtdPlan += pPlan;
    grandTotalMtdAch += pAch;

    consolidatedMtdRows.push({
      Category: prod.category || 'General',
      Product: prod.name || prod.productName,
      'Plan (MTD)': formatNum(pPlan),
      'Achievement (MTD)': formatNum(pAch),
      'Achievement %': `${calcPct(pPlan, pAch)}%`
    });
  });

  consolidatedMtdRows.push({
    Category: 'TOTAL',
    Product: 'GRAND TOTAL',
    'Plan (MTD)': formatNum(grandTotalMtdPlan),
    'Achievement (MTD)': formatNum(grandTotalMtdAch),
    'Achievement %': `${calcPct(grandTotalMtdPlan, grandTotalMtdAch)}%`
  });

  // Sheet 2: Consolidated YTD
  const consolidatedYtdRows: any[] = [];
  let grandTotalYtdPlan = 0;
  let grandTotalYtdAch = 0;

  products.forEach((prod: any) => {
    const pId = prod.productId || prod.id;
    let pPlan = 0;
    let pAch = 0;
    users.forEach((u: any) => {
      pPlan += ytdPlansByUser[u.id]?.[pId] || 0;
      pAch += ytdSalesByUser[u.id]?.[pId] || 0;
    });

    grandTotalYtdPlan += pPlan;
    grandTotalYtdAch += pAch;

    consolidatedYtdRows.push({
      Category: prod.category || 'General',
      Product: prod.name || prod.productName,
      'Plan (YTD)': formatNum(pPlan),
      'Achievement (YTD)': formatNum(pAch),
      'Achievement %': `${calcPct(pPlan, pAch)}%`
    });
  });

  consolidatedYtdRows.push({
    Category: 'TOTAL',
    Product: 'GRAND TOTAL',
    'Plan (YTD)': formatNum(grandTotalYtdPlan),
    'Achievement (YTD)': formatNum(grandTotalYtdAch),
    'Achievement %': `${calcPct(grandTotalYtdPlan, grandTotalYtdAch)}%`
  });

  // Sheet 3: User Level MTD
  const userMtdRows: any[] = [];
  users.forEach((u: any) => {
    const userName = u.displayName || u.email || 'User';
    products.forEach((prod: any) => {
      const pId = prod.productId || prod.id;
      const pPlan = mtdPlansByUser[u.id]?.[pId] || 0;
      const pAch = mtdSalesByUser[u.id]?.[pId] || 0;
      userMtdRows.push({
        'User Name': userName,
        'User Email': u.email || '',
        Category: prod.category || 'General',
        Product: prod.name || prod.productName,
        'Plan (MTD)': formatNum(pPlan),
        'Achievement (MTD)': formatNum(pAch),
        'Achievement %': `${calcPct(pPlan, pAch)}%`
      });
    });
  });

  // Sheet 4: User Level YTD
  const userYtdRows: any[] = [];
  users.forEach((u: any) => {
    const userName = u.displayName || u.email || 'User';
    products.forEach((prod: any) => {
      const pId = prod.productId || prod.id;
      const pPlan = ytdPlansByUser[u.id]?.[pId] || 0;
      const pAch = ytdSalesByUser[u.id]?.[pId] || 0;
      userYtdRows.push({
        'User Name': userName,
        'User Email': u.email || '',
        Category: prod.category || 'General',
        Product: prod.name || prod.productName,
        'Plan (YTD)': formatNum(pPlan),
        'Achievement (YTD)': formatNum(pAch),
        'Achievement %': `${calcPct(pPlan, pAch)}%`
      });
    });
  });

  // Build Excel workbook
  const wb = XLSX.utils.book_new();

  const wsConsMtd = XLSX.utils.json_to_sheet(consolidatedMtdRows);
  const wsConsYtd = XLSX.utils.json_to_sheet(consolidatedYtdRows);
  const wsUserMtd = XLSX.utils.json_to_sheet(userMtdRows);
  const wsUserYtd = XLSX.utils.json_to_sheet(userYtdRows);

  XLSX.utils.book_append_sheet(wb, wsConsMtd, 'Consolidated MTD');
  XLSX.utils.book_append_sheet(wb, wsConsYtd, 'Consolidated YTD');
  XLSX.utils.book_append_sheet(wb, wsUserMtd, 'User MTD');
  XLSX.utils.book_append_sheet(wb, wsUserYtd, 'User YTD');

  const base64Excel = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });

  const mtdOverallPct = calcPct(grandTotalMtdPlan, grandTotalMtdAch);
  const ytdOverallPct = calcPct(grandTotalYtdPlan, grandTotalYtdAch);

  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; padding: 20px; color: #1e293b; background-color: #f8fafc; border-radius: 8px;">
      <div style="background-color: #2563eb; color: #ffffff; padding: 20px; border-radius: 6px; text-align: center;">
        <h2 style="margin: 0; font-size: 22px;">Varchaz Daily Performance Report</h2>
        <p style="margin: 6px 0 0 0; font-size: 14px; opacity: 0.9;">Date: ${todayStr} | Consolidated & User Level MTD & YTD</p>
      </div>

      <div style="padding: 20px 0;">
        <h3 style="margin-top: 0; color: #0f172a;">Executive Summary</h3>

        <div style="display: flex; gap: 12px; margin-bottom: 20px;">
          <div style="flex: 1; background: #ffffff; padding: 16px; border-radius: 8px; border: 1px solid #e2e8f0; text-align: center;">
            <div style="font-size: 12px; color: #64748b; font-weight: bold; text-transform: uppercase;">MTD Achievement</div>
            <div style="font-size: 24px; font-weight: bold; color: ${mtdOverallPct >= 80 ? '#16a34a' : '#d97706'}; margin-top: 4px;">${mtdOverallPct}%</div>
            <div style="font-size: 11px; color: #94a3b8; margin-top: 4px;">Plan: ${grandTotalMtdPlan.toLocaleString('en-IN')} | Ach: ${grandTotalMtdAch.toLocaleString('en-IN')}</div>
          </div>
          <div style="flex: 1; background: #ffffff; padding: 16px; border-radius: 8px; border: 1px solid #e2e8f0; text-align: center;">
            <div style="font-size: 12px; color: #64748b; font-weight: bold; text-transform: uppercase;">YTD Achievement</div>
            <div style="font-size: 24px; font-weight: bold; color: ${ytdOverallPct >= 80 ? '#16a34a' : '#d97706'}; margin-top: 4px;">${ytdOverallPct}%</div>
            <div style="font-size: 11px; color: #94a3b8; margin-top: 4px;">Plan: ${grandTotalYtdPlan.toLocaleString('en-IN')} | Ach: ${grandTotalYtdAch.toLocaleString('en-IN')}</div>
          </div>
        </div>

        <p style="font-size: 14px; line-height: 1.5; color: #334155;">
          Please find attached the detailed Excel workbook (<strong>Varchaz_Daily_Report_${todayStr}.xlsx</strong>) containing full Consolidated and User-level MTD and YTD Plan vs Achievement performance reports across all active products.
        </p>

        <ul style="font-size: 13px; color: #475569; padding-left: 20px;">
          <li><strong>Consolidated MTD:</strong> Overall product-wise achievement for current month</li>
          <li><strong>Consolidated YTD:</strong> Overall product-wise achievement for current Financial Year</li>
          <li><strong>User MTD:</strong> Rep-by-rep product-wise MTD achievement</li>
          <li><strong>User YTD:</strong> Rep-by-rep product-wise YTD achievement</li>
        </ul>
      </div>

      <div style="border-top: 1px solid #e2e8f0; padding-top: 16px; text-align: center; color: #94a3b8; font-size: 11px;">
        <p style="margin: 0;">Automated email generated by Varchaz Performance Management System.</p>
      </div>
    </div>
  `;

  const apiUrl = import.meta.env.VITE_EMAIL_API_URL || 'https://varchaz-email-api-sigma.vercel.app/send';
  const apiKey = import.meta.env.VITE_EMAIL_API_KEY || 'your_super_secret_api_key_here';

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey
    },
    body: JSON.stringify({
      to: targetEmail,
      subject: `[Varchaz] Daily Performance Report - MTD & YTD (${todayStr})`,
      html: htmlBody,
      text: `Varchaz Daily Performance Report (${todayStr}). MTD Ach: ${mtdOverallPct}%, YTD Ach: ${ytdOverallPct}%. Please see attached Excel file.`,
      attachments: [
        {
          filename: `Varchaz_Daily_Report_${todayStr}.xlsx`,
          content: base64Excel,
          content_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        }
      ]
    })
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.detail || `Email microservice returned ${response.status}`);
  }

  // Update status in Firestore settings
  await saveDailyReportConfig({
    recipientEmail: targetEmail,
    lastSentAt: new Date(),
    lastStatus: 'success'
  });

  return {
    success: true,
    message: `Daily report Excel sent successfully to ${targetEmail}`
  };
}

// ────────────────────────────────────────────────────────────
// Manual Trigger for 4 Product Groups MIS + 1 Active Products Tracker
// ────────────────────────────────────────────────────────────

const MIS_PRODUCT_PRIORITIES: Record<string, number> = {
  // Liabilities
  'CA': 1, 'CA MAMC': 2, 'SA': 3, 'SA MAMC': 4,
  'IP Value': 5, 'RFD Value': 6, 'UFD Nos.': 7, 'UFD Value': 8, 'Aane Do FD Val': 9,
  // Assets
  'Home Loan': 1, 'LAP': 2, 'Auto Loan': 3, 'Personal Loan': 4,
  'Business Loan': 5, 'Gold Loan': 6, 'MEG': 7, 'EEG/BBG': 8,
  // TPP
  'LI': 1, 'GI/HI': 2, 'MF': 3, 'SIP': 4,
  // Others
  'Credit Card': 1, 'Demat/HSL': 2, 'Payzapp': 3, 'Smart Wealth': 4, 'SSS': 5
};

function sortMisProducts(productsList: any[]): any[] {
  return [...productsList].sort((a, b) => {
    const nameA = a.name || a.productName || '';
    const nameB = b.name || b.productName || '';
    const pA = MIS_PRODUCT_PRIORITIES[nameA] || 99;
    const pB = MIS_PRODUCT_PRIORITIES[nameB] || 99;
    if (pA !== pB) return pA - pB;
    return nameA.localeCompare(nameB);
  });
}

function renderProductGroupMisHtmlTable(
  groupName: string,
  products: any[],
  reps: any[],
  mtdSalesByUser: Record<string, Record<string, number>>,
  dateStr: string,
  isPriorWorkingDay: boolean
): string {
  const colTotals: Record<string, number> = {};
  products.forEach(p => { colTotals[p.id] = 0; });

  let rowsHtml = '';
  reps.forEach((rep, idx) => {
    const rowBg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
    let cellsHtml = '';

    products.forEach(p => {
      const pId = p.id;
      const ach = mtdSalesByUser[rep.id || rep.uid]?.[pId] || 0;

      if (ach > 0) {
        colTotals[pId] = (colTotals[pId] || 0) + ach;
        cellsHtml += `
          <td style="padding: 9px 8px; border: 1px solid #e2e8f0; font-size: 13px; font-weight: 600; color: #0f172a; text-align: center;">
            ${ach.toLocaleString('en-IN')}
          </td>
        `;
      } else {
        cellsHtml += `
          <td style="padding: 9px 8px; border: 1px solid #e2e8f0; font-size: 12px; font-weight: 600; color: #ef4444; text-align: center;">
            Inactive
          </td>
        `;
      }
    });

    rowsHtml += `
      <tr style="background-color: ${rowBg};">
        <td style="padding: 9px 12px; text-align: left; font-weight: 600; color: #1e293b; border: 1px solid #e2e8f0; font-size: 13px; white-space: nowrap;">
          ${rep.displayName || rep.email || 'Team Member'}
        </td>
        ${cellsHtml}
      </tr>
    `;
  });

  let footerCellsHtml = '';
  products.forEach(p => {
    const tot = colTotals[p.id] || 0;
    footerCellsHtml += `
      <td style="padding: 10px 8px; border: 1px solid #cbd5e1; font-size: 13px; font-weight: 700; color: #0f172a; text-align: center;">
        ${tot > 0 ? tot.toLocaleString('en-IN') : '0'}
      </td>
    `;
  });

  const productHeadersHtml = products.map(p => `
    <th style="padding: 10px 8px; font-size: 12px; font-weight: 700; color: #0f172a; border: 1px solid #e2e8f0; text-align: center; white-space: nowrap;">
      ${p.name || p.productName}
    </th>
  `).join('');

  const dateSubBadge = isPriorWorkingDay 
    ? `${dateStr} (Data as of Previous Working Day)` 
    : `${dateStr} (End-of-Day MIS)`;

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 980px; margin: 0 auto; padding: 20px; background-color: #f8fafc; border-radius: 8px;">
      
      <!-- Executive Header -->
      <div style="background: linear-gradient(135deg, #0f172a 0%, #1e3a8a 50%, #2563eb 100%); color: #ffffff; padding: 18px 24px; border-radius: 8px 8px 0 0;">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
          <div>
            <h2 style="margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.02em;">
              Varchaz — Daily MTD Report: ${groupName}
            </h2>
            <p style="margin: 4px 0 0 0; font-size: 13px; opacity: 0.9;">
              Month-to-Date Performance MIS &bull; Product Group Overview
            </p>
          </div>
          <div style="background: rgba(255, 255, 255, 0.2); padding: 6px 14px; border-radius: 6px; font-size: 12px; font-weight: 600; white-space: nowrap;">
            ${dateSubBadge}
          </div>
        </div>
      </div>

      <!-- Main Data Table Container -->
      <div style="background: #ffffff; border: 1px solid #cbd5e1; border-top: none; border-radius: 0 0 8px 8px; overflow-x: auto; padding: 16px; box-shadow: 0 2px 6px rgba(15, 23, 42, 0.04);">
        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
          <thead>
            <tr style="background-color: #0284c7; color: #ffffff;">
              <th colspan="${products.length + 1}" style="padding: 10px; font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; text-align: center; border: 1px solid #0284c7;">
                ${groupName}
              </th>
            </tr>
            <tr style="background-color: #f1f5f9;">
              <th style="padding: 10px 12px; font-size: 12px; font-weight: 700; color: #0f172a; border: 1px solid #e2e8f0; text-align: left; width: 140px; white-space: nowrap;">
                User Name
              </th>
              ${productHeadersHtml}
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
          <tfoot>
            <tr style="background-color: #f8fafc; font-weight: 700; border-top: 2px solid #cbd5e1;">
              <td style="padding: 10px 12px; text-align: left; font-size: 13px; font-weight: 700; color: #0f172a; border: 1px solid #cbd5e1;">
                Total
              </td>
              ${footerCellsHtml}
            </tr>
          </tfoot>
        </table>
      </div>

      <!-- Footer Info -->
      <div style="margin-top: 14px; text-align: center; color: #94a3b8; font-size: 11px;">
        <p style="margin: 0;">Automated daily MTD performance MIS dispatched by Varchaz Performance Management System via VarchazReport@gmail.com.</p>
        <p style="margin: 3px 0 0 0;">Report strictly reflects verified Month-to-Date (MTD) sales data.</p>
      </div>

    </div>
  `;
}

function getMonthWorkingDaysUpToDate(targetDate: Date) {
  const year = targetDate.getFullYear();
  const month = targetDate.getMonth();
  const currentDay = targetDate.getDate();
  const workingDays: Array<{ isoDate: string; displayLabel: string; dayNum: number; dateObj: Date }> = [];

  for (let d = 1; d <= currentDay; d++) {
    const dObj = new Date(year, month, d);
    const holidayCheck = isNonWorkingDay(dObj);
    if (!holidayCheck.isExcluded) {
      const yyyy = dObj.getFullYear();
      const mm = String(dObj.getMonth() + 1).padStart(2, '0');
      const dd = String(dObj.getDate()).padStart(2, '0');
      const isoDate = `${yyyy}-${mm}-${dd}`;

      const dayNum = dObj.getDate();
      const monthShort = dObj.toLocaleString('en-US', { month: 'short' });
      const yearShort = String(dObj.getFullYear()).slice(-2);
      const displayLabel = `${dayNum} ${monthShort} ${yearShort}`;

      workingDays.push({
        isoDate,
        displayLabel,
        dayNum,
        dateObj: dObj
      });
    }
  }
  return workingDays;
}

function renderActiveProductsTrackerHtmlTable(
  displayedDays: Array<{ isoDate: string; displayLabel: string }>,
  allWorkingDays: Array<{ isoDate: string }>,
  reps: any[],
  countsByRepAndDate: Record<string, Record<string, number>>,
  totalsByDate: Record<string, number>,
  dateStr: string,
  isPriorWorkingDay: boolean
): string {
  const isMultiDay = allWorkingDays.length >= 2;
  const latestDay = allWorkingDays[allWorkingDays.length - 1];
  const prevDay = isMultiDay ? allWorkingDays[allWorkingDays.length - 2] : null;

  const dateHeadersHtml = displayedDays.map(day => `
    <th style="padding: 10px 8px; font-size: 13px; font-weight: 700; color: #000000; border: 1.5px solid #000000; text-align: center; white-space: nowrap; background-color: #ffffff;">
      ${day.displayLabel}
    </th>
  `).join('');

  let rowsHtml = '';
  reps.forEach((rep) => {
    let cellsHtml = '';
    const repId = rep.id || rep.uid;
    displayedDays.forEach(day => {
      const cnt = countsByRepAndDate[repId]?.[day.isoDate] || 0;
      cellsHtml += `
        <td style="padding: 8px 10px; border: 1.5px solid #000000; font-size: 13px; color: #000000; text-align: center; background-color: #ffffff;">
          ${cnt}
        </td>
      `;
    });

    let improvementText = 'Baseline';
    let improvementColor = '#64748b';

    if (isMultiDay && prevDay) {
      const latestCount = countsByRepAndDate[repId]?.[latestDay.isoDate] || 0;
      const prevCount = countsByRepAndDate[repId]?.[prevDay.isoDate] || 0;
      if (latestCount > prevCount) {
        improvementText = 'Improved';
        improvementColor = '#16a34a';
      } else if (latestCount === prevCount) {
        improvementText = 'No Change';
        improvementColor = '#ea580c';
      } else {
        improvementText = 'Declined';
        improvementColor = '#dc2626';
      }
    }

    rowsHtml += `
      <tr>
        <td style="padding: 8px 14px; text-align: left; font-size: 13px; font-weight: 500; color: #000000; border: 1.5px solid #000000; white-space: nowrap; background-color: #ffffff;">
          ${rep.displayName || rep.email || 'Team Member'}
        </td>
        ${cellsHtml}
        <td style="padding: 8px 10px; font-size: 13px; font-weight: 700; color: ${improvementColor}; border: 1.5px solid #000000; text-align: center; white-space: nowrap; background-color: #ffffff;">
          ${improvementText}
        </td>
      </tr>
    `;
  });

  let footerTotalCellsHtml = '';
  displayedDays.forEach(day => {
    const tot = totalsByDate[day.isoDate] || 0;
    footerTotalCellsHtml += `
      <td style="padding: 10px 8px; border: 1.5px solid #000000; font-size: 14px; font-weight: 800; color: #000000; text-align: center; background-color: #ffffff;">
        ${tot}
      </td>
    `;
  });

  let totalImprovementText = 'Baseline';
  let totalImprovementColor = '#64748b';
  if (isMultiDay && prevDay) {
    const latestTot = totalsByDate[latestDay.isoDate] || 0;
    const prevTot = totalsByDate[prevDay.isoDate] || 0;
    if (latestTot > prevTot) {
      totalImprovementText = 'Improved';
      totalImprovementColor = '#16a34a';
    } else {
      totalImprovementText = 'No Change';
      totalImprovementColor = '#ea580c';
    }
  }

  const colSpan = displayedDays.length + 2;
  const dateSubBadge = isPriorWorkingDay 
    ? `${dateStr} (Data as of Previous Working Day)` 
    : `${dateStr} (End-of-Day MIS)`;

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 980px; margin: 0 auto; padding: 20px; background-color: #f8fafc; border-radius: 8px;">
      
      <!-- Executive Header -->
      <div style="background: linear-gradient(135deg, #0f172a 0%, #065f46 50%, #059669 100%); color: #ffffff; padding: 18px 24px; border-radius: 8px 8px 0 0;">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
          <div>
            <h2 style="margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.02em;">
              Varchaz — Daily Active Products Tracker
            </h2>
            <p style="margin: 4px 0 0 0; font-size: 13px; opacity: 0.9;">
              Month-to-Date (MTD) Consolidated Active Products &bull; Working Days Tracker
            </p>
          </div>
          <div style="background: rgba(255, 255, 255, 0.2); padding: 6px 14px; border-radius: 6px; font-size: 12px; font-weight: 600; white-space: nowrap;">
            ${dateSubBadge}
          </div>
        </div>
      </div>

      <!-- Main Data Table Container -->
      <div style="background: #ffffff; border: 1px solid #cbd5e1; border-top: none; border-radius: 0 0 8px 8px; overflow-x: auto; padding: 20px; box-shadow: 0 2px 6px rgba(15, 23, 42, 0.04);">
        <table style="width: 100%; border-collapse: collapse; font-size: 13px; border: 1.5px solid #000000; margin: 0 auto;">
          <thead>
            <tr style="background-color: #ffffff;">
              <th colspan="${colSpan}" style="padding: 12px; font-size: 16px; font-weight: 700; color: #000000; border: 1.5px solid #000000; text-align: center; letter-spacing: 0.01em;">
                Active Products Tracker
              </th>
            </tr>
            <tr style="background-color: #ffffff;">
              <th style="padding: 10px 14px; font-size: 13px; font-weight: 700; color: #000000; border: 1.5px solid #000000; text-align: left; width: 140px; white-space: nowrap;">
                User Name
              </th>
              ${dateHeadersHtml}
              <th style="padding: 8px 10px; font-size: 12px; font-weight: 700; color: #000000; border: 1.5px solid #000000; text-align: center; max-width: 130px; line-height: 1.25;">
                Improvement from previous day
              </th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
          <tfoot>
            <tr style="background-color: #ffffff; font-weight: 800;">
              <td style="padding: 10px 14px; text-align: left; font-size: 14px; font-weight: 800; color: #000000; border: 1.5px solid #000000;">
                Total
              </td>
              ${footerTotalCellsHtml}
              <td style="padding: 10px 8px; font-size: 13px; font-weight: 800; color: ${totalImprovementColor}; border: 1.5px solid #000000; text-align: center;">
                ${totalImprovementText}
              </td>
            </tr>
          </tfoot>
        </table>

        <!-- Footnotes -->
        <div style="margin-top: 16px; font-size: 12px; color: #64748b; line-height: 1.5; padding: 0 4px;">
          <p style="margin: 0 0 4px 0;"><strong>&bull; Consolidated Monthly Metric:</strong> Cell values reflect the <strong>consolidated count of distinct products activated Month-to-Date (MTD)</strong> as of each working day.</p>
          <p style="margin: 0 0 4px 0;"><strong>&bull; Calendar Exclusions:</strong> Non-working days (all Sundays, 2nd &amp; 4th Saturdays) are excluded from tracking.</p>
          <p style="margin: 0;"><strong>&bull; Column Progression:</strong> Displays up to the last 7 working days.</p>
        </div>
      </div>

      <!-- Footer Info -->
      <div style="margin-top: 14px; text-align: center; color: #94a3b8; font-size: 11px;">
        <p style="margin: 0;">Automated daily active products tracker dispatched by Varchaz Performance Management System via VarchazReport@gmail.com.</p>
      </div>

    </div>
  `;
}

export interface TriggerReportsResult {
  success: boolean;
  count: number;
  date: string;
  isPriorWorkingDay: boolean;
  effectiveDateStr: string;
  effectiveDateDisplay: string;
  toRecipientsCount: number;
  ccRecipientsCount: number;
  message: string;
}

/**
 * Trigger the 4 Product Group MIS emails + 1 Active Products Tracker email manually.
 * - Cutoff rule: If triggered before 6:00 PM IST, data up till previous working day is sent (today excluded).
 * - Recipients: TO active reps (role === 'user'), CC supervisor (role === 'supervisor'). Admins strictly excluded.
 */
export async function trigger4Plus1ReportsManual(
  supervisorUser?: { uid: string; displayName?: string; email?: string; automailerEmail?: string },
  onProgress?: (step: string, current: number, total: number) => void
): Promise<TriggerReportsResult> {
  const cutoff = getReportingCutoffInfo();
  const effectiveDateStr = cutoff.effectiveDateStr;
  const currentMonthStr = effectiveDateStr.substring(0, 7);
  const isPriorWorkingDay = cutoff.isPriorWorkingDay;

  onProgress?.('Fetching products and team members...', 0, 5);

  // 1. Fetch products & active approved users
  const [productsSnap, usersSnap] = await Promise.all([
    getDocs(collection(db, 'products')),
    getDocs(query(collection(db, 'users'), where('status', '==', 'approved')))
  ]);

  const rawProducts = productsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const allUsers = usersSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));

  // Reps (active users only, sorted alphabetically)
  const reps = allUsers
    .filter(u => u.role === 'user')
    .sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));

  // Target recipients: TO active reps, CC supervisor(s)
  // Admins & viewers are strictly excluded!
  const toRecipients = Array.from(new Set(
    reps
      .map(u => (u.automailerEmail || u.email || '').trim().toLowerCase())
      .filter(Boolean)
  ));

  const ccRecipients = Array.from(new Set(
    allUsers
      .filter(u => u.role === 'supervisor')
      .map(u => (u.automailerEmail || u.email || '').trim().toLowerCase())
      .filter(Boolean)
  ));

  if (toRecipients.length === 0) {
    throw new Error('No active team member recipients found with configured automailer email.');
  }

  onProgress?.('Fetching sales records...', 0, 5);

  // 2. Fetch daily sales
  // Query by supervisorId to satisfy Firestore rules, or fallback to rep user IDs
  let salesDocs: any[] = [];
  const supervisorUid = supervisorUser?.uid;
  if (supervisorUid) {
    try {
      const qSup = query(collection(db, 'dailySales'), where('supervisorId', '==', supervisorUid));
      const supSnap = await getDocs(qSup);
      salesDocs = supSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (err) {
      console.warn('SupervisorId sales query returned error, fetching per rep:', err);
    }
  }

  if (salesDocs.length === 0 && reps.length > 0) {
    for (const rep of reps) {
      try {
        const qRep = query(collection(db, 'dailySales'), where('userId', '==', rep.id || rep.uid));
        const repSnap = await getDocs(qRep);
        repSnap.docs.forEach(d => salesDocs.push({ id: d.id, ...d.data() }));
      } catch (err) {
        console.warn('Rep sales query failed for', rep.id, err);
      }
    }
  }

  // Calculate MTD sales per user per product up to effectiveDateStr
  // If isPriorWorkingDay is true, any sales from today are strictly excluded!
  const mtdSalesByUser: Record<string, Record<string, number>> = {};
  salesDocs.forEach(ds => {
    if (ds.date && ds.date.substring(0, 7) === currentMonthStr && ds.date <= effectiveDateStr && ds.userId) {
      if (!mtdSalesByUser[ds.userId]) mtdSalesByUser[ds.userId] = {};
      Object.entries(ds.products || {}).forEach(([pId, val]) => {
        mtdSalesByUser[ds.userId][pId] = (mtdSalesByUser[ds.userId][pId] || 0) + Number(val || 0);
      });
    }
  });

  const apiUrl = import.meta.env.VITE_EMAIL_API_URL || 'https://varchaz-email-api-sigma.vercel.app/send';
  const apiKey = import.meta.env.VITE_EMAIL_API_KEY || 'your_super_secret_api_key_here';

  const groupConfigs = [
    {
      name: 'Liabilities',
      matcher: (p: any) => (p.category || '').toLowerCase().includes('liabilit')
    },
    {
      name: 'Assets',
      matcher: (p: any) => (p.category || '').toLowerCase().includes('asset')
    },
    {
      name: 'TPP',
      matcher: (p: any) => (p.category || '').toLowerCase().includes('tpp')
    },
    {
      name: 'Others',
      matcher: (p: any) => {
        const cat = (p.category || '').toLowerCase();
        return !cat.includes('liabilit') && !cat.includes('asset') && !cat.includes('tpp');
      }
    }
  ];

  let emailsDispatched = 0;

  // 3. Dispatch Emails 1-4: Product Groups MIS
  for (let i = 0; i < groupConfigs.length; i++) {
    const gc = groupConfigs[i];
    const groupProds = sortMisProducts(rawProducts.filter(gc.matcher));
    if (groupProds.length === 0) continue;

    onProgress?.(`Sending ${gc.name} MIS (${i + 1}/5)...`, i, 5);

    const htmlBody = renderProductGroupMisHtmlTable(
      gc.name,
      groupProds,
      reps,
      mtdSalesByUser,
      effectiveDateStr,
      isPriorWorkingDay
    );

    const subjectTag = isPriorWorkingDay 
      ? `(As of ${effectiveDateStr} / Prior Working Day)`
      : `(${effectiveDateStr})`;

    const payload: any = {
      to: toRecipients,
      subject: `[Varchaz] Daily MTD Performance MIS - ${gc.name} ${subjectTag}`,
      html: htmlBody,
      text: `Varchaz Daily MTD Performance MIS for ${gc.name} ${subjectTag}. Please view in an HTML-compatible client.`
    };
    if (ccRecipients.length > 0) {
      payload.cc = ccRecipients;
    }

    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Failed to send ${gc.name} email (${res.status}): ${errText}`);
    }
    emailsDispatched++;
  }

  // 4. Dispatch Email 5: Active Products Tracker
  onProgress?.('Sending Active Products Tracker (5/5)...', 4, 5);

  const effectiveDateObj = new Date(effectiveDateStr + 'T12:00:00Z');
  const allWorkingDays = getMonthWorkingDaysUpToDate(effectiveDateObj);
  const displayedDays = allWorkingDays.length <= 7 ? allWorkingDays : allWorkingDays.slice(-7);
  const validProductIds = new Set(rawProducts.map(p => p.id));

  const countsByRepAndDate: Record<string, Record<string, number>> = {};
  const totalsByDate: Record<string, number> = {};
  displayedDays.forEach(d => { totalsByDate[d.isoDate] = 0; });
  if (allWorkingDays.length >= 2) {
    const prevDay = allWorkingDays[allWorkingDays.length - 2];
    totalsByDate[prevDay.isoDate] = 0;
  }

  reps.forEach(rep => {
    const repId = rep.id || rep.uid;
    countsByRepAndDate[repId] = {};
    const repSales = salesDocs.filter(ds => ds.userId === repId && ds.date && ds.date.substring(0, 7) === currentMonthStr && ds.date <= effectiveDateStr);

    allWorkingDays.forEach(wDay => {
      const productTotals: Record<string, number> = {};
      repSales.forEach(ds => {
        if (ds.date <= wDay.isoDate && ds.products) {
          Object.entries(ds.products).forEach(([pId, val]) => {
            if (validProductIds.has(pId)) {
              productTotals[pId] = (productTotals[pId] || 0) + Number(val || 0);
            }
          });
        }
      });
      const activeCount = Object.values(productTotals).filter(v => v > 0).length;
      countsByRepAndDate[repId][wDay.isoDate] = activeCount;
    });
  });

  allWorkingDays.forEach(wDay => {
    totalsByDate[wDay.isoDate] = reps.reduce((sum, rep) => sum + (countsByRepAndDate[rep.id || rep.uid]?.[wDay.isoDate] || 0), 0);
  });

  const trackerHtml = renderActiveProductsTrackerHtmlTable(
    displayedDays,
    allWorkingDays,
    reps,
    countsByRepAndDate,
    totalsByDate,
    effectiveDateStr,
    isPriorWorkingDay
  );

  const trackerSubjectTag = isPriorWorkingDay 
    ? `(As of ${effectiveDateStr} / Prior Working Day)`
    : `- ${effectiveDateStr}`;

  const trackerPayload: any = {
    to: toRecipients,
    subject: `[Varchaz] Daily Active Products Tracker ${trackerSubjectTag}`,
    html: trackerHtml,
    text: `Varchaz Daily Active Products Tracker ${trackerSubjectTag}. Please view in an HTML-compatible client.`
  };
  if (ccRecipients.length > 0) {
    trackerPayload.cc = ccRecipients;
  }

  const trackerRes = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
    body: JSON.stringify(trackerPayload)
  });

  if (!trackerRes.ok) {
    const errText = await trackerRes.text().catch(() => '');
    throw new Error(`Failed to send Active Products Tracker email (${trackerRes.status}): ${errText}`);
  }
  emailsDispatched++;

  onProgress?.('All 5 reports dispatched successfully!', 5, 5);

  // Attempt to save timestamp in settings (ignore if supervisor lacks write permission)
  try {
    await setDoc(doc(db, 'settings', SETTINGS_DOC_ID), {
      lastProductGroupsSentAt: new Date(),
      lastProductGroupsCount: emailsDispatched,
      lastStatus: 'success',
      lastTriggeredBy: supervisorUser?.email || supervisorUser?.displayName || 'Supervisor'
    }, { merge: true });
  } catch {
    // Non-fatal if firestore rules restrict write to admin only
  }

  return {
    success: true,
    count: emailsDispatched,
    date: effectiveDateStr,
    isPriorWorkingDay,
    effectiveDateStr,
    effectiveDateDisplay: cutoff.effectiveDateDisplay,
    toRecipientsCount: toRecipients.length,
    ccRecipientsCount: ccRecipients.length,
    message: `Successfully dispatched all ${emailsDispatched} reports to ${toRecipients.length} team members (CC: ${ccRecipients.length} supervisor${ccRecipients.length === 1 ? '' : 's'})!`
  };
}

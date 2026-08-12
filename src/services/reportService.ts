/* ============================================================
   Varchaz — Daily Report Service
   ============================================================ */

import { doc, getDoc, setDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../config/firebase';

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
        isEnabled: data.isEnabled !== false,
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
    isEnabled: true,
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

  // Fetch Firestore Collections
  const productsSnap = await getDocs(collection(db, 'products'));
  const products = productsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const usersSnap = await getDocs(query(collection(db, 'users'), where('status', '==', 'approved')));
  const users = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));

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

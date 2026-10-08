/* ============================================================
   Varchaz — Daily Report Cron Script (GitHub Actions & Standalone)
   ============================================================ */

const admin = require('firebase-admin');
const XLSX = require('xlsx');

const DEFAULT_EMAIL_API_KEY = 'your_super_secret_api_key_here';
const DEFAULT_EMAIL_API_URL = 'https://varchaz-email-api-sigma.vercel.app/send';

async function sendEmailViaMicroservice(apiUrl, apiKey, payload) {
  const targetUrl = apiUrl || DEFAULT_EMAIL_API_URL;
  const targetKey = apiKey || DEFAULT_EMAIL_API_KEY;

  const res = await fetch(targetUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': targetKey },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Email microservice error (${res.status}): ${errText}`);
  }

  return await res.json().catch(() => ({}));
}

function initializeFirebase() {
  if (admin.apps.length > 0) return;

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) {
    // If running in an environment with Application Default Credentials (e.g., GCP / Cloud Functions)
    try {
      admin.initializeApp({
        projectId: process.env.VITE_FIREBASE_PROJECT_ID || 'varchaz'
      });
      console.log('Initializing Firebase Admin with Application Default Credentials...');
      return;
    } catch (err) {
      console.error('CRITICAL: FIREBASE_SERVICE_ACCOUNT_JSON environment variable is missing.');
      process.exit(1);
    }
  }

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(serviceAccountJson);
  } catch (e) {
    console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON:', e.message);
    process.exit(1);
  }

  console.log('Initializing Firebase Admin with service account credentials...');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

function getCategoryRank(category) {
  const cat = (category || '').toLowerCase().trim();
  if (cat.includes('liabilit')) return 1;
  if (cat.includes('retail asset') || cat === 'retail assets') return 2;
  if (cat.includes('tpp')) return 3;
  if (cat.includes('asset')) return 4;
  if (cat.includes('other')) return 5;
  return 6;
}

function sortProductsByCategoryPriority(productsList) {
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

function formatNumberVal(num) {
  return Math.round((num || 0) * 100) / 100;
}

function calcPctVal(plan, ach) {
  if (!plan || plan === 0) return ach > 0 ? 100 : 0;
  return Math.round((ach / plan) * 10000) / 100;
}

/** Check if date is a non-working day in IST (All Sundays, 2nd & 4th Saturdays of the month) */
function isNonWorkingDay(dateObj) {
  const dayOfWeek = dateObj.getDay(); // 0 = Sunday, 6 = Saturday
  if (dayOfWeek === 0) {
    return { isExcluded: true, reason: 'Sunday' };
  }
  if (dayOfWeek === 6) {
    const dateOfMonth = dateObj.getDate();
    const nthSaturday = Math.ceil(dateOfMonth / 7);
    if (nthSaturday === 2 || nthSaturday === 4) {
      return { isExcluded: true, reason: `${nthSaturday === 2 ? '2nd' : '4th'} Saturday` };
    }
  }
  return { isExcluded: false, reason: null };
}

/**
 * Check if date is the last working day of the week in IST.
 * - In 2nd and 4th weeks of the month (where Saturday is a non-working day), Friday is the last working day.
 * - Otherwise (1st, 3rd, 5th weeks), Saturday is the last working day.
 */
function isLastWorkingDayOfWeek(dateObj) {
  const dayOfWeek = dateObj.getDay(); // 0 = Sunday, 5 = Friday, 6 = Saturday
  
  if (dayOfWeek === 5) { // Friday
    const tomorrow = new Date(dateObj.getTime() + (24 * 60 * 60 * 1000));
    const nthSaturday = Math.ceil(tomorrow.getDate() / 7);
    if (nthSaturday === 2 || nthSaturday === 4) {
      return { isLastWorkingDay: true, reason: `Friday before ${nthSaturday === 2 ? '2nd' : '4th'} Saturday holiday` };
    }
    return { isLastWorkingDay: false, reason: 'Friday (Saturday is a working day this week)' };
  }

  if (dayOfWeek === 6) { // Saturday
    const dateOfMonth = dateObj.getDate();
    const nthSaturday = Math.ceil(dateOfMonth / 7);
    if (nthSaturday === 2 || nthSaturday === 4) {
      return { isLastWorkingDay: false, reason: `${nthSaturday === 2 ? '2nd' : '4th'} Saturday is a non-working day` };
    }
    return { isLastWorkingDay: true, reason: `Working Saturday (${nthSaturday === 1 ? '1st' : nthSaturday === 3 ? '3rd' : '5th'} Saturday)` };
  }

  return { isLastWorkingDay: false, reason: 'Midweek day' };
}

/** Get the previous working day in IST prior to the given reference date (or today). */
function getPreviousWorkingDay(refDate) {
  const d = new Date(refDate);
  d.setDate(d.getDate() - 1);
  while (isNonWorkingDay(d).isExcluded) {
    d.setDate(d.getDate() - 1);
  }
  return d;
}

/**
 * Get reporting cutoff date based on 6:00 PM IST (18:00) rule:
 * - If before 18:00 IST: cutoff is previous working day, today is strictly excluded.
 * - If at or after 18:00 IST: cutoff is today.
 */
function getReportingCutoffInfo(istDate) {
  const istHour = istDate.getUTCHours();
  const istMinute = istDate.getUTCMinutes();
  const todayStr = istDate.toISOString().split('T')[0];

  if (istHour < 18) {
    const prev = getPreviousWorkingDay(istDate);
    const prevStr = prev.toISOString().split('T')[0];
    return {
      isPriorWorkingDay: true,
      effectiveDateStr: prevStr,
      effectiveDateObj: prev,
      todayStr,
      istHour,
      istMinute
    };
  }

  return {
    isPriorWorkingDay: false,
    effectiveDateStr: todayStr,
    effectiveDateObj: istDate,
    todayStr,
    istHour,
    istMinute
  };
}

/** Render a clean, app-styled HTML table for MTD Plan vs Achievement */
function renderMtdHtmlTable(title, rows, totalPlan, totalAch) {
  const totalPct = calcPctVal(totalPlan, totalAch);

  let rowsHtml = '';
  rows.forEach((r, idx) => {
    const pct = calcPctVal(r.plan, r.ach);
    const badgeBg = pct >= 100 ? '#dcfce7' : pct >= 80 ? '#fef3c7' : '#fee2e2';
    const badgeColor = pct >= 100 ? '#15803d' : pct >= 80 ? '#b45309' : '#b91c1c';
    const rowBg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';

    rowsHtml += `
      <tr style="background-color: ${rowBg}; border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 10px 12px; font-size: 13px; color: #475569;">${r.category}</td>
        <td style="padding: 10px 12px; font-size: 13px; font-weight: 600; color: #0f172a;">${r.product}</td>
        <td style="padding: 10px 12px; font-size: 13px; text-align: right; color: #334155;">${r.plan.toLocaleString('en-IN')}</td>
        <td style="padding: 10px 12px; font-size: 13px; text-align: right; color: #334155;">${r.ach.toLocaleString('en-IN')}</td>
        <td style="padding: 10px 12px; font-size: 13px; text-align: right;">
          <span style="background-color: ${badgeBg}; color: ${badgeColor}; font-weight: bold; padding: 3px 8px; border-radius: 4px; font-size: 12px;">
            ${pct}%
          </span>
        </td>
      </tr>
    `;
  });

  const totalBadgeBg = totalPct >= 100 ? '#dcfce7' : totalPct >= 80 ? '#fef3c7' : '#fee2e2';
  const totalBadgeColor = totalPct >= 100 ? '#15803d' : totalPct >= 80 ? '#b45309' : '#b91c1c';

  return `
    <div style="margin-bottom: 24px;">
      <h3 style="margin: 0 0 12px 0; font-size: 16px; color: #0f172a; border-bottom: 2px solid #2563eb; padding-bottom: 6px; display: inline-block;">
        ${title} (MTD Plan vs. Achievement)
      </h3>
      <table style="width: 100%; border-collapse: collapse; margin-top: 8px; font-family: Arial, sans-serif; box-shadow: 0 1px 3px rgba(0,0,0,0.05); border-radius: 6px; overflow: hidden;">
        <thead>
          <tr style="background-color: #1e293b; color: #ffffff; text-align: left;">
            <th style="padding: 12px; font-size: 13px; font-weight: bold; text-transform: uppercase;">Category</th>
            <th style="padding: 12px; font-size: 13px; font-weight: bold; text-transform: uppercase;">Product</th>
            <th style="padding: 12px; font-size: 13px; font-weight: bold; text-transform: uppercase; text-align: right;">Plan (MTD)</th>
            <th style="padding: 12px; font-size: 13px; font-weight: bold; text-transform: uppercase; text-align: right;">Achievement (MTD)</th>
            <th style="padding: 12px; font-size: 13px; font-weight: bold; text-transform: uppercase; text-align: right;">Achievement %</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
        <tfoot>
          <tr style="background-color: #e2e8f0; font-weight: bold; border-top: 2px solid #cbd5e1;">
            <td style="padding: 12px; font-size: 13px; color: #0f172a;">TOTAL</td>
            <td style="padding: 12px; font-size: 13px; color: #0f172a;">GRAND TOTAL</td>
            <td style="padding: 12px; font-size: 13px; text-align: right; color: #0f172a;">${totalPlan.toLocaleString('en-IN')}</td>
            <td style="padding: 12px; font-size: 13px; text-align: right; color: #0f172a;">${totalAch.toLocaleString('en-IN')}</td>
            <td style="padding: 12px; font-size: 13px; text-align: right;">
              <span style="background-color: ${totalBadgeBg}; color: ${totalBadgeColor}; font-weight: bold; padding: 4px 10px; border-radius: 4px; font-size: 12px;">
                ${totalPct}%
              </span>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  `;
}

function renderWeeklyCommitmentsHtmlTable(title, userRows) {
  let rowsHtml = '';
  userRows.forEach((r, idx) => {
    const consistency = r.consistency;
    const badgeBg = consistency >= 80 ? '#dcfce7' : consistency >= 50 ? '#fef3c7' : '#fee2e2';
    const badgeColor = consistency >= 80 ? '#15803d' : consistency >= 50 ? '#b45309' : '#b91c1c';
    const rowBg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';

    rowsHtml += `
      <tr style="background-color: ${rowBg}; border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 10px 12px; font-size: 13px; font-weight: 600; color: #0f172a;">${r.name}</td>
        <td style="padding: 10px 12px; font-size: 13px; text-align: center; color: #475569;">${r.daysCommitted}</td>
        <td style="padding: 10px 12px; font-size: 13px; text-align: right; color: #334155;">₹${(r.totalCommitted || 0).toLocaleString('en-IN')}</td>
        <td style="padding: 10px 12px; font-size: 13px; text-align: right; color: #334155;">₹${(r.totalAchieved || 0).toLocaleString('en-IN')}</td>
        <td style="padding: 10px 12px; font-size: 13px; text-align: right;">
          <span style="background-color: ${badgeBg}; color: ${badgeColor}; font-weight: bold; padding: 3px 8px; border-radius: 4px; font-size: 12px;">
            ${consistency}%
          </span>
        </td>
      </tr>
    `;
  });

  return `
    <div style="margin-top: 24px; margin-bottom: 24px;">
      <h3 style="margin: 0 0 12px 0; font-size: 16px; color: #0f172a; border-bottom: 2px solid #16a34a; padding-bottom: 6px; display: inline-block;">
        🎯 ${title}
      </h3>
      <table style="width: 100%; border-collapse: collapse; margin-top: 8px; font-family: Arial, sans-serif; box-shadow: 0 1px 3px rgba(0,0,0,0.05); border-radius: 6px; overflow: hidden;">
        <thead>
          <tr style="background-color: #1e293b; color: #ffffff; text-align: left;">
            <th style="padding: 12px; font-size: 13px; font-weight: bold;">Team Member</th>
            <th style="padding: 12px; font-size: 13px; font-weight: bold; text-align: center;">Days Entered</th>
            <th style="padding: 12px; font-size: 13px; font-weight: bold; text-align: right;">Committed (₹)</th>
            <th style="padding: 12px; font-size: 13px; font-weight: bold; text-align: right;">Achieved (₹)</th>
            <th style="padding: 12px; font-size: 13px; font-weight: bold; text-align: right;">Consistency %</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
      <p style="font-size: 11px; color: #64748b; margin-top: 6px; font-style: italic;">
        * Note: Weekly Consistency % is the average daily target fulfillment percentage capped at 100% per day.
      </p>
    </div>
  `;
}

function getWeekDates(refDate = new Date()) {
  const d = new Date(refDate);
  const day = d.getDay();
  const diffToMonday = (day === 0 ? -6 : 1) - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diffToMonday);

  const dates = [];
  for (let i = 0; i < 6; i++) {
    const cur = new Date(monday);
    cur.setDate(monday.getDate() + i);
    dates.push(cur.toISOString().split('T')[0]);
  }
  return {
    weekStart: dates[0],
    weekEnd: dates[dates.length - 1],
    dates
  };
}

async function runDailyReportCron() {
  initializeFirebase();
  const db = admin.firestore();

  const settingsDoc = await db.collection('settings').doc('dailyReportConfig').get();
  const isEnabled = settingsDoc.exists ? settingsDoc.data()?.isEnabled === true : false;
  if (!isEnabled && !process.env.FORCE_RUN) {
    console.log('Weekly MTD Report auto-mailer is currently disabled in settings (isEnabled is false). Skipping execution.');
    return;
  }

  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istDate = new Date(now.getTime() + istOffset);
  const todayStr = istDate.toISOString().split('T')[0]; // YYYY-MM-DD
  const currentMonthStr = todayStr.substring(0, 7); // YYYY-MM

  const isForce = process.env.FORCE_RUN || process.argv.includes('--force');
  const lastWorkingDayCheck = isLastWorkingDayOfWeek(istDate);
  if (!lastWorkingDayCheck.isLastWorkingDay && !isForce) {
    console.log(`Skipping Weekly MTD Report dispatch today (${todayStr}): Not the last working day of the week (${lastWorkingDayCheck.reason}).`);
    return;
  }

  console.log(`Executing Varchaz Weekly MTD Plan vs. Ach Auto Mailer Cron for date: ${todayStr} (IST)...`);

  const currentYear = istDate.getFullYear();
  const currentMonthNum = istDate.getMonth() + 1; // 1-12
  const fyStartYear = currentMonthNum >= 4 ? currentYear : currentYear - 1;

  const ytdMonths = [];
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
  const productsSnap = await db.collection('products').get();
  const rawProducts = productsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  const products = sortProductsByCategoryPriority(rawProducts);

  const usersSnap = await db.collection('users').where('status', '==', 'approved').get();
  const allUsers = usersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

  // Fetch weekly commitments (Monday to Saturday)
  const weekInfo = getWeekDates(istDate);
  const commitmentsSnap = await db.collection('dailyCommitments')
    .where('date', '>=', weekInfo.weekStart)
    .where('date', '<=', weekInfo.weekEnd)
    .get();
  const allCommitments = commitmentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

  const monthlyPlansSnap = await db.collection('monthlyPlans').get();
  const allMonthlyPlans = monthlyPlansSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

  const dailySalesSnap = await db.collection('dailySales').get();
  const allDailySales = dailySalesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

  const mtdPlansByUser = {};
  const ytdPlansByUser = {};

  allMonthlyPlans.forEach((mp) => {
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

  const mtdSalesByUser = {};
  const ytdSalesByUser = {};

  allDailySales.forEach((ds) => {
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

  const apiUrl = process.env.EMAIL_API_URL || DEFAULT_EMAIL_API_URL;
  const apiKey = process.env.EMAIL_API_KEY || DEFAULT_EMAIL_API_KEY;

  let totalEmailsDispatched = 0;
  const supervisors = allUsers.filter(u => u.role === 'supervisor');

  for (const supervisor of supervisors) {
    const supId = supervisor.id;
    const supAutomailerEmail = supervisor.automailerEmail || supervisor.email;
    const teamMembers = allUsers.filter(u => 
      (u.role === 'user' || u.role === 'supervisor') && (u.supervisorId === supId || u.id === supId)
    );

    if (teamMembers.length === 0) continue;

    // ──────────────────────────────────────────────────
    // TYPE A: CONSOLIDATED TEAM REPORT
    // ──────────────────────────────────────────────────
    const consMtdRows = [];
    const consYtdRows = [];
    const consMtdTableData = [];

    let teamMtdPlanTotal = 0;
    let teamMtdAchTotal = 0;
    let teamYtdPlanTotal = 0;
    let teamYtdAchTotal = 0;

    products.forEach((prod) => {
      const pId = prod.productId || prod.id;
      let pMtdPlan = 0;
      let pMtdAch = 0;
      let pYtdPlan = 0;
      let pYtdAch = 0;

      teamMembers.forEach((u) => {
        pMtdPlan += mtdPlansByUser[u.id]?.[pId] || 0;
        pMtdAch += mtdSalesByUser[u.id]?.[pId] || 0;
        pYtdPlan += ytdPlansByUser[u.id]?.[pId] || 0;
        pYtdAch += ytdSalesByUser[u.id]?.[pId] || 0;
      });

      teamMtdPlanTotal += pMtdPlan;
      teamMtdAchTotal += pMtdAch;
      teamYtdPlanTotal += pYtdPlan;
      teamYtdAchTotal += pYtdAch;

      const categoryName = prod.category || 'General';
      const productName = prod.name || prod.productName || 'Product';

      consMtdTableData.push({
        category: categoryName,
        product: productName,
        plan: formatNumberVal(pMtdPlan),
        ach: formatNumberVal(pMtdAch)
      });

      consMtdRows.push({
        Category: categoryName,
        Product: productName,
        'Plan (MTD)': formatNumberVal(pMtdPlan),
        'Achievement (MTD)': formatNumberVal(pMtdAch),
        'Achievement %': `${calcPctVal(pMtdPlan, pMtdAch)}%`
      });

      consYtdRows.push({
        Category: categoryName,
        Product: productName,
        'Plan (YTD)': formatNumberVal(pYtdPlan),
        'Achievement (YTD)': formatNumberVal(pYtdAch),
        'Achievement %': `${calcPctVal(pYtdPlan, pYtdAch)}%`
      });
    });

    consMtdRows.push({
      Category: 'TOTAL',
      Product: 'GRAND TOTAL',
      'Plan (MTD)': formatNumberVal(teamMtdPlanTotal),
      'Achievement (MTD)': formatNumberVal(teamMtdAchTotal),
      'Achievement %': `${calcPctVal(teamMtdPlanTotal, teamMtdAchTotal)}%`
    });

    consYtdRows.push({
      Category: 'TOTAL',
      Product: 'GRAND TOTAL',
      'Plan (YTD)': formatNumberVal(teamYtdPlanTotal),
      'Achievement (YTD)': formatNumberVal(teamYtdAchTotal),
      'Achievement %': `${calcPctVal(teamYtdPlanTotal, teamYtdAchTotal)}%`
    });

    // Create Consolidated Weekly Commitments Sheet & Table
    const consWeeklyCommitmentRows = [];
    const teamCommitmentTableData = [];

    teamMembers.forEach((u) => {
      const userComms = allCommitments.filter((c) => c.userId === u.id);
      let commTotal = 0;
      let achTotal = 0;
      let cappedSum = 0;
      let reportedDays = 0;
      let fulfilledDays = 0;

      userComms.forEach((c) => {
        commTotal += Number(c.totalCommitted || 0);
        const ach = Number(c.totalAchieved || 0);
        achTotal += ach;
        if (c.isFulfilled) fulfilledDays++;
        if (c.eodReported) {
          reportedDays++;
          const rawPct = c.totalCommitted > 0 ? (ach / c.totalCommitted) * 100 : 0;
          cappedSum += Math.min(100, Math.max(0, rawPct));
        }
      });

      const consistency = reportedDays > 0 ? Math.round((cappedSum / reportedDays) * 10) / 10 : 0;
      const status = consistency >= 80 ? 'Target Master' : consistency >= 50 ? 'Consistent' : 'Developing';

      consWeeklyCommitmentRows.push({
        'Rep Name': u.displayName,
        'Days Entered': `${userComms.length} days`,
        'Days Fulfilled': `${fulfilledDays} days`,
        'Total Committed (₹)': formatNumberVal(commTotal),
        'Total Achieved (₹)': formatNumberVal(achTotal),
        'Weekly Consistency % (Capped 100%)': `${consistency}%`,
        'Status': status
      });

      teamCommitmentTableData.push({
        name: u.displayName,
        daysCommitted: userComms.length,
        totalCommitted: formatNumberVal(commTotal),
        totalAchieved: formatNumberVal(achTotal),
        consistency
      });
    });

    const wbCons = XLSX.utils.book_new();
    const wsConsMtd = XLSX.utils.json_to_sheet(consMtdRows);
    const wsConsYtd = XLSX.utils.json_to_sheet(consYtdRows);
    const wsConsCommitments = XLSX.utils.json_to_sheet(consWeeklyCommitmentRows);
    XLSX.utils.book_append_sheet(wbCons, wsConsMtd, 'Consolidated MTD');
    XLSX.utils.book_append_sheet(wbCons, wsConsYtd, 'Consolidated YTD');
    XLSX.utils.book_append_sheet(wbCons, wsConsCommitments, 'Weekly Commitments');
    const excelBufferCons = XLSX.write(wbCons, { type: 'buffer', bookType: 'xlsx' });
    const base64ExcelCons = excelBufferCons.toString('base64');

    const mtdTableHtmlCons = renderMtdHtmlTable('Team Consolidated', consMtdTableData, teamMtdPlanTotal, teamMtdAchTotal);
    const commitmentsTableHtmlCons = renderWeeklyCommitmentsHtmlTable('Team Weekly Commitments & Consistency', teamCommitmentTableData);
    // List of Recipients for Consolidated Report (Supervisor + Team Members, strictly excluding admins)
    const consRecipients = Array.from(new Set(
      teamMembers
        .filter(u => u.role !== 'admin')
        .map(u => u.automailerEmail || u.email)
        .filter(Boolean)
    ));

    if (consRecipients.length > 0) {
      const htmlConsBody = `
        <div style="font-family: Arial, sans-serif; max-width: 680px; margin: 0 auto; padding: 20px; color: #1e293b; background-color: #f8fafc; border-radius: 8px;">
          <div style="background-color: #2563eb; color: #ffffff; padding: 20px; border-radius: 6px; text-align: center;">
            <h2 style="margin: 0; font-size: 22px;">Varchaz — Consolidated Team Performance Report</h2>
            <p style="margin: 6px 0 0 0; font-size: 14px; opacity: 0.9;">Team: ${supervisor.displayName || 'Supervisor'} | Date: ${todayStr}</p>
          </div>

          <div style="padding: 20px 0;">
            ${mtdTableHtmlCons}
            ${commitmentsTableHtmlCons}

            <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-top: 16px;">
              <p style="font-size: 13px; line-height: 1.5; color: #475569; margin: 0;">
                ℹ️ <strong>Note:</strong> The full Year-to-Date (YTD) performance and Weekly Commitments reports are attached as an Excel workbook (<strong>Varchaz_Consolidated_Daily_Report_${todayStr}.xlsx</strong>) with separate MTD, YTD, and Weekly Commitments sheets.
              </p>
            </div>
          </div>

          <div style="border-top: 1px solid #e2e8f0; padding-top: 16px; text-align: center; color: #94a3b8; font-size: 11px;">
            <p style="margin: 0;">Automated email generated by Varchaz Performance System via VarchazReport@gmail.com.</p>
          </div>
        </div>
      `;

      try {
        const resData = await sendEmailViaMicroservice(apiUrl, apiKey, {
          to: consRecipients,
          subject: `[Varchaz] Consolidated Team Daily Report - MTD & YTD (${todayStr})`,
          html: htmlConsBody,
          text: `Varchaz Consolidated Daily Report (${todayStr}). Please view MTD in body and attached Excel for YTD.`,
          attachments: [
            {
              filename: `Varchaz_Consolidated_Daily_Report_${todayStr}.xlsx`,
              content: base64ExcelCons,
              content_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            }
          ]
        });
        console.log(`Consolidated email sent to ${consRecipients.length} recipient(s):`, resData.message || 'Success');
        totalEmailsDispatched++;
      } catch (err) {
        console.error('Error dispatching consolidated email:', err.message);
      }
    }

    // ──────────────────────────────────────────────────
    // TYPE B: INDIVIDUAL USER LEVEL REPORTS (TO: User, CC: Supervisor - NEVER Admin)
    // ──────────────────────────────────────────────────
    for (const member of teamMembers) {
      if (member.id === supId) continue;
      if (member.role === 'admin') continue; // STRICT RULE: Never send daily reports to admin

      const userTargetEmail = member.automailerEmail || member.email;
      if (!userTargetEmail) continue;

      const userMtdRows = [];
      const userYtdRows = [];
      const userMtdTableData = [];

      let userMtdPlanTotal = 0;
      let userMtdAchTotal = 0;
      let userYtdPlanTotal = 0;
      let userYtdAchTotal = 0;

      products.forEach((prod) => {
        const pId = prod.productId || prod.id;
        const pMtdPlan = mtdPlansByUser[member.id]?.[pId] || 0;
        const pMtdAch = mtdSalesByUser[member.id]?.[pId] || 0;
        const pYtdPlan = ytdPlansByUser[member.id]?.[pId] || 0;
        const pYtdAch = ytdSalesByUser[member.id]?.[pId] || 0;

        userMtdPlanTotal += pMtdPlan;
        userMtdAchTotal += pMtdAch;
        userYtdPlanTotal += pYtdPlan;
        userYtdAchTotal += pYtdAch;

        const categoryName = prod.category || 'General';
        const productName = prod.name || prod.productName || 'Product';

        userMtdTableData.push({
          category: categoryName,
          product: productName,
          plan: formatNumberVal(pMtdPlan),
          ach: formatNumberVal(pMtdAch)
        });

        userMtdRows.push({
          Category: categoryName,
          Product: productName,
          'Plan (MTD)': formatNumberVal(pMtdPlan),
          'Achievement (MTD)': formatNumberVal(pMtdAch),
          'Achievement %': `${calcPctVal(pMtdPlan, pMtdAch)}%`
        });

        userYtdRows.push({
          Category: categoryName,
          Product: productName,
          'Plan (YTD)': formatNumberVal(pYtdPlan),
          'Achievement (YTD)': formatNumberVal(pYtdAch),
          'Achievement %': `${calcPctVal(pYtdPlan, pYtdAch)}%`
        });
      });

      userMtdRows.push({
        Category: 'TOTAL',
        Product: 'GRAND TOTAL',
        'Plan (MTD)': formatNumberVal(userMtdPlanTotal),
        'Achievement (MTD)': formatNumberVal(userMtdAchTotal),
        'Achievement %': `${calcPctVal(userMtdPlanTotal, userMtdAchTotal)}%`
      });

      userYtdRows.push({
        Category: 'TOTAL',
        Product: 'GRAND TOTAL',
        'Plan (YTD)': formatNumberVal(userYtdPlanTotal),
        'Achievement (YTD)': formatNumberVal(userYtdAchTotal),
        'Achievement %': `${calcPctVal(userYtdPlanTotal, userYtdAchTotal)}%`
      });

      const wbUser = XLSX.utils.book_new();
      const wsUserMtd = XLSX.utils.json_to_sheet(userMtdRows);
      const wsUserYtd = XLSX.utils.json_to_sheet(userYtdRows);

      const memberComms = allCommitments.filter((c) => c.userId === member.id);
      let mCommTotal = 0;
      let mAchTotal = 0;
      let mCappedSum = 0;
      let mReportedDays = 0;
      let mFulfilledDays = 0;

      const userCommitmentRows = [];
      memberComms.forEach((c) => {
        mCommTotal += Number(c.totalCommitted || 0);
        const ach = Number(c.totalAchieved || 0);
        mAchTotal += ach;
        if (c.isFulfilled) mFulfilledDays++;
        if (c.eodReported) {
          mReportedDays++;
          const rawPct = c.totalCommitted > 0 ? (ach / c.totalCommitted) * 100 : 0;
          mCappedSum += Math.min(100, Math.max(0, rawPct));
        }

        userCommitmentRows.push({
          Date: c.date,
          'Total Committed (₹)': formatNumberVal(c.totalCommitted),
          'Total Achieved (₹)': formatNumberVal(c.totalAchieved),
          'Fulfillment %': `${c.fulfillmentPct}%`,
          'Status': c.isFulfilled ? 'Fulfilled' : c.eodReported ? 'Partial' : 'Pending'
        });
      });

      const memberConsistency = mReportedDays > 0 ? Math.round((mCappedSum / mReportedDays) * 10) / 10 : 0;
      const wsUserCommitments = XLSX.utils.json_to_sheet(userCommitmentRows.length > 0 ? userCommitmentRows : [{ Status: 'No commitments recorded this week' }]);

      XLSX.utils.book_append_sheet(wbUser, wsUserMtd, 'User MTD');
      XLSX.utils.book_append_sheet(wbUser, wsUserYtd, 'User YTD');
      XLSX.utils.book_append_sheet(wbUser, wsUserCommitments, 'Weekly Commitments');
      const excelBufferUser = XLSX.write(wbUser, { type: 'buffer', bookType: 'xlsx' });
      const base64ExcelUser = excelBufferUser.toString('base64');

      const mtdTableHtmlUser = renderMtdHtmlTable(member.displayName || 'Performance', userMtdTableData, userMtdPlanTotal, userMtdAchTotal);

      const htmlUserBody = `
        <div style="font-family: Arial, sans-serif; max-width: 680px; margin: 0 auto; padding: 20px; color: #1e293b; background-color: #f8fafc; border-radius: 8px;">
          <div style="background-color: #2563eb; color: #ffffff; padding: 20px; border-radius: 6px; text-align: center;">
            <h2 style="margin: 0; font-size: 22px;">Varchaz — Daily Performance Report</h2>
            <p style="margin: 6px 0 0 0; font-size: 14px; opacity: 0.9;">User: ${member.displayName} | Date: ${todayStr}</p>
          </div>

          <div style="padding: 20px 0;">
            ${mtdTableHtmlUser}

            <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-top: 16px;">
              <h4 style="margin: 0 0 8px 0; color: #0f172a; font-size: 14px;">🎯 Weekly Commitment Summary</h4>
              <p style="font-size: 13px; color: #475569; margin: 0 0 6px 0;">
                Committed: <strong>₹${(mCommTotal || 0).toLocaleString('en-IN')}</strong> | Achieved: <strong>₹${(mAchTotal || 0).toLocaleString('en-IN')}</strong> | Consistency: <strong>${memberConsistency}%</strong> (Capped at 100%) | Fulfilled Days: <strong>${mFulfilledDays}</strong>
              </p>
              <p style="font-size: 12px; color: #64748b; margin: 0;">
                Full daily breakdown is attached in the <strong>Weekly Commitments</strong> Excel sheet.
              </p>
            </div>

            <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-top: 16px;">
              <p style="font-size: 13px; line-height: 1.5; color: #475569; margin: 0;">
                ℹ️ <strong>Note:</strong> Your full Year-to-Date (YTD) performance and Weekly Commitments reports are attached as an Excel file (<strong>Varchaz_Daily_Report_${member.displayName.replace(/\s+/g, '_')}_${todayStr}.xlsx</strong>) containing MTD, YTD, and Weekly Commitments sheets.
              </p>
            </div>
          </div>

          <div style="border-top: 1px solid #e2e8f0; padding-top: 16px; text-align: center; color: #94a3b8; font-size: 11px;">
            <p style="margin: 0;">Automated email generated by Varchaz Performance System via VarchazReport@gmail.com.</p>
          </div>
        </div>
      `;

      try {
        const resData = await sendEmailViaMicroservice(apiUrl, apiKey, {
          to: userTargetEmail,
          cc: supAutomailerEmail,
          subject: `[Varchaz] Daily Performance Report - ${member.displayName} (${todayStr})`,
          html: htmlUserBody,
          text: `Varchaz Daily Report for ${member.displayName} (${todayStr}). Please view MTD in body and attached Excel for YTD.`,
          attachments: [
            {
              filename: `Varchaz_Daily_Report_${member.displayName.replace(/\s+/g, '_')}_${todayStr}.xlsx`,
              content: base64ExcelUser,
              content_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            }
          ]
        });
        console.log(`Individual email sent to ${userTargetEmail} (CC: ${supAutomailerEmail}):`, resData.message || 'Success');
        totalEmailsDispatched++;
      } catch (err) {
        console.error(`Error sending individual email for ${member.displayName}:`, err.message);
      }
    }
  }

  await db.collection('settings').doc('dailyReportConfig').set({
    lastSentAt: admin.firestore.FieldValue.serverTimestamp(),
    lastStatus: 'success',
    lastCount: totalEmailsDispatched
  }, { merge: true });

  console.log(`Varchaz Daily Auto Mailer Cron completed. Dispatched ${totalEmailsDispatched} email payload(s).`);
}

async function runMorningUserNudgeCron() {
  initializeFirebase();
  const db = admin.firestore();

  const settingsDoc = await db.collection('settings').doc('dailyReportConfig').get();
  const isEnabled = settingsDoc.exists ? settingsDoc.data()?.isEnabled === true : false;
  if (!isEnabled && !process.env.FORCE_RUN) {
    console.log('Morning User Nudge auto-mailer is currently disabled in settings (isEnabled is false). Skipping execution.');
    return;
  }

  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istDate = new Date(now.getTime() + istOffset);
  const todayStr = istDate.toISOString().split('T')[0];
  const currentMonthStr = todayStr.substring(0, 7);

  const holidayCheck = isNonWorkingDay(istDate);
  if (holidayCheck.isExcluded && !process.env.FORCE_RUN) {
    console.log(`Skipping Morning User Nudge dispatch today (${todayStr}): Non-working day (${holidayCheck.reason}).`);
    return;
  }

  console.log(`Starting Varchaz Morning User Nudge Cron execution for date: ${todayStr} (IST)...`);

  const usersSnap = await db.collection('users').where('status', '==', 'approved').get();
  const allUsers = usersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  const teamUsers = allUsers.filter(u => u.role === 'user');

  if (teamUsers.length === 0) {
    console.log('No approved users with role "user" found.');
    return;
  }

  const productsSnap = await db.collection('products').get();
  const rawProducts = productsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  const products = sortProductsByCategoryPriority(rawProducts);

  const monthlyPlansSnap = await db.collection('monthlyPlans').get();
  const allMonthlyPlans = monthlyPlansSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

  const dailySalesSnap = await db.collection('dailySales').get();
  const allDailySales = dailySalesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

  const mtdPlansByUser = {};
  allMonthlyPlans.forEach((mp) => {
    if (mp.month === currentMonthStr && mp.userId) {
      if (!mtdPlansByUser[mp.userId]) mtdPlansByUser[mp.userId] = {};
      Object.entries(mp.products || {}).forEach(([pId, val]) => {
        mtdPlansByUser[mp.userId][pId] = (mtdPlansByUser[mp.userId][pId] || 0) + Number(val || 0);
      });
    }
  });

  const mtdSalesByUser = {};
  allDailySales.forEach((ds) => {
    if (ds.date && ds.date.substring(0, 7) === currentMonthStr && ds.date <= todayStr && ds.userId) {
      if (!mtdSalesByUser[ds.userId]) mtdSalesByUser[ds.userId] = {};
      Object.entries(ds.products || {}).forEach(([pId, val]) => {
        mtdSalesByUser[ds.userId][pId] = (mtdSalesByUser[ds.userId][pId] || 0) + Number(val || 0);
      });
    }
  });

  const apiUrl = process.env.EMAIL_API_URL || DEFAULT_EMAIL_API_URL;
  const apiKey = process.env.EMAIL_API_KEY || DEFAULT_EMAIL_API_KEY;

  let count = 0;

  for (const user of teamUsers) {
    const userTargetEmail = user.automailerEmail || user.email;
    if (!userTargetEmail) continue;

    let supAutomailerEmail = null;
    if (user.supervisorId) {
      const supervisor = allUsers.find(u => u.id === user.supervisorId);
      if (supervisor) {
        supAutomailerEmail = supervisor.automailerEmail || supervisor.email || null;
      }
    }

    let userProducts = products;
    if (user.supervisorId) {
      const supProdDoc = await db.collection('supervisorProducts').doc(user.supervisorId).get();
      if (supProdDoc.exists) {
        const activeProductIds = supProdDoc.data()?.activeProductIds || [];
        if (activeProductIds.length > 0) {
          userProducts = products.filter(p => activeProductIds.includes(p.productId || p.id));
        }
      }
    }

    const goodProducts = [];
    const inactiveProducts = [];

    userProducts.forEach((prod) => {
      const pId = prod.productId || prod.id;
      const plan = mtdPlansByUser[user.id]?.[pId] || 0;
      const ach = mtdSalesByUser[user.id]?.[pId] || 0;
      const pct = plan > 0 ? (ach / plan) * 100 : (ach > 0 ? 100 : 0);

      if (ach > 0) {
        goodProducts.push({
          name: prod.name || prod.productName || 'Product',
          plan: formatNumberVal(plan),
          ach: formatNumberVal(ach),
          pct: Math.round(pct * 10) / 10
        });
      } else {
        inactiveProducts.push({
          name: prod.name || prod.productName || 'Product',
          plan: formatNumberVal(plan),
          ach: formatNumberVal(ach)
        });
      }
    });

    const userName = user.displayName || 'Team Member';

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 650px; margin: 0 auto; padding: 20px; color: #1e293b; background-color: #f8fafc; border-radius: 8px;">
        <div style="background-color: #2563eb; color: #ffffff; padding: 20px; border-radius: 6px; text-align: center;">
          <h2 style="margin: 0; font-size: 22px;">Varchaz — Daily Morning Performance Nudge</h2>
          <p style="margin: 6px 0 0 0; font-size: 14px; opacity: 0.9;">Hello ${userName} | Date: ${todayStr}</p>
        </div>

        <div style="padding: 20px 0;">
          ${goodProducts.length > 0 ? `
            <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
              <h3 style="margin: 0 0 8px 0; color: #166534; font-size: 16px;">🟢 Doing Great! Active Products & Progress</h3>
              <p style="margin: 0 0 12px 0; font-size: 13px; color: #15803d;">
                Great momentum on these products! You are nearing your monthly plan targets. Keep pushing to complete 100%:
              </p>
              <ul style="margin: 0; padding-left: 20px; font-size: 13px; color: #166534;">
                ${goodProducts.map(p => `
                  <li style="margin-bottom: 6px;">
                    <strong>${p.name}</strong>: Achieved <strong>${p.ach}</strong> / Plan <strong>${p.plan}</strong> (${p.pct}% target reached)
                  </li>
                `).join('')}
              </ul>
            </div>
          ` : ''}

          ${inactiveProducts.length > 0 ? `
            <div style="background: #fff1f2; border: 1px solid #fecdd3; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
              <h3 style="margin: 0 0 8px 0; color: #9f1239; font-size: 16px;">⚠️ Action Required: Inactive Products MTD (${inactiveProducts.length})</h3>
              <p style="margin: 0 0 12px 0; font-size: 13px; color: #be123c;">
                You currently have 0 sales reported for the following products this month:
              </p>
              <ul style="margin: 0 0 16px 0; padding-left: 20px; font-size: 13px; color: #9f1239;">
                ${inactiveProducts.map(p => `
                  <li style="margin-bottom: 6px;">
                    <strong>${p.name}</strong> (Target Plan: ${p.plan})
                  </li>
                `).join('')}
              </ul>

              <div style="background: #ffffff; border: 1px dashed #fda4af; border-radius: 6px; padding: 14px;">
                <h4 style="margin: 0 0 8px 0; color: #881337; font-size: 14px;">📋 Supervisor Review & Reflection Questions</h4>
                <p style="margin: 0 0 8px 0; font-size: 12px; color: #475569;">
                  Please review the following check-in questions to prepare your active plan:
                </p>
                <ol style="margin: 0; padding-left: 20px; font-size: 13px; color: #1e293b; line-height: 1.6;">
                  <li><strong>What actions are you taking</strong> to get active on these products?</li>
                  <li><strong>What support do you require</strong> from your supervisor or team?</li>
                  <li><strong>How many active leads</strong> do you currently have for each of these products?</li>
                  <li><strong>If leads are none or low:</strong> How many customer engagements have you carried out to generate new leads?</li>
                </ol>
              </div>
            </div>
          ` : ''}

          <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px;">
            <p style="font-size: 13px; line-height: 1.5; color: #475569; margin: 0;">
              💡 <strong>Daily Tip:</strong> Log in to Varchaz to update your daily sales report and track your progress against monthly targets.
            </p>
          </div>
        </div>

        <div style="border-top: 1px solid #e2e8f0; padding-top: 16px; text-align: center; color: #94a3b8; font-size: 11px;">
          <p style="margin: 0;">Automated daily morning encouragement sent by Varchaz Performance System via VarchazReport@gmail.com.</p>
        </div>
      </div>
    `;

    try {
      const payload = {
        to: userTargetEmail,
        subject: `[Varchaz] Morning Performance Check-in & Action Plan (${todayStr})`,
        html: htmlBody,
        text: `Varchaz Morning Performance Check-in for ${userName} (${todayStr}). Please log in to review your active products and lead generation.`
      };

      if (supAutomailerEmail) {
        payload.cc = supAutomailerEmail;
      }

      const resData = await sendEmailViaMicroservice(apiUrl, apiKey, payload);
      console.log(`Morning nudge sent to ${userTargetEmail}${supAutomailerEmail ? ` (CC: ${supAutomailerEmail})` : ''}:`, resData.message || 'Success');
      count++;
    } catch (err) {
      console.error(`Error sending morning nudge to ${userTargetEmail}:`, err.message);
    }
  }

  console.log(`Morning User Nudge Cron completed. Dispatched ${count} email(s).`);
}

// ────────────────────────────────────────────────────────────
// Product Group MIS Daily Reports (Liabilities, Assets, TPP, Others)
// ────────────────────────────────────────────────────────────
const MIS_PRODUCT_PRIORITIES = {
  // Liabilities
  'CA': 1, 'CA MAMC': 2, 'SA': 3, 'SA MAMC': 4, 'IP Value': 5, 'RFD Value': 6, 'UFD Nos.': 7, 'UFD Value': 8, 'Aane Do FD Val': 9, 'Aaane Do FD Val': 9,
  // Assets (Retail + Wholesale)
  'Home Loan Value': 1, 'LAP Value': 2, 'Auto Loan Value': 3, 'Auto Loan LC': 4, 'Personal Loan Value': 5, 'Personal Loan LC': 6, 'Business Loan Value': 7, 'Business Loan LC': 8, 'Gold Loan Value': 9, 'MEG Value': 10, 'EEG/BBG Val': 11,
  // TPP
  'LI': 1, 'GI/HI': 2, 'MF': 3, 'SIP': 4,
  // Others
  'Credit Card': 1, 'Demat/HSL': 2, 'Payzapp': 3, 'Smart Wealth': 4, 'SSS': 5
};

function sortMisProducts(products) {
  return [...products].sort((a, b) => {
    const nameA = a.name || a.productName || '';
    const nameB = b.name || b.productName || '';
    const pA = MIS_PRODUCT_PRIORITIES[nameA] || 99;
    const pB = MIS_PRODUCT_PRIORITIES[nameB] || 99;
    if (pA !== pB) return pA - pB;
    return nameA.localeCompare(nameB);
  });
}

function renderProductGroupMisHtmlTable(groupName, products, reps, mtdSalesByUser, dateStr) {
  const colTotals = {};
  products.forEach(p => { colTotals[p.id] = 0; });

  let rowsHtml = '';
  reps.forEach((rep, idx) => {
    const rowBg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
    let cellsHtml = '';

    products.forEach(p => {
      const pId = p.id;
      const ach = mtdSalesByUser[rep.id]?.[pId] || 0;

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
          ${rep.displayName || 'Team Member'}
        </td>
        ${cellsHtml}
      </tr>
    `;
  });

  // Footer Totals
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
            ${dateStr} (9:00 PM IST)
          </div>
        </div>
      </div>

      <!-- Main Data Table Container -->
      <div style="background: #ffffff; border: 1px solid #cbd5e1; border-top: none; border-radius: 0 0 8px 8px; overflow-x: auto; padding: 16px; box-shadow: 0 2px 6px rgba(15, 23, 42, 0.04);">
        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
          <thead>
            <!-- Group Banner -->
            <tr style="background-color: #0284c7; color: #ffffff;">
              <th colspan="${products.length + 1}" style="padding: 10px; font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; text-align: center; border: 1px solid #0284c7;">
                ${groupName}
              </th>
            </tr>
            <!-- Product Column Titles -->
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
            <!-- Bold Total Row -->
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
        <p style="margin: 3px 0 0 0;">Report strictly reflects verified Month-to-Date (MTD) sales submitted up to 9:00 PM IST.</p>
      </div>

    </div>
  `;
}

/**
 * Get all working days for the current month up to targetIstDate (in IST),
 * excluding all Sundays and non-working Saturdays (2nd & 4th Saturday).
 */
function getMonthWorkingDaysUpTo(targetIstDate) {
  const year = targetIstDate.getFullYear();
  const month = targetIstDate.getMonth(); // 0-indexed
  const currentDay = targetIstDate.getDate();
  const workingDays = [];

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

/**
 * Render the HTML table for the Active Products Tracker email,
 * matching the exact multi-day grid with "Improvement from previous day".
 */
function renderActiveProductsTrackerHtmlTable(displayedDays, allWorkingDays, reps, countsByRepAndDate, totalsByDate, dateStr) {
  const isMultiDay = allWorkingDays.length >= 2;
  const latestDay = allWorkingDays[allWorkingDays.length - 1];
  const prevDay = isMultiDay ? allWorkingDays[allWorkingDays.length - 2] : null;

  // Date Column Headers
  const dateHeadersHtml = displayedDays.map(day => `
    <th style="padding: 10px 8px; font-size: 13px; font-weight: 700; color: #000000; border: 1.5px solid #000000; text-align: center; white-space: nowrap; background-color: #ffffff;">
      ${day.displayLabel}
    </th>
  `).join('');

  // Rows for each representative
  let rowsHtml = '';
  reps.forEach((rep) => {
    let cellsHtml = '';
    displayedDays.forEach(day => {
      const cnt = countsByRepAndDate[rep.id]?.[day.isoDate] || 0;
      cellsHtml += `
        <td style="padding: 8px 10px; border: 1.5px solid #000000; font-size: 13px; color: #000000; text-align: center; background-color: #ffffff;">
          ${cnt}
        </td>
      `;
    });

    // Improvement calculation comparing latestDay vs prevDay
    let improvementText = 'Baseline';
    let improvementColor = '#64748b';

    if (isMultiDay && prevDay) {
      const latestCount = countsByRepAndDate[rep.id]?.[latestDay.isoDate] || 0;
      const prevCount = countsByRepAndDate[rep.id]?.[prevDay.isoDate] || 0;
      if (latestCount > prevCount) {
        improvementText = 'Improved';
        improvementColor = '#16a34a'; // Green
      } else if (latestCount === prevCount) {
        improvementText = 'No Change';
        improvementColor = '#ea580c'; // Orange
      } else {
        improvementText = 'Declined';
        improvementColor = '#dc2626'; // Red
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

  // Footer Totals Row
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
            ${dateStr} (9:00 PM IST)
          </div>
        </div>
      </div>

      <!-- Main Data Table Container -->
      <div style="background: #ffffff; border: 1px solid #cbd5e1; border-top: none; border-radius: 0 0 8px 8px; overflow-x: auto; padding: 20px; box-shadow: 0 2px 6px rgba(15, 23, 42, 0.04);">
        <table style="width: 100%; border-collapse: collapse; font-size: 13px; border: 1.5px solid #000000; margin: 0 auto;">
          <thead>
            <!-- Main Title Banner -->
            <tr style="background-color: #ffffff;">
              <th colspan="${colSpan}" style="padding: 12px; font-size: 16px; font-weight: 700; color: #000000; border: 1.5px solid #000000; text-align: center; letter-spacing: 0.01em;">
                Active Products Tracker
              </th>
            </tr>
            <!-- Column Titles -->
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
            <!-- Bold Total Row -->
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
          <p style="margin: 0 0 4px 0;"><strong>&bull; Consolidated Monthly Metric:</strong> Cell values reflect the <strong>consolidated count of distinct products activated Month-to-Date (MTD)</strong> as of each working day (products with cumulative achievement &gt; 0 in current month).</p>
          <p style="margin: 0 0 4px 0;"><strong>&bull; Calendar Exclusions:</strong> Non-working days (all Sundays, 2nd &amp; 4th Saturdays) are excluded from tracking.</p>
          <p style="margin: 0;"><strong>&bull; Column Progression:</strong> Starts from 1 working day at the start of each month, increases daily up to 7 working days, and thereafter displays the last 7 working days till month end.</p>
        </div>
      </div>

      <!-- Footer Info -->
      <div style="margin-top: 14px; text-align: center; color: #94a3b8; font-size: 11px;">
        <p style="margin: 0;">Automated daily active products tracker dispatched by Varchaz Performance Management System via VarchazReport@gmail.com.</p>
        <p style="margin: 3px 0 0 0;">Report strictly reflects verified Month-to-Date (MTD) sales submitted up to 9:00 PM IST.</p>
      </div>

    </div>
  `;
}

/**
 * Dispatch the Active Products Tracker email.
 */
async function dispatchActiveProductsTrackerMail({
  rawProducts,
  reps,
  dailySalesSnap,
  todayStr,
  currentMonthStr,
  istDate,
  toRecipients,
  ccRecipients,
  apiUrl,
  apiKey,
  isPriorWorkingDay = false
}) {
  const allWorkingDays = getMonthWorkingDaysUpTo(istDate);
  if (allWorkingDays.length === 0) {
    console.log('Active Products Tracker: No working days in current month up to today. Skipping.');
    return { success: false, message: 'No working days in month' };
  }

  // Display up to the last 7 working days (starts with 1 on day 1, up to 7)
  const displayedDays = allWorkingDays.length <= 7 ? allWorkingDays : allWorkingDays.slice(-7);

  const validProductIds = new Set(rawProducts.map(p => p.id));

  // Compute consolidated MTD active products for each rep on each working day
  const countsByRepAndDate = {};
  const totalsByDate = {};
  displayedDays.forEach(d => { totalsByDate[d.isoDate] = 0; });
  if (allWorkingDays.length >= 2) {
    const prevDay = allWorkingDays[allWorkingDays.length - 2];
    totalsByDate[prevDay.isoDate] = 0;
  }

  reps.forEach(rep => {
    countsByRepAndDate[rep.id] = {};

    // Get all sales docs for this rep in current month up to today
    const repSales = [];
    dailySalesSnap.docs.forEach(doc => {
      const ds = doc.data();
      if (ds.userId === rep.id && ds.date && ds.date.substring(0, 7) === currentMonthStr && ds.date <= todayStr) {
        repSales.push(ds);
      }
    });

    // For all working days (needed for both displayed days and the previous day for comparison)
    allWorkingDays.forEach(wDay => {
      // Calculate cumulative sales for each product from start of month up to wDay.isoDate
      const productTotals = {};
      repSales.forEach(ds => {
        if (ds.date <= wDay.isoDate && ds.products) {
          Object.entries(ds.products).forEach(([pId, val]) => {
            if (validProductIds.has(pId)) {
              productTotals[pId] = (productTotals[pId] || 0) + Number(val || 0);
            }
          });
        }
      });

      // Count distinct products with cumulative sales > 0 (Consolidated Month Active Products)
      const activeCount = Object.values(productTotals).filter(v => v > 0).length;
      countsByRepAndDate[rep.id][wDay.isoDate] = activeCount;
    });
  });

  // Calculate totals by date
  allWorkingDays.forEach(wDay => {
    totalsByDate[wDay.isoDate] = reps.reduce((sum, rep) => sum + (countsByRepAndDate[rep.id]?.[wDay.isoDate] || 0), 0);
  });

  const htmlBody = renderActiveProductsTrackerHtmlTable(
    displayedDays,
    allWorkingDays,
    reps,
    countsByRepAndDate,
    totalsByDate,
    todayStr
  );

  const subjectTag = isPriorWorkingDay 
    ? `(As of ${todayStr} / Prior Working Day)`
    : `- ${todayStr}`;

  const payload = {
    to: toRecipients,
    subject: `[Varchaz] Daily Active Products Tracker ${subjectTag}`,
    html: htmlBody,
    text: `Varchaz Daily Active Products Tracker ${subjectTag}. Please view in an HTML-compatible client.`
  };
  if (ccRecipients.length > 0) {
    payload.cc = ccRecipients;
  }

  try {
    const resData = await sendEmailViaMicroservice(apiUrl, apiKey, payload);
    console.log(`Dispatched Active Products Tracker email to ${toRecipients.length} user(s) (CC: ${ccRecipients.length}):`, resData.message || 'Success');
    return { success: true, count: 1 };
  } catch (err) {
    console.error('Error sending Active Products Tracker email:', err.message);
    return { success: false, error: err.message };
  }
}

async function runProductGroupReports(overrideRecipient) {
  initializeFirebase();
  const db = admin.firestore();

  const settingsDoc = await db.collection('settings').doc('dailyReportConfig').get();
  const isEnabled = settingsDoc.exists ? settingsDoc.data()?.isEnabled === true : false;
  if (!isEnabled && !process.env.FORCE_RUN && !overrideRecipient) {
    console.log('Product Group Reports are currently disabled in settings (isEnabled is false). Skipping execution.');
    return { success: false, message: 'Reporting disabled in settings' };
  }

  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istDate = new Date(now.getTime() + istOffset);
  const cutoff = getReportingCutoffInfo(istDate);
  const effectiveDateStr = cutoff.effectiveDateStr;
  const effectiveDateObj = cutoff.effectiveDateObj;
  const todayStr = cutoff.todayStr;
  const isPriorWorkingDay = cutoff.isPriorWorkingDay;
  const currentMonthStr = effectiveDateStr.substring(0, 7);

  const holidayCheck = isNonWorkingDay(istDate);
  if (holidayCheck.isExcluded && !process.env.FORCE_RUN && !overrideRecipient) {
    console.log(`Skipping Daily Product Group MTD MIS dispatch today (${todayStr}): Non-working day (${holidayCheck.reason}).`);
    return { success: false, message: `Skipped: Non-working day (${holidayCheck.reason})` };
  }

  if (isPriorWorkingDay) {
    console.log(`[Cutoff Notice] Current time is before 6:00 PM IST (${cutoff.istHour}:${String(cutoff.istMinute).padStart(2, '0')} IST). Dispatching data up to previous working day (${effectiveDateStr}). Today's entries (${todayStr}) excluded.`);
  } else {
    console.log(`Starting Daily Product Group MTD MIS dispatch for date: ${effectiveDateStr} (IST)...`);
  }

  const [productsSnap, usersSnap, dailySalesSnap] = await Promise.all([
    db.collection('products').get(),
    db.collection('users').where('status', '==', 'approved').get(),
    db.collection('dailySales').get()
  ]);

  const rawProducts = productsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const allUsers = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  
  // Left column: All active team reps (excluding supervisors)
  const reps = allUsers.filter(u => u.role === 'user').sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));

  // Target email recipients: All active reps in TO, Supervisors in CC (Admins STRICTLY excluded per policy)
  let toRecipients = [];
  let ccRecipients = [];
  if (overrideRecipient) {
    toRecipients = [overrideRecipient];
  } else {
    toRecipients = Array.from(new Set(
      allUsers
        .filter(u => u.role === 'user')
        .map(u => (u.automailerEmail || u.email || '').trim().toLowerCase())
        .filter(Boolean)
    ));

    // STRICT: Do not send daily reports to admins. CC only supervisors.
    ccRecipients = Array.from(new Set(
      allUsers
        .filter(u => u.role === 'supervisor')
        .map(u => (u.automailerEmail || u.email || '').trim().toLowerCase())
        .filter(Boolean)
    ));
  }

  if (toRecipients.length === 0) {
    console.log('No valid rep recipient emails found.');
    return { success: false, message: 'No recipients found' };
  }

  // Calculate MTD sales per user per product up to effectiveDateStr
  const mtdSalesByUser = {};
  dailySalesSnap.docs.forEach(doc => {
    const ds = doc.data();
    if (ds.date && ds.date.substring(0, 7) === currentMonthStr && ds.date <= effectiveDateStr && ds.userId) {
      if (!mtdSalesByUser[ds.userId]) mtdSalesByUser[ds.userId] = {};
      Object.entries(ds.products || {}).forEach(([pId, val]) => {
        mtdSalesByUser[ds.userId][pId] = (mtdSalesByUser[ds.userId][pId] || 0) + Number(val || 0);
      });
    }
  });

  const groupConfigs = [
    {
      name: 'Liabilities',
      matcher: p => (p.category || '').toLowerCase().includes('liabilit')
    },
    {
      name: 'Assets', // Retail Assets + Wholesale Assets combined
      matcher: p => (p.category || '').toLowerCase().includes('asset')
    },
    {
      name: 'TPP',
      matcher: p => (p.category || '').toLowerCase().includes('tpp')
    },
    {
      name: 'Others',
      matcher: p => {
        const cat = (p.category || '').toLowerCase();
        return !cat.includes('liabilit') && !cat.includes('asset') && !cat.includes('tpp');
      }
    }
  ];

  const apiUrl = process.env.EMAIL_API_URL || DEFAULT_EMAIL_API_URL;
  const apiKey = process.env.EMAIL_API_KEY || DEFAULT_EMAIL_API_KEY;

  let emailsDispatched = 0;

  // ────────────────────────────────────────────────────────────
  // EMAILS 1-4: PRODUCT GROUP MTD MIS EMAILS
  // ────────────────────────────────────────────────────────────
  for (const gc of groupConfigs) {
    const groupProds = sortMisProducts(rawProducts.filter(gc.matcher));
    if (groupProds.length === 0) continue;

    const htmlBody = renderProductGroupMisHtmlTable(gc.name, groupProds, reps, mtdSalesByUser, effectiveDateStr);

    const subjectTag = isPriorWorkingDay 
      ? `(As of ${effectiveDateStr} / Prior Working Day)`
      : `(${effectiveDateStr})`;

    const payload = {
      to: toRecipients,
      subject: `[Varchaz] Daily MTD Performance MIS - ${gc.name} ${subjectTag}`,
      html: htmlBody,
      text: `Varchaz Daily MTD Performance MIS for ${gc.name} ${subjectTag}. Please view in an HTML-compatible client.`
    };
    if (ccRecipients.length > 0) {
      payload.cc = ccRecipients;
    }

    try {
      const resData = await sendEmailViaMicroservice(apiUrl, apiKey, payload);
      console.log(`Dispatched ${gc.name} email to ${toRecipients.length} user(s) (CC: ${ccRecipients.length}):`, resData.message || 'Success');
      emailsDispatched++;
    } catch (err) {
      console.error(`Error sending ${gc.name} report email:`, err.message);
    }
  }

  // ────────────────────────────────────────────────────────────
  // EMAIL 5: ACTIVE PRODUCTS TRACKER (Consolidated Monthly Active Products)
  // ────────────────────────────────────────────────────────────
  try {
    const trackerResult = await dispatchActiveProductsTrackerMail({
      rawProducts,
      reps,
      dailySalesSnap,
      todayStr: effectiveDateStr,
      currentMonthStr,
      istDate: effectiveDateObj,
      toRecipients,
      ccRecipients,
      apiUrl,
      apiKey,
      isPriorWorkingDay
    });
    if (trackerResult && trackerResult.success) {
      emailsDispatched++;
    }
  } catch (err) {
    console.error('Error sending Active Products Tracker email:', err.message);
  }

  await db.collection('settings').doc('dailyReportConfig').set({
    lastProductGroupsSentAt: admin.firestore.FieldValue.serverTimestamp(),
    lastProductGroupsCount: emailsDispatched,
    lastStatus: 'success'
  }, { merge: true });

  console.log(`Daily Product Group MIS & Active Products Tracker execution completed. Dispatched ${emailsDispatched} email(s) across 4 groups + Active Products Tracker.`);
  return { success: true, count: emailsDispatched, date: effectiveDateStr };
}

async function runActiveProductsTrackerStandalone(overrideRecipient) {
  initializeFirebase();
  const db = admin.firestore();

  const settingsDoc = await db.collection('settings').doc('dailyReportConfig').get();
  const isEnabled = settingsDoc.exists ? settingsDoc.data()?.isEnabled === true : false;
  if (!isEnabled && !process.env.FORCE_RUN && !overrideRecipient) {
    console.log('Active Products Tracker is currently disabled in settings. Skipping execution.');
    return { success: false, message: 'Reporting disabled in settings' };
  }

  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istDate = new Date(now.getTime() + istOffset);
  const cutoff = getReportingCutoffInfo(istDate);
  const effectiveDateStr = cutoff.effectiveDateStr;
  const effectiveDateObj = cutoff.effectiveDateObj;
  const todayStr = cutoff.todayStr;
  const isPriorWorkingDay = cutoff.isPriorWorkingDay;
  const currentMonthStr = effectiveDateStr.substring(0, 7);

  const holidayCheck = isNonWorkingDay(istDate);
  if (holidayCheck.isExcluded && !process.env.FORCE_RUN && !overrideRecipient) {
    console.log(`Skipping Active Products Tracker dispatch today (${todayStr}): Non-working day (${holidayCheck.reason}).`);
    return { success: false, message: `Skipped: Non-working day (${holidayCheck.reason})` };
  }

  if (isPriorWorkingDay) {
    console.log(`[Cutoff Notice] Current time is before 6:00 PM IST (${cutoff.istHour}:${String(cutoff.istMinute).padStart(2, '0')} IST). Dispatching Active Products Tracker up to previous working day (${effectiveDateStr}).`);
  } else {
    console.log(`Starting Daily Active Products Tracker dispatch for date: ${effectiveDateStr} (IST)...`);
  }

  const [productsSnap, usersSnap, dailySalesSnap] = await Promise.all([
    db.collection('products').get(),
    db.collection('users').where('status', '==', 'approved').get(),
    db.collection('dailySales').get()
  ]);

  const rawProducts = productsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const allUsers = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const reps = allUsers.filter(u => u.role === 'user').sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));

  let toRecipients = [];
  let ccRecipients = [];
  if (overrideRecipient) {
    toRecipients = [overrideRecipient];
  } else {
    toRecipients = Array.from(new Set(
      allUsers
        .filter(u => u.role === 'user')
        .map(u => (u.automailerEmail || u.email || '').trim().toLowerCase())
        .filter(Boolean)
    ));

    ccRecipients = Array.from(new Set(
      allUsers
        .filter(u => u.role === 'supervisor')
        .map(u => (u.automailerEmail || u.email || '').trim().toLowerCase())
        .filter(Boolean)
    ));
  }

  if (toRecipients.length === 0) {
    console.log('No valid rep recipient emails found.');
    return { success: false, message: 'No recipients found' };
  }

  const apiUrl = process.env.EMAIL_API_URL || DEFAULT_EMAIL_API_URL;
  const apiKey = process.env.EMAIL_API_KEY || DEFAULT_EMAIL_API_KEY;

  return await dispatchActiveProductsTrackerMail({
    rawProducts,
    reps,
    dailySalesSnap,
    todayStr: effectiveDateStr,
    currentMonthStr,
    istDate: effectiveDateObj,
    toRecipients,
    ccRecipients,
    apiUrl,
    apiKey,
    isPriorWorkingDay
  });
}

if (require.main === module) {
  const isMorning = process.argv.includes('--morning');
  const isTracker = process.argv.includes('--active-tracker') || process.argv.includes('--tracker');
  const isDailyGroups = process.argv.includes('--daily-groups') || process.argv.includes('--groups') || process.argv.includes('--evening');
  const recipientIdx = process.argv.findIndex(arg => arg === '--recipient' || arg === '--to');
  const overrideRecipient = recipientIdx !== -1 && process.argv[recipientIdx + 1] ? process.argv[recipientIdx + 1] : undefined;

  const runner = isMorning 
    ? runMorningUserNudgeCron 
    : isTracker 
      ? runActiveProductsTrackerStandalone 
      : isDailyGroups 
        ? runProductGroupReports 
        : runDailyReportCron;
  runner(overrideRecipient)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Cron Execution Error:', err);
      process.exit(1);
    });
}

module.exports = { 
  runDailyReportCron, 
  runMorningUserNudgeCron, 
  runProductGroupReports, 
  runActiveProductsTrackerStandalone,
  getReportingCutoffInfo,
  getPreviousWorkingDay,
  isNonWorkingDay
};


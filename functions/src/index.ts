/* ============================================================
   Varchaz — Cloud Functions
   ============================================================
   1. onUserCreated        — Auth trigger: create user doc defaults
   2. onUserApprovalUpdate — Firestore trigger: sync approval status
   3. onDailySalesWrite    — Firestore trigger: audit log for sales
   4. adminSetUserRole     — HTTPS callable: admin changes user role
   5. adminBulkApprove     — HTTPS callable: approve multiple users
   ============================================================ */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as XLSX from 'xlsx';

admin.initializeApp();
const db = admin.firestore();

// ──────────────────────────────────────────────────
// 1. Auth Trigger: When a new user is created in Firebase Auth
// ──────────────────────────────────────────────────
export const onUserCreated = functions.auth.user().onCreate(async (user) => {
  // Check if user doc already exists (created during registration)
  const userDoc = await db.collection('users').doc(user.uid).get();
  if (userDoc.exists) return;

  // If user was created externally (e.g., admin SDK), create minimal profile
  await db.collection('users').doc(user.uid).set({
    uid: user.uid,
    email: user.email || '',
    displayName: user.displayName || user.email?.split('@')[0] || 'User',
    role: 'user',
    status: 'pending',
    supervisorId: null,
    parentSupervisorId: null,
    financialYear: 'apr-mar',
    assignedSupervisors: [],
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    disabledAt: null,
    disabledBy: null,
    profileComplete: false
  });

  // Create audit log
  await createAuditEntry('USER_CREATED', 'system', 'System', `users/${user.uid}`, user.uid, null, { email: user.email });
});

// ──────────────────────────────────────────────────
// 2. Firestore Trigger: When an approval record is updated
// ──────────────────────────────────────────────────
export const onApprovalUpdate = functions.firestore
  .document('approvals/{approvalId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();

    // Only act when status changes from 'pending' to 'approved' or 'rejected'
    if (before.status === 'pending' && after.status !== 'pending') {
      const userId = after.userId;

      if (after.status === 'approved') {
        // Update user status to approved
        await db.collection('users').doc(userId).update({
          status: 'approved',
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        await createAuditEntry(
          'USER_APPROVED',
          after.processedBy || 'unknown',
          'Supervisor',
          `users/${userId}`,
          userId,
          { status: 'pending' },
          { status: 'approved' }
        );
      } else if (after.status === 'rejected') {
        await createAuditEntry(
          'USER_REJECTED',
          after.processedBy || 'unknown',
          'Supervisor',
          `users/${userId}`,
          userId,
          { status: 'pending' },
          { status: 'rejected' }
        );
      }
    }
  });

// ──────────────────────────────────────────────────
// 3. Firestore Trigger: Audit log when daily sales are written
// ──────────────────────────────────────────────────
export const onDailySalesWrite = functions.firestore
  .document('dailySales/{salesId}')
  .onWrite(async (change, context) => {
    const after = change.after.exists ? change.after.data() : null;
    const before = change.before.exists ? change.before.data() : null;

    if (!after) return; // deletion — shouldn't happen

    const action = before ? 'SALES_UPDATED' : 'SALES_CREATED';

    await createAuditEntry(
      action,
      after.userId,
      'User',
      `dailySales/${context.params.salesId}`,
      after.userId,
      before ? before.products : null,
      after.products
    );
  });

// ──────────────────────────────────────────────────
// 4. HTTPS Callable: Admin sets user role
// ──────────────────────────────────────────────────
export const adminSetUserRole = functions.https.onCall(async (data, context) => {
  // Verify caller is admin
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');

  const callerDoc = await db.collection('users').doc(context.auth.uid).get();
  if (!callerDoc.exists || callerDoc.data()?.role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Only admins can change roles');
  }

  const { userId, newRole } = data;
  if (!userId || !newRole) {
    throw new functions.https.HttpsError('invalid-argument', 'userId and newRole are required');
  }

  if (!['user', 'supervisor', 'viewer', 'admin'].includes(newRole)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid role');
  }

  const targetDoc = await db.collection('users').doc(userId).get();
  if (!targetDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'User not found');
  }

  const oldRole = targetDoc.data()?.role;

  await db.collection('users').doc(userId).update({
    role: newRole,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  await createAuditEntry(
    'ROLE_CHANGED',
    context.auth.uid,
    callerDoc.data()?.displayName || 'Admin',
    `users/${userId}`,
    userId,
    { role: oldRole },
    { role: newRole }
  );

  return { success: true, message: `Role changed to ${newRole}` };
});

// ──────────────────────────────────────────────────
// 5. HTTPS Callable: Admin bulk approve
// ──────────────────────────────────────────────────
export const adminBulkApprove = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');

  const callerDoc = await db.collection('users').doc(context.auth.uid).get();
  if (!callerDoc.exists || callerDoc.data()?.role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Only admins can bulk approve');
  }

  const { userIds } = data;
  if (!Array.isArray(userIds) || userIds.length === 0) {
    throw new functions.https.HttpsError('invalid-argument', 'userIds array is required');
  }

  const batch = db.batch();
  const now = admin.firestore.FieldValue.serverTimestamp();

  for (const uid of userIds) {
    batch.update(db.collection('users').doc(uid), {
      status: 'approved',
      updatedAt: now
    });
  }

  await batch.commit();

  await createAuditEntry(
    'BULK_APPROVE',
    context.auth.uid,
    callerDoc.data()?.displayName || 'Admin',
    'users',
    null,
    null,
    { approvedUserIds: userIds, count: userIds.length }
  );

  return { success: true, count: userIds.length };
});

// ──────────────────────────────────────────────────
// 6. Daily Excel & Body Report Core Generator & Dispatcher
// ──────────────────────────────────────────────────
function escapeHtml(str: any): string {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getCategoryRank(category: string): number {
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

function formatNumberVal(num: number): number {
  return Math.round((num || 0) * 100) / 100;
}

function calcPctVal(plan: number, ach: number): number {
  if (!plan || plan === 0) return ach > 0 ? 100 : 0;
  return Math.round((ach / plan) * 10000) / 100;
}

/** Render a clean, app-styled HTML table for MTD Plan vs Achievement */
function renderMtdHtmlTable(
  title: string,
  rows: Array<{ category: string; product: string; plan: number; ach: number }>,
  totalPlan: number,
  totalAch: number
): string {
  const totalPct = calcPctVal(totalPlan, totalAch);

  let rowsHtml = '';
  rows.forEach((r, idx) => {
    const pct = calcPctVal(r.plan, r.ach);
    const badgeBg = pct >= 100 ? '#dcfce7' : pct >= 80 ? '#fef3c7' : '#fee2e2';
    const badgeColor = pct >= 100 ? '#15803d' : pct >= 80 ? '#b45309' : '#b91c1c';
    const rowBg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';

    rowsHtml += `
      <tr style="background-color: ${rowBg}; border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 10px 12px; font-size: 13px; color: #475569;">${escapeHtml(r.category)}</td>
        <td style="padding: 10px 12px; font-size: 13px; font-weight: 600; color: #0f172a;">${escapeHtml(r.product)}</td>
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
        ${escapeHtml(title)} (MTD Plan vs. Achievement)
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

function renderWeeklyCommitmentsHtmlTable(
  title: string,
  userRows: Array<{ name: string; daysCommitted: number; totalCommitted: number; totalAchieved: number; consistency: number }>
): string {
  let rowsHtml = '';
  userRows.forEach((r, idx) => {
    const consistency = r.consistency;
    const badgeBg = consistency >= 80 ? '#dcfce7' : consistency >= 50 ? '#fef3c7' : '#fee2e2';
    const badgeColor = consistency >= 80 ? '#15803d' : consistency >= 50 ? '#b45309' : '#b91c1c';
    const rowBg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';

    rowsHtml += `
      <tr style="background-color: ${rowBg}; border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 10px 12px; font-size: 13px; font-weight: 600; color: #0f172a;">${escapeHtml(r.name)}</td>
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
        🎯 ${escapeHtml(title)}
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

function getWeekDates(refDate: Date = new Date()): { weekStart: string; weekEnd: string; dates: string[] } {
  const d = new Date(refDate);
  const day = d.getDay();
  const diffToMonday = (day === 0 ? -6 : 1) - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diffToMonday);

  const dates: string[] = [];
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

async function generateAndSendDailyReport(overrideRecipient?: string) {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istDate = new Date(now.getTime() + istOffset);
  const todayStr = istDate.toISOString().split('T')[0]; // YYYY-MM-DD
  const currentMonthStr = todayStr.substring(0, 7); // YYYY-MM

  // Determine FY start month (Apr-Mar)
  const currentYear = istDate.getFullYear();
  const currentMonthNum = istDate.getMonth() + 1; // 1-12
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
  const productsSnap = await db.collection('products').get();
  const rawProducts: any[] = productsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  const products: any[] = sortProductsByCategoryPriority(rawProducts);

  const usersSnap = await db.collection('users').where('status', '==', 'approved').get();
  const allUsers: any[] = usersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

  const monthlyPlansSnap = await db.collection('monthlyPlans').get();
  const allMonthlyPlans: any[] = monthlyPlansSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

  const dailySalesSnap = await db.collection('dailySales').get();
  const allDailySales: any[] = dailySalesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

  // Fetch weekly commitments (Monday to Saturday)
  const weekInfo = getWeekDates(istDate);
  const commitmentsSnap = await db.collection('dailyCommitments')
    .where('date', '>=', weekInfo.weekStart)
    .where('date', '<=', weekInfo.weekEnd)
    .get();
  const allCommitments: any[] = commitmentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

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

  const apiUrl = process.env.EMAIL_API_URL || 'https://varchaz-email-api-sigma.vercel.app/send';
  const apiKey = process.env.EMAIL_API_KEY || '';

  // Guard: Verify if automated reporting is enabled before emailing users and supervisors
  const settingsDoc = await db.collection('settings').doc('dailyReportConfig').get();
  const isEnabled = settingsDoc.exists ? settingsDoc.data()?.isEnabled === true : false;
  if (!isEnabled && !overrideRecipient) {
    console.log('Automated reporting is disabled in settings. Skipping dispatch to users and supervisors.');
    return { success: false, message: 'Reporting emails are currently disabled in settings.', count: 0, date: todayStr };
  }

  let totalEmailsDispatched = 0;

  // Identify Supervisors & Group Team Members (Restricted to users and supervisors only)
  const supervisors = allUsers.filter((u: any) => u.role === 'supervisor');

  for (const supervisor of supervisors) {
    const supId = supervisor.id;
    const supAutomailerEmail = supervisor.automailerEmail || supervisor.email;
    const teamMembers = allUsers.filter((u: any) => 
      (u.role === 'user' || u.role === 'supervisor') && (u.supervisorId === supId || u.id === supId)
    );

    if (teamMembers.length === 0) continue;

    // ──────────────────────────────────────────────────
    // TYPE A: CONSOLIDATED TEAM REPORT
    // ──────────────────────────────────────────────────
    const consMtdRows: any[] = [];
    const consYtdRows: any[] = [];
    const consMtdTableData: Array<{ category: string; product: string; plan: number; ach: number }> = [];

    let teamMtdPlanTotal = 0;
    let teamMtdAchTotal = 0;
    let teamYtdPlanTotal = 0;
    let teamYtdAchTotal = 0;

    products.forEach((prod: any) => {
      const pId = prod.productId || prod.id;
      let pMtdPlan = 0;
      let pMtdAch = 0;
      let pYtdPlan = 0;
      let pYtdAch = 0;

      teamMembers.forEach((u: any) => {
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
    const consWeeklyCommitmentRows: any[] = [];
    const teamCommitmentTableData: any[] = [];

    teamMembers.forEach((u: any) => {
      const userComms = allCommitments.filter((c: any) => c.userId === u.id);
      let commTotal = 0;
      let achTotal = 0;
      let cappedSum = 0;
      let reportedDays = 0;
      let fulfilledDays = 0;

      userComms.forEach((c: any) => {
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

    // Create 3-Sheet Excel for Consolidated
    const wbCons = XLSX.utils.book_new();
    const wsConsMtd = XLSX.utils.json_to_sheet(consMtdRows);
    const wsConsYtd = XLSX.utils.json_to_sheet(consYtdRows);
    const wsConsCommitments = XLSX.utils.json_to_sheet(consWeeklyCommitmentRows);
    XLSX.utils.book_append_sheet(wbCons, wsConsMtd, 'Consolidated MTD');
    XLSX.utils.book_append_sheet(wbCons, wsConsYtd, 'Consolidated YTD');
    XLSX.utils.book_append_sheet(wbCons, wsConsCommitments, 'Weekly Commitments');
    const excelBufferCons = XLSX.write(wbCons, { type: 'buffer', bookType: 'xlsx' });
    const base64ExcelCons = excelBufferCons.toString('base64');

    // In-Body HTML Tables
    const mtdTableHtmlCons = renderMtdHtmlTable('Team Consolidated', consMtdTableData, teamMtdPlanTotal, teamMtdAchTotal);
    const commitmentsTableHtmlCons = renderWeeklyCommitmentsHtmlTable('Team Weekly Commitments & Consistency', teamCommitmentTableData);

    // List of Recipients for Consolidated Report (Supervisor + Team Members, strictly excluding admins)
    const consRecipients = Array.from(new Set(
      overrideRecipient
        ? [overrideRecipient]
        : teamMembers
            .filter((u: any) => u.role !== 'admin')
            .map((u: any) => u.automailerEmail || u.email)
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

      await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({
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
        })
      });
      totalEmailsDispatched++;
    }

    // ──────────────────────────────────────────────────
    // TYPE B: INDIVIDUAL USER LEVEL REPORTS (TO: User, CC: Supervisor - NEVER Admin)
    // ──────────────────────────────────────────────────
    for (const member of teamMembers) {
      if (member.id === supId) continue; // Skip supervisor self in individual pass
      if (member.role === 'admin') continue; // STRICT RULE: Never send daily reports to admin

      const userTargetEmail = member.automailerEmail || member.email;
      if (!userTargetEmail) continue;

      const userMtdRows: any[] = [];
      const userYtdRows: any[] = [];
      const userMtdTableData: Array<{ category: string; product: string; plan: number; ach: number }> = [];

      let userMtdPlanTotal = 0;
      let userMtdAchTotal = 0;
      let userYtdPlanTotal = 0;
      let userYtdAchTotal = 0;

      products.forEach((prod: any) => {
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

      // Create 3-Sheet Excel for User
      const wbUser = XLSX.utils.book_new();
      const wsUserMtd = XLSX.utils.json_to_sheet(userMtdRows);
      const wsUserYtd = XLSX.utils.json_to_sheet(userYtdRows);

      const memberComms = allCommitments.filter((c: any) => c.userId === member.id);
      let mCommTotal = 0;
      let mAchTotal = 0;
      let mCappedSum = 0;
      let mReportedDays = 0;
      let mFulfilledDays = 0;

      const userCommitmentRows: any[] = [];
      memberComms.forEach((c: any) => {
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

      // In-Body HTML Table for User (MTD ONLY)
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

      await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({
          to: overrideRecipient || userTargetEmail,
          cc: overrideRecipient ? undefined : supAutomailerEmail,
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
        })
      });
      totalEmailsDispatched++;
    }
  }

  await db.collection('settings').doc('dailyReportConfig').set({
    lastSentAt: admin.firestore.FieldValue.serverTimestamp(),
    lastStatus: 'success',
    lastCount: totalEmailsDispatched
  }, { merge: true });

  return { success: true, count: totalEmailsDispatched, date: todayStr };
}

/** Check if date is a non-working day in IST (All Sundays, 2nd & 4th Saturdays of the month) */
function isNonWorkingDay(dateObj: Date): { isExcluded: boolean; reason: string | null } {
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
function isLastWorkingDayOfWeek(dateObj: Date): { isLastWorkingDay: boolean; reason: string } {
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
function getPreviousWorkingDay(refDate: Date): Date {
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
function getReportingCutoffInfo(istDate: Date) {
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

// ──────────────────────────────────────────────────
// 7. Scheduled Weekly MTD Cloud Function (9:00 PM IST / 21:00 Asia/Kolkata on Last Working Day of Week)
// ──────────────────────────────────────────────────
export const scheduledDailyReport = functions.pubsub
  .schedule('0 21 * * 5,6')
  .timeZone('Asia/Kolkata')
  .onRun(async (context) => {
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(now.getTime() + istOffset);

    // Verify if today is the last working day of the week
    const lastWorkingDayCheck = isLastWorkingDayOfWeek(istDate);
    if (!lastWorkingDayCheck.isLastWorkingDay) {
      console.log(`Skipping weekly MTD report: ${lastWorkingDayCheck.reason}.`);
      return null;
    }

    const settingsDoc = await db.collection('settings').doc('dailyReportConfig').get();
    const isEnabled = settingsDoc.exists ? settingsDoc.data()?.isEnabled === true : false;
    if (!isEnabled) {
      console.log('Automailer is currently disabled in settings. Skipping execution.');
      return null;
    }
    console.log('Starting automated weekly MTD performance report execution...');
    return await generateAndSendDailyReport();
  });

// ──────────────────────────────────────────────────
// 8. HTTPS Callable: Manual trigger from Admin Settings UI
// ──────────────────────────────────────────────────
export const sendDailyReportNow = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
  }

  const callerDoc = await db.collection('users').doc(context.auth.uid).get();
  const callerData = callerDoc.data();
  if (callerData?.status !== 'approved' || (callerData?.role !== 'admin' && callerData?.role !== 'supervisor')) {
    throw new functions.https.HttpsError('permission-denied', 'Only approved admins or supervisors can trigger daily report emails');
  }

  const { recipientEmail } = data || {};
  try {
    const result = await generateAndSendDailyReport(recipientEmail);
    return result;
  } catch (err: any) {
    console.error('Error generating daily report:', err);
    throw new functions.https.HttpsError('internal', err.message || 'Failed to send daily report email');
  }
});

// ──────────────────────────────────────────────────
// 8a. Daily Product Group MTD MIS Reports (Liabilities, Assets, TPP, Others)
// ──────────────────────────────────────────────────
const MIS_PRODUCT_PRIORITIES: Record<string, number> = {
  // Liabilities
  'CA': 1, 'CA MAMC': 2, 'SA': 3, 'SA MAMC': 4, 'IP Value': 5, 'RFD Value': 6, 'UFD Nos.': 7, 'UFD Value': 8, 'Aane Do FD Val': 9, 'Aaane Do FD Val': 9,
  // Assets (Retail + Wholesale)
  'Home Loan Value': 1, 'LAP Value': 2, 'Auto Loan Value': 3, 'Auto Loan LC': 4, 'Personal Loan Value': 5, 'Personal Loan LC': 6, 'Business Loan Value': 7, 'Business Loan LC': 8, 'Gold Loan Value': 9, 'MEG Value': 10, 'EEG/BBG Val': 11,
  // TPP
  'LI': 1, 'GI/HI': 2, 'MF': 3, 'SIP': 4,
  // Others
  'Credit Card': 1, 'Demat/HSL': 2, 'Payzapp': 3, 'Smart Wealth': 4, 'SSS': 5
};

function sortMisProducts(products: any[]): any[] {
  return [...products].sort((a, b) => {
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
  dateStr: string
): string {
  const colTotals: Record<string, number> = {};
  products.forEach((p: any) => { colTotals[p.id] = 0; });

  let rowsHtml = '';
  reps.forEach((rep: any, idx: number) => {
    const rowBg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
    let cellsHtml = '';

    products.forEach((p: any) => {
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
          ${escapeHtml(rep.displayName || 'Team Member')}
        </td>
        ${cellsHtml}
      </tr>
    `;
  });

  // Footer Totals
  let footerCellsHtml = '';
  products.forEach((p: any) => {
    const tot = colTotals[p.id] || 0;
    footerCellsHtml += `
      <td style="padding: 10px 8px; border: 1px solid #cbd5e1; font-size: 13px; font-weight: 700; color: #0f172a; text-align: center;">
        ${tot > 0 ? tot.toLocaleString('en-IN') : '0'}
      </td>
    `;
  });

  const productHeadersHtml = products.map((p: any) => `
    <th style="padding: 10px 8px; font-size: 12px; font-weight: 700; color: #0f172a; border: 1px solid #e2e8f0; text-align: center; white-space: nowrap;">
      ${escapeHtml(p.name || p.productName)}
    </th>
  `).join('');

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 980px; margin: 0 auto; padding: 20px; background-color: #f8fafc; border-radius: 8px;">
      
      <!-- Executive Header -->
      <div style="background: linear-gradient(135deg, #0f172a 0%, #1e3a8a 50%, #2563eb 100%); color: #ffffff; padding: 18px 24px; border-radius: 8px 8px 0 0;">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
          <div>
            <h2 style="margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.02em;">
              Varchaz — Daily MTD Report: ${escapeHtml(groupName)}
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

async function generateAndSendProductGroupReports(overrideRecipient?: string) {
  const settingsDoc = await db.collection('settings').doc('dailyReportConfig').get();
  const isEnabled = settingsDoc.exists ? settingsDoc.data()?.isEnabled === true : false;
  if (!isEnabled && !overrideRecipient) {
    console.log('Product Group Reports are currently disabled in settings. Skipping execution.');
    return { success: false, message: 'Reporting disabled in settings' };
  }

  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istDate = new Date(now.getTime() + istOffset);
  const cutoff = getReportingCutoffInfo(istDate);
  const effectiveDateStr = cutoff.effectiveDateStr;
  const todayStr = cutoff.todayStr;
  const isPriorWorkingDay = cutoff.isPriorWorkingDay;
  const currentMonthStr = effectiveDateStr.substring(0, 7);

  const holidayCheck = isNonWorkingDay(istDate);
  if (holidayCheck.isExcluded && !overrideRecipient) {
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
  const reps = allUsers.filter((u: any) => u.role === 'user').sort((a: any, b: any) => (a.displayName || '').localeCompare(b.displayName || ''));

  // Target recipients: All active reps in TO, Supervisors in CC (Admins STRICTLY excluded per policy)
  let toRecipients: string[] = [];
  let ccRecipients: string[] = [];
  if (overrideRecipient) {
    toRecipients = [overrideRecipient];
  } else {
    toRecipients = Array.from(new Set(
      allUsers
        .filter((u: any) => u.role === 'user')
        .map((u: any) => (u.automailerEmail || u.email || '').trim().toLowerCase())
        .filter(Boolean)
    ));

    // STRICT: Do not send daily reports to admins. CC only supervisors.
    ccRecipients = Array.from(new Set(
      allUsers
        .filter((u: any) => u.role === 'supervisor')
        .map((u: any) => (u.automailerEmail || u.email || '').trim().toLowerCase())
        .filter(Boolean)
    ));
  }

  if (toRecipients.length === 0) {
    return { success: false, message: 'No recipients found' };
  }

  const mtdSalesByUser: Record<string, Record<string, number>> = {};
  dailySalesSnap.docs.forEach(doc => {
    const ds = doc.data() as any;
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
      matcher: (p: any) => (p.category || '').toLowerCase().includes('liabilit')
    },
    {
      name: 'Assets', // Retail Assets + Wholesale Assets combined
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

  const apiUrl = process.env.EMAIL_API_URL || 'https://varchaz-email-api-sigma.vercel.app/send';
  const apiKey = process.env.EMAIL_API_KEY || 'your_super_secret_api_key_here';

  let emailsDispatched = 0;

  for (const gc of groupConfigs) {
    const groupProds = sortMisProducts(rawProducts.filter(gc.matcher));
    if (groupProds.length === 0) continue;

    const htmlBody = renderProductGroupMisHtmlTable(gc.name, groupProds, reps, mtdSalesByUser, effectiveDateStr);

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

    try {
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`Email microservice returned HTTP ${res.status}: ${errText}`);
      }
      emailsDispatched++;
    } catch (err: any) {
      console.error(`Error sending ${gc.name} report email:`, err.message);
    }
  }

  await db.collection('settings').doc('dailyReportConfig').set({
    lastProductGroupsSentAt: admin.firestore.FieldValue.serverTimestamp(),
    lastProductGroupsCount: emailsDispatched,
    lastStatus: 'success'
  }, { merge: true });

  return { success: true, count: emailsDispatched, date: effectiveDateStr };
}

// Scheduled Daily Product Group MIS at 9:00 PM IST (21:00 Asia/Kolkata)
export const scheduledDailyProductGroupReports = functions.pubsub
  .schedule('0 21 * * *')
  .timeZone('Asia/Kolkata')
  .onRun(async (context) => {
    console.log('Triggering automated 9:00 PM IST daily product group reports...');
    return await generateAndSendProductGroupReports();
  });

// HTTPS Callable to trigger on-demand from UI
export const sendProductGroupReportsNow = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
  }

  const callerDoc = await db.collection('users').doc(context.auth.uid).get();
  const callerData = callerDoc.data();
  if (callerData?.status !== 'approved' || (callerData?.role !== 'admin' && callerData?.role !== 'supervisor')) {
    throw new functions.https.HttpsError('permission-denied', 'Only approved admins or supervisors can trigger daily product group emails');
  }

  const { recipientEmail } = data || {};
  try {
    const result = await generateAndSendProductGroupReports(recipientEmail);
    return result;
  } catch (err: any) {
    console.error('Error generating product group reports:', err);
    throw new functions.https.HttpsError('internal', err.message || 'Failed to send product group reports');
  }
});

// ──────────────────────────────────────────────────
// 8b. Morning User Nudge Email Generator (Target: Users / Team Members Only)
// ──────────────────────────────────────────────────
async function generateAndSendMorningUserNudges(overrideRecipient?: string) {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istDate = new Date(now.getTime() + istOffset);
  const todayStr = istDate.toISOString().split('T')[0]; // YYYY-MM-DD
  const currentMonthStr = todayStr.substring(0, 7); // YYYY-MM

  // Fetch approved users with role === 'user' (Team Members only)
  const usersSnap = await db.collection('users')
    .where('status', '==', 'approved')
    .get();
  
  const teamUsers: any[] = usersSnap.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .filter((u: any) => u.role === 'user');

  if (teamUsers.length === 0) {
    return { success: true, count: 0, date: todayStr, message: 'No approved users with role "user" found.' };
  }

  // Fetch products, monthly plans, and daily sales
  const productsSnap = await db.collection('products').get();
  const rawProducts = productsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  const products: any[] = sortProductsByCategoryPriority(rawProducts);

  const monthlyPlansSnap = await db.collection('monthlyPlans').get();
  const allMonthlyPlans: any[] = monthlyPlansSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

  const dailySalesSnap = await db.collection('dailySales').get();
  const allDailySales: any[] = dailySalesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

  // Helper maps for MTD plans and sales by user
  const mtdPlansByUser: Record<string, Record<string, number>> = {};
  allMonthlyPlans.forEach((mp: any) => {
    if (mp.month === currentMonthStr && mp.userId) {
      if (!mtdPlansByUser[mp.userId]) mtdPlansByUser[mp.userId] = {};
      Object.entries(mp.products || {}).forEach(([pId, val]) => {
        mtdPlansByUser[mp.userId][pId] = (mtdPlansByUser[mp.userId][pId] || 0) + Number(val || 0);
      });
    }
  });

  const mtdSalesByUser: Record<string, Record<string, number>> = {};
  allDailySales.forEach((ds: any) => {
    if (ds.date && ds.date.substring(0, 7) === currentMonthStr && ds.date <= todayStr && ds.userId) {
      if (!mtdSalesByUser[ds.userId]) mtdSalesByUser[ds.userId] = {};
      Object.entries(ds.products || {}).forEach(([pId, val]) => {
        mtdSalesByUser[ds.userId][pId] = (mtdSalesByUser[ds.userId][pId] || 0) + Number(val || 0);
      });
    }
  });

  const apiUrl = process.env.EMAIL_API_URL || 'https://varchaz-email-api-sigma.vercel.app/send';
  const apiKey = process.env.EMAIL_API_KEY || 'your_super_secret_api_key_here';

  // Guard: Verify if automated morning nudges are enabled before emailing users and supervisors
  const settingsDoc = await db.collection('settings').doc('dailyReportConfig').get();
  const isEnabled = settingsDoc.exists ? settingsDoc.data()?.isEnabled === true : false;
  if (!isEnabled && !overrideRecipient) {
    console.log('Morning user nudges are disabled in settings. Skipping dispatch to users and supervisors.');
    return { success: false, message: 'Morning nudges are currently disabled in settings.', count: 0, date: todayStr };
  }

  let emailsDispatched = 0;

  for (const user of teamUsers) {
    const userTargetEmail = overrideRecipient || user.automailerEmail || user.email;
    if (!userTargetEmail) continue;

    let supervisorCcEmail: string | null = null;
    if (user.supervisorId && !overrideRecipient) {
      const supUserDoc = await db.collection('users').doc(user.supervisorId).get();
      if (supUserDoc.exists) {
        const supData = supUserDoc.data();
        supervisorCcEmail = supData?.automailerEmail || supData?.email || null;
      }
    }

    // Filter supervisor active products if user has supervisorId
    let userProducts = products;
    if (user.supervisorId) {
      const supProdDoc = await db.collection('supervisorProducts').doc(user.supervisorId).get();
      if (supProdDoc.exists) {
        const activeProductIds: string[] = supProdDoc.data()?.activeProductIds || [];
        if (activeProductIds.length > 0) {
          userProducts = products.filter(p => activeProductIds.includes(p.productId || p.id));
        }
      }
    }

    const goodProducts: Array<{ name: string; plan: number; ach: number; pct: number }> = [];
    const inactiveProducts: Array<{ name: string; plan: number; ach: number }> = [];

    userProducts.forEach((prod: any) => {
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

    // HTML Email Template
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

    const payload: any = {
      to: userTargetEmail,
      subject: `[Varchaz] Morning Performance Check-in & Action Plan (${todayStr})`,
      html: htmlBody,
      text: `Varchaz Morning Performance Check-in for ${userName} (${todayStr}). Please log in to review your active products and lead generation.`
    };
    if (supervisorCcEmail) {
      payload.cc = supervisorCcEmail;
    }

    try {
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`Email microservice returned HTTP ${res.status}: ${errText}`);
      }
      emailsDispatched++;
    } catch (err: any) {
      console.error(`Error sending morning nudge to ${userTargetEmail}:`, err.message);
    }
  }

  return { success: true, count: emailsDispatched, date: todayStr };
}

// Scheduled Morning Cloud Function (2:00 AM IST / 02:00 Asia/Kolkata)
export const scheduledMorningUserNudge = functions.pubsub
  .schedule('0 2 * * *')
  .timeZone('Asia/Kolkata')
  .onRun(async (context) => {
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(now.getTime() + istOffset);
    const holidayCheck = isNonWorkingDay(istDate);
    if (holidayCheck.isExcluded) {
      console.log(`Skipping scheduled morning user nudge: Non-working day (${holidayCheck.reason}).`);
      return null;
    }

    const settingsDoc = await db.collection('settings').doc('dailyReportConfig').get();
    const isEnabled = settingsDoc.exists ? settingsDoc.data()?.isEnabled === true : false;
    if (!isEnabled) {
      console.log('Daily report is currently disabled in settings. Skipping morning nudge.');
      return null;
    }
    console.log('Starting automated morning user nudge execution...');
    return await generateAndSendMorningUserNudges();
  });

// HTTPS Callable: Trigger Morning User Nudges Manually
export const sendMorningUserNudgeNow = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
  }

  const callerDoc = await db.collection('users').doc(context.auth.uid).get();
  const callerData = callerDoc.data();
  if (callerData?.status !== 'approved' || (callerData?.role !== 'admin' && callerData?.role !== 'supervisor')) {
    throw new functions.https.HttpsError('permission-denied', 'Only approved admins or supervisors can trigger morning user nudge emails');
  }

  const { recipientEmail } = data || {};
  try {
    const result = await generateAndSendMorningUserNudges(recipientEmail);
    return result;
  } catch (err: any) {
    console.error('Error sending morning user nudge:', err);
    throw new functions.https.HttpsError('internal', err.message || 'Failed to send morning user nudge email');
  }
});

// ──────────────────────────────────────────────────
// 9. HTTPS Callable: Send Custom Password Reset Email via Microservice
// ──────────────────────────────────────────────────
export const sendCustomPasswordResetEmail = functions.https.onCall(async (data, context) => {
  const { email } = data || {};
  if (!email || typeof email !== 'string') {
    throw new functions.https.HttpsError('invalid-argument', 'Email address is required');
  }

  const cleanEmail = email.trim().toLowerCase();

  try {
    // Generate secure official Firebase Password Reset link
    const resetLink = await admin.auth().generatePasswordResetLink(cleanEmail);

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1e293b; background-color: #f8fafc; border-radius: 8px;">
        <div style="background-color: #2563eb; color: #ffffff; padding: 20px; border-radius: 6px; text-align: center;">
          <h2 style="margin: 0; font-size: 22px;">Varchaz — Password Reset Request</h2>
        </div>

        <div style="padding: 20px; background-color: #ffffff; border-radius: 6px; margin-top: 16px; border: 1px solid #e2e8f0;">
          <p style="font-size: 15px; color: #334155; margin-top: 0;">Hello,</p>
          <p style="font-size: 14px; color: #475569; line-height: 1.6;">
            We received a request to reset your password for your Varchaz account (<strong>${cleanEmail}</strong>).
          </p>
          <p style="font-size: 14px; color: #475569; line-height: 1.6;">
            Click the button below to set a new password:
          </p>

          <div style="text-align: center; margin: 24px 0;">
            <a href="${resetLink}" target="_blank" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 14px; display: inline-block;">
              Reset My Password
            </a>
          </div>

          <p style="font-size: 12px; color: #94a3b8; line-height: 1.4; margin-bottom: 0;">
            If you did not request a password reset, you can safely ignore this email.
            <br/><br/>
            Direct Link: <a href="${resetLink}" style="color: #2563eb; word-break: break-all;">${resetLink}</a>
          </p>
        </div>

        <div style="border-top: 1px solid #e2e8f0; margin-top: 20px; padding-top: 16px; text-align: center; color: #94a3b8; font-size: 11px;">
          <p style="margin: 0;">© ${new Date().getFullYear()} Varchaz. All rights reserved.</p>
        </div>
      </div>
    `;

    const apiUrl = process.env.EMAIL_API_URL || 'https://varchaz-email-api-sigma.vercel.app/send';
    const apiKey = process.env.EMAIL_API_KEY;

    if (!apiKey) {
      throw new functions.https.HttpsError('failed-precondition', 'Email service API key is not configured.');
    }

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey
      },
      body: JSON.stringify({
        to: cleanEmail,
        subject: '[Varchaz] Password Reset Request',
        html: htmlBody,
        text: `Reset your Varchaz password using this link: ${resetLink}`
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Email microservice error (${response.status}): ${errText}`);
    }

    return { success: true, message: 'If an account exists with this email address, a password reset link has been sent.' };
  } catch (err: any) {
    console.error('Error generating/sending password reset email:', err);
    if (err.code === 'auth/user-not-found') {
      // Prevent user enumeration: return identical success response if user does not exist
      return { success: true, message: 'If an account exists with this email address, a password reset link has been sent.' };
    }
    throw new functions.https.HttpsError('internal', err.message || 'Failed to send password reset email.');
  }
});

// ──────────────────────────────────────────────────
// Helper: Create audit log entry
// ──────────────────────────────────────────────────
async function createAuditEntry(
  action: string,
  performedBy: string,
  performedByName: string,
  affectedRecord: string,
  affectedUserId: string | null,
  previousValue: any,
  newValue: any
) {
  await db.collection('auditLogs').add({
    action,
    performedBy,
    performedByName,
    affectedRecord,
    affectedUserId,
    previousValue: previousValue || null,
    newValue: newValue || null,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    metadata: {}
  });
}



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
// 6. Daily Excel Report Core Generator & Dispatcher
// ──────────────────────────────────────────────────
function formatNumberVal(num: number): number {
  return Math.round((num || 0) * 100) / 100;
}

function calcPctVal(plan: number, ach: number): number {
  if (!plan || plan === 0) return ach > 0 ? 100 : 0;
  return Math.round((ach / plan) * 10000) / 100;
}

async function generateAndSendDailyReport(overrideRecipient?: string) {
  // Fetch config settings
  const settingsDoc = await db.collection('settings').doc('dailyReportConfig').get();
  const config = settingsDoc.exists ? settingsDoc.data() : null;
  const recipientEmail = overrideRecipient || config?.recipientEmail || process.env.DAILY_REPORT_RECIPIENT_EMAIL || 'admin@varchaz.com';

  if (!recipientEmail) {
    throw new Error('No recipient email configured for daily report.');
  }

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
  const products = productsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

  const usersSnap = await db.collection('users').where('status', '==', 'approved').get();
  const users = usersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

  const monthlyPlansSnap = await db.collection('monthlyPlans').get();
  const allMonthlyPlans = monthlyPlansSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

  const dailySalesSnap = await db.collection('dailySales').get();
  const allDailySales = dailySalesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

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
      'Plan (MTD)': formatNumberVal(pPlan),
      'Achievement (MTD)': formatNumberVal(pAch),
      'Achievement %': `${calcPctVal(pPlan, pAch)}%`
    });
  });

  consolidatedMtdRows.push({
    Category: 'TOTAL',
    Product: 'GRAND TOTAL',
    'Plan (MTD)': formatNumberVal(grandTotalMtdPlan),
    'Achievement (MTD)': formatNumberVal(grandTotalMtdAch),
    'Achievement %': `${calcPctVal(grandTotalMtdPlan, grandTotalMtdAch)}%`
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
      'Plan (YTD)': formatNumberVal(pPlan),
      'Achievement (YTD)': formatNumberVal(pAch),
      'Achievement %': `${calcPctVal(pPlan, pAch)}%`
    });
  });

  consolidatedYtdRows.push({
    Category: 'TOTAL',
    Product: 'GRAND TOTAL',
    'Plan (YTD)': formatNumberVal(grandTotalYtdPlan),
    'Achievement (YTD)': formatNumberVal(grandTotalYtdAch),
    'Achievement %': `${calcPctVal(grandTotalYtdPlan, grandTotalYtdAch)}%`
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
        'Plan (MTD)': formatNumberVal(pPlan),
        'Achievement (MTD)': formatNumberVal(pAch),
        'Achievement %': `${calcPctVal(pPlan, pAch)}%`
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
        'Plan (YTD)': formatNumberVal(pPlan),
        'Achievement (YTD)': formatNumberVal(pAch),
        'Achievement %': `${calcPctVal(pPlan, pAch)}%`
      });
    });
  });

  // Construct Excel Workbook
  const wb = XLSX.utils.book_new();

  const wsConsMtd = XLSX.utils.json_to_sheet(consolidatedMtdRows);
  const wsConsYtd = XLSX.utils.json_to_sheet(consolidatedYtdRows);
  const wsUserMtd = XLSX.utils.json_to_sheet(userMtdRows);
  const wsUserYtd = XLSX.utils.json_to_sheet(userYtdRows);

  XLSX.utils.book_append_sheet(wb, wsConsMtd, 'Consolidated MTD');
  XLSX.utils.book_append_sheet(wb, wsConsYtd, 'Consolidated YTD');
  XLSX.utils.book_append_sheet(wb, wsUserMtd, 'User MTD');
  XLSX.utils.book_append_sheet(wb, wsUserYtd, 'User YTD');

  const excelBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const base64Excel = excelBuffer.toString('base64');

  // Dispatch Email via Microservice
  const apiUrl = process.env.EMAIL_API_URL || 'https://varchaz-email-api-sigma.vercel.app/send';
  const apiKey = process.env.EMAIL_API_KEY || 'your_super_secret_api_key_here';

  const mtdOverallPct = calcPctVal(grandTotalMtdPlan, grandTotalMtdAch);
  const ytdOverallPct = calcPctVal(grandTotalYtdPlan, grandTotalYtdAch);

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

  const emailPayload = {
    to: recipientEmail,
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
  };

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey
    },
    body: JSON.stringify(emailPayload)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Email microservice returned ${response.status}: ${errText}`);
  }

  await db.collection('settings').doc('dailyReportConfig').set({
    recipientEmail,
    isEnabled: config?.isEnabled ?? true,
    lastSentAt: admin.firestore.FieldValue.serverTimestamp(),
    lastStatus: 'success',
    lastRecipient: recipientEmail
  }, { merge: true });

  return { success: true, recipient: recipientEmail, date: todayStr };
}

// ──────────────────────────────────────────────────
// 7. Scheduled Daily Cloud Function (8:00 PM IST / 20:00)
// ──────────────────────────────────────────────────
export const scheduledDailyReport = functions.pubsub
  .schedule('0 20 * * *')
  .timeZone('Asia/Kolkata')
  .onRun(async (context) => {
    const settingsDoc = await db.collection('settings').doc('dailyReportConfig').get();
    const isEnabled = settingsDoc.exists ? settingsDoc.data()?.isEnabled !== false : true;
    if (!isEnabled) {
      console.log('Daily report is currently disabled in settings. Skipping execution.');
      return null;
    }
    console.log('Starting automated daily performance report execution...');
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
  const callerRole = callerDoc.data()?.role;
  if (callerRole !== 'admin' && callerRole !== 'supervisor') {
    throw new functions.https.HttpsError('permission-denied', 'Only admins or supervisors can trigger daily report emails');
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
    const apiKey = process.env.EMAIL_API_KEY || 'your_super_secret_api_key_here';

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

    return { success: true, message: 'Password reset link sent to ' + cleanEmail };
  } catch (err: any) {
    console.error('Error generating/sending password reset email:', err);
    if (err.code === 'auth/user-not-found') {
      throw new functions.https.HttpsError('not-found', 'No user account found with this email address.');
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



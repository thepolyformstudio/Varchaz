/* ============================================================
   Varchaz — Daily Report Cron Script (GitHub Actions & Standalone)
   ============================================================ */

const admin = require('firebase-admin');
const XLSX = require('xlsx');

const DEFAULT_SERVICE_ACCOUNT = {
  type: "service_account",
  project_id: "varchaz",
  private_key_id: "4b6b2568d3dcc6c4c0d6f2b21d158e44ca60faeb",
  private_key: "-----BEGIN PRIVATE KEY-----\nMIIEvwIBADANBgkqhkiG9w0BAQEFAASCBKkwggSlAgEAAoIBAQC18a96oCuEj23O\neOHvWREB682Zhma8WAQ3KkymKdnwc6eHR+YC/u5SEhp81Qi+5NXSTdF1QWvnYw8X\nVw0Ebz/sQJx37T/wSGbWZR/bwR2glKmCKCN+7JzyPAL0y8TM7rzPMvve6NBggTp/\nwN7+QqmSLbZcgg2kjub6CU1yLom2B13QtdM9xI0nkk0a7Y4SHlxttl/OIELHemf7\ndUer1KycRa6VJyhjkz4PFxxKI3id1AF2l8liDmWQ0XKNbS2/nUnvr3Wn9els90oi\nxoyc+d2n2vc6tYRqvv1vUFvbz3Pj2mKHOnorf82P0b+GbQoDRrU5z7q4GXUx0Ozr\nO9qFbq5jAgMBAAECggEAS5UIGb/Z9CqFKiWrbfupBgxID8P2f71smuIWj1yJbcsN\nyDQFCC+RH0Tn/f2dsXdsn/21yqkPw0KybTa7cKEqg+FfXq6PRik9l0jREEBMJ346\nYJh+DmcK19I4RCs2KQ/wHX8HhNVgYwasH5Am0qcsvE4DGLDqK/c1Wp9srcdJa/U1\nlsjSrgjb4HFPQt1jHTZsVBc8BL2O+vmEjX1fvjX0bWpa+WnS0uz6W9serW3BrUvN\ndUqxv6dTqtkUVBCn88cwFLWZkyLxSeYO70vuJWfVcGo44VHDebdCbSZ5xKD9Q/rH\nUkLQ7N3if0x2/9Q91Yprh9wwoJcvkkQMrLhqtTz/QQKBgQDpX4QxUXSbsivzWI+N\nkBD8pUmv5LgkH5l3ZvCQ9T0nywRBRkeko6D+fiZ02h7asHSnWoeHNvMcFYb6o7an\n5c4vIV4ssasxzXbtnno0LW8pZVd8U2karegToIZqZX+qpOITqsUmGv3y8KzR0dGH\ndlq3arOWyBBBboboZiMRj1o8gwKBgQDHlaoqsV5SR5rXdWMbqwHXQQ+y2uuk0uvm\nGuFcSY5dE4pMKg1ot9ogaknpsjsRw4iRdJx8ojvpsLsw/kSyqXnDZ6XYOJtyz//c\nIfPF9cpWJqor0XLwhuMKwKDv3NYQTj/mjU0xsIzXwuoBej1xvV+taOG+Do9rvEJY\nY3YDT5TgoQKBgQCvq/QBf/SMQymsa8zb3ke7NtzqJ/ypTJQkenu6UrDvZHZWgIXr\nnDTTfbiLG6pAKrYVSCNfGHEWgenygAw+BNIZTj/q2u8odScCJdqNrmnQOnYJo2wp\n5iEdrSehrbfVh3qbHWB8l7L0DlG5O/1CwEf3a722UfFSn9Wz2TaqwENH6wKBgQCO\nYJYkHqPKzooHahZphnSpuiAY11ODIXRnkoVx8Ic+ntHpw5YNPhq9RRW1QRAie/rQ\nyP9ZaeKTsx/Ws40OZxgV7brBpKBAJ2G/B/l/HvhYvPxoheIY9CDDaudkNYX/29J6\nBhMrf2b6BHIq26k5mn7Glit0Ca8GjCZIJ6vocL0kAQKBgQCb9ZeWvAaasn2NHh0G\nlXxSCg0pgAi7/NzDlWJ+NIS8tNYSaGK9JLyEPw4skUHsBrq3pmm0m0zx81PL4pas\n2ubDeRRnJ/LIHwySxnB/by+0WEnM6axlGNBCKMRn8h9x9YJ4r1BEOXGghlTBm9IZ\n/n93PEvm+EoHaUNzKZjNpuX0mg==\n-----END PRIVATE KEY-----\n",
  client_email: "firebase-adminsdk-fbsvc@varchaz.iam.gserviceaccount.com",
  client_id: "115324774516365282414",
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url: "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-fbsvc%40varchaz.iam.gserviceaccount.com",
  universe_domain: "googleapis.com"
};

function initializeFirebase() {
  if (admin.apps.length > 0) return;

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  let serviceAccount = DEFAULT_SERVICE_ACCOUNT;
  if (serviceAccountJson) {
    try {
      serviceAccount = JSON.parse(serviceAccountJson);
    } catch (e) {
      console.warn('Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON, using default credentials.');
    }
  }

  console.log('Initializing Firebase Admin with service account credentials...');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

function formatNumberVal(num) {
  return Math.round((num || 0) * 100) / 100;
}

function calcPctVal(plan, ach) {
  if (!plan || plan === 0) return ach > 0 ? 100 : 0;
  return Math.round((ach / plan) * 10000) / 100;
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

async function runDailyReportCron() {
  initializeFirebase();
  const db = admin.firestore();

  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istDate = new Date(now.getTime() + istOffset);
  const todayStr = istDate.toISOString().split('T')[0]; // YYYY-MM-DD
  const currentMonthStr = todayStr.substring(0, 7); // YYYY-MM

  console.log(`Executing Varchaz Daily Auto Mailer Cron for date: ${todayStr} (IST)...`);

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
  const products = productsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

  const usersSnap = await db.collection('users').where('status', '==', 'approved').get();
  const allUsers = usersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

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

  const apiUrl = process.env.EMAIL_API_URL || 'https://varchaz-email-api-sigma.vercel.app/send';
  const apiKey = process.env.EMAIL_API_KEY || 'your_super_secret_api_key_here';

  let totalEmailsDispatched = 0;
  const supervisors = allUsers.filter(u => u.role === 'supervisor' || u.role === 'admin');

  for (const supervisor of supervisors) {
    const supId = supervisor.id;
    const supAutomailerEmail = supervisor.automailerEmail || supervisor.email;
    const teamMembers = allUsers.filter(u => u.supervisorId === supId || u.id === supId);

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

    const wbCons = XLSX.utils.book_new();
    const wsConsMtd = XLSX.utils.json_to_sheet(consMtdRows);
    const wsConsYtd = XLSX.utils.json_to_sheet(consYtdRows);
    XLSX.utils.book_append_sheet(wbCons, wsConsMtd, 'Consolidated MTD');
    XLSX.utils.book_append_sheet(wbCons, wsConsYtd, 'Consolidated YTD');
    const excelBufferCons = XLSX.write(wbCons, { type: 'buffer', bookType: 'xlsx' });
    const base64ExcelCons = excelBufferCons.toString('base64');

    const mtdTableHtmlCons = renderMtdHtmlTable('Team Consolidated', consMtdTableData, teamMtdPlanTotal, teamMtdAchTotal);
    const consRecipients = Array.from(new Set(
      teamMembers.map(u => u.automailerEmail || u.email).filter(Boolean)
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

            <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-top: 16px;">
              <p style="font-size: 13px; line-height: 1.5; color: #475569; margin: 0;">
                ℹ️ <strong>Note:</strong> The full Year-to-Date (YTD Plan vs. Achievement) report is attached as an Excel workbook (<strong>Varchaz_Consolidated_Daily_Report_${todayStr}.xlsx</strong>) with separate MTD and YTD sheets.
              </p>
            </div>
          </div>

          <div style="border-top: 1px solid #e2e8f0; padding-top: 16px; text-align: center; color: #94a3b8; font-size: 11px;">
            <p style="margin: 0;">Automated email generated by Varchaz Performance System via VarchazReport@gmail.com.</p>
          </div>
        </div>
      `;

      try {
        const res = await fetch(apiUrl, {
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
        const resData = await res.json();
        console.log(`Consolidated email sent to ${consRecipients.length} recipient(s):`, resData.message || 'Success');
        totalEmailsDispatched++;
      } catch (err) {
        console.error('Error dispatching consolidated email:', err.message);
      }
    }

    // ──────────────────────────────────────────────────
    // TYPE B: INDIVIDUAL USER LEVEL REPORTS (TO: User, CC: Supervisor)
    // ──────────────────────────────────────────────────
    for (const member of teamMembers) {
      if (member.id === supId) continue;

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
      XLSX.utils.book_append_sheet(wbUser, wsUserMtd, 'User MTD');
      XLSX.utils.book_append_sheet(wbUser, wsUserYtd, 'User YTD');
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
              <p style="font-size: 13px; line-height: 1.5; color: #475569; margin: 0;">
                ℹ️ <strong>Note:</strong> Your full Year-to-Date (YTD) performance report is attached as an Excel file (<strong>Varchaz_Daily_Report_${member.displayName.replace(/\s+/g, '_')}_${todayStr}.xlsx</strong>) containing both MTD and YTD sheets.
              </p>
            </div>
          </div>

          <div style="border-top: 1px solid #e2e8f0; padding-top: 16px; text-align: center; color: #94a3b8; font-size: 11px;">
            <p style="margin: 0;">Automated email generated by Varchaz Performance System via VarchazReport@gmail.com.</p>
          </div>
        </div>
      `;

      try {
        const res = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
          body: JSON.stringify({
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
          })
        });
        const resData = await res.json();
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

if (require.main === module) {
  runDailyReportCron()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Daily Report Cron Error:', err);
      process.exit(1);
    });
}

module.exports = { runDailyReportCron };

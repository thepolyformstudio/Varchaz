/* ============================================================
   Varchaz — Seed Data Script
   ============================================================
   Run this script once to populate initial data in Firestore.
   
   Usage:
     1. Install firebase-admin: npm install firebase-admin
     2. Download your service account key from Firebase Console
        (Project Settings → Service Accounts → Generate New Private Key)
     3. Set env variable: GOOGLE_APPLICATION_CREDENTIALS=path/to/key.json
     4. Run: npx ts-node scripts/seed.ts
   ============================================================ */

import * as admin from 'firebase-admin';

admin.initializeApp();
const db = admin.firestore();

async function seed() {
  console.log('🌱 Seeding Varchaz database...\n');

  // ── 1. Create Products ──
  const products = [
    { name: 'Product Alpha', description: 'Premium offering', category: 'Tablets', isActive: true },
    { name: 'Product Beta', description: 'Standard line', category: 'Syrups', isActive: true },
    { name: 'Product Gamma', description: 'Economy segment', category: 'Syrups', isActive: true },
    { name: 'Product Delta', description: 'New launch', category: 'Tablets', isActive: true },
    { name: 'Product Epsilon', description: 'Enterprise solution', category: 'Capsules', isActive: true },
    { name: 'Product Zeta', description: 'Bundled package', category: 'Capsules', isActive: true },
    { name: 'Product Eta', description: 'Seasonal special', category: 'Syrups', isActive: true },
    { name: 'Product Theta', description: 'Regional variant', category: 'Injections', isActive: true },
    { name: 'Product Iota', description: 'Legacy product', category: 'Injections', isActive: false },
    { name: 'Product Kappa', description: 'OEM supply', category: 'Injections', isActive: true },
  ];

  console.log('📦 Creating products...');
  const productIds: string[] = [];
  for (const p of products) {
    const ref = db.collection('products').doc();
    await ref.set({
      ...p,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: 'seed-script',
      addedDate: admin.firestore.FieldValue.serverTimestamp()
    });
    productIds.push(ref.id);
    console.log(`  ✓ ${p.name} (${ref.id})`);
  }

  // ── 2. Create Admin User ──
  console.log('\n👤 Creating admin user...');
  // Note: You must first create this user in Firebase Auth (Console or SDK)
  // Then provide the UID here:
  const adminUid = 'REPLACE_WITH_ADMIN_UID';
  
  if (adminUid !== 'REPLACE_WITH_ADMIN_UID') {
    await db.collection('users').doc(adminUid).set({
      uid: adminUid,
      email: 'admin@varchaz.com',
      displayName: 'Admin',
      role: 'admin',
      status: 'approved',
      supervisorId: null,
      parentSupervisorId: null,
      financialYear: 'apr-mar',
      assignedSupervisors: [],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      disabledAt: null,
      disabledBy: null,
      profileComplete: true
    });
    console.log(`  ✓ Admin created (${adminUid})`);
  } else {
    console.log('  ⚠ Skipped — replace REPLACE_WITH_ADMIN_UID with actual UID');
  }

  // ── 3. Create App Settings ──
  console.log('\n⚙️  Creating app settings...');
  await db.collection('settings').doc('app').set({
    defaultFinancialYear: 'apr-mar',
    planWindowStart: 1,
    planWindowEnd: 10,
    appVersion: '1.0.0',
    maintenanceMode: false,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
  console.log('  ✓ App settings created');

  console.log('\n✅ Seed complete!\n');
  console.log('Next steps:');
  console.log('  1. Create an admin user in Firebase Auth');
  console.log('  2. Update the adminUid in this script and re-run');
  console.log('  3. Register as supervisor and get approved by admin');
  console.log('  4. Register users under the supervisor');
}

seed().catch(console.error);

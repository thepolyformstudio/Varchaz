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

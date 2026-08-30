"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.migrateLegacyPasswords = exports.sendTaskAssignmentNotification = exports.adminSetUserPassword = exports.resetPasswordWithOtp = exports.verifyPasswordResetOtp = exports.requestPasswordResetOtp = exports.loginWithOtp = exports.requestLoginOtp = exports.loginWithPassword = void 0;
const admin = require("firebase-admin");
const firebase_functions_1 = require("firebase-functions");
const https_1 = require("firebase-functions/v2/https");
const bcrypt = require("bcryptjs");
const shared_1 = require("./shared");
/**
 * Fixed-window rate limiter backed by a `rate_limits/{key}` doc.
 * Firestore rules deny all client access to this collection — it's Admin-SDK only.
 */
async function checkRateLimit(key, maxAttempts, windowMs) {
    const ref = admin.firestore().collection(shared_1.COLLECTIONS.RATE_LIMITS).doc(key);
    await admin.firestore().runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const now = Date.now();
        const data = snap.exists ? snap.data() : null;
        if (data && now - data.windowStart < windowMs) {
            if (data.count >= maxAttempts) {
                throw new https_1.HttpsError('resource-exhausted', 'Too many attempts. Please try again later.');
            }
            tx.set(ref, { windowStart: data.windowStart, count: data.count + 1 });
        }
        else {
            tx.set(ref, { windowStart: now, count: 1 });
        }
    });
}
function elevenzaConfigFromEnv() {
    return {
        apiUrl: process.env.ELEVENZA_API_URL || 'https://app.11za.in/apis/template/sendTemplate',
        originWebsite: process.env.ELEVENZA_ORIGIN_WEBSITE || 'https://whiterock.co.in/',
        authToken: process.env.ELEVENZA_AUTH_TOKEN,
    };
}
/** Verifies email/password against `tasks_users` and mints a Firebase custom auth token. */
exports.loginWithPassword = (0, https_1.onCall)({ timeoutSeconds: 30, memory: '256MiB' }, async (request) => {
    const email = String(request.data?.email || '').toLowerCase().trim();
    const password = String(request.data?.password || '');
    if (!email || !password) {
        throw new https_1.HttpsError('invalid-argument', 'Email and password are required.');
    }
    await checkRateLimit(`login:${email}`, 5, 15 * 60 * 1000);
    const db = admin.firestore();
    const snap = await db.collection(shared_1.COLLECTIONS.USERS).where('email', '==', email).limit(1).get();
    if (snap.empty) {
        throw new https_1.HttpsError('unauthenticated', 'Invalid email or password.');
    }
    const userDoc = snap.docs[0];
    const data = userDoc.data();
    const storedHash = data.password;
    if (typeof storedHash !== 'string' || !storedHash.startsWith('$2')) {
        // No plaintext fallback — legacy accounts must go through password reset.
        throw new https_1.HttpsError('failed-precondition', 'Please reset your password to continue.');
    }
    if (!bcrypt.compareSync(password, storedHash)) {
        throw new https_1.HttpsError('unauthenticated', 'Invalid email or password.');
    }
    const role = data.role || 'doer';
    const token = await admin.auth().createCustomToken(userDoc.id, { role });
    return { token };
});
/** Shared helper: resolve a tasks_users doc by any phone-number variant. */
async function findUserByPhone(phoneRaw) {
    const usersRef = admin.firestore().collection(shared_1.COLLECTIONS.USERS);
    for (const variant of (0, shared_1.phoneVariants)(phoneRaw)) {
        const snap = await usersRef.where('phone', '==', variant).limit(1).get();
        if (!snap.empty) {
            const d = snap.docs[0];
            const data = d.data();
            return { id: d.id, name: data.name || '', phone: data.phone || '', role: data.role || 'doer' };
        }
    }
    return null;
}
/** Shared helper: create (replacing any previous) a purpose-tagged 6-digit OTP for a user. */
async function issueOtp(userId, purpose) {
    const db = admin.firestore();
    const now = Date.now();
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const otpRef = db.collection(shared_1.COLLECTIONS.PASSWORD_RESET_OTPS);
    const oldSnap = await otpRef.where('user_id', '==', userId).where('purpose', '==', purpose).get();
    const batch = db.batch();
    oldSnap.docs.forEach((d) => batch.delete(d.ref));
    batch.set(otpRef.doc(), {
        user_id: userId,
        otp,
        purpose,
        created_at: admin.firestore.Timestamp.fromMillis(now),
        expires_at: admin.firestore.Timestamp.fromMillis(now + 5 * 60 * 1000),
    });
    await batch.commit();
    return otp;
}
/**
 * Login step 1: send a WhatsApp OTP (11za `login_otp` template) to a registered phone.
 * This is the primary sign-in method — there is no password login in the UI.
 */
exports.requestLoginOtp = (0, https_1.onCall)({ timeoutSeconds: 30 }, async (request) => {
    const phoneRaw = String(request.data?.phone || '').trim();
    if (!phoneRaw) {
        throw new https_1.HttpsError('invalid-argument', 'Phone number is required.');
    }
    const digits = phoneRaw.replace(/\D/g, '');
    await checkRateLimit(`login-otp:${digits}`, 5, 15 * 60 * 1000);
    const found = await findUserByPhone(phoneRaw);
    if (!found) {
        throw new https_1.HttpsError('not-found', 'No account found with this mobile number. Contact your administrator.');
    }
    const otp = await issueOtp(found.id, 'login');
    const { apiUrl, originWebsite, authToken } = elevenzaConfigFromEnv();
    const templateLoginOtp = process.env.ELEVENZA_TEMPLATE_LOGIN_OTP || 'login_otp';
    if (!authToken) {
        firebase_functions_1.logger.error('ELEVENZA_AUTH_TOKEN not set; cannot send login OTP');
        throw new https_1.HttpsError('internal', 'OTP service is not configured.');
    }
    try {
        await (0, shared_1.send11zaTemplate)(found.phone, templateLoginOtp, [otp], { apiUrl, originWebsite, authToken });
    }
    catch (err) {
        firebase_functions_1.logger.error('Failed to send login OTP:', err);
        throw new https_1.HttpsError('internal', 'Failed to send OTP. Please try again.');
    }
    return { ok: true };
});
/** Login step 2: verify the OTP and mint a Firebase custom auth token. */
exports.loginWithOtp = (0, https_1.onCall)({ timeoutSeconds: 30 }, async (request) => {
    const phoneRaw = String(request.data?.phone || '').trim();
    const otp = String(request.data?.otp || '').trim();
    if (!phoneRaw || !otp) {
        throw new https_1.HttpsError('invalid-argument', 'Phone number and OTP are required.');
    }
    const digits = phoneRaw.replace(/\D/g, '');
    await checkRateLimit(`login-verify:${digits}`, 8, 15 * 60 * 1000);
    const found = await findUserByPhone(phoneRaw);
    if (!found) {
        throw new https_1.HttpsError('unauthenticated', 'Invalid OTP.');
    }
    const db = admin.firestore();
    const snap = await db
        .collection(shared_1.COLLECTIONS.PASSWORD_RESET_OTPS)
        .where('user_id', '==', found.id)
        .where('otp', '==', otp)
        .where('purpose', '==', 'login')
        .limit(1)
        .get();
    if (snap.empty) {
        throw new https_1.HttpsError('unauthenticated', 'Invalid OTP.');
    }
    const otpDoc = snap.docs[0];
    const otpData = otpDoc.data();
    const expiresAtMs = otpData.expires_at?.toMillis
        ? otpData.expires_at.toMillis()
        : new Date(otpData.expires_at).getTime();
    if (Date.now() > expiresAtMs) {
        await otpDoc.ref.delete();
        throw new https_1.HttpsError('deadline-exceeded', 'OTP has expired. Please request a new one.');
    }
    await otpDoc.ref.delete();
    const token = await admin.auth().createCustomToken(found.id, { role: found.role });
    return { token };
});
/** Looks up a user by phone, generates a 6-digit OTP, and sends it via WhatsApp. */
exports.requestPasswordResetOtp = (0, https_1.onCall)({ timeoutSeconds: 30 }, async (request) => {
    const phoneRaw = String(request.data?.phone || '').trim();
    if (!phoneRaw) {
        throw new https_1.HttpsError('invalid-argument', 'Phone number is required.');
    }
    const digits = phoneRaw.replace(/\D/g, '');
    await checkRateLimit(`otp-request:${digits}`, 5, 15 * 60 * 1000);
    const db = admin.firestore();
    const usersRef = db.collection(shared_1.COLLECTIONS.USERS);
    let userId = null;
    let userName = '';
    let userPhone = '';
    for (const variant of (0, shared_1.phoneVariants)(phoneRaw)) {
        const snap = await usersRef.where('phone', '==', variant).limit(1).get();
        if (!snap.empty) {
            const d = snap.docs[0];
            userId = d.id;
            userName = d.data().name || '';
            userPhone = d.data().phone || '';
            break;
        }
    }
    // Respond success-shaped either way, so this can't be used to enumerate registered phones.
    if (!userId) {
        firebase_functions_1.logger.info('Password reset OTP requested for unrecognized phone number.');
        return { ok: true };
    }
    const otp = await issueOtp(userId, 'reset');
    const { apiUrl, originWebsite, authToken } = elevenzaConfigFromEnv();
    const templateOtp = process.env.ELEVENZA_TEMPLATE_OTP || 'otp_verification_v2';
    if (!authToken) {
        firebase_functions_1.logger.error('ELEVENZA_AUTH_TOKEN not set; cannot send password-reset OTP');
        throw new https_1.HttpsError('internal', 'OTP service is not configured.');
    }
    try {
        await (0, shared_1.send11zaTemplate)(userPhone, templateOtp, [otp], { apiUrl, originWebsite, authToken });
    }
    catch (err) {
        firebase_functions_1.logger.error('Failed to send password-reset OTP:', err);
        throw new https_1.HttpsError('internal', 'Failed to send OTP. Please try again.');
    }
    return { ok: true };
});
/**
 * Checks an OTP without consuming it, so the UI can show "invalid OTP" at the verify step
 * rather than only at final submit. `resetPasswordWithOtp` re-validates and consumes it for real.
 */
exports.verifyPasswordResetOtp = (0, https_1.onCall)({ timeoutSeconds: 30 }, async (request) => {
    const phoneRaw = String(request.data?.phone || '').trim();
    const otp = String(request.data?.otp || '').trim();
    if (!phoneRaw || !otp) {
        throw new https_1.HttpsError('invalid-argument', 'Phone and OTP are required.');
    }
    const digits = phoneRaw.replace(/\D/g, '');
    await checkRateLimit(`otp-verify:${digits}`, 8, 15 * 60 * 1000);
    const db = admin.firestore();
    const usersRef = db.collection(shared_1.COLLECTIONS.USERS);
    let userId = null;
    for (const variant of (0, shared_1.phoneVariants)(phoneRaw)) {
        const snap = await usersRef.where('phone', '==', variant).limit(1).get();
        if (!snap.empty) {
            userId = snap.docs[0].id;
            break;
        }
    }
    if (!userId) {
        throw new https_1.HttpsError('unauthenticated', 'Invalid OTP.');
    }
    const snap = await db
        .collection(shared_1.COLLECTIONS.PASSWORD_RESET_OTPS)
        .where('user_id', '==', userId)
        .where('otp', '==', otp)
        .where('purpose', '==', 'reset')
        .limit(1)
        .get();
    if (snap.empty) {
        throw new https_1.HttpsError('unauthenticated', 'Invalid OTP.');
    }
    const data = snap.docs[0].data();
    const expiresAtMs = data.expires_at?.toMillis ? data.expires_at.toMillis() : new Date(data.expires_at).getTime();
    if (Date.now() > expiresAtMs) {
        throw new https_1.HttpsError('deadline-exceeded', 'OTP has expired. Please request a new one.');
    }
    return { valid: true };
});
/** Verifies an OTP and sets a new (bcrypt-hashed) password. Runs pre-login via Admin SDK. */
exports.resetPasswordWithOtp = (0, https_1.onCall)({ timeoutSeconds: 30 }, async (request) => {
    const phoneRaw = String(request.data?.phone || '').trim();
    const otp = String(request.data?.otp || '').trim();
    const newPassword = String(request.data?.newPassword || '');
    if (!phoneRaw || !otp || !newPassword) {
        throw new https_1.HttpsError('invalid-argument', 'Phone, OTP, and new password are required.');
    }
    if (newPassword.length < 6) {
        throw new https_1.HttpsError('invalid-argument', 'Password must be at least 6 characters.');
    }
    const digits = phoneRaw.replace(/\D/g, '');
    await checkRateLimit(`otp-verify:${digits}`, 8, 15 * 60 * 1000);
    const db = admin.firestore();
    const usersRef = db.collection(shared_1.COLLECTIONS.USERS);
    let userId = null;
    for (const variant of (0, shared_1.phoneVariants)(phoneRaw)) {
        const snap = await usersRef.where('phone', '==', variant).limit(1).get();
        if (!snap.empty) {
            userId = snap.docs[0].id;
            break;
        }
    }
    if (!userId) {
        throw new https_1.HttpsError('unauthenticated', 'Invalid OTP.');
    }
    const otpRef = db.collection(shared_1.COLLECTIONS.PASSWORD_RESET_OTPS);
    const snap = await otpRef.where('user_id', '==', userId).where('otp', '==', otp).where('purpose', '==', 'reset').limit(1).get();
    if (snap.empty) {
        throw new https_1.HttpsError('unauthenticated', 'Invalid OTP.');
    }
    const otpDoc = snap.docs[0];
    const otpData = otpDoc.data();
    const expiresAtMs = otpData.expires_at?.toMillis
        ? otpData.expires_at.toMillis()
        : new Date(otpData.expires_at).getTime();
    if (Date.now() > expiresAtMs) {
        await otpDoc.ref.delete();
        throw new https_1.HttpsError('deadline-exceeded', 'OTP has expired. Please request a new one.');
    }
    await otpDoc.ref.delete();
    await usersRef.doc(userId).update({
        password: bcrypt.hashSync(newPassword, 10),
        updated_at: admin.firestore.Timestamp.now(),
    });
    return { ok: true };
});
/** Lets an owner/manager reset another member's password (client can no longer write `password` directly). */
exports.adminSetUserPassword = (0, https_1.onCall)({ timeoutSeconds: 30 }, async (request) => {
    const role = request.auth?.token?.role;
    if (!request.auth || (role !== 'owner' && role !== 'manager')) {
        throw new https_1.HttpsError('permission-denied', "Only owners or managers can reset another member's password.");
    }
    const targetUserId = String(request.data?.targetUserId || '');
    const newPassword = String(request.data?.newPassword || '');
    if (!targetUserId || !newPassword) {
        throw new https_1.HttpsError('invalid-argument', 'targetUserId and newPassword are required.');
    }
    if (newPassword.length < 6) {
        throw new https_1.HttpsError('invalid-argument', 'Password must be at least 6 characters.');
    }
    await admin.firestore().collection(shared_1.COLLECTIONS.USERS).doc(targetUserId).update({
        password: bcrypt.hashSync(newPassword, 10),
        updated_at: admin.firestore.Timestamp.now(),
    });
    return { ok: true };
});
/** Sends the task-assignment WhatsApp message. Requires a signed-in caller so the 11za token never reaches the browser. */
exports.sendTaskAssignmentNotification = (0, https_1.onCall)({ timeoutSeconds: 30 }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'You must be signed in to send task notifications.');
    }
    const { phone, taskName, dueDate, assignedBy, description, link } = request.data || {};
    if (!phone || !taskName || !dueDate || !link) {
        throw new https_1.HttpsError('invalid-argument', 'Missing required task notification fields.');
    }
    await checkRateLimit(`task-assign:${request.auth.uid}`, 60, 60 * 60 * 1000);
    const { apiUrl, originWebsite, authToken } = elevenzaConfigFromEnv();
    const templateName = process.env.ELEVENZA_TEMPLATE_TASK_ASSIGNMENT || 'task_assignment';
    if (!authToken) {
        firebase_functions_1.logger.error('ELEVENZA_AUTH_TOKEN not set; cannot send task assignment notification');
        throw new https_1.HttpsError('internal', 'WhatsApp service is not configured.');
    }
    await (0, shared_1.send11zaTemplate)(String(phone), templateName, [String(taskName), String(dueDate), String(assignedBy || ''), String(description || ''), String(link)], { apiUrl, originWebsite, authToken });
    return { ok: true };
});
/**
 * ONE-TIME migration: bcrypt-hashes any `tasks_users` password still stored in plaintext.
 * Gated by a shared secret (set via `ADMIN_ACTION_SECRET` in the functions env) since it must
 * run before any real auth exists. Delete this export once it's been run successfully (Stage 5).
 */
exports.migrateLegacyPasswords = (0, https_1.onCall)({ timeoutSeconds: 120 }, async (request) => {
    const secret = process.env.ADMIN_ACTION_SECRET;
    if (!secret || request.data?.secret !== secret) {
        throw new https_1.HttpsError('permission-denied', 'Invalid or missing migration secret.');
    }
    const db = admin.firestore();
    const snap = await db.collection(shared_1.COLLECTIONS.USERS).get();
    let migrated = 0;
    let batch = db.batch();
    let batchCount = 0;
    for (const doc of snap.docs) {
        const pw = doc.data().password;
        if (typeof pw === 'string' && pw && !pw.startsWith('$2')) {
            batch.update(doc.ref, { password: bcrypt.hashSync(pw, 10) });
            migrated++;
            batchCount++;
            if (batchCount >= 400) {
                await batch.commit();
                batch = db.batch();
                batchCount = 0;
            }
        }
    }
    if (batchCount > 0)
        await batch.commit();
    firebase_functions_1.logger.info(`migrateLegacyPasswords: migrated ${migrated} account(s)`);
    return { migrated };
});

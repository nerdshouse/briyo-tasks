"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendTaskAssignmentNotification = exports.loginWithOtp = exports.requestLoginOtp = void 0;
const admin = require("firebase-admin");
const firebase_functions_1 = require("firebase-functions");
const https_1 = require("firebase-functions/v2/https");
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

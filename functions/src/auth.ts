import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { COLLECTIONS, send11zaTemplate, phoneVariants } from './shared';

/**
 * Fixed-window rate limiter backed by a `rate_limits/{key}` doc.
 * Firestore rules deny all client access to this collection — it's Admin-SDK only.
 */
async function checkRateLimit(key: string, maxAttempts: number, windowMs: number): Promise<void> {
  const ref = admin.firestore().collection(COLLECTIONS.RATE_LIMITS).doc(key);
  await admin.firestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const now = Date.now();
    const data = snap.exists ? (snap.data() as { windowStart: number; count: number }) : null;

    if (data && now - data.windowStart < windowMs) {
      if (data.count >= maxAttempts) {
        throw new HttpsError('resource-exhausted', 'Too many attempts. Please try again later.');
      }
      tx.set(ref, { windowStart: data.windowStart, count: data.count + 1 });
    } else {
      tx.set(ref, { windowStart: now, count: 1 });
    }
  });
}

function elevenzaConfigFromEnv(): { apiUrl: string; originWebsite: string; authToken: string | undefined } {
  return {
    apiUrl: process.env.ELEVENZA_API_URL || 'https://app.11za.in/apis/template/sendTemplate',
    originWebsite: process.env.ELEVENZA_ORIGIN_WEBSITE || 'https://whiterock.co.in/',
    authToken: process.env.ELEVENZA_AUTH_TOKEN,
  };
}

/** Shared helper: resolve a tasks_users doc by any phone-number variant. */
async function findUserByPhone(
  phoneRaw: string
): Promise<{ id: string; name: string; phone: string; role: string } | null> {
  const usersRef = admin.firestore().collection(COLLECTIONS.USERS);
  for (const variant of phoneVariants(phoneRaw)) {
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
async function issueOtp(userId: string, purpose: 'login'): Promise<string> {
  const db = admin.firestore();
  const now = Date.now();
  const otp = String(Math.floor(100000 + Math.random() * 900000));
  const otpRef = db.collection(COLLECTIONS.PASSWORD_RESET_OTPS);
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
export const requestLoginOtp = onCall({ timeoutSeconds: 30 }, async (request) => {
  const phoneRaw = String(request.data?.phone || '').trim();
  if (!phoneRaw) {
    throw new HttpsError('invalid-argument', 'Phone number is required.');
  }

  const digits = phoneRaw.replace(/\D/g, '');
  await checkRateLimit(`login-otp:${digits}`, 5, 15 * 60 * 1000);

  const found = await findUserByPhone(phoneRaw);
  if (!found) {
    throw new HttpsError('not-found', 'No account found with this mobile number. Contact your administrator.');
  }

  const otp = await issueOtp(found.id, 'login');

  const { apiUrl, originWebsite, authToken } = elevenzaConfigFromEnv();
  const templateLoginOtp = process.env.ELEVENZA_TEMPLATE_LOGIN_OTP || 'login_otp';

  if (!authToken) {
    logger.error('ELEVENZA_AUTH_TOKEN not set; cannot send login OTP');
    throw new HttpsError('internal', 'OTP service is not configured.');
  }

  try {
    await send11zaTemplate(found.phone, templateLoginOtp, [otp], { apiUrl, originWebsite, authToken });
  } catch (err) {
    logger.error('Failed to send login OTP:', err);
    throw new HttpsError('internal', 'Failed to send OTP. Please try again.');
  }

  return { ok: true };
});

/** Login step 2: verify the OTP and mint a Firebase custom auth token. */
export const loginWithOtp = onCall({ timeoutSeconds: 30 }, async (request) => {
  const phoneRaw = String(request.data?.phone || '').trim();
  const otp = String(request.data?.otp || '').trim();
  if (!phoneRaw || !otp) {
    throw new HttpsError('invalid-argument', 'Phone number and OTP are required.');
  }

  const digits = phoneRaw.replace(/\D/g, '');
  await checkRateLimit(`login-verify:${digits}`, 8, 15 * 60 * 1000);

  const found = await findUserByPhone(phoneRaw);
  if (!found) {
    throw new HttpsError('unauthenticated', 'Invalid OTP.');
  }

  const db = admin.firestore();
  const snap = await db
    .collection(COLLECTIONS.PASSWORD_RESET_OTPS)
    .where('user_id', '==', found.id)
    .where('otp', '==', otp)
    .where('purpose', '==', 'login')
    .limit(1)
    .get();

  if (snap.empty) {
    throw new HttpsError('unauthenticated', 'Invalid OTP.');
  }

  const otpDoc = snap.docs[0];
  const otpData = otpDoc.data();
  const expiresAtMs = otpData.expires_at?.toMillis
    ? otpData.expires_at.toMillis()
    : new Date(otpData.expires_at).getTime();

  if (Date.now() > expiresAtMs) {
    await otpDoc.ref.delete();
    throw new HttpsError('deadline-exceeded', 'OTP has expired. Please request a new one.');
  }
  await otpDoc.ref.delete();

  const token = await admin.auth().createCustomToken(found.id, { role: found.role });
  return { token };
});

/** Sends the task-assignment WhatsApp message. Requires a signed-in caller so the 11za token never reaches the browser. */
export const sendTaskAssignmentNotification = onCall({ timeoutSeconds: 30 }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in to send task notifications.');
  }

  const { phone, taskName, dueDate, assignedBy, description, link } = request.data || {};
  if (!phone || !taskName || !dueDate || !link) {
    throw new HttpsError('invalid-argument', 'Missing required task notification fields.');
  }

  await checkRateLimit(`task-assign:${request.auth.uid}`, 60, 60 * 60 * 1000);

  const { apiUrl, originWebsite, authToken } = elevenzaConfigFromEnv();
  const templateName = process.env.ELEVENZA_TEMPLATE_TASK_ASSIGNMENT || 'task_assignment';

  if (!authToken) {
    logger.error('ELEVENZA_AUTH_TOKEN not set; cannot send task assignment notification');
    throw new HttpsError('internal', 'WhatsApp service is not configured.');
  }

  await send11zaTemplate(
    String(phone),
    templateName,
    [String(taskName), String(dueDate), String(assignedBy || ''), String(description || ''), String(link)],
    { apiUrl, originWebsite, authToken }
  );

  return { ok: true };
});


"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendTaskReminder = exports.onMemberCreated = exports.REMINDABLE_STATUSES = exports.REMINDER_COOLDOWN_MS = void 0;
exports.firstNameOf = firstNameOf;
exports.formatDueDateIST = formatDueDateIST;
exports.buildTaskReminderParams = buildTaskReminderParams;
exports.buildOnboardingParams = buildOnboardingParams;
exports.cooldownRemainingMs = cooldownRemainingMs;
/*
 * Developed by Nerdshouse Technologies LLP — https://nerdshouse.com
 * © 2026 WhiteRock (Royal Enterprise). All rights reserved.
 *
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */
const admin = require("firebase-admin");
const firebase_functions_1 = require("firebase-functions");
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-functions/v2/firestore");
const shared_1 = require("./shared");
const whatsappTemplates_1 = require("./whatsappTemplates");
const auth_1 = require("./auth");
exports.REMINDER_COOLDOWN_MS = 4 * 60 * 60 * 1000;
/** Statuses a reminder may be sent for; completed/closed/etc. are rejected. */
exports.REMINDABLE_STATUSES = ['pending', 'in_progress', 'overdue'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** First word of a full name, trimmed; falls back to 'there' for empty names. */
function firstNameOf(fullName) {
    const first = String(fullName || '').trim().split(/\s+/)[0];
    return first || 'there';
}
/**
 * Format a due date as DD-MMM-YYYY (e.g. 31-Aug-2026) in Asia/Kolkata.
 * Due dates are stored as date-only YYYY-MM-DD strings, which are already
 * IST calendar dates; anything else is formatted through the IST timezone.
 * Missing/invalid dates become 'Not set'.
 */
function formatDueDateIST(dueDate) {
    const raw = String(dueDate || '').trim();
    if (!raw)
        return 'Not set';
    const dateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dateOnly) {
        const [, y, m, d] = dateOnly;
        const monthIdx = Number(m) - 1;
        if (monthIdx < 0 || monthIdx > 11)
            return 'Not set';
        return `${d}-${MONTHS_SHORT[monthIdx]}-${y}`;
    }
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime()))
        return 'Not set';
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    }).formatToParts(parsed);
    const get = (type) => parts.find((p) => p.type === type)?.value || '';
    const monthIdx = Number(get('month')) - 1;
    if (monthIdx < 0 || monthIdx > 11)
        return 'Not set';
    return `${get('day')}-${MONTHS_SHORT[monthIdx]}-${get('year')}`;
}
/** task_reminder variables IN ORDER: {{name}}, {{task_name}}, {{due_date}}. */
function buildTaskReminderParams(memberFullName, taskTitle, dueDate) {
    return [firstNameOf(memberFullName), String(taskTitle || ''), formatDueDateIST(dueDate)];
}
/** member_onboarding variables IN ORDER: {{name}} only. */
function buildOnboardingParams(memberFullName) {
    return [firstNameOf(memberFullName)];
}
/** Milliseconds of cooldown left; 0 when expired or never reminded. */
function cooldownRemainingMs(lastRemindedAtMs, nowMs) {
    if (!lastRemindedAtMs)
        return 0;
    return Math.max(0, lastRemindedAtMs + exports.REMINDER_COOLDOWN_MS - nowMs);
}
function formatRemaining(ms) {
    const totalMinutes = Math.ceil(ms / 60000);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    if (h > 0)
        return `${h}h ${m}m`;
    return `${m}m`;
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
/** Spacing between onboarding sends during a bulk import, reserved via a shared slot doc. */
const ONBOARDING_SEND_SPACING_MS = 1500;
const ONBOARDING_MAX_WAIT_MS = 4 * 60 * 1000;
/**
 * Reserve a global send slot so concurrent member-created triggers (bulk CSV
 * import) space their 11za calls out instead of bursting. Returns how long
 * this invocation should wait before sending.
 */
async function reserveOnboardingSendSlot(db) {
    const ref = db.collection(shared_1.COLLECTIONS.RATE_LIMITS).doc('onboarding-send-queue');
    let waitMs = 0;
    await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const now = Date.now();
        const lastSlot = snap.exists ? Number(snap.data()?.lastSlot || 0) : 0;
        const slot = Math.max(now, lastSlot + ONBOARDING_SEND_SPACING_MS);
        waitMs = Math.min(slot - now, ONBOARDING_MAX_WAIT_MS);
        tx.set(ref, { lastSlot: slot });
    });
    return waitMs;
}
/**
 * Sends the member_onboarding WhatsApp template whenever a member document is
 * created (single add and bulk CSV import both create docs, so both are
 * covered). Idempotent: skips docs already marked sent. Failures are recorded
 * on the member doc and never propagate — a bad number cannot abort an import.
 */
exports.onMemberCreated = (0, firestore_1.onDocumentCreated)({
    document: `${shared_1.COLLECTIONS.USERS}/{userId}`,
    timeoutSeconds: 300,
    memory: '256MiB',
}, async (event) => {
    const snap = event.data;
    if (!snap)
        return;
    const member = snap.data();
    if (member.onboardingMessage?.status === 'sent') {
        firebase_functions_1.logger.info(`Member ${snap.id}: onboarding already sent; skipping`);
        return;
    }
    const db = admin.firestore();
    const writeStatus = (status, error) => snap.ref
        .update({
        onboardingMessage: {
            status,
            sentAt: admin.firestore.Timestamp.now(),
            ...(error ? { error: error.slice(0, 500) } : {}),
        },
    })
        .catch((err) => firebase_functions_1.logger.error(`Member ${snap.id}: failed to record onboarding status`, err));
    const phone = String(member.phone || '').trim();
    if (!phone) {
        firebase_functions_1.logger.warn(`Member ${snap.id}: no phone number; onboarding not sent`);
        await writeStatus('failed', 'No phone number on member');
        return;
    }
    const { apiUrl, originWebsite, authToken } = (0, auth_1.elevenzaConfigFromEnv)();
    if (!authToken) {
        firebase_functions_1.logger.error('ELEVENZA_AUTH_TOKEN not set; cannot send onboarding message');
        await writeStatus('failed', 'WhatsApp service not configured');
        return;
    }
    // Stagger bulk-import sends to stay under 11za rate limits.
    const waitMs = await reserveOnboardingSendSlot(db);
    if (waitMs > 0)
        await sleep(waitMs);
    const params = buildOnboardingParams(member.name || '');
    const config = { apiUrl, originWebsite, authToken, language: whatsappTemplates_1.WHATSAPP_TEMPLATES.language };
    try {
        try {
            await (0, shared_1.send11zaTemplate)(phone, whatsappTemplates_1.WHATSAPP_TEMPLATES.onboarding, params, config);
        }
        catch (firstErr) {
            firebase_functions_1.logger.warn(`Member ${snap.id}: onboarding send failed, retrying once`, firstErr);
            await sleep(2000);
            await (0, shared_1.send11zaTemplate)(phone, whatsappTemplates_1.WHATSAPP_TEMPLATES.onboarding, params, config);
        }
        await writeStatus('sent');
        firebase_functions_1.logger.info(`Onboarding message sent to ${member.name || snap.id}`);
    }
    catch (err) {
        firebase_functions_1.logger.error(`Member ${snap.id}: onboarding send failed after retry`, err);
        await writeStatus('failed', err instanceof Error ? err.message : String(err));
    }
});
/**
 * Bell-icon reminder: sends the task_reminder template to a task's assignee.
 * Role rules mirror the app: admins may remind on any task; sub-admins and
 * users only on tasks they assigned. Cooldown: one reminder per task per
 * member per 4 hours, reserved transactionally so double-presses can't race.
 */
exports.sendTaskReminder = (0, https_1.onCall)({ timeoutSeconds: 30 }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'You must be signed in to send reminders.');
    }
    const taskId = String(request.data?.taskId || '').trim();
    if (!taskId) {
        throw new https_1.HttpsError('invalid-argument', 'taskId is required.');
    }
    const uid = request.auth.uid;
    const role = String(request.auth.token.role || 'user');
    await (0, auth_1.checkRateLimit)(`task-remind:${uid}`, 30, 60 * 60 * 1000);
    const db = admin.firestore();
    const taskRef = db.collection(shared_1.COLLECTIONS.TASKS).doc(taskId);
    const taskSnap = await taskRef.get();
    if (!taskSnap.exists) {
        throw new https_1.HttpsError('not-found', 'Task not found.');
    }
    const task = taskSnap.data();
    if (role !== 'admin' && task.assigned_by_id !== uid) {
        throw new https_1.HttpsError('permission-denied', 'You can only send reminders for tasks you assigned.');
    }
    if (!exports.REMINDABLE_STATUSES.includes(task.status)) {
        throw new https_1.HttpsError('failed-precondition', 'Reminders can only be sent for pending or in-progress tasks.');
    }
    const assigneeId = String(task.assigned_to_id || '');
    if (!assigneeId || task.assignee_deleted === true) {
        throw new https_1.HttpsError('failed-precondition', 'This task has no active assignee.');
    }
    const assigneeSnap = await db.collection(shared_1.COLLECTIONS.USERS).doc(assigneeId).get();
    const assignee = assigneeSnap.data();
    const assigneePhone = String(assignee?.phone || '').trim();
    if (!assignee || !assigneePhone) {
        throw new https_1.HttpsError('failed-precondition', 'The assignee has no WhatsApp number on file.');
    }
    const { apiUrl, originWebsite, authToken } = (0, auth_1.elevenzaConfigFromEnv)();
    if (!authToken) {
        firebase_functions_1.logger.error('ELEVENZA_AUTH_TOKEN not set; cannot send task reminder');
        throw new https_1.HttpsError('internal', 'WhatsApp service is not configured.');
    }
    // Reserve the cooldown slot transactionally before sending, so two
    // simultaneous presses can't both pass the check.
    const now = admin.firestore.Timestamp.now();
    const previous = await db.runTransaction(async (tx) => {
        const fresh = await tx.get(taskRef);
        const data = fresh.data();
        const lastTs = data?.lastRemindedAt?.[assigneeId];
        const lastMs = lastTs?.toMillis ? lastTs.toMillis() : null;
        const remaining = cooldownRemainingMs(lastMs, now.toMillis());
        if (remaining > 0) {
            throw new https_1.HttpsError('failed-precondition', `Already reminded recently. Try again in ${formatRemaining(remaining)}.`);
        }
        tx.update(taskRef, { [`lastRemindedAt.${assigneeId}`]: now });
        return lastTs ?? null;
    });
    const params = buildTaskReminderParams(assignee.name || '', task.title || '', task.due_date);
    try {
        await (0, shared_1.send11zaTemplate)(assigneePhone, whatsappTemplates_1.WHATSAPP_TEMPLATES.taskReminder, params, {
            apiUrl,
            originWebsite,
            authToken,
            language: whatsappTemplates_1.WHATSAPP_TEMPLATES.language,
        });
    }
    catch (err) {
        // Roll back the reserved slot so the sender can retry immediately.
        await taskRef
            .update({ [`lastRemindedAt.${assigneeId}`]: previous ?? admin.firestore.FieldValue.delete() })
            .catch((rollbackErr) => firebase_functions_1.logger.error('Failed to roll back reminder cooldown', rollbackErr));
        firebase_functions_1.logger.error(`Task ${taskId}: reminder send failed`, err);
        throw new https_1.HttpsError('internal', 'Failed to send the WhatsApp reminder. Please try again.');
    }
    // Audit trail entry, matching the client's task_logs shape.
    const callerSnap = await db.collection(shared_1.COLLECTIONS.USERS).doc(uid).get();
    const callerName = callerSnap.data()?.name || 'Unknown';
    await db
        .collection('task_logs')
        .add({
        task_id: taskId,
        task_title: task.title || '',
        action: 'reminder_sent',
        actor_id: uid,
        actor_name: callerName,
        actor_role: role,
        timestamp: now,
        note: `WhatsApp reminder sent to ${assignee.name || assigneeId}`,
    })
        .catch((err) => firebase_functions_1.logger.error('Failed to write reminder audit log', err));
    firebase_functions_1.logger.info(`Task reminder sent for task ${taskId} to ${assignee.name} by ${callerName}`);
    return { ok: true, remindedAt: now.toMillis(), cooldownMs: exports.REMINDER_COOLDOWN_MS };
});

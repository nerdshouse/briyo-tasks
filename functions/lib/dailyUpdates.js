"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.remindDailyUpdate = exports.sendDailyUpdateReminder = exports.DAILY_UPDATE_REMINDER_COOLDOWN_MS = void 0;
exports.dailyUpdateReminderSkipReason = dailyUpdateReminderSkipReason;
exports.pickDailyUpdateReminderRecipients = pickDailyUpdateReminderRecipients;
exports.buildDailyUpdateReminderParams = buildDailyUpdateReminderParams;
/*
 * Developed by Nerdshouse Technologies LLP — https://nerdshouse.com
 * © 2026 WhiteRock (Royal Enterprise). All rights reserved.
 *
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */
const admin = require("firebase-admin");
const firebase_functions_1 = require("firebase-functions");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const https_1 = require("firebase-functions/v2/https");
const shared_1 = require("./shared");
const whatsappTemplates_1 = require("./whatsappTemplates");
const auth_1 = require("./auth");
const notifications_1 = require("./notifications");
/** Gap between 11za sends so a full-company run doesn't burst the API. */
const SEND_SPACING_MS = 1000;
/** Abort the run after this many failures in a row (e.g. template not approved yet). */
const MAX_CONSECUTIVE_FAILURES = 3;
/** One daily-update nudge per member per this window (scheduled + manual combined). */
exports.DAILY_UPDATE_REMINDER_COOLDOWN_MS = 2 * 60 * 60 * 1000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
/** Why a member should NOT get a nudge for `date`, or null if they should. */
function dailyUpdateReminderSkipReason(member, submittedUserIds, absences, date) {
    if (String(member.phone || '').trim() === '')
        return 'no_phone';
    if (member.approved === false)
        return 'unapproved';
    if (submittedUserIds.has(member.id))
        return 'submitted';
    if (absences.some((a) => a.user_id === member.id && a.from_date <= date && date <= a.to_date)) {
        return 'absent';
    }
    return null;
}
/**
 * Members who should get today's "log your daily update" nudge: has a phone,
 * not explicitly unapproved, hasn't submitted for `date`, and isn't on a
 * recorded absence covering `date`.
 */
function pickDailyUpdateReminderRecipients(members, submittedUserIds, absences, date) {
    return members.filter((m) => dailyUpdateReminderSkipReason(m, submittedUserIds, absences, date) === null);
}
/** daily_update_reminder body variables IN ORDER: {{name}}, {{date}}. */
function buildDailyUpdateReminderParams(memberFullName, date) {
    return [(0, notifications_1.firstNameOf)(memberFullName), (0, notifications_1.formatDueDateIST)(date)];
}
function getTodayIST() {
    return new Date()
        .toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
        .replace(/\//g, '-');
}
const cooldownRef = (db, userId, date) => db.collection(shared_1.COLLECTIONS.RATE_LIMITS).doc(`daily-update-remind:${userId}:${date}`);
/** Everything needed to decide who to nudge for `date`. */
async function loadReminderContext(db, date) {
    const [usersSnap, updatesSnap, absencesSnap] = await Promise.all([
        db.collection(shared_1.COLLECTIONS.USERS).get(),
        db.collection(shared_1.COLLECTIONS.DAILY_UPDATES).where('date', '==', date).get(),
        db.collection(shared_1.COLLECTIONS.ABSENCES).where('to_date', '>=', date).get(),
    ]);
    const members = usersSnap.docs.map((d) => {
        const data = d.data();
        return { id: d.id, name: data.name || '', phone: data.phone, approved: data.approved };
    });
    const submitted = new Set(updatesSnap.docs.map((d) => String(d.data().user_id || '')));
    const absences = absencesSnap.docs.map((d) => {
        const data = d.data();
        return { user_id: data.user_id, from_date: data.from_date, to_date: data.to_date };
    });
    return { members, submitted, absences };
}
/**
 * Send the nudge to each recipient in turn, skipping anyone still inside the
 * cooldown window. Records the send time per member/day on success.
 */
async function sendDailyUpdateReminders(db, recipients, date) {
    const result = { sent: [], cooldown: [], failed: [], aborted: false };
    const { apiUrl, originWebsite, authToken } = (0, auth_1.elevenzaConfigFromEnv)();
    const templateName = whatsappTemplates_1.WHATSAPP_TEMPLATES.dailyUpdateReminder.trim();
    if (!authToken || !templateName) {
        throw new Error('WhatsApp service is not configured (ELEVENZA_AUTH_TOKEN / template name).');
    }
    const config = {
        apiUrl,
        originWebsite,
        authToken,
        language: whatsappTemplates_1.WHATSAPP_TEMPLATES.language,
        buttonValue: whatsappTemplates_1.WHATSAPP_BUTTON_VALUES.dailyUpdateReminder,
    };
    const now = Date.now();
    const cooldownSnaps = recipients.length
        ? await db.getAll(...recipients.map((m) => cooldownRef(db, m.id, date)))
        : [];
    const lastSentById = new Map(cooldownSnaps.map((snap, i) => [recipients[i].id, Number(snap.data()?.lastSentAt || 0)]));
    let consecutiveFailures = 0;
    for (const member of recipients) {
        const lastSent = lastSentById.get(member.id) || 0;
        if (lastSent && now - lastSent < exports.DAILY_UPDATE_REMINDER_COOLDOWN_MS) {
            result.cooldown.push(member.id);
            continue;
        }
        try {
            await (0, shared_1.send11zaTemplate)(member.phone, templateName, buildDailyUpdateReminderParams(member.name, date), config);
            result.sent.push(member.id);
            consecutiveFailures = 0;
            await cooldownRef(db, member.id, date)
                .set({ lastSentAt: Date.now() })
                .catch((err) => firebase_functions_1.logger.error(`Failed to record reminder cooldown for ${member.id}`, err));
        }
        catch (err) {
            result.failed.push(member.id);
            consecutiveFailures++;
            firebase_functions_1.logger.error(`Daily update reminder failed for ${member.name || member.id}`, err);
            if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
                firebase_functions_1.logger.error(`Daily update reminders: ${MAX_CONSECUTIVE_FAILURES} failures in a row; aborting ` +
                    `(check that template "${templateName}" is approved in 11za)`);
                result.aborted = true;
                break;
            }
        }
        await sleep(SEND_SPACING_MS);
    }
    return result;
}
/**
 * Scheduled function: 7:00 PM IST, Monday–Saturday. WhatsApps every member
 * who hasn't logged a Daily Update for today. Skips company holidays and
 * members on a recorded absence.
 */
exports.sendDailyUpdateReminder = (0, scheduler_1.onSchedule)({
    schedule: '0 19 * * 1-6',
    timeZone: 'Asia/Kolkata',
    timeoutSeconds: 540,
    memory: '256MiB',
}, async () => {
    if (!(0, auth_1.elevenzaConfigFromEnv)().authToken || !whatsappTemplates_1.WHATSAPP_TEMPLATES.dailyUpdateReminder.trim()) {
        firebase_functions_1.logger.warn('WhatsApp not configured; skipping daily update reminders');
        return;
    }
    const db = admin.firestore();
    const today = getTodayIST();
    const holidaySnap = await db.collection(shared_1.COLLECTIONS.HOLIDAYS).where('date', '==', today).limit(1).get();
    if (!holidaySnap.empty) {
        firebase_functions_1.logger.info(`sendDailyUpdateReminder: ${today} is a company holiday; skipping`);
        return;
    }
    const { members, submitted, absences } = await loadReminderContext(db, today);
    const recipients = pickDailyUpdateReminderRecipients(members, submitted, absences, today);
    firebase_functions_1.logger.info(`sendDailyUpdateReminder ${today}: ${submitted.size} submitted, ${recipients.length} to remind`);
    const res = await sendDailyUpdateReminders(db, recipients, today);
    firebase_functions_1.logger.info(`sendDailyUpdateReminder complete: sent ${res.sent.length}/${recipients.length}, ` +
        `${res.cooldown.length} in cooldown, ${res.failed.length} failed`);
});
/**
 * Team Updates "Remind" button: admins and sub-admins nudge members who
 * haven't logged today's update. `userIds` limits it to specific members;
 * omitted means everyone who hasn't submitted. Same skip rules and cooldown
 * as the scheduled run.
 */
exports.remindDailyUpdate = (0, https_1.onCall)({ timeoutSeconds: 540 }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'You must be signed in to send reminders.');
    }
    const role = String(request.auth.token.role || 'user');
    if (role !== 'admin' && role !== 'sub_admin') {
        throw new https_1.HttpsError('permission-denied', 'Only admins and sub-admins can send daily update reminders.');
    }
    const rawIds = request.data?.userIds;
    if (rawIds !== undefined && !Array.isArray(rawIds)) {
        throw new https_1.HttpsError('invalid-argument', 'userIds must be an array.');
    }
    const userIds = Array.isArray(rawIds)
        ? Array.from(new Set(rawIds.map((x) => String(x || '').trim()).filter(Boolean)))
        : null;
    if (userIds && userIds.length === 0) {
        throw new https_1.HttpsError('invalid-argument', 'No members selected.');
    }
    await (0, auth_1.checkRateLimit)(`daily-update-remind-caller:${request.auth.uid}`, 20, 60 * 60 * 1000);
    const db = admin.firestore();
    const today = getTodayIST();
    const { members, submitted, absences } = await loadReminderContext(db, today);
    const pool = userIds ? members.filter((m) => userIds.includes(m.id)) : members;
    const skipped = [];
    const recipients = [];
    for (const m of pool) {
        const reason = dailyUpdateReminderSkipReason(m, submitted, absences, today);
        if (reason) {
            // "Remind all" only reports skips the admin can act on.
            if (userIds || reason === 'no_phone')
                skipped.push({ id: m.id, reason });
        }
        else {
            recipients.push(m);
        }
    }
    let res;
    try {
        res = await sendDailyUpdateReminders(db, recipients, today);
    }
    catch (err) {
        firebase_functions_1.logger.error('remindDailyUpdate: WhatsApp not configured', err);
        throw new https_1.HttpsError('internal', 'WhatsApp service is not configured.');
    }
    firebase_functions_1.logger.info(`remindDailyUpdate by ${request.auth.uid}: sent ${res.sent.length}, cooldown ${res.cooldown.length}, ` +
        `failed ${res.failed.length}, skipped ${skipped.length}`);
    return {
        sent: res.sent,
        cooldown: res.cooldown,
        failed: res.failed,
        skipped,
        aborted: res.aborted,
        cooldownMs: exports.DAILY_UPDATE_REMINDER_COOLDOWN_MS,
    };
});

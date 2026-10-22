"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendDailyUpdateReminder = void 0;
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
const shared_1 = require("./shared");
const whatsappTemplates_1 = require("./whatsappTemplates");
const auth_1 = require("./auth");
const notifications_1 = require("./notifications");
/** Gap between 11za sends so a full-company run doesn't burst the API. */
const SEND_SPACING_MS = 1000;
/** Abort the run after this many failures in a row (e.g. template not approved yet). */
const MAX_CONSECUTIVE_FAILURES = 3;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
/**
 * Members who should get today's "log your daily update" nudge: has a phone,
 * not explicitly unapproved, hasn't submitted for `date`, and isn't on a
 * recorded absence covering `date`.
 */
function pickDailyUpdateReminderRecipients(members, submittedUserIds, absences, date) {
    const absentIds = new Set(absences.filter((a) => a.from_date <= date && date <= a.to_date).map((a) => a.user_id));
    return members.filter((m) => String(m.phone || '').trim() !== '' &&
        m.approved !== false &&
        !submittedUserIds.has(m.id) &&
        !absentIds.has(m.id));
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
    const { apiUrl, originWebsite, authToken } = (0, auth_1.elevenzaConfigFromEnv)();
    if (!authToken) {
        firebase_functions_1.logger.warn('ELEVENZA_AUTH_TOKEN not set; skipping daily update reminders');
        return;
    }
    const templateName = whatsappTemplates_1.WHATSAPP_TEMPLATES.dailyUpdateReminder.trim();
    if (!templateName) {
        firebase_functions_1.logger.warn('ELEVENZA_TEMPLATE_DAILY_UPDATE_REMINDER is empty; skipping daily update reminders');
        return;
    }
    const db = admin.firestore();
    const today = getTodayIST();
    const holidaySnap = await db.collection(shared_1.COLLECTIONS.HOLIDAYS).where('date', '==', today).limit(1).get();
    if (!holidaySnap.empty) {
        firebase_functions_1.logger.info(`sendDailyUpdateReminder: ${today} is a company holiday; skipping`);
        return;
    }
    const [usersSnap, updatesSnap, absencesSnap] = await Promise.all([
        db.collection(shared_1.COLLECTIONS.USERS).get(),
        db.collection(shared_1.COLLECTIONS.DAILY_UPDATES).where('date', '==', today).get(),
        db.collection(shared_1.COLLECTIONS.ABSENCES).where('to_date', '>=', today).get(),
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
    const recipients = pickDailyUpdateReminderRecipients(members, submitted, absences, today);
    firebase_functions_1.logger.info(`sendDailyUpdateReminder ${today}: ${submitted.size} submitted, ${recipients.length} to remind`);
    const config = {
        apiUrl,
        originWebsite,
        authToken,
        language: whatsappTemplates_1.WHATSAPP_TEMPLATES.language,
        buttonValue: whatsappTemplates_1.WHATSAPP_BUTTON_VALUES.dailyUpdateReminder,
    };
    let sent = 0;
    let consecutiveFailures = 0;
    for (const member of recipients) {
        try {
            await (0, shared_1.send11zaTemplate)(member.phone, templateName, buildDailyUpdateReminderParams(member.name, today), config);
            sent++;
            consecutiveFailures = 0;
        }
        catch (err) {
            consecutiveFailures++;
            firebase_functions_1.logger.error(`Daily update reminder failed for ${member.name || member.id}`, err);
            if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
                firebase_functions_1.logger.error(`sendDailyUpdateReminder: ${MAX_CONSECUTIVE_FAILURES} failures in a row; aborting run ` +
                    `(check that template "${templateName}" is approved in 11za)`);
                break;
            }
        }
        await sleep(SEND_SPACING_MS);
    }
    firebase_functions_1.logger.info(`sendDailyUpdateReminder complete: sent ${sent}/${recipients.length}`);
});

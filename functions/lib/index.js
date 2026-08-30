"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.onRecurringTaskAuditSopUpdated = exports.onTaskAuditSopUpdated = exports.transitionScheduledTasks = exports.generateRecurringTasksDaily = exports.sendDailyReminder = exports.sendTaskReminder = exports.onMemberCreated = void 0;
/*
 * Developed by Nerdshouse Technologies LLP — https://nerdshouse.com
 * © 2026 WhiteRock (Royal Enterprise). All rights reserved.
 *
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */
const admin = require("firebase-admin");
const firebase_functions_1 = require("firebase-functions");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const firestore_1 = require("firebase-functions/v2/firestore");
const shared_1 = require("./shared");
admin.initializeApp();
__exportStar(require("./auth"), exports);
var notifications_1 = require("./notifications");
Object.defineProperty(exports, "onMemberCreated", { enumerable: true, get: function () { return notifications_1.onMemberCreated; } });
Object.defineProperty(exports, "sendTaskReminder", { enumerable: true, get: function () { return notifications_1.sendTaskReminder; } });
const RECURRING_TYPES = [
    'daily',
    'weekly',
    'fortnightly',
    'monthly',
    'quarterly',
    'half_yearly',
    'yearly',
];
const DAY_MS = 24 * 60 * 60 * 1000;
function parseISODateOnly(value) {
    if (!value)
        return null;
    const parsed = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime()))
        return null;
    return parsed;
}
function toISODateOnly(date) {
    return date.toISOString().split('T')[0];
}
function getStartDateForRecurringDue(baseStartDate, baseDueDate, targetDueDate) {
    const startBase = parseISODateOnly(baseStartDate);
    const dueBase = parseISODateOnly(baseDueDate);
    const targetDue = parseISODateOnly(targetDueDate);
    if (!startBase || !dueBase || !targetDue)
        return null;
    const dueDeltaDays = Math.round((targetDue.getTime() - dueBase.getTime()) / DAY_MS);
    const nextStart = new Date(startBase);
    nextStart.setUTCDate(nextStart.getUTCDate() + dueDeltaDays);
    return toISODateOnly(nextStart);
}
function toAppWeekday(date) {
    const jsWeekday = date.getUTCDay(); // 0 = Sun .. 6 = Sat
    return jsWeekday === 0 ? 6 : jsWeekday - 1; // 0 = Mon .. 6 = Sun
}
function getNextRecurringDueDate(dueDate, recurring, recurringDays) {
    if (!dueDate)
        return null;
    const base = new Date(`${dueDate}T00:00:00Z`);
    if (Number.isNaN(base.getTime()))
        return null;
    const next = new Date(base);
    switch (recurring) {
        case 'daily': {
            const days = (recurringDays || []).slice().sort((a, b) => a - b);
            if (days.length === 0) {
                next.setUTCDate(next.getUTCDate() + 1);
            }
            else {
                const current = toAppWeekday(base);
                const nextDay = days.find((d) => d > current);
                const target = nextDay ?? days[0];
                const delta = nextDay != null ? target - current : 7 - current + target;
                next.setUTCDate(next.getUTCDate() + delta);
            }
            break;
        }
        case 'weekly':
            next.setUTCDate(next.getUTCDate() + 7);
            break;
        case 'fortnightly':
            next.setUTCDate(next.getUTCDate() + 14);
            break;
        case 'monthly':
            next.setUTCMonth(next.getUTCMonth() + 1);
            break;
        case 'quarterly':
            next.setUTCMonth(next.getUTCMonth() + 3);
            break;
        case 'half_yearly':
            next.setUTCMonth(next.getUTCMonth() + 6);
            break;
        case 'yearly':
            next.setUTCFullYear(next.getUTCFullYear() + 1);
            break;
        default:
            return null;
    }
    return next.toISOString().split('T')[0];
}
function getRecurringStreamKey(task) {
    return JSON.stringify({
        assigned_to_id: task.assigned_to_id || '',
        assigned_by_id: task.assigned_by_id || '',
        title: task.title || '',
        recurring: task.recurring || '',
        recurring_days: Array.isArray(task.recurring_days) ? [...task.recurring_days].sort((a, b) => a - b) : [],
        verifier_id: task.verifier_id || '',
        attachment_required: Boolean(task.attachment_required),
        attachment_type: task.attachment_type || '',
        attachment_description: task.attachment_description || '',
    });
}
function isRecurringMaster(task) {
    if (!task)
        return false;
    return task.is_recurring_master === true;
}
/**
 * Scheduled function: runs daily at 8:00 AM IST.
 * Sends a WhatsApp reminder to every member who has at least one
 * assigned/pending task, prompting them to check the task software.
 */
exports.sendDailyReminder = (0, scheduler_1.onSchedule)({
    schedule: '30 10 * * *',
    timeZone: 'Asia/Kolkata',
    timeoutSeconds: 120,
    memory: '256MiB',
}, async () => {
    const authToken = process.env.ELEVENZA_AUTH_TOKEN;
    const apiUrl = process.env.ELEVENZA_API_URL ||
        'https://app.11za.in/apis/template/sendTemplate';
    const originWebsite = process.env.ELEVENZA_ORIGIN_WEBSITE ||
        'https://whiterock.co.in/';
    const templateDailyReminder = process.env.ELEVENZA_TEMPLATE_DAILY_REMINDER ||
        'daily_reminder_v1';
    if (!templateDailyReminder.trim()) {
        firebase_functions_1.logger.warn('ELEVENZA_TEMPLATE_DAILY_REMINDER is empty; skipping daily reminders');
        return;
    }
    if (!authToken) {
        firebase_functions_1.logger.warn('ELEVENZA_AUTH_TOKEN not set; skipping daily reminders');
        return;
    }
    const db = admin.firestore();
    // Find all tasks that are active (assigned/pending)
    const activeTasksSnap = await db
        .collection(shared_1.COLLECTIONS.TASKS)
        .where('status', 'in', ['pending', 'in_progress', 'overdue'])
        .get();
    // Collect unique user IDs who have at least one active task
    const userIdsWithTasks = new Set();
    for (const doc of activeTasksSnap.docs) {
        const uid = doc.data().assigned_to_id;
        if (uid)
            userIdsWithTasks.add(uid);
    }
    if (userIdsWithTasks.size === 0) {
        firebase_functions_1.logger.info('No users with active tasks; skipping daily reminders');
        return;
    }
    // Fetch all users to get phone numbers
    const usersSnap = await db.collection(shared_1.COLLECTIONS.USERS).get();
    const usersById = new Map();
    for (const doc of usersSnap.docs) {
        const d = doc.data();
        usersById.set(doc.id, { phone: d.phone, name: d.name || '' });
    }
    const elevenzaConfig = {
        apiUrl,
        originWebsite,
        authToken,
    };
    let sentCount = 0;
    for (const userId of userIdsWithTasks) {
        const user = usersById.get(userId);
        const phone = user?.phone;
        if (!phone) {
            firebase_functions_1.logger.info(`No phone for user ${userId}; skipping daily reminder`);
            continue;
        }
        try {
            await (0, shared_1.send11zaTemplate)(phone, templateDailyReminder, [user.name], elevenzaConfig);
            firebase_functions_1.logger.info(`Daily reminder sent to ${user.name} (${phone})`);
            sentCount++;
        }
        catch (err) {
            firebase_functions_1.logger.error(`Failed to send daily reminder to ${phone}:`, err);
        }
    }
    firebase_functions_1.logger.info(`Daily reminders complete: sent to ${sentCount} users`);
    return;
});
function getTodayIST() {
    return new Date()
        .toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
        .replace(/\//g, '-');
}
function resolveInstanceStartDate(baseStartDate, baseDueDate, dueCursor) {
    return getStartDateForRecurringDue(baseStartDate, baseDueDate, dueCursor) || dueCursor;
}
function resolveInitialTaskStatus(requestedStatus, startDate, today) {
    if (requestedStatus === 'pending' && startDate && startDate > today) {
        return 'scheduled';
    }
    return requestedStatus;
}
/**
 * Creates recurring child instances when their start_date has arrived (not due_date).
 * Also advances master pointers to the next future period.
 */
async function runGenerateRecurringTasks(db, opts = {}) {
    const dryRun = opts.dryRun === true;
    const nowIso = new Date().toISOString();
    const today = getTodayIST();
    const recurringSnap = await db
        .collection(shared_1.COLLECTIONS.RECURRING_TASKS)
        .get();
    if (recurringSnap.empty) {
        firebase_functions_1.logger.info('No recurring tasks found; skipping recurring generation');
        return { streamCount: 0, createdCount: 0, dryRun, created: [] };
    }
    const streamMap = new Map();
    for (const taskDoc of recurringSnap.docs) {
        const task = taskDoc.data();
        if (!task?.due_date)
            continue;
        if (!isRecurringMaster(task))
            continue;
        if (task.status === 'completed')
            continue;
        if (task.status === 'closed_permanently')
            continue;
        const streamKey = getRecurringStreamKey(task);
        const existing = streamMap.get(streamKey) || [];
        existing.push({ id: taskDoc.id, ...task });
        streamMap.set(streamKey, existing);
    }
    let createdCount = 0;
    let streamCount = 0;
    const created = [];
    for (const streamTasks of streamMap.values()) {
        if (streamTasks.length === 0)
            continue;
        streamCount += 1;
        streamTasks.sort((a, b) => String(a.due_date || '').localeCompare(String(b.due_date || '')));
        const template = streamTasks[streamTasks.length - 1];
        const recurring = template.recurring;
        if (!RECURRING_TYPES.includes(recurring))
            continue;
        const masterTaskId = String(template.id || '');
        const masterRef = db.collection(shared_1.COLLECTIONS.RECURRING_TASKS).doc(masterTaskId);
        const existingInstanceSnap = await db
            .collection(shared_1.COLLECTIONS.TASKS)
            .where('parent_task_id', '==', masterTaskId)
            .where('recurring', '==', 'none')
            .get();
        const existingInstanceDueDates = new Set(existingInstanceSnap.docs.map((d) => String(d.data().due_date || '')));
        const baseStartDate = String(template.start_date || '');
        const baseDueDate = String(template.due_date || '');
        let cursor = String(template.due_date || '');
        const originalCursor = cursor;
        let guard = 0;
        while (guard < 400) {
            guard += 1;
            const instanceStartDate = resolveInstanceStartDate(baseStartDate, baseDueDate, cursor);
            // Stop at the first period whose work window has not opened yet
            if (instanceStartDate > today)
                break;
            let shouldCreateInstance = true;
            if (recurring === 'daily' &&
                template.recurring_days &&
                Array.isArray(template.recurring_days) &&
                template.recurring_days.length > 0) {
                const cursorWeekday = toAppWeekday(new Date(`${cursor}T00:00:00Z`));
                shouldCreateInstance = template.recurring_days.includes(cursorWeekday);
            }
            if (shouldCreateInstance && !existingInstanceDueDates.has(cursor)) {
                const status = resolveInitialTaskStatus('pending', instanceStartDate, today);
                const newTask = {
                    title: template.title || '',
                    description: template.description || '',
                    start_date: instanceStartDate,
                    due_date: cursor,
                    priority: template.priority || 'medium',
                    status,
                    recurring: 'none',
                    is_recurring_master: false,
                    recurring_days: null,
                    verification_required: template.verification_required === true,
                    verifier_id: template.verifier_id || null,
                    verifier_name: template.verifier_name || null,
                    attachment_required: template.attachment_required === true,
                    attachment_type: template.attachment_type || null,
                    attachment_description: template.attachment_description || null,
                    assigned_to_id: template.assigned_to_id || '',
                    assigned_to_name: template.assigned_to_name || '',
                    assigned_to_department: template.assigned_to_department || null,
                    assigned_by_id: template.assigned_by_id || '',
                    assigned_by_name: template.assigned_by_name || '',
                    assignee_deleted: template.assignee_deleted === true,
                    parent_task_id: masterTaskId,
                    is_holiday: template.is_holiday === true,
                    audit_sop_text: template.audit_sop_text || null,
                    audit_sop_attachments: template.audit_sop_attachments || null,
                    audit_sop_links: template.audit_sop_links || null,
                    audit_sop_updated_by: template.audit_sop_updated_by || null,
                    audit_sop_updated_at: template.audit_sop_updated_at || null,
                    created_at: admin.firestore.Timestamp.fromDate(new Date(nowIso)),
                    updated_at: admin.firestore.Timestamp.fromDate(new Date(nowIso)),
                };
                created.push({
                    masterId: masterTaskId,
                    dueDate: cursor,
                    startDate: instanceStartDate,
                    title: String(template.title || ''),
                });
                if (!dryRun) {
                    await db.collection(shared_1.COLLECTIONS.TASKS).add(newTask);
                }
                existingInstanceDueDates.add(cursor);
                createdCount += 1;
            }
            const nextDueDate = getNextRecurringDueDate(cursor, recurring, template.recurring_days);
            if (!nextDueDate)
                break;
            cursor = nextDueDate;
        }
        if (cursor !== originalCursor) {
            const nextMasterStartDate = resolveInstanceStartDate(baseStartDate, baseDueDate, cursor) ||
                String(template.start_date || today);
            if (!dryRun) {
                await masterRef.update({
                    start_date: nextMasterStartDate,
                    due_date: cursor,
                    updated_at: admin.firestore.Timestamp.fromDate(new Date(nowIso)),
                });
            }
        }
    }
    firebase_functions_1.logger.info(`Recurring generation complete (dryRun=${dryRun}): processed ${streamCount} streams, created ${createdCount} tasks`);
    return { streamCount, createdCount, dryRun, created };
}
/**
 * Scheduled function: runs daily at 00:10 AM IST (after transitionScheduledTasks at 00:05).
 * Creates recurring child instances when start_date has arrived and advances master due dates.
 */
exports.generateRecurringTasksDaily = (0, scheduler_1.onSchedule)({
    schedule: '10 0 * * *',
    timeZone: 'Asia/Kolkata',
    timeoutSeconds: 540,
    memory: '512MiB',
}, async () => {
    await runGenerateRecurringTasks(admin.firestore());
    return;
});
/**
 * Scheduled function: runs daily at 00:05 AM IST (18:05 UTC).
 * Finds all tasks with status 'scheduled' whose start_date has arrived (start_date <= today).
 * Updates them to 'pending' so they become visible to assignees in the task tables.
 */
exports.transitionScheduledTasks = (0, scheduler_1.onSchedule)({
    schedule: '05 00 * * *', // 00:05 IST
    timeZone: 'Asia/Kolkata',
    timeoutSeconds: 540,
    memory: '512MiB',
}, async () => {
    const db = admin.firestore();
    const today = getTodayIST(); // YYYY-MM-DD in IST
    firebase_functions_1.logger.info(`transitionScheduledTasks: running for date ${today}`);
    // Fetch all tasks with 'scheduled' status
    const scheduledSnap = await db
        .collection(shared_1.COLLECTIONS.TASKS)
        .where('status', '==', 'scheduled')
        .get();
    if (scheduledSnap.empty) {
        firebase_functions_1.logger.info('No scheduled tasks found; nothing to transition.');
        return;
    }
    // Filter to only those whose start_date has arrived (start_date <= today)
    const tasksToActivate = scheduledSnap.docs.filter((docSnap) => {
        const startDate = docSnap.data().start_date;
        // If no start_date set, activate it (edge case safety)
        if (!startDate)
            return true;
        return startDate <= today;
    });
    if (tasksToActivate.length === 0) {
        firebase_functions_1.logger.info('No scheduled tasks are ready to activate yet.');
        return;
    }
    firebase_functions_1.logger.info(`Activating ${tasksToActivate.length} scheduled task(s)...`);
    // Firestore batch writes are limited to 500 ops per batch — use chunks of 450 to be safe
    const BATCH_SIZE = 450;
    const nowTimestamp = admin.firestore.Timestamp.now();
    for (let i = 0; i < tasksToActivate.length; i += BATCH_SIZE) {
        const batch = db.batch();
        const chunk = tasksToActivate.slice(i, i + BATCH_SIZE);
        for (const docSnap of chunk) {
            batch.update(docSnap.ref, {
                status: 'pending',
                updated_at: nowTimestamp,
            });
        }
        await batch.commit();
        firebase_functions_1.logger.info(`Batch committed: ${chunk.length} tasks activated.`);
    }
    firebase_functions_1.logger.info(`transitionScheduledTasks complete: ${tasksToActivate.length} task(s) transitioned to pending.`);
    return;
});
/**
 * Triggered when a task document is updated.
 * Checks if audit_sop fields changed and sends a WhatsApp notification to the assigned doer and verifier.
 */
exports.onTaskAuditSopUpdated = (0, firestore_1.onDocumentUpdated)({
    document: `${shared_1.COLLECTIONS.TASKS}/{taskId}`,
}, async (event) => {
    if (!event.data)
        return;
    const before = event.data.before.data();
    const after = event.data.after.data();
    // Check if any audit SOP field changed
    const sopTextChanged = before.audit_sop_text !== after.audit_sop_text;
    const sopAttachmentsChanged = JSON.stringify(before.audit_sop_attachments || []) !== JSON.stringify(after.audit_sop_attachments || []);
    const sopLinksChanged = JSON.stringify(before.audit_sop_links || []) !== JSON.stringify(after.audit_sop_links || []);
    const hasSopChanged = sopTextChanged || sopAttachmentsChanged || sopLinksChanged;
    if (!hasSopChanged) {
        return;
    }
    const db = admin.firestore();
    // If it's a recurring master, propagate the SOP changes to active child instances
    const authToken = process.env.ELEVENZA_AUTH_TOKEN;
    const apiUrl = process.env.ELEVENZA_API_URL ||
        'https://app.11za.in/apis/template/sendTemplate';
    const originWebsite = process.env.ELEVENZA_ORIGIN_WEBSITE ||
        'https://whiterock.co.in/';
    const templateAuditSopUpdate = process.env.ELEVENZA_TEMPLATE_AUDIT_SOP_UPDATE ||
        'audit_sop_update';
    if (!authToken) {
        firebase_functions_1.logger.warn('ELEVENZA_AUTH_TOKEN not set; skipping audit SOP notification');
        return;
    }
    const taskTitle = after.title || 'Unknown Task';
    const updatedByName = after.audit_sop_updated_by || 'Assigner/Admin';
    // Collect users to notify
    const usersToNotify = new Set();
    if (after.assigned_to_id)
        usersToNotify.add(after.assigned_to_id);
    if (after.verifier_id)
        usersToNotify.add(after.verifier_id);
    if (usersToNotify.size === 0)
        return;
    const elevenzaConfig = {
        apiUrl,
        originWebsite,
        authToken,
    };
    const usersSnap = await db.collection(shared_1.COLLECTIONS.USERS).get();
    const usersById = new Map();
    for (const doc of usersSnap.docs) {
        const d = doc.data();
        usersById.set(doc.id, { phone: d.phone, name: d.name || '' });
    }
    for (const userId of usersToNotify) {
        const user = usersById.get(userId);
        const phone = user?.phone;
        if (!phone)
            continue;
        try {
            await (0, shared_1.send11zaTemplate)(phone, templateAuditSopUpdate, [user.name, taskTitle, updatedByName], elevenzaConfig);
            firebase_functions_1.logger.info(`Audit SOP update notification sent to ${user.name} (${phone})`);
        }
        catch (err) {
            firebase_functions_1.logger.error(`Failed to send Audit SOP update notification to ${phone}:`, err);
        }
    }
});
/**
 * Triggered when a recurring task template is updated.
 * Checks if audit_sop fields changed and propagates them to active children, and notifies doer/verifier.
 */
exports.onRecurringTaskAuditSopUpdated = (0, firestore_1.onDocumentUpdated)({
    document: `${shared_1.COLLECTIONS.RECURRING_TASKS}/{taskId}`,
}, async (event) => {
    if (!event.data)
        return;
    const before = event.data.before.data();
    const after = event.data.after.data();
    const sopTextChanged = before.audit_sop_text !== after.audit_sop_text;
    const sopAttachmentsChanged = JSON.stringify(before.audit_sop_attachments || []) !== JSON.stringify(after.audit_sop_attachments || []);
    const sopLinksChanged = JSON.stringify(before.audit_sop_links || []) !== JSON.stringify(after.audit_sop_links || []);
    const hasSopChanged = sopTextChanged || sopAttachmentsChanged || sopLinksChanged;
    if (!hasSopChanged) {
        return;
    }
    const db = admin.firestore();
    const taskId = event.data.after.id;
    try {
        const activeChildrenSnap = await db
            .collection(shared_1.COLLECTIONS.TASKS)
            .where('parent_task_id', '==', taskId)
            .where('recurring', '==', 'none')
            .where('status', 'in', ['pending', 'scheduled', 'in_progress', 'correction_required', 'pending_verification', 'overdue'])
            .get();
        if (!activeChildrenSnap.empty) {
            const batch = db.batch();
            activeChildrenSnap.forEach(doc => {
                batch.update(doc.ref, {
                    audit_sop_text: after.audit_sop_text || null,
                    audit_sop_attachments: after.audit_sop_attachments || null,
                    audit_sop_links: after.audit_sop_links || null,
                    audit_sop_updated_by: after.audit_sop_updated_by || null,
                    audit_sop_updated_at: after.audit_sop_updated_at || null,
                    updated_at: admin.firestore.Timestamp.now(),
                });
            });
            await batch.commit();
            firebase_functions_1.logger.info(`Propagated SOP updates from recurring master ${taskId} to ${activeChildrenSnap.size} active child tasks.`);
        }
    }
    catch (err) {
        firebase_functions_1.logger.error(`Failed to propagate SOP updates for recurring master ${taskId}:`, err);
    }
    const authToken = process.env.ELEVENZA_AUTH_TOKEN;
    const apiUrl = process.env.ELEVENZA_API_URL ||
        'https://app.11za.in/apis/template/sendTemplate';
    const originWebsite = process.env.ELEVENZA_ORIGIN_WEBSITE ||
        'https://whiterock.co.in/';
    const templateAuditSopUpdate = process.env.ELEVENZA_TEMPLATE_AUDIT_SOP_UPDATE ||
        'audit_sop_update';
    if (!authToken)
        return;
    const taskTitle = after.title || 'Unknown Task';
    const updatedByName = after.audit_sop_updated_by || 'Assigner/Admin';
    const usersToNotify = new Set();
    if (after.assigned_to_id)
        usersToNotify.add(after.assigned_to_id);
    if (after.verifier_id)
        usersToNotify.add(after.verifier_id);
    if (usersToNotify.size === 0)
        return;
    const elevenzaConfig = {
        apiUrl,
        originWebsite,
        authToken,
    };
    const usersSnap = await db.collection(shared_1.COLLECTIONS.USERS).get();
    const usersById = new Map();
    for (const doc of usersSnap.docs) {
        const d = doc.data();
        usersById.set(doc.id, { phone: d.phone, name: d.name || '' });
    }
    for (const userId of usersToNotify) {
        const user = usersById.get(userId);
        const phone = user?.phone;
        if (!phone)
            continue;
        try {
            await (0, shared_1.send11zaTemplate)(phone, templateAuditSopUpdate, [user.name, taskTitle, updatedByName], elevenzaConfig);
        }
        catch (err) {
            firebase_functions_1.logger.error(`Failed to send Audit SOP update notification to ${phone}:`, err);
        }
    }
});

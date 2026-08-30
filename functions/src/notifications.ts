/*
 * Developed by Nerdshouse Technologies LLP — https://nerdshouse.com
 * © 2026 WhiteRock (Royal Enterprise). All rights reserved.
 *
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */
import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { COLLECTIONS, send11zaTemplate } from './shared';
import { WHATSAPP_TEMPLATES, WHATSAPP_BUTTON_VALUES } from './whatsappTemplates';
import { checkRateLimit, elevenzaConfigFromEnv } from './auth';

export const REMINDER_COOLDOWN_MS = 4 * 60 * 60 * 1000;

/** Statuses a reminder may be sent for; completed/closed/etc. are rejected. */
export const REMINDABLE_STATUSES = ['pending', 'in_progress', 'overdue'] as const;

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** First word of a full name, trimmed; falls back to 'there' for empty names. */
export function firstNameOf(fullName: string | undefined | null): string {
  const first = String(fullName || '').trim().split(/\s+/)[0];
  return first || 'there';
}

/**
 * Format a due date as DD-MMM-YYYY (e.g. 31-Aug-2026) in Asia/Kolkata.
 * Due dates are stored as date-only YYYY-MM-DD strings, which are already
 * IST calendar dates; anything else is formatted through the IST timezone.
 * Missing/invalid dates become 'Not set'.
 */
export function formatDueDateIST(dueDate: string | undefined | null): string {
  const raw = String(dueDate || '').trim();
  if (!raw) return 'Not set';

  const dateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    const [, y, m, d] = dateOnly;
    const monthIdx = Number(m) - 1;
    if (monthIdx < 0 || monthIdx > 11) return 'Not set';
    return `${d}-${MONTHS_SHORT[monthIdx]}-${y}`;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return 'Not set';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(parsed);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || '';
  const monthIdx = Number(get('month')) - 1;
  if (monthIdx < 0 || monthIdx > 11) return 'Not set';
  return `${get('day')}-${MONTHS_SHORT[monthIdx]}-${get('year')}`;
}

/** task_reminder body variables IN ORDER: {{name}}, {{task_name}}, {{due_date}}. */
export function buildTaskReminderParams(
  memberFullName: string,
  taskTitle: string,
  dueDate: string | undefined | null
): string[] {
  return [firstNameOf(memberFullName), String(taskTitle || ''), formatDueDateIST(dueDate)];
}

/** member_onboarding body variables IN ORDER: {{name}} only. */
export function buildOnboardingParams(memberFullName: string): string[] {
  return [firstNameOf(memberFullName)];
}

/** Milliseconds of cooldown left; 0 when expired or never reminded. */
export function cooldownRemainingMs(lastRemindedAtMs: number | null | undefined, nowMs: number): number {
  if (!lastRemindedAtMs) return 0;
  return Math.max(0, lastRemindedAtMs + REMINDER_COOLDOWN_MS - nowMs);
}

function formatRemaining(ms: number): string {
  const totalMinutes = Math.ceil(ms / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Spacing between onboarding sends during a bulk import, reserved via a shared slot doc. */
const ONBOARDING_SEND_SPACING_MS = 1500;
const ONBOARDING_MAX_WAIT_MS = 4 * 60 * 1000;

/**
 * Reserve a global send slot so concurrent member-created triggers (bulk CSV
 * import) space their 11za calls out instead of bursting. Returns how long
 * this invocation should wait before sending.
 */
async function reserveOnboardingSendSlot(db: FirebaseFirestore.Firestore): Promise<number> {
  const ref = db.collection(COLLECTIONS.RATE_LIMITS).doc('onboarding-send-queue');
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
export const onMemberCreated = onDocumentCreated(
  {
    document: `${COLLECTIONS.USERS}/{userId}`,
    timeoutSeconds: 300,
    memory: '256MiB',
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const member = snap.data();

    if (member.onboardingMessage?.status === 'sent') {
      logger.info(`Member ${snap.id}: onboarding already sent; skipping`);
      return;
    }

    const db = admin.firestore();
    const writeStatus = (status: 'sent' | 'failed', error?: string) =>
      snap.ref
        .update({
          onboardingMessage: {
            status,
            sentAt: admin.firestore.Timestamp.now(),
            ...(error ? { error: error.slice(0, 500) } : {}),
          },
        })
        .catch((err) => logger.error(`Member ${snap.id}: failed to record onboarding status`, err));

    const phone = String(member.phone || '').trim();
    if (!phone) {
      logger.warn(`Member ${snap.id}: no phone number; onboarding not sent`);
      await writeStatus('failed', 'No phone number on member');
      return;
    }

    const { apiUrl, originWebsite, authToken } = elevenzaConfigFromEnv();
    if (!authToken) {
      logger.error('ELEVENZA_AUTH_TOKEN not set; cannot send onboarding message');
      await writeStatus('failed', 'WhatsApp service not configured');
      return;
    }

    // Stagger bulk-import sends to stay under 11za rate limits.
    const waitMs = await reserveOnboardingSendSlot(db);
    if (waitMs > 0) await sleep(waitMs);

    const params = buildOnboardingParams(member.name || '');
    const config = {
      apiUrl,
      originWebsite,
      authToken,
      language: WHATSAPP_TEMPLATES.language,
      buttonValue: WHATSAPP_BUTTON_VALUES.onboarding,
    };

    try {
      try {
        await send11zaTemplate(phone, WHATSAPP_TEMPLATES.onboarding, params, config);
      } catch (firstErr) {
        logger.warn(`Member ${snap.id}: onboarding send failed, retrying once`, firstErr);
        await sleep(2000);
        await send11zaTemplate(phone, WHATSAPP_TEMPLATES.onboarding, params, config);
      }
      await writeStatus('sent');
      logger.info(`Onboarding message sent to ${member.name || snap.id}`);
    } catch (err) {
      logger.error(`Member ${snap.id}: onboarding send failed after retry`, err);
      await writeStatus('failed', err instanceof Error ? err.message : String(err));
    }
  }
);

/**
 * Bell-icon reminder: sends the task_reminder template to a task's assignee.
 * Role rules mirror the app: admins may remind on any task; sub-admins and
 * users only on tasks they assigned. Cooldown: one reminder per task per
 * member per 4 hours, reserved transactionally so double-presses can't race.
 */
export const sendTaskReminder = onCall({ timeoutSeconds: 30 }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in to send reminders.');
  }
  const taskId = String(request.data?.taskId || '').trim();
  if (!taskId) {
    throw new HttpsError('invalid-argument', 'taskId is required.');
  }

  const uid = request.auth.uid;
  const role = String(request.auth.token.role || 'user');

  await checkRateLimit(`task-remind:${uid}`, 30, 60 * 60 * 1000);

  const db = admin.firestore();
  const taskRef = db.collection(COLLECTIONS.TASKS).doc(taskId);
  const taskSnap = await taskRef.get();
  if (!taskSnap.exists) {
    throw new HttpsError('not-found', 'Task not found.');
  }
  const task = taskSnap.data() as FirebaseFirestore.DocumentData;

  if (role !== 'admin' && task.assigned_by_id !== uid) {
    throw new HttpsError('permission-denied', 'You can only send reminders for tasks you assigned.');
  }

  if (!REMINDABLE_STATUSES.includes(task.status)) {
    throw new HttpsError('failed-precondition', 'Reminders can only be sent for pending or in-progress tasks.');
  }

  const assigneeId = String(task.assigned_to_id || '');
  if (!assigneeId || task.assignee_deleted === true) {
    throw new HttpsError('failed-precondition', 'This task has no active assignee.');
  }

  const assigneeSnap = await db.collection(COLLECTIONS.USERS).doc(assigneeId).get();
  const assignee = assigneeSnap.data();
  const assigneePhone = String(assignee?.phone || '').trim();
  if (!assignee || !assigneePhone) {
    throw new HttpsError('failed-precondition', 'The assignee has no WhatsApp number on file.');
  }

  const { apiUrl, originWebsite, authToken } = elevenzaConfigFromEnv();
  if (!authToken) {
    logger.error('ELEVENZA_AUTH_TOKEN not set; cannot send task reminder');
    throw new HttpsError('internal', 'WhatsApp service is not configured.');
  }

  // Reserve the cooldown slot transactionally before sending, so two
  // simultaneous presses can't both pass the check.
  const now = admin.firestore.Timestamp.now();
  const previous = await db.runTransaction(async (tx) => {
    const fresh = await tx.get(taskRef);
    const data = fresh.data() as FirebaseFirestore.DocumentData;
    const lastTs = data?.lastRemindedAt?.[assigneeId];
    const lastMs = lastTs?.toMillis ? lastTs.toMillis() : null;
    const remaining = cooldownRemainingMs(lastMs, now.toMillis());
    if (remaining > 0) {
      throw new HttpsError(
        'failed-precondition',
        `Already reminded recently. Try again in ${formatRemaining(remaining)}.`
      );
    }
    tx.update(taskRef, { [`lastRemindedAt.${assigneeId}`]: now });
    return lastTs ?? null;
  });

  const params = buildTaskReminderParams(assignee.name || '', task.title || '', task.due_date);

  try {
    await send11zaTemplate(assigneePhone, WHATSAPP_TEMPLATES.taskReminder, params, {
      apiUrl,
      originWebsite,
      authToken,
      language: WHATSAPP_TEMPLATES.language,
      buttonValue: WHATSAPP_BUTTON_VALUES.taskReminder,
    });
  } catch (err) {
    // Roll back the reserved slot so the sender can retry immediately.
    await taskRef
      .update({ [`lastRemindedAt.${assigneeId}`]: previous ?? admin.firestore.FieldValue.delete() })
      .catch((rollbackErr) => logger.error('Failed to roll back reminder cooldown', rollbackErr));
    logger.error(`Task ${taskId}: reminder send failed`, err);
    throw new HttpsError('internal', 'Failed to send the WhatsApp reminder. Please try again.');
  }

  // Audit trail entry, matching the client's task_logs shape.
  const callerSnap = await db.collection(COLLECTIONS.USERS).doc(uid).get();
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
    .catch((err) => logger.error('Failed to write reminder audit log', err));

  logger.info(`Task reminder sent for task ${taskId} to ${assignee.name} by ${callerName}`);
  return { ok: true, remindedAt: now.toMillis(), cooldownMs: REMINDER_COOLDOWN_MS };
});

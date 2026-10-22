/*
 * Developed by Nerdshouse Technologies LLP — https://nerdshouse.com
 * © 2026 WhiteRock (Royal Enterprise). All rights reserved.
 *
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */
import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { COLLECTIONS, send11zaTemplate } from './shared';
import { WHATSAPP_TEMPLATES, WHATSAPP_BUTTON_VALUES } from './whatsappTemplates';
import { checkRateLimit, elevenzaConfigFromEnv } from './auth';
import { firstNameOf, formatDueDateIST } from './notifications';

/** Gap between 11za sends so a full-company run doesn't burst the API. */
const SEND_SPACING_MS = 1000;
/** Abort the run after this many failures in a row (e.g. template not approved yet). */
const MAX_CONSECUTIVE_FAILURES = 3;
/** One daily-update nudge per member per this window (scheduled + manual combined). */
export const DAILY_UPDATE_REMINDER_COOLDOWN_MS = 2 * 60 * 60 * 1000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface ReminderMember {
  id: string;
  name: string;
  phone?: string;
  approved?: boolean;
}

export interface ReminderAbsence {
  user_id: string;
  from_date: string;
  to_date: string;
}

export type ReminderSkipReason = 'no_phone' | 'unapproved' | 'submitted' | 'absent';

/** Why a member should NOT get a nudge for `date`, or null if they should. */
export function dailyUpdateReminderSkipReason(
  member: ReminderMember,
  submittedUserIds: Set<string>,
  absences: ReminderAbsence[],
  date: string
): ReminderSkipReason | null {
  if (String(member.phone || '').trim() === '') return 'no_phone';
  if (member.approved === false) return 'unapproved';
  if (submittedUserIds.has(member.id)) return 'submitted';
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
export function pickDailyUpdateReminderRecipients(
  members: ReminderMember[],
  submittedUserIds: Set<string>,
  absences: ReminderAbsence[],
  date: string
): ReminderMember[] {
  return members.filter((m) => dailyUpdateReminderSkipReason(m, submittedUserIds, absences, date) === null);
}

/** daily_update_reminder body variables IN ORDER: {{name}}, {{date}}. */
export function buildDailyUpdateReminderParams(memberFullName: string, date: string): string[] {
  return [firstNameOf(memberFullName), formatDueDateIST(date)];
}

function getTodayIST(): string {
  return new Date()
    .toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
    .replace(/\//g, '-');
}

const cooldownRef = (db: FirebaseFirestore.Firestore, userId: string, date: string) =>
  db.collection(COLLECTIONS.RATE_LIMITS).doc(`daily-update-remind:${userId}:${date}`);

/** Everything needed to decide who to nudge for `date`. */
async function loadReminderContext(db: FirebaseFirestore.Firestore, date: string) {
  const [usersSnap, updatesSnap, absencesSnap] = await Promise.all([
    db.collection(COLLECTIONS.USERS).get(),
    db.collection(COLLECTIONS.DAILY_UPDATES).where('date', '==', date).get(),
    db.collection(COLLECTIONS.ABSENCES).where('to_date', '>=', date).get(),
  ]);
  const members: ReminderMember[] = usersSnap.docs.map((d) => {
    const data = d.data();
    return { id: d.id, name: data.name || '', phone: data.phone, approved: data.approved };
  });
  const submitted = new Set(updatesSnap.docs.map((d) => String(d.data().user_id || '')));
  const absences: ReminderAbsence[] = absencesSnap.docs.map((d) => {
    const data = d.data();
    return { user_id: data.user_id, from_date: data.from_date, to_date: data.to_date };
  });
  return { members, submitted, absences };
}

/**
 * Send the nudge to each recipient in turn, skipping anyone still inside the
 * cooldown window. Records the send time per member/day on success.
 */
async function sendDailyUpdateReminders(
  db: FirebaseFirestore.Firestore,
  recipients: ReminderMember[],
  date: string
): Promise<{ sent: string[]; cooldown: string[]; failed: string[]; aborted: boolean }> {
  const result = { sent: [] as string[], cooldown: [] as string[], failed: [] as string[], aborted: false };

  const { apiUrl, originWebsite, authToken } = elevenzaConfigFromEnv();
  const templateName = WHATSAPP_TEMPLATES.dailyUpdateReminder.trim();
  if (!authToken || !templateName) {
    throw new Error('WhatsApp service is not configured (ELEVENZA_AUTH_TOKEN / template name).');
  }
  const config = {
    apiUrl,
    originWebsite,
    authToken,
    language: WHATSAPP_TEMPLATES.language,
    buttonValue: WHATSAPP_BUTTON_VALUES.dailyUpdateReminder,
  };

  const now = Date.now();
  const cooldownSnaps = recipients.length
    ? await db.getAll(...recipients.map((m) => cooldownRef(db, m.id, date)))
    : [];
  const lastSentById = new Map(
    cooldownSnaps.map((snap, i) => [recipients[i].id, Number(snap.data()?.lastSentAt || 0)])
  );

  let consecutiveFailures = 0;
  for (const member of recipients) {
    const lastSent = lastSentById.get(member.id) || 0;
    if (lastSent && now - lastSent < DAILY_UPDATE_REMINDER_COOLDOWN_MS) {
      result.cooldown.push(member.id);
      continue;
    }
    try {
      await send11zaTemplate(
        member.phone as string,
        templateName,
        buildDailyUpdateReminderParams(member.name, date),
        config
      );
      result.sent.push(member.id);
      consecutiveFailures = 0;
      await cooldownRef(db, member.id, date)
        .set({ lastSentAt: Date.now() })
        .catch((err) => logger.error(`Failed to record reminder cooldown for ${member.id}`, err));
    } catch (err) {
      result.failed.push(member.id);
      consecutiveFailures++;
      logger.error(`Daily update reminder failed for ${member.name || member.id}`, err);
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        logger.error(
          `Daily update reminders: ${MAX_CONSECUTIVE_FAILURES} failures in a row; aborting ` +
            `(check that template "${templateName}" is approved in 11za)`
        );
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
export const sendDailyUpdateReminder = onSchedule(
  {
    schedule: '0 19 * * 1-6',
    timeZone: 'Asia/Kolkata',
    timeoutSeconds: 540,
    memory: '256MiB',
  },
  async () => {
    if (!elevenzaConfigFromEnv().authToken || !WHATSAPP_TEMPLATES.dailyUpdateReminder.trim()) {
      logger.warn('WhatsApp not configured; skipping daily update reminders');
      return;
    }

    const db = admin.firestore();
    const today = getTodayIST();

    const holidaySnap = await db.collection(COLLECTIONS.HOLIDAYS).where('date', '==', today).limit(1).get();
    if (!holidaySnap.empty) {
      logger.info(`sendDailyUpdateReminder: ${today} is a company holiday; skipping`);
      return;
    }

    const { members, submitted, absences } = await loadReminderContext(db, today);
    const recipients = pickDailyUpdateReminderRecipients(members, submitted, absences, today);
    logger.info(
      `sendDailyUpdateReminder ${today}: ${submitted.size} submitted, ${recipients.length} to remind`
    );

    const res = await sendDailyUpdateReminders(db, recipients, today);
    logger.info(
      `sendDailyUpdateReminder complete: sent ${res.sent.length}/${recipients.length}, ` +
        `${res.cooldown.length} in cooldown, ${res.failed.length} failed`
    );
  }
);

/**
 * Team Updates "Remind" button: admins and sub-admins nudge members who
 * haven't logged today's update. `userIds` limits it to specific members;
 * omitted means everyone who hasn't submitted. Same skip rules and cooldown
 * as the scheduled run.
 */
export const remindDailyUpdate = onCall({ timeoutSeconds: 540 }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in to send reminders.');
  }
  const role = String(request.auth.token.role || 'user');
  if (role !== 'admin' && role !== 'sub_admin') {
    throw new HttpsError('permission-denied', 'Only admins and sub-admins can send daily update reminders.');
  }

  const rawIds = request.data?.userIds;
  if (rawIds !== undefined && !Array.isArray(rawIds)) {
    throw new HttpsError('invalid-argument', 'userIds must be an array.');
  }
  const userIds: string[] | null = Array.isArray(rawIds)
    ? Array.from(new Set(rawIds.map((x: unknown) => String(x || '').trim()).filter(Boolean)))
    : null;
  if (userIds && userIds.length === 0) {
    throw new HttpsError('invalid-argument', 'No members selected.');
  }

  await checkRateLimit(`daily-update-remind-caller:${request.auth.uid}`, 20, 60 * 60 * 1000);

  const db = admin.firestore();
  const today = getTodayIST();
  const { members, submitted, absences } = await loadReminderContext(db, today);

  const pool = userIds ? members.filter((m) => userIds.includes(m.id)) : members;
  const skipped: { id: string; reason: ReminderSkipReason }[] = [];
  const recipients: ReminderMember[] = [];
  for (const m of pool) {
    const reason = dailyUpdateReminderSkipReason(m, submitted, absences, today);
    if (reason) {
      // "Remind all" only reports skips the admin can act on.
      if (userIds || reason === 'no_phone') skipped.push({ id: m.id, reason });
    } else {
      recipients.push(m);
    }
  }

  let res;
  try {
    res = await sendDailyUpdateReminders(db, recipients, today);
  } catch (err) {
    logger.error('remindDailyUpdate: WhatsApp not configured', err);
    throw new HttpsError('internal', 'WhatsApp service is not configured.');
  }

  logger.info(
    `remindDailyUpdate by ${request.auth.uid}: sent ${res.sent.length}, cooldown ${res.cooldown.length}, ` +
      `failed ${res.failed.length}, skipped ${skipped.length}`
  );
  return {
    sent: res.sent,
    cooldown: res.cooldown,
    failed: res.failed,
    skipped,
    aborted: res.aborted,
    cooldownMs: DAILY_UPDATE_REMINDER_COOLDOWN_MS,
  };
});

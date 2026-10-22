/*
 * Developed by Nerdshouse Technologies LLP — https://nerdshouse.com
 * © 2026 WhiteRock (Royal Enterprise). All rights reserved.
 *
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */
import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { COLLECTIONS, send11zaTemplate } from './shared';
import { WHATSAPP_TEMPLATES, WHATSAPP_BUTTON_VALUES } from './whatsappTemplates';
import { elevenzaConfigFromEnv } from './auth';
import { firstNameOf, formatDueDateIST } from './notifications';

/** Gap between 11za sends so a full-company run doesn't burst the API. */
const SEND_SPACING_MS = 1000;
/** Abort the run after this many failures in a row (e.g. template not approved yet). */
const MAX_CONSECUTIVE_FAILURES = 3;

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
  const absentIds = new Set(
    absences.filter((a) => a.from_date <= date && date <= a.to_date).map((a) => a.user_id)
  );
  return members.filter(
    (m) =>
      String(m.phone || '').trim() !== '' &&
      m.approved !== false &&
      !submittedUserIds.has(m.id) &&
      !absentIds.has(m.id)
  );
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
    const { apiUrl, originWebsite, authToken } = elevenzaConfigFromEnv();
    if (!authToken) {
      logger.warn('ELEVENZA_AUTH_TOKEN not set; skipping daily update reminders');
      return;
    }
    const templateName = WHATSAPP_TEMPLATES.dailyUpdateReminder.trim();
    if (!templateName) {
      logger.warn('ELEVENZA_TEMPLATE_DAILY_UPDATE_REMINDER is empty; skipping daily update reminders');
      return;
    }

    const db = admin.firestore();
    const today = getTodayIST();

    const holidaySnap = await db.collection(COLLECTIONS.HOLIDAYS).where('date', '==', today).limit(1).get();
    if (!holidaySnap.empty) {
      logger.info(`sendDailyUpdateReminder: ${today} is a company holiday; skipping`);
      return;
    }

    const [usersSnap, updatesSnap, absencesSnap] = await Promise.all([
      db.collection(COLLECTIONS.USERS).get(),
      db.collection(COLLECTIONS.DAILY_UPDATES).where('date', '==', today).get(),
      db.collection(COLLECTIONS.ABSENCES).where('to_date', '>=', today).get(),
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

    const recipients = pickDailyUpdateReminderRecipients(members, submitted, absences, today);
    logger.info(
      `sendDailyUpdateReminder ${today}: ${submitted.size} submitted, ${recipients.length} to remind`
    );

    const config = {
      apiUrl,
      originWebsite,
      authToken,
      language: WHATSAPP_TEMPLATES.language,
      buttonValue: WHATSAPP_BUTTON_VALUES.dailyUpdateReminder,
    };

    let sent = 0;
    let consecutiveFailures = 0;
    for (const member of recipients) {
      try {
        await send11zaTemplate(
          member.phone as string,
          templateName,
          buildDailyUpdateReminderParams(member.name, today),
          config
        );
        sent++;
        consecutiveFailures = 0;
      } catch (err) {
        consecutiveFailures++;
        logger.error(`Daily update reminder failed for ${member.name || member.id}`, err);
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          logger.error(
            `sendDailyUpdateReminder: ${MAX_CONSECUTIVE_FAILURES} failures in a row; aborting run ` +
              `(check that template "${templateName}" is approved in 11za)`
          );
          break;
        }
      }
      await sleep(SEND_SPACING_MS);
    }

    logger.info(`sendDailyUpdateReminder complete: sent ${sent}/${recipients.length}`);
  }
);

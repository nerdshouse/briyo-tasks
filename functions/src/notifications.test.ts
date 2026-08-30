/*
 * Developed by Nerdshouse Technologies LLP — https://nerdshouse.com
 * © 2026 WhiteRock (Royal Enterprise). All rights reserved.
 *
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { WHATSAPP_BUTTON_VALUES } from './whatsappTemplates';
import {
  firstNameOf,
  formatDueDateIST,
  buildTaskReminderParams,
  buildOnboardingParams,
  cooldownRemainingMs,
  REMINDER_COOLDOWN_MS,
} from './notifications';

test('firstNameOf takes the first word, trimmed', () => {
  assert.equal(firstNameOf('Axit Mehta'), 'Axit');
  assert.equal(firstNameOf('  Priya   Sharma Patel '), 'Priya');
  assert.equal(firstNameOf('Madonna'), 'Madonna');
  assert.equal(firstNameOf(''), 'there');
  assert.equal(firstNameOf('   '), 'there');
  assert.equal(firstNameOf(undefined), 'there');
});

test('formatDueDateIST formats YYYY-MM-DD as DD-MMM-YYYY', () => {
  assert.equal(formatDueDateIST('2026-08-31'), '31-Aug-2026');
  assert.equal(formatDueDateIST('2026-01-05'), '05-Jan-2026');
  assert.equal(formatDueDateIST('2026-12-25'), '25-Dec-2026');
});

test('formatDueDateIST handles missing/invalid dates as Not set', () => {
  assert.equal(formatDueDateIST(''), 'Not set');
  assert.equal(formatDueDateIST(undefined), 'Not set');
  assert.equal(formatDueDateIST(null), 'Not set');
  assert.equal(formatDueDateIST('garbage'), 'Not set');
  assert.equal(formatDueDateIST('2026-13-01'), 'Not set');
});

test('formatDueDateIST renders ISO timestamps in Asia/Kolkata', () => {
  // 2026-08-31T20:00:00Z is already 2026-09-01 01:30 IST.
  assert.equal(formatDueDateIST('2026-08-31T20:00:00Z'), '01-Sep-2026');
  // 2026-08-31T18:00:00Z is 2026-08-31 23:30 IST — same calendar day.
  assert.equal(formatDueDateIST('2026-08-31T18:00:00Z'), '31-Aug-2026');
});

test('task_reminder body variables ordered: name, task_name, due_date', () => {
  assert.deepEqual(buildTaskReminderParams('Axit Mehta', 'File GST returns', '2026-08-31'), [
    'Axit',
    'File GST returns',
    '31-Aug-2026',
  ]);
  assert.deepEqual(buildTaskReminderParams('Priya Sharma', 'Stock audit', undefined), [
    'Priya',
    'Stock audit',
    'Not set',
  ]);
});

test('member_onboarding has exactly one body variable: first name', () => {
  assert.deepEqual(buildOnboardingParams('Axit Mehta'), ['Axit']);
  assert.deepEqual(buildOnboardingParams('Priya'), ['Priya']);
});

test('both dynamic URL buttons have non-empty values (11za rejects empty)', () => {
  assert.ok(WHATSAPP_BUTTON_VALUES.onboarding.length > 0);
  assert.ok(WHATSAPP_BUTTON_VALUES.taskReminder.length > 0);
});

test('cooldown: zero when never reminded', () => {
  assert.equal(cooldownRemainingMs(null, Date.now()), 0);
  assert.equal(cooldownRemainingMs(undefined, Date.now()), 0);
  assert.equal(cooldownRemainingMs(0, Date.now()), 0);
});

test('cooldown: full window right after a reminder', () => {
  const now = 1_000_000_000_000;
  assert.equal(cooldownRemainingMs(now, now), REMINDER_COOLDOWN_MS);
});

test('cooldown: partial window mid-way', () => {
  const now = 1_000_000_000_000;
  const oneHourAgo = now - 60 * 60 * 1000;
  assert.equal(cooldownRemainingMs(oneHourAgo, now), REMINDER_COOLDOWN_MS - 60 * 60 * 1000);
});

test('cooldown: expired exactly at and after the 4h boundary', () => {
  const now = 1_000_000_000_000;
  assert.equal(cooldownRemainingMs(now - REMINDER_COOLDOWN_MS, now), 0);
  assert.equal(cooldownRemainingMs(now - REMINDER_COOLDOWN_MS - 1, now), 0);
});

test('cooldown: one millisecond before the boundary still blocks', () => {
  const now = 1_000_000_000_000;
  assert.equal(cooldownRemainingMs(now - REMINDER_COOLDOWN_MS + 1, now), 1);
});

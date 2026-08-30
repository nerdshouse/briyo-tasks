"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/*
 * Developed by Nerdshouse Technologies LLP — https://nerdshouse.com
 * © 2026 WhiteRock (Royal Enterprise). All rights reserved.
 *
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */
const node_test_1 = require("node:test");
const assert = require("node:assert/strict");
const whatsappTemplates_1 = require("./whatsappTemplates");
const notifications_1 = require("./notifications");
(0, node_test_1.test)('firstNameOf takes the first word, trimmed', () => {
    assert.equal((0, notifications_1.firstNameOf)('Axit Mehta'), 'Axit');
    assert.equal((0, notifications_1.firstNameOf)('  Priya   Sharma Patel '), 'Priya');
    assert.equal((0, notifications_1.firstNameOf)('Madonna'), 'Madonna');
    assert.equal((0, notifications_1.firstNameOf)(''), 'there');
    assert.equal((0, notifications_1.firstNameOf)('   '), 'there');
    assert.equal((0, notifications_1.firstNameOf)(undefined), 'there');
});
(0, node_test_1.test)('formatDueDateIST formats YYYY-MM-DD as DD-MMM-YYYY', () => {
    assert.equal((0, notifications_1.formatDueDateIST)('2026-08-31'), '31-Aug-2026');
    assert.equal((0, notifications_1.formatDueDateIST)('2026-01-05'), '05-Jan-2026');
    assert.equal((0, notifications_1.formatDueDateIST)('2026-12-25'), '25-Dec-2026');
});
(0, node_test_1.test)('formatDueDateIST handles missing/invalid dates as Not set', () => {
    assert.equal((0, notifications_1.formatDueDateIST)(''), 'Not set');
    assert.equal((0, notifications_1.formatDueDateIST)(undefined), 'Not set');
    assert.equal((0, notifications_1.formatDueDateIST)(null), 'Not set');
    assert.equal((0, notifications_1.formatDueDateIST)('garbage'), 'Not set');
    assert.equal((0, notifications_1.formatDueDateIST)('2026-13-01'), 'Not set');
});
(0, node_test_1.test)('formatDueDateIST renders ISO timestamps in Asia/Kolkata', () => {
    // 2026-08-31T20:00:00Z is already 2026-09-01 01:30 IST.
    assert.equal((0, notifications_1.formatDueDateIST)('2026-08-31T20:00:00Z'), '01-Sep-2026');
    // 2026-08-31T18:00:00Z is 2026-08-31 23:30 IST — same calendar day.
    assert.equal((0, notifications_1.formatDueDateIST)('2026-08-31T18:00:00Z'), '31-Aug-2026');
});
(0, node_test_1.test)('task_reminder body variables ordered: name, task_name, due_date', () => {
    assert.deepEqual((0, notifications_1.buildTaskReminderParams)('Axit Mehta', 'File GST returns', '2026-08-31'), [
        'Axit',
        'File GST returns',
        '31-Aug-2026',
    ]);
    assert.deepEqual((0, notifications_1.buildTaskReminderParams)('Priya Sharma', 'Stock audit', undefined), [
        'Priya',
        'Stock audit',
        'Not set',
    ]);
});
(0, node_test_1.test)('member_onboarding has exactly one body variable: first name', () => {
    assert.deepEqual((0, notifications_1.buildOnboardingParams)('Axit Mehta'), ['Axit']);
    assert.deepEqual((0, notifications_1.buildOnboardingParams)('Priya'), ['Priya']);
});
(0, node_test_1.test)('both dynamic URL buttons have non-empty values (11za rejects empty)', () => {
    assert.ok(whatsappTemplates_1.WHATSAPP_BUTTON_VALUES.onboarding.length > 0);
    assert.ok(whatsappTemplates_1.WHATSAPP_BUTTON_VALUES.taskReminder.length > 0);
});
(0, node_test_1.test)('cooldown: zero when never reminded', () => {
    assert.equal((0, notifications_1.cooldownRemainingMs)(null, Date.now()), 0);
    assert.equal((0, notifications_1.cooldownRemainingMs)(undefined, Date.now()), 0);
    assert.equal((0, notifications_1.cooldownRemainingMs)(0, Date.now()), 0);
});
(0, node_test_1.test)('cooldown: full window right after a reminder', () => {
    const now = 1000000000000;
    assert.equal((0, notifications_1.cooldownRemainingMs)(now, now), notifications_1.REMINDER_COOLDOWN_MS);
});
(0, node_test_1.test)('cooldown: partial window mid-way', () => {
    const now = 1000000000000;
    const oneHourAgo = now - 60 * 60 * 1000;
    assert.equal((0, notifications_1.cooldownRemainingMs)(oneHourAgo, now), notifications_1.REMINDER_COOLDOWN_MS - 60 * 60 * 1000);
});
(0, node_test_1.test)('cooldown: expired exactly at and after the 4h boundary', () => {
    const now = 1000000000000;
    assert.equal((0, notifications_1.cooldownRemainingMs)(now - notifications_1.REMINDER_COOLDOWN_MS, now), 0);
    assert.equal((0, notifications_1.cooldownRemainingMs)(now - notifications_1.REMINDER_COOLDOWN_MS - 1, now), 0);
});
(0, node_test_1.test)('cooldown: one millisecond before the boundary still blocks', () => {
    const now = 1000000000000;
    assert.equal((0, notifications_1.cooldownRemainingMs)(now - notifications_1.REMINDER_COOLDOWN_MS + 1, now), 1);
});

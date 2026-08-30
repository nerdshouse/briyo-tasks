/*
 * Developed by Nerdshouse Technologies LLP — https://nerdshouse.com
 * © 2026 WhiteRock (Royal Enterprise). All rights reserved.
 *
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */

/**
 * Single source of truth for approved 11za WhatsApp template names + language.
 * Override any name via env without redeploying code changes.
 */
export const WHATSAPP_TEMPLATES = {
  onboarding: process.env.ELEVENZA_TEMPLATE_ONBOARDING || 'member_onboarding',
  taskReminder: process.env.ELEVENZA_TEMPLATE_TASK_REMINDER || 'task_reminder',
  language: 'en',
} as const;

/**
 * Both templates carry a dynamic URL button. 11za's sendTemplate takes the
 * dynamic part as a separate `buttonValue` field (verified against the live
 * API: omitting it or sending it empty returns "Invalid Button value").
 * The value is the path suffix appended to the base URL configured on the
 * template's button in 11za.
 */
export const WHATSAPP_BUTTON_VALUES = {
  /** member_onboarding "Open App" button */
  onboarding: process.env.ELEVENZA_BUTTON_ONBOARDING || 'my-tasks',
  /** task_reminder "See my pending tasks" button */
  taskReminder: process.env.ELEVENZA_BUTTON_TASK_REMINDER || 'my-tasks',
} as const;

"use strict";
/*
 * Developed by Nerdshouse Technologies LLP — https://nerdshouse.com
 * © 2026 WhiteRock (Royal Enterprise). All rights reserved.
 *
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.WHATSAPP_TEMPLATES = void 0;
/**
 * Single source of truth for approved 11za WhatsApp template names + language.
 * Override any name via env without redeploying code changes.
 */
exports.WHATSAPP_TEMPLATES = {
    onboarding: process.env.ELEVENZA_TEMPLATE_ONBOARDING || 'member_onboarding',
    taskReminder: process.env.ELEVENZA_TEMPLATE_TASK_REMINDER || 'task_reminder',
    language: 'en',
};

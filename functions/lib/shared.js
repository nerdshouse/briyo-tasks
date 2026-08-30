"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.COLLECTIONS = void 0;
exports.normalizePhone = normalizePhone;
exports.sanitizeOrigin = sanitizeOrigin;
exports.send11zaTemplate = send11zaTemplate;
exports.phoneVariants = phoneVariants;
exports.COLLECTIONS = {
    TASKS: 'tasks',
    USERS: 'tasks_users',
    RECURRING_TASKS: 'recurring_tasks',
    PASSWORD_RESET_OTPS: 'password_reset_otps',
    RATE_LIMITS: 'rate_limits',
};
/** Normalize phone to 11za format: country code + number, no + or spaces */
function normalizePhone(phone) {
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 10 && !digits.startsWith('0'))
        return '91' + digits;
    if (digits.startsWith('91') && digits.length === 12)
        return digits;
    return digits;
}
/** Sanitize origin website for API calls */
function sanitizeOrigin(origin) {
    return origin.replace(/[`"' ]/g, '').trim();
}
/** Call 11za sendTemplate API */
async function send11zaTemplate(phone, templateName, bodyParams, config) {
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone)
        return;
    const body = {
        sendto: normalizedPhone,
        authToken: config.authToken,
        originWebsite: sanitizeOrigin(config.originWebsite),
        language: 'en',
        templateName,
        data: bodyParams,
    };
    const res = await fetch(config.apiUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`11za API ${res.status}: ${text}`);
    }
}
/** Resolve the set of phone-number variants a stored `phone` field might match. */
function phoneVariants(phoneRaw) {
    const digits = phoneRaw.replace(/\D/g, '');
    const variants = new Set();
    if (digits.length === 10) {
        variants.add('+91' + digits);
        variants.add('91' + digits);
        variants.add(digits);
    }
    else if (digits.length === 12 && digits.startsWith('91')) {
        variants.add('+' + digits);
        variants.add(digits);
        variants.add(digits.slice(2));
    }
    else {
        variants.add(phoneRaw.trim());
        variants.add(digits);
    }
    return variants;
}

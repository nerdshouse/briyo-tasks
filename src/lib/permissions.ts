/*
 * Developed by Nerdshouse Technologies LLP — https://nerdshouse.com
 * © 2026 WhiteRock (Royal Enterprise). All rights reserved.
 *
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */
import { User, UserRole } from '../types';

/**
 * Central permission map for the three roles.
 *
 *  admin      — everything.
 *  sub_admin  — own/assigned-by task scope; can view + add/edit members
 *               (no delete); sees all absences; no company KPI, no deletes.
 *  user       — own/assigned-by task scope only; no members access;
 *               sees only their own absences; own KPI only.
 *
 * Task deletion and holiday management are admin-only. Verification stays
 * per-task: whoever is set as a task's verifier sees it in Approve.
 */
export const isAdmin = (u?: User | null): boolean => u?.role === UserRole.ADMIN;
export const isSubAdmin = (u?: User | null): boolean => u?.role === UserRole.SUB_ADMIN;

/** Company-wide task visibility (Task Table all rows, Overdue all, etc.). */
export const canSeeAllTasks = isAdmin;
/** Company-wide KPI table; everyone else gets their personal KPI. */
export const canSeeCompanyKpi = isAdmin;
/** Deleting tasks (and recurring streams) is admin-only. */
export const canDeleteTasks = isAdmin;
/** Members page access: view + add + edit. */
export const canManageMembers = (u?: User | null): boolean => isAdmin(u) || isSubAdmin(u);
/** Deleting members (and their tasks) is admin-only. */
export const canDeleteMembers = isAdmin;
/** Changing another member's role is admin-only. */
export const canChangeRoles = isAdmin;
/** Adding/removing company holidays. */
export const canManageHolidays = isAdmin;
/** Seeing everyone's absence records (users see only their own). */
export const canSeeAllAbsences = (u?: User | null): boolean => isAdmin(u) || isSubAdmin(u);
/** Admin-only oversight pages (Verification Pending, Audit Attachments, Help logs/MIS). */
export const canSeeOversight = isAdmin;

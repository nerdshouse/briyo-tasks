/*
 * Developed by Nerdshouse Technologies LLP — https://nerdshouse.com
 * © 2026 WhiteRock (Royal Enterprise). All rights reserved.
 *
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */
import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { UserRole } from '../types';
import { api } from '../services/api';
import {
  ClipboardList,
  AlertTriangle,
  BarChart3,
  Table2,
  ClipboardCheck,
  CheckCircle2,
  Settings,
  LogOut,
  Menu,
  X,
  Repeat,
  LifeBuoy,
} from 'lucide-react';

const roleLabels: Record<UserRole, string> = {
  [UserRole.OWNER]: 'Owner',
  [UserRole.MANAGER]: 'Manager',
  [UserRole.DOER]: 'Doer',
  [UserRole.AUDITOR]: 'Auditor',
  [UserRole.VERIFIER]: 'Verifier',
};

const NavItem = ({
  to,
  icon: Icon,
  label,
  badgeCount,
  secondBadgeCount,
  active,
  onClick,
}: {
  to: string;
  icon: any;
  label: string;
  badgeCount?: number;
  secondBadgeCount?: number;
  active: boolean;
  onClick?: () => void;
}) => (
  <Link
    to={to}
    onClick={onClick}
    className={`flex items-center gap-3 px-3 py-2 rounded-control text-sm font-medium transition-all duration-200 ${active
      ? 'bg-brand-600 text-white'
      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'
      }`}
  >
    <Icon size={18} className={active ? 'text-white' : 'text-slate-500'} />
    <span className="flex-1">{label}</span>
    {typeof badgeCount === 'number' && (
      <span
        className={`inline-flex min-w-5 h-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold ${active ? 'bg-white/15 text-white' : 'bg-brand-100 text-brand-800'
          }`}
      >
        {badgeCount > 99 ? '99+' : badgeCount}
      </span>
    )}
    {typeof secondBadgeCount === 'number' && (
      <span className="inline-flex min-w-5 h-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold bg-danger-100 text-danger-700">
        {secondBadgeCount > 99 ? '99+' : secondBadgeCount}
      </span>
    )}
  </Link>
);

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pendingApprovalCount, setPendingApprovalCount] = useState(0);
  const [overdueCount, setOverdueCount] = useState(0);
  const [helpPendingCount, setHelpPendingCount] = useState(0);
  const [totalOverdueCount, setTotalOverdueCount] = useState(0);
  const [myTasksCount, setMyTasksCount] = useState(0);
  const [allTasksCount, setAllTasksCount] = useState(0);
  const [totalVerificationPendingCount, setTotalVerificationPendingCount] = useState(0);
  const [assignedByMeCount, setAssignedByMeCount] = useState(0);

  if (!user) return <>{children}</>;

  useEffect(() => {
    if (!user?.id) {
      setPendingApprovalCount(0);
      setOverdueCount(0);
      setHelpPendingCount(0);
      setTotalOverdueCount(0);
      setAllTasksCount(0);
      setTotalVerificationPendingCount(0);
      setAssignedByMeCount(0);
      return;
    }

    let isMounted = true;

    const loadSidebarCounts = async () => {
      try {
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);
        const dueDateTo = yesterday.toISOString().split('T')[0];

        const isManagerOrOwner = user.role === UserRole.MANAGER || user.role === UserRole.OWNER;

        const openStatuses: any[] = ['pending', 'overdue', 'cancelled', 'pending_verification', 'correction_required'];

        const [approvalCount, overdueTasksCount, helpCount, allTasks, myTasksAll, ...rest] = await Promise.all([
          api.getTasksCount({
            status: 'pending_verification',
            verifierId: user.id,
          }),
          api.getTasksCount({
            assignedTo: user.id,
            statusIn: ['pending', 'overdue', 'pending_verification', 'correction_required'],
            dueDateTo,
          }),
          api.getHelpTicketsCount({
            helperId: user.id,
            statusIn: ['open', 'in_progress'],
          }),
          api.getTasksCount({
            statusIn: openStatuses,
          }),
          api.getTasksCount({
            assignedTo: user.id,
            statusIn: openStatuses,
          }),
          ...(isManagerOrOwner
            ? [
              api.getTasksCount({
                statusIn: ['pending', 'overdue', 'pending_verification', 'correction_required'],
                dueDateTo,
              }),
              api.getTasksCount({
                status: 'pending_verification',
              }),
            ]
            : [
              api.getTasksCount({
                assignedBy: user.id,
                statusIn: openStatuses,
              }),
            ]),
        ]);

        if (isMounted) {
          setPendingApprovalCount(approvalCount);
          setOverdueCount(overdueTasksCount);
          setHelpPendingCount(helpCount);
          setAllTasksCount(allTasks);
          setMyTasksCount(myTasksAll);
          if (isManagerOrOwner && rest.length >= 2) {
            setTotalOverdueCount(rest[0]);
            setTotalVerificationPendingCount(rest[1]);
          } else if (!isManagerOrOwner && rest.length >= 1) {
            setAssignedByMeCount(rest[0]);
          }
        }
      } catch (err) {
        console.error('Failed to load sidebar counts:', err);
      }
    };

    loadSidebarCounts();
    const intervalId = window.setInterval(loadSidebarCounts, 60000);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, [user?.id]);


  const isManagerOrOwnerRole = user.role === UserRole.MANAGER || user.role === UserRole.OWNER;
  const isAuditor = user.role === UserRole.AUDITOR;
  const isVerifier = user.role === UserRole.VERIFIER;
  const isManager = user.role === UserRole.MANAGER || user.role === UserRole.OWNER;
  const canAssign = [UserRole.OWNER, UserRole.MANAGER, UserRole.DOER].includes(user.role);

  type SectionType = 'Tasks' | 'Help' | 'Settings';
  type NavItemType = { to: string; icon: any; label: string; section: SectionType };

  const navItems: NavItemType[] = isAuditor
    ? [
      { to: '/tasks', icon: Table2, label: 'Audit Tasks', section: 'Tasks' },
      { to: '/completed-tasks', icon: CheckCircle2, label: 'Completed Tasks', section: 'Tasks' },
      { to: '/approve', icon: ClipboardCheck, label: 'Approve Task', section: 'Tasks' },
      { to: '/help', icon: LifeBuoy, label: 'Helper Dashboard', section: 'Help' },
      { to: '/settings', icon: Settings, label: 'Settings', section: 'Settings' },
    ]
    : isVerifier
      ? [
        { to: '/completed-tasks', icon: CheckCircle2, label: 'Completed Tasks', section: 'Tasks' },
        { to: '/approve', icon: ClipboardCheck, label: 'Approve Task', section: 'Tasks' },
        { to: '/help', icon: LifeBuoy, label: 'Helper Dashboard', section: 'Help' },
        { to: '/settings', icon: Settings, label: 'Settings', section: 'Settings' },
      ]
      : [
        ...(isManager ? [{ to: '/my-tasks', icon: ClipboardList, label: 'My Tasks', section: 'Tasks' as const }] : []),
        ...(canAssign ? [{ to: '/assign', icon: ClipboardList, label: 'Assign Task', section: 'Tasks' as const }] : []),
        { to: '/approve', icon: ClipboardCheck, label: 'Approve Task', section: 'Tasks' as const },
        ...(isManagerOrOwnerRole ? [{ to: '/verifier-pending', icon: ClipboardCheck, label: 'Verification Pending', section: 'Tasks' as const }] : []),
        { to: '/tasks', icon: Table2, label: 'Task Table', section: 'Tasks' as const },
        { to: '/redzone', icon: AlertTriangle, label: 'Overdue', section: 'Tasks' as const },
        ...(user.role === UserRole.DOER ? [{ to: '/assigned-by-me', icon: ClipboardList, label: 'Assigned By Me', section: 'Tasks' as const }] : []),
        { to: '/recurring-tasks', icon: Repeat, label: 'Recurring Tasks', section: 'Tasks' as const },
        { to: '/completed-tasks', icon: CheckCircle2, label: 'Completed Tasks', section: 'Tasks' as const },
        { to: '/kpi', icon: BarChart3, label: 'KPI', section: 'Tasks' as const },
        { to: '/help', icon: LifeBuoy, label: 'Helper Dashboard', section: 'Help' as const },
        { to: '/settings', icon: Settings, label: 'Settings', section: 'Settings' as const },
      ];

  const badgeFor = (item: NavItemType): number | undefined =>
    item.to === '/approve'
      ? pendingApprovalCount
      : item.to === '/verifier-pending'
        ? totalVerificationPendingCount
        : item.to === '/redzone'
          ? overdueCount
          : item.to === '/tasks' && isManagerOrOwnerRole
            ? allTasksCount
            : item.to === '/assigned-by-me'
              ? assignedByMeCount
              : item.to === '/help'
                ? helpPendingCount
                : item.to === '/my-tasks'
                  ? myTasksCount
                  : undefined;

  const secondBadgeFor = (item: NavItemType): number | undefined =>
    item.to === '/redzone' && isManagerOrOwnerRole ? totalOverdueCount : undefined;

  const SidebarContent = ({ onNavigate }: { onNavigate?: () => void }) => (
    <>
      <nav className="flex-1 min-h-0 px-4 py-2 overflow-y-auto">
        {(['Tasks', 'Help', 'Settings'] as SectionType[]).map((sectionName) => {
          const items = navItems.filter((i) => i.section === sectionName);
          if (items.length === 0) return null;
          return (
            <div key={sectionName} className="mb-2">
              <h2 className="px-3 mb-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-widest">{sectionName}</h2>
              <div className="space-y-0.5">
                {items.map((item) => (
                  <NavItem
                    key={item.to}
                    to={item.to}
                    icon={item.icon}
                    label={item.label}
                    badgeCount={badgeFor(item)}
                    secondBadgeCount={secondBadgeFor(item)}
                    active={location.pathname === item.to}
                    onClick={onNavigate}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </nav>
      <div className="px-3 py-2 border-t border-slate-100">
        <div className="my-2 flex items-center gap-2.5 px-1">
          <div className="w-8 h-8 rounded-control bg-brand-100 flex items-center justify-center text-brand-700 font-semibold text-sm">
            {user.name.charAt(0)}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-800 truncate">{user.name}</p>
            <p className="text-xs text-slate-500">{roleLabels[user.role]}</p>
          </div>
        </div>
        <button
          onClick={() => {
            logout();
            onNavigate?.();
          }}
          className="flex items-center gap-3 px-3 py-2 w-full text-slate-600 hover:text-danger-600 hover:bg-danger-50 rounded-control transition-colors text-sm font-medium"
        >
          <LogOut size={18} />
          <span>Log out</span>
        </button>
      </div>
    </>
  );

  const pathTitles: Record<string, string> = {
    '/': 'Dashboard',
    '/tasks': 'Task Table',
    '/recurring-tasks': 'Recurring Tasks',
    '/assign': 'Assign Task',
    '/removal': 'Removal Request',
    '/redzone': 'Overdue',
    '/reports': 'Reports',
    '/my-tasks': 'My Tasks',
    '/assigned-by-me': 'Assigned By Me',
    '/members': 'Members',
    '/completed-tasks': 'Completed & Closed Tasks',
    '/approve': 'Approve Task',
    '/kpi': 'KPI',
    '/help': 'Helper Dashboard',
    '/help/new': 'Create Help Ticket',
    '/help/logs': 'Help Logs',
    '/help/kpi': 'Help KPI',
    '/bogus-attachment': 'Audit Attachments',
    '/settings': 'Settings',
    '/verifier-pending': 'Verification Pending',
  };
  const pageTitle = isAuditor && location.pathname === '/tasks'
    ? 'Audit Tasks'
    : (pathTitles[location.pathname] || 'Dashboard');

  return (
    <div className="min-h-screen md:h-screen md:overflow-hidden bg-slate-50 flex flex-col md:flex-row">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:h-screen shrink-0 flex-col w-64 bg-white border-r border-slate-200">
        <div className="flex h-20 items-center justify-center border-b border-slate-100 px-6">
          <span className="text-2xl font-extrabold tracking-tight text-brand-600">BRIYO</span>
        </div>
        <SidebarContent />
      </aside>

      {/* Mobile header */}
      <div className="md:hidden bg-white border-b border-slate-200 px-4 py-3 flex justify-between items-center sticky top-0 z-30 shadow-sm">
        <span className="text-lg font-extrabold tracking-tight text-brand-600">BRIYO</span>
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="p-2 rounded-control hover:bg-slate-100 text-slate-600"
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile drawer */}
      <div
        className={`fixed inset-0 z-50 md:hidden ${mobileOpen ? '' : 'pointer-events-none'}`}
        aria-hidden={!mobileOpen}
      >
        <div
          className={`absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity duration-200 ${mobileOpen ? 'opacity-100' : 'opacity-0'}`}
          onClick={() => setMobileOpen(false)}
        />
        <div
          className={`absolute left-0 top-0 bottom-0 w-72 bg-white shadow-xl flex flex-col transition-transform duration-200 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
        >
          <div className="flex justify-between items-center px-4 py-3 border-b border-slate-100">
            <span className="text-lg font-extrabold tracking-tight text-brand-600">BRIYO</span>
            <button onClick={() => setMobileOpen(false)} className="p-2 rounded-control hover:bg-slate-100">
              <X size={20} />
            </button>
          </div>
          <SidebarContent onNavigate={() => setMobileOpen(false)} />
        </div>
      </div>

      {/* Main content */}
      <main className="flex-1 min-h-screen md:min-h-0 md:h-screen md:overflow-y-auto bg-slate-50">
        <div className={`w-full ${location.pathname.startsWith('/help') ? 'max-w-none' : 'max-w-450 mx-auto'} p-4 sm:p-6 lg:p-8`}>
          <h1 className="text-2xl font-semibold text-slate-900 tracking-tight mb-6">{pageTitle}</h1>
          {children}
        </div>
      </main>
    </div>
  );
}

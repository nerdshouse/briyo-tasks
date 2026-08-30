/*
 * Developed by Nerdshouse Technologies LLP — https://nerdshouse.com
 * © 2026 WhiteRock (Royal Enterprise). All rights reserved.
 *
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import { Task, UserRole, User, Holiday } from '../types';
import { useLocation, useSearchParams } from 'react-router-dom';

import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Select } from '../components/ui/Select';
import { DateInput } from '../components/ui/DateInput';
import { StatusBadge } from '../components/ui/StatusBadge';
import { TableSkeleton } from '../components/ui/Skeleton';
import { EmptyState } from '../components/ui/EmptyState';
import { FilterBar } from '../components/ui/FilterBar';
import { TaskCard, TaskCardMeta } from '../components/TaskCard';
import { CsvExportButton } from '../components/ui/CsvExportButton';
import { SearchableUserSelect } from '../components/ui/SearchableUserSelect';
import { CompleteTaskModal } from '../components/ui/CompleteTaskModal';
import { AttachmentViewerModal } from '../components/ui/AttachmentViewerModal';
import { AuditSopModal } from '../components/ui/AuditSopModal';
import { exportRowsToCsv, type CsvColumn } from '../lib/csv';
import { isHoliday, formatDateDDMMYYYY, getDisplayRecurring, formatRecurringLabel } from '../lib/utils';
import { getTodayIST } from '../lib/dates';
import {
  ExternalLink,

  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,

  Table2,
  FileText,
} from 'lucide-react';
import type { QueryDocumentSnapshot } from 'firebase/firestore';

const ROWS_PER_PAGE_OPTIONS = [50, 100, 500, 1000] as const;
type TaskSortKey = 'start_date' | 'due_date';

const DAYS = [
  { value: 0, label: 'Mon' },
  { value: 1, label: 'Tue' },
  { value: 2, label: 'Wed' },
  { value: 3, label: 'Thu' },
  { value: 4, label: 'Fri' },
  { value: 5, label: 'Sat' },
  { value: 6, label: 'Sun' },
];

export const TaskTable: React.FC = () => {
  const { user } = useAuth();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const highlightId = searchParams.get('highlight');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot | null>(null);
  const [pageCursors, setPageCursors] = useState<(QueryDocumentSnapshot | null)[]>([null]);
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState<number>(ROWS_PER_PAGE_OPTIONS[0]);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [totalResults, setTotalResults] = useState(0);
  const [midnightRefreshKey, setMidnightRefreshKey] = useState(0);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState('all_time');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [assignedToFilter, setAssignedToFilter] = useState('');
  const [assignedByFilter, setAssignedByFilter] = useState('');





  const [statusFilter, setStatusFilter] = useState('');

  const [recurringFilter, setRecurringFilter] = useState('');
  const [completeTask, setCompleteTask] = useState<Task | null>(null);
  const [completing, setCompleting] = useState(false);
  const [viewAttachment, setViewAttachment] = useState<{ urls: string[]; text?: string } | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: TaskSortKey; direction: 'asc' | 'desc' } | null>(null);
  const [taskSummary, setTaskSummary] = useState({ dueToday: 0, overdue: 0 });
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [selectedAuditTask, setSelectedAuditTask] = useState<Task | null>(null);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [nameFilteredRows, setNameFilteredRows] = useState<Task[] | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [rejectTask, setRejectTask] = useState<Task | null>(null);
  const [rejectComment, setRejectComment] = useState('');
  const [recurringTaskLookup, setRecurringTaskLookup] = useState<Map<string, Task>>(new Map());
  const defaultAssignedToApplied = useRef(false);

  // Edit State
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editStartDate, setEditStartDate] = useState('');
  const [editAssignedToId, setEditAssignedToId] = useState('');
  const [editDueDate, setEditDueDate] = useState('');
  const [editRecurring, setEditRecurring] = useState<Task['recurring']>('none');
  const [editRecurringDays, setEditRecurringDays] = useState<number[]>([]);
  const [editAttachmentRequired, setEditAttachmentRequired] = useState(false);
  const [editAttachmentType, setEditAttachmentType] = useState<'media' | 'text'>('media');
  const [editAttachmentDescription, setEditAttachmentDescription] = useState('');
  const [editVerificationRequired, setEditVerificationRequired] = useState(false);
  const [editVerifierId, setEditVerifierId] = useState('');
  const [editError, setEditError] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);

  const isAuditor = false;
  const isManager = user?.role === UserRole.ADMIN;
  const isDoer = user?.role !== UserRole.ADMIN;
  const isVerifier = false;
  const isMyTasksRoute = location.pathname === '/my-tasks';
  const isManagerMyTasksView = isManager && isMyTasksRoute;
  const isSelfTasksView = isDoer || (isManager && isMyTasksRoute);

    // Removed: is_recurring_master logic is no longer relevant as masters are not in the TASKS collection

  const hydrateRecurringLookup = useCallback(async (rows: Task[]) => {
    let currentMap: Map<string, Task> = new Map();
    setRecurringTaskLookup((prev) => { currentMap = prev; return prev; });

    const lookup = new Map(currentMap);
    let changed = false;

    rows.forEach((task) => {
      if (!lookup.has(task.id)) {
        lookup.set(task.id, task);
        changed = true;
      }
    });

    const parentIds = Array.from(
      new Set(
        rows
          .map((task) => task.parent_task_id)
          .filter((parentId): parentId is string => Boolean(parentId))
      )
    );

    const missingParentIds = parentIds.filter((parentId) => !lookup.has(parentId) && lookup.get(parentId) !== null);

    if (missingParentIds.length > 0) {
      const parents = await Promise.all(missingParentIds.map((parentId) => api.getTaskById(parentId)));
      parents.forEach((parent, idx) => {
        if (parent) {
          lookup.set(parent.id, parent);
        } else {
          lookup.set(missingParentIds[idx], null as unknown as Task);
        }
      });
      changed = true;
    }

    if (changed) {
      setRecurringTaskLookup(lookup);
    }
    return lookup;
  }, []);

  const taskById = useMemo(() => {
    const merged = new Map<string, Task>();
    recurringTaskLookup.forEach((task, id) => merged.set(id, task));
    tasks.forEach((task) => merged.set(task.id, task));
    return merged;
  }, [recurringTaskLookup, tasks]);

  const resolveDoerDateRange = useCallback((): { dueDateFrom?: string; dueDateTo?: string } => {
    if (dateFilter === 'all_time') return {};

    const today = new Date();
    const getFormattedDate = (d: Date) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    if (dateFilter === 'today') {
      const day = getFormattedDate(today);
      return { dueDateFrom: day, dueDateTo: day };
    }
    if (dateFilter === 'yesterday') {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      const day = getFormattedDate(y);
      return { dueDateFrom: day, dueDateTo: day };
    }
    if (dateFilter === 'last_7_days') {
      const past = new Date(today);
      past.setDate(past.getDate() - 7);
      return { dueDateFrom: getFormattedDate(past), dueDateTo: getFormattedDate(today) };
    }
    if (dateFilter === 'last_30_days') {
      const past = new Date(today);
      past.setDate(past.getDate() - 30);
      return { dueDateFrom: getFormattedDate(past), dueDateTo: getFormattedDate(today) };
    }
    if (dateFilter === 'custom') {
      return { dueDateFrom: customStart || undefined, dueDateTo: customEnd || undefined };
    }
    return {};
  }, [dateFilter, customStart, customEnd]);

  const getActiveFilters = useCallback(() => {
    const filters: {
      assignedTo?: string;
      assignedBy?: string;
      status?: Task['status'];
      statusIn?: Task['status'][];
      recurring?: string;
      dueDateFrom?: string;
      dueDateTo?: string;
      verifierId?: string;
    } = {};
    const openStatuses: Task['status'][] = [
      'pending',
      'overdue',
      'cancelled',
      'pending_verification',
      'correction_required',
    ];

    if (isSelfTasksView) {
      filters.assignedTo = user?.id ?? '';
    } else if (assignedToFilter) {
      filters.assignedTo = assignedToFilter;
    }
    
    if (assignedByFilter) {
      filters.assignedBy = assignedByFilter;
    }
    if (isAuditor) {
      filters.status = 'completed';
    }
    if (isVerifier) {
      filters.verifierId = user?.id ?? '';
      filters.status = 'pending_verification';
    }

    if (!isAuditor && !isVerifier) {
      if (statusFilter === 'overdue') {
        filters.statusIn = ['pending', 'overdue', 'pending_verification', 'correction_required'];
      } else if (statusFilter) {
        filters.status = statusFilter as Task['status'];
      } else {
        filters.statusIn = openStatuses;
      }
    }

    const range = resolveDoerDateRange();
    if (range.dueDateFrom) filters.dueDateFrom = range.dueDateFrom;

    if (statusFilter === 'overdue') {
      const today = new Date();
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      const year = y.getFullYear();
      const month = String(y.getMonth() + 1).padStart(2, '0');
      const day = String(y.getDate()).padStart(2, '0');
      const yesterday = `${year}-${month}-${day}`;

      if (range.dueDateTo && range.dueDateTo < yesterday) {
        filters.dueDateTo = range.dueDateTo;
      } else {
        filters.dueDateTo = yesterday;
      }
    } else if (range.dueDateTo) {
      filters.dueDateTo = range.dueDateTo;
    }

    return filters;
  }, [user?.id, isSelfTasksView, isAuditor, isVerifier, recurringFilter, resolveDoerDateRange, statusFilter, dateFilter, assignedToFilter, assignedByFilter]);

  const getDoerBaseFilters = useCallback(() => {
    const filters: {
      status?: Task['status'];
      statusIn?: Task['status'][];
      dueDateFrom?: string;
      dueDateTo?: string;
    } = {};

    const openStatuses: Task['status'][] = [
      'pending',
      'overdue',
      'cancelled',
      'pending_verification',
      'correction_required',
    ];

    if (statusFilter === 'overdue') {
      filters.statusIn = ['pending', 'overdue', 'pending_verification', 'correction_required'];
    } else if (statusFilter) {
      filters.status = statusFilter as Task['status'];
    } else {
      filters.statusIn = openStatuses;
    }

    const range = resolveDoerDateRange();
    if (range.dueDateFrom) filters.dueDateFrom = range.dueDateFrom;

    if (statusFilter === 'overdue') {
      const today = new Date();
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      const year = y.getFullYear();
      const month = String(y.getMonth() + 1).padStart(2, '0');
      const day = String(y.getDate()).padStart(2, '0');
      const yesterday = `${year}-${month}-${day}`;

      if (range.dueDateTo && range.dueDateTo < yesterday) {
        filters.dueDateTo = range.dueDateTo;
      } else {
        filters.dueDateTo = yesterday;
      }
    } else if (range.dueDateTo) {
      filters.dueDateTo = range.dueDateTo;
    }

    return filters;
  }, [resolveDoerDateRange, statusFilter, dateFilter]);

  const sortRowsByConfig = useCallback(
    (rows: Task[]) => {
      if (!sortConfig) return rows;
      return [...rows].sort((a, b) => {
        const aValue = (a[sortConfig.key] || '') as string;
        const bValue = (b[sortConfig.key] || '') as string;

        if (aValue === bValue) return 0;
        if (!aValue) return 1;
        if (!bValue) return -1;

        if (sortConfig.direction === 'asc') {
          return aValue < bValue ? -1 : 1;
        }
        return aValue > bValue ? -1 : 1;
      });
    },
    [sortConfig]
  );

  const getDoerVisibleRows = useCallback(async (): Promise<Task[]> => {
    if (!user?.id) return [];

    const baseFilters = getDoerBaseFilters();
    const assignedToRows = await api.getAllTasksByFilters({
      assignedTo: user.id,
      sortBy: sortConfig?.key,
      sortDirection: sortConfig?.direction,
      ...baseFilters,
    });
    // In owner/manager My Tasks, show only tasks assigned to the logged-in user.
    if (isManagerMyTasksView) {
      return sortRowsByConfig(assignedToRows);
    }

    const assignedByRows = await api.getAllTasksByFilters({
      assignedBy: user.id,
      sortBy: sortConfig?.key,
      sortDirection: sortConfig?.direction,
      ...baseFilters,
    });
    const mergedById = new Map<string, Task>();
    [...assignedToRows, ...assignedByRows].forEach((task) => {
      mergedById.set(task.id, task);
    });

    return sortRowsByConfig(Array.from(mergedById.values()));
  }, [getDoerBaseFilters, isManagerMyTasksView, sortConfig, sortRowsByConfig, user?.id]);

  const applyNameFilters = useCallback(
    (list: Task[]) => {
      return list.filter((task) => {
        if (assignedToFilter && task.assigned_to_id !== assignedToFilter) return false;
        if (assignedByFilter && task.assigned_by_id !== assignedByFilter) return false;
        return true;
      });
    },
    [assignedByFilter, assignedToFilter]
  );

  const isStartDateSort = sortConfig?.key === 'start_date';

  const formatDateValue = useCallback((value?: string, opts?: { includeTime?: boolean; emptyValue?: string }) => {
    const { includeTime = false, emptyValue = '' } = opts || {};
    return formatDateDDMMYYYY(value, { includeTime, emptyValue });
  }, []);

  const loadPage = useCallback(
    async (startAfterDoc: QueryDocumentSnapshot | null | undefined, pageNumber: number) => {
      try {
        const filters = getActiveFilters();
        const { tasks: nextTasks, lastDoc: nextLastDoc } = await api.getTasksPaginated({
          pageSize: rowsPerPage,
          startAfterDoc: startAfterDoc ?? undefined,
          sortBy: sortConfig?.key,
          sortDirection: sortConfig?.direction,
          ...filters,
        });
        await hydrateRecurringLookup(nextTasks);
        setTasks(nextTasks);
        setLastDoc(nextLastDoc);
        setCurrentPage(pageNumber);
        setHasNextPage(nextLastDoc != null);
      } catch (err) {
        console.error('Failed to load tasks:', err);
        setTasks([]);
        setLastDoc(null);
        setCurrentPage(pageNumber);
        setHasNextPage(false);
      } finally {
        setLoading(false);
      }
    },
    [getActiveFilters, hydrateRecurringLookup, rowsPerPage, sortConfig]
  );

  const setClientPageFromRows = useCallback(
    (rows: Task[], pageNumber: number) => {
      const clientTotalPages = Math.max(1, Math.ceil(rows.length / rowsPerPage));
      const safePage = Math.min(Math.max(pageNumber, 1), clientTotalPages);
      const startIndex = (safePage - 1) * rowsPerPage;
      const pagedRows = rows.slice(startIndex, startIndex + rowsPerPage);

      setTasks(pagedRows);
      setCurrentPage(safePage);
      setLastDoc(null);
      setHasNextPage(safePage < clientTotalPages);
    },
    [rowsPerPage]
  );

  useEffect(() => {
    api.getHolidays().then(setHolidays).catch(console.error);
  }, []);

  useEffect(() => {
    let isActive = true;

    const load = async () => {
      setCurrentPage(1);
      setPageCursors([null]);
      const filters = getActiveFilters();

      if (isSelfTasksView) {
        setLoading(true);
        try {
          const doerRows = await getDoerVisibleRows();
          if (!isActive) return;

          const lookup = await hydrateRecurringLookup(doerRows);
          const recurringRows = recurringFilter
            ? doerRows.filter((task) => getDisplayRecurring(task, lookup) === recurringFilter)
            : doerRows;
          const filteredRows = applyNameFilters(recurringRows);
          setNameFilteredRows(filteredRows);
          setTotalResults(filteredRows.length);
          setClientPageFromRows(filteredRows, 1);
        } catch (err) {
          if (!isActive) return;
          console.error('Failed to load tasks:', err);
          setTasks([]);
          setTotalResults(0);
          setLastDoc(null);
          setHasNextPage(false);
        } finally {
          if (isActive) setLoading(false);
        }
        return;
      }

      if (recurringFilter || isStartDateSort) {
        try {
          const allRows = await api.getAllTasksByFilters({
            sortBy: sortConfig?.key,
            sortDirection: sortConfig?.direction,
            ...filters,
          });
          if (!isActive) return;

          const lookup = await hydrateRecurringLookup(allRows);
          const recurringRows = recurringFilter
            ? allRows.filter((task) => getDisplayRecurring(task, lookup) === recurringFilter)
            : allRows;
          const filteredRows = applyNameFilters(recurringRows);
          setNameFilteredRows(filteredRows);
          setTotalResults(filteredRows.length);
          setClientPageFromRows(filteredRows, 1);
          setLoading(false);
        } catch (err) {
          if (!isActive) return;
          console.error('Failed to load tasks:', err);
          setTasks([]);
          setTotalResults(0);
          setLastDoc(null);
          setHasNextPage(false);
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      try {
        if (!isActive) return;
        setNameFilteredRows(null);
        const count = await api.getTasksCount(filters);
        if (!isActive) return;
        setTotalResults(count);
        await loadPage(undefined, 1);
      } catch (err) {
        if (!isActive) return;
        console.error('Failed to load tasks:', err);
        setTasks([]);
        setTotalResults(0);
        setLastDoc(null);
        setHasNextPage(false);
      } finally {
        if (isActive) setLoading(false);
      }
    };
    load();

    return () => {
      isActive = false;
    };
  }, [
    recurringFilter,
    applyNameFilters,
    getActiveFilters,
    getDoerVisibleRows,
    isSelfTasksView,
    loadPage,
    midnightRefreshKey,
    refreshToken,
    setClientPageFromRows,
    sortConfig,
  ]);

  useEffect(() => {
    if (isSelfTasksView && !sortConfig) {
      setSortConfig({ key: 'due_date', direction: 'asc' });
    }
  }, [isSelfTasksView, sortConfig]);

  useEffect(() => {
    const now = new Date();
    const istNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const istTomorrow = new Date(istNow);
    istTomorrow.setDate(istTomorrow.getDate() + 1);
    istTomorrow.setHours(0, 0, 5, 0);
    const msUntilMidnight = istTomorrow.getTime() - istNow.getTime();
    const timer = setTimeout(() => setMidnightRefreshKey((k) => k + 1), msUntilMidnight);
    return () => clearTimeout(timer);
  }, [midnightRefreshKey]);

  // 1. Calculate Summary for Client-Side Views (My Tasks) instantly without fetching
  useEffect(() => {
    if (!isSelfTasksView || !nameFilteredRows) return;
    
    const today = getTodayIST();
    let dueToday = 0;
    let overdue = 0;
    
    nameFilteredRows.forEach(t => {
      if (t.status === 'completed' || t.status === 'cancelled' || t.status === 'closed_permanently') return;
      if (t.due_date === today) dueToday++;
      else if (t.due_date && t.due_date < today) overdue++;
    });
    
    setTaskSummary({ dueToday, overdue });
  }, [nameFilteredRows, isSelfTasksView]);

  // 2. Fetch Global Summary for Server-Side Views (Main Table) natively
  useEffect(() => {
    if (isAuditor || isVerifier || isSelfTasksView) return;
    let isMounted = true;

    const loadSummary = async () => {
      setSummaryLoading(true);
      try {
        const filters = getActiveFilters();
        const counts = await api.getTaskSummaryCounts(filters);
        
        if (isMounted) setTaskSummary(counts);
      } catch (err) {
        console.error('Failed to load task summary:', err);
        if (isMounted) setTaskSummary({ dueToday: 0, overdue: 0 });
      } finally {
        if (isMounted) setSummaryLoading(false);
      }
    };

    loadSummary();

    return () => {
      isMounted = false;
    };
  }, [getActiveFilters, isAuditor, isSelfTasksView, isVerifier]);

  const filteredTasks = applyNameFilters(tasks);

  const sortedTasks = [...filteredTasks].sort((a, b) => {
    if (!sortConfig) return 0;
    const aValue = (a[sortConfig.key] || '') as string;
    const bValue = (b[sortConfig.key] || '') as string;

    if (aValue === bValue) return 0;
    if (!aValue) return 1;
    if (!bValue) return -1;

    if (sortConfig.direction === 'asc') {
      return aValue < bValue ? -1 : 1;
    }
    return aValue > bValue ? -1 : 1;
  });

  const isClientMode = isSelfTasksView || isStartDateSort;

  const effectiveTotalResults = isClientMode
    ? (nameFilteredRows?.length ?? 0)
    : totalResults;
  const totalPages = Math.max(1, Math.ceil(effectiveTotalResults / rowsPerPage));

  const toggleDateSort = (key: TaskSortKey) => {
    setSortConfig((prev) => {
      if (!prev || prev.key !== key) return { key, direction: 'asc' };
      return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
    });
  };

  const renderSortIcon = (key: TaskSortKey) => {
    if (sortConfig?.key !== key) return <ArrowUpDown size={14} className="text-slate-400" />;
    return sortConfig.direction === 'asc' ? (
      <ArrowUp size={14} className="text-brand-600" />
    ) : (
      <ArrowDown size={14} className="text-brand-600" />
    );
  };

  const handleExportCsv = async () => {
    if (!isManager || isSelfTasksView || exportingCsv) return;

    setExportingCsv(true);
    try {
      const filters = getActiveFilters();
      const exportRows = await api.getAllTasksByFilters({
        sortBy: sortConfig?.key,
        sortDirection: sortConfig?.direction,
        ...filters,
      });
      const exportRowsByName = applyNameFilters(exportRows);
      const exportLookup = await hydrateRecurringLookup(exportRowsByName);
      const exportRecurringRows = recurringFilter
        ? exportRowsByName.filter((task) => getDisplayRecurring(task, exportLookup) === recurringFilter)
        : exportRowsByName;

      const columns: CsvColumn<Task>[] = [
        { header: 'Title', accessor: (t) => t.title },
        { header: 'Description', accessor: (t) => t.description || '' },
        { header: 'Assigned To', accessor: (t) => t.assigned_to_name || '' },
        { header: 'Assigned To Department', accessor: (t) => t.assigned_to_department || '' },
        { header: 'Assigned By', accessor: (t) => t.assigned_by_name || '' },
        { header: 'Start Date', accessor: (t) => formatDateValue(t.start_date, { emptyValue: '###' }) },
        { header: 'Due Date', accessor: (t) => formatDateValue(t.due_date, { emptyValue: '###' }) },
        { header: 'Recurring', accessor: (t) => formatRecurringLabel(getDisplayRecurring(t, exportLookup), 'None') },
        { header: 'Status', accessor: (t) => t.status || '' },
        { header: 'Verification Required', accessor: (t) => (t.verification_required ? 'Yes' : 'No') },
        { header: 'Verifier Name', accessor: (t) => t.verifier_name || '' },
        { header: 'Attachment Required', accessor: (t) => (t.attachment_required ? 'Yes' : 'No') },
        { header: 'Attachment Type', accessor: (t) => t.attachment_type || '' },
        {
          header: 'Attachment Content',
          accessor: (t) => {
            const urls = t.attachment_urls || (t.attachment_url ? [t.attachment_url] : []);
            const urlString = urls.length > 0 ? `URLs: ${urls.join(', ')}` : '';
            if (t.attachment_text && urlString) {
              return `Text: ${t.attachment_text} | ${urlString}`;
            }
            return t.attachment_text || urlString || '';
          },
        },
        { header: 'Completed At', accessor: (t) => formatDateValue(t.completed_at, { includeTime: false }) },
        { header: 'Created At', accessor: (t) => formatDateValue(t.created_at, { includeTime: false }) },
        { header: 'Updated At', accessor: (t) => formatDateValue(t.updated_at, { includeTime: false }) },
      ];

      const now = new Date();
      const datePart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
        now.getDate()
      ).padStart(2, '0')}`;
      exportRowsToCsv({
        rows: exportRecurringRows,
        columns,
        fileName: `Task-table-${datePart}.csv`,
      });
    } catch (err) {
      console.error('Failed to export CSV:', err);
    } finally {
      setExportingCsv(false);
    }
  };

  const [allUsers, setAllUsers] = useState<User[]>([]);

  useEffect(() => {
    api.getUsers().then(setAllUsers).catch(console.error);
  }, []);

  useEffect(() => {
    if (!defaultAssignedToApplied.current && user?.id && isSelfTasksView && !assignedToFilter) {
      setAssignedToFilter(user.id);
      defaultAssignedToApplied.current = true;
    }
  }, [assignedToFilter, isSelfTasksView, user?.id]);

  const handleCompleteClick = (t: Task) => {
    setCompleteTask(t);
  };

  const handleComplete = async (
    t: Task,
    url?: string,
    text?: string,
    remark?: string,
    opts?: { closePermanently?: boolean; attachment_urls?: string[] }
  ) => {
    if (!user) return;
    if (completing) return;
    const closePermanently = opts?.closePermanently === true;
    if (!closePermanently && remark !== undefined) {
      remark = remark.trim();
    }

    setCompleting(true);
    try {
      const baseUpdates: Partial<Task> = {
        ...(url && { attachment_url: url }),
        ...(opts?.attachment_urls && { attachment_urls: opts.attachment_urls }),
        ...(text && { attachment_text: text }),
        ...(!closePermanently && { doer_remark: remark?.trim() }),
      };

      if (closePermanently && t.recurring !== 'none') {
        await api.updateTask(t.id, {
          ...baseUpdates,
          status: 'closed_permanently',
        });
      } else if (t.verification_required) {
        await api.updateTask(t.id, {
          ...baseUpdates,
          status: 'pending_verification',
        });
      } else {
        const completedAt = new Date().toISOString();
        await api.updateTask(t.id, {
          ...baseUpdates,
          status: 'completed',
          completed_at: completedAt,
        });
      }
      if (isSelfTasksView) {
        setRefreshToken((prev) => prev + 1);
      } else {
        setLoading(true);
        await loadPage(pageCursors[currentPage - 1] ?? null, currentPage);
      }
      setCompleteTask(null);
    } catch (err) {
      console.error(err);
    } finally {
      setCompleting(false);
    }
  };

  const closeCompleteModal = () => {
    setCompleteTask(null);
  };


  const handleNextPage = () => {
    if (isClientMode) {
      if (loading || currentPage >= totalPages || !nameFilteredRows) return;
      setClientPageFromRows(nameFilteredRows, currentPage + 1);
      return;
    }
    if (!lastDoc || !hasNextPage || loading) return;
    setPageCursors((prev) => {
      const next = [...prev];
      next[currentPage] = lastDoc;
      return next;
    });
    setLoading(true);
    loadPage(lastDoc, currentPage + 1);
  };

  const handlePreviousPage = () => {
    if (isClientMode) {
      if (currentPage <= 1 || loading || !nameFilteredRows) return;
      setClientPageFromRows(nameFilteredRows, currentPage - 1);
      return;
    }
    if (currentPage <= 1 || loading) return;
    const previousCursor = pageCursors[currentPage - 2] ?? null;
    setLoading(true);
    loadPage(previousCursor, currentPage - 1);
  };

  const handleRowsPerPageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextRowsPerPage = Number(e.target.value);
    setRowsPerPage(nextRowsPerPage);
    setCurrentPage(1);
  };

  const handleFirstPage = () => {
    if (isClientMode) {
      if (currentPage <= 1 || loading || !nameFilteredRows) return;
      setClientPageFromRows(nameFilteredRows, 1);
      return;
    }
    if (currentPage <= 1 || loading) return;
    setLoading(true);
    loadPage(null, 1);
  };

  const handleLastPage = async () => {
    if (isClientMode) {
      if (loading || currentPage >= totalPages || !nameFilteredRows) return;
      setClientPageFromRows(nameFilteredRows, totalPages);
      return;
    }
    if (loading || currentPage >= totalPages) return;

    let cursor = lastDoc;
    let targetPage = currentPage;
    setLoading(true);

    try {
      while (targetPage < totalPages && cursor != null) {
        const filters = getActiveFilters();
        const { tasks: nextTasks, lastDoc: nextLastDoc } = await api.getTasksPaginated({
          pageSize: rowsPerPage,
          startAfterDoc: cursor,
          sortBy: sortConfig?.key,
          sortDirection: sortConfig?.direction,
          ...filters,
        });
        targetPage += 1;
        setPageCursors((prev) => {
          const next = [...prev];
          next[targetPage - 1] = cursor;
          return next;
        });
        setTasks(nextTasks);
        setLastDoc(nextLastDoc);
        setCurrentPage(targetPage);
        setHasNextPage(nextLastDoc != null);
        cursor = nextLastDoc;
      }
    } catch (err) {
      console.error('Failed to load last page:', err);
    } finally {
      setLoading(false);
    }
  };

  const openEditModal = (t: Task) => {
    setEditingTask(t);
    setEditError('');
    setEditTitle(t.title);
    setEditDesc(t.description || '');
    setEditStartDate(t.start_date || '');
    setEditAssignedToId(t.assigned_to_id);
    setEditDueDate(t.due_date);
    setEditRecurring(t.recurring);
    setEditRecurringDays(t.recurring_days || []);
    setEditAttachmentRequired(Boolean(t.attachment_required));
    setEditAttachmentType((t.attachment_type as 'media' | 'text') || 'media');
    setEditAttachmentDescription(t.attachment_description || '');
    setEditVerificationRequired(Boolean(t.verification_required));
    setEditVerifierId(t.verifier_id || '');
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTask || !user) return;
    setEditError('');
    const isAssigneeLimitedEdit = isDoer && editingTask.assigned_to_id === user.id;

    if (!isAssigneeLimitedEdit) {
      if (editVerificationRequired && !editVerifierId) {
        setEditError('Please select a verifier when verification is required.');
        return;
      }

      if (editVerificationRequired && editVerifierId === editAssignedToId) {
        setEditError('Verifier and assignee cannot be the same member.');
        return;
      }
    }

    setEditSubmitting(true);
    try {
      let finalStatus = editingTask.status;
      const today = getTodayIST();
      if (editStartDate && editStartDate > today && ['pending', 'scheduled'].includes(editingTask.status)) {
        finalStatus = 'scheduled';
      } else if (editStartDate && editStartDate <= today && editingTask.status === 'scheduled') {
        finalStatus = 'pending';
      }

      const immutableRecurring = editingTask.recurring;
      if (isAssigneeLimitedEdit) {
        const updates: Partial<Task> = {
          title: editTitle,
          description: editDesc,
          start_date: editStartDate || (null as any),
          due_date: editDueDate,
          status: finalStatus,
          recurring: immutableRecurring,
          recurring_days: immutableRecurring === 'daily' && editRecurringDays.length > 0 ? editRecurringDays : (null as any),
          attachment_required: editAttachmentRequired,
          attachment_type: editAttachmentRequired ? editAttachmentType : (null as any),
          attachment_description: editAttachmentRequired ? (editAttachmentDescription || '') : (null as any),
        };
        if (editingTask.due_date !== editDueDate) {
          updates.is_holiday = isHoliday(editDueDate, holidays);
        }
        await api.updateTask(editingTask.id, updates);
        setTasks((prev) =>
          prev.map((t) =>
            t.id === editingTask.id ? { ...t, ...updates, updated_at: new Date().toISOString() } : t
          )
        );
        setNameFilteredRows((prev) =>
          prev
            ? prev.map((t) =>
              t.id === editingTask.id ? { ...t, ...updates, updated_at: new Date().toISOString() } : t
            )
            : null
        );
        setEditingTask(null);
        setRefreshToken((x) => x + 1);
      } else {
        const assigneeUser = allUsers.find((u) => u.id === editAssignedToId);
        const verifierUser = allUsers.find((u) => u.id === editVerifierId);
        const updates: Partial<Task> = {
          title: editTitle,
          description: editDesc,
          start_date: editStartDate || (null as any),
          status: finalStatus,
          assigned_to_id: editAssignedToId,
          assigned_to_name: assigneeUser?.name || editingTask.assigned_to_name,
          assigned_to_department: assigneeUser?.department || editingTask.assigned_to_department,
          due_date: editDueDate,
          recurring: immutableRecurring,
          recurring_days: immutableRecurring === 'daily' && editRecurringDays.length > 0 ? editRecurringDays : (null as any),
          attachment_required: editAttachmentRequired,
          attachment_type: editAttachmentRequired ? editAttachmentType : (null as any),
          attachment_description: editAttachmentRequired ? (editAttachmentDescription || '') : (null as any),
          verification_required: editVerificationRequired,
          verifier_id: editVerificationRequired ? editVerifierId : (null as any),
          verifier_name: editVerificationRequired ? (verifierUser?.name || '') : (null as any),
          assignee_deleted: false,
        };

        if (editingTask.due_date !== editDueDate) {
          updates.is_holiday = isHoliday(editDueDate, holidays);
        }

        await api.updateTask(editingTask.id, updates);

        setTasks((prev) =>
          prev.map((t) =>
            t.id === editingTask.id ? { ...t, ...updates, updated_at: new Date().toISOString() } : t
          )
        );
        setNameFilteredRows((prev) =>
          prev
            ? prev.map((t) =>
              t.id === editingTask.id ? { ...t, ...updates, updated_at: new Date().toISOString() } : t
            )
            : null
        );
        setEditingTask(null);
      }
    } catch (err) {
      console.error('Failed to update task:', err);
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!window.confirm('Are you sure you want to delete this task? This action cannot be undone.')) return;
    setLoading(true);
    try {
      await api.deleteTask(taskId, { id: user!.id, name: user!.name, role: user!.role }, 'Deleted from Task Table');
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
    } catch (err) {
      console.error('Failed to delete task:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleClosePermanentlyTask = async (task: Task) => {
    if (task.recurring === 'none') return;
    if (!window.confirm('Are you sure you want to permanently close this recurring task? It will never spawn again.')) return;
    setLoading(true);
    try {
      await api.updateTask(task.id, { status: 'closed_permanently' }, { id: user!.id, name: user!.name, role: user!.role }, 'Closed permanently from Task Table');
      setTasks((prev) =>
        prev.map((t) =>
          t.id === task.id ? { ...t, status: 'closed_permanently', updated_at: new Date().toISOString() } : t
        )
      );
      setNameFilteredRows((prev) =>
        prev
          ? prev.map((t) =>
            t.id === task.id ? { ...t, status: 'closed_permanently', updated_at: new Date().toISOString() } : t
          )
          : null
      );
    } catch (err) {
      console.error('Failed to close recurring task permanently:', err);
    } finally {
      setLoading(false);
    }
  };

  const startRow = effectiveTotalResults === 0 || sortedTasks.length === 0
    ? 0
    : (currentPage - 1) * rowsPerPage + 1;
  const endRow = effectiveTotalResults === 0 || sortedTasks.length === 0
    ? 0
    : Math.min(startRow + Math.max(sortedTasks.length - 1, 0), effectiveTotalResults);

  const paginationControls = (
    <div className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-700">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-slate-600">Rows per page</span>
          <select
            value={rowsPerPage}
            onChange={handleRowsPerPageChange}
            className="h-9 rounded-control border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          >
            {ROWS_PER_PAGE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-3 sm:gap-4">
          <p className="text-sm text-slate-500 whitespace-nowrap">
            Showing <span className="font-semibold text-slate-800">{startRow}-{endRow}</span> of{' '}
            <span className="font-semibold text-slate-800">{effectiveTotalResults}</span> results
          </p>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              aria-label="First page"
              onClick={handleFirstPage}
              disabled={loading || currentPage <= 1}
              className="h-9 w-9 inline-flex items-center justify-center rounded-control border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronsLeft size={16} />
            </button>
            <button
              type="button"
              aria-label="Previous page"
              onClick={handlePreviousPage}
              disabled={loading || currentPage <= 1}
              className="h-9 w-9 inline-flex items-center justify-center rounded-control border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              aria-label="Next page"
              onClick={handleNextPage}
              disabled={loading || !hasNextPage || currentPage >= totalPages}
              className="h-9 w-9 inline-flex items-center justify-center rounded-control border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRight size={16} />
            </button>
            <button
              type="button"
              aria-label="Last page"
              onClick={handleLastPage}
              disabled={loading || currentPage >= totalPages || !hasNextPage}
              className="h-9 w-9 inline-flex items-center justify-center rounded-control border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronsRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  const renderSopAction = (t: Task, requireLinks = true) => {
    const hasSop =
      !!t.audit_sop_text ||
      (t.audit_sop_attachments && t.audit_sop_attachments.length > 0) ||
      (requireLinks && t.audit_sop_links && t.audit_sop_links.length > 0);
    const isAssigner = user?.id === t.assigned_by_id;
    const isAdmin = user?.role === UserRole.ADMIN;
    const canEditSop = (isAssigner || isAdmin) && !t.verified_at;

    if (hasSop) {
      return (
        <button
          type="button"
          onClick={() => setSelectedAuditTask(t)}
          className="mt-2 text-xs font-medium text-brand-600 hover:text-brand-800 hover:bg-brand-50 px-2 py-1 rounded inline-flex items-center gap-1 w-fit transition-colors border border-brand-100"
        >
          <FileText size={12} /> View Guidelines to Audit
        </button>
      );
    }
    if (canEditSop) {
      return (
        <button
          type="button"
          onClick={() => setSelectedAuditTask(t)}
          className="mt-2 text-xs font-medium text-slate-400 hover:text-brand-600 hover:bg-slate-50 px-2 py-1 rounded inline-flex items-center gap-1 w-fit transition-colors border border-transparent border-dashed hover:border-brand-200"
        >
          + Add Guidelines to Audit
        </button>
      );
    }
    return null;
  };

  const renderAttachmentAction = (t: Task, dashWhenEmpty = true) =>
    ((t.attachment_urls && t.attachment_urls.length > 0) || t.attachment_url || t.attachment_text) ? (
      <button
        type="button"
        onClick={() =>
          setViewAttachment({
            urls: t.attachment_urls || (t.attachment_url ? [t.attachment_url] : []),
            text: t.attachment_text,
          })
        }
        className="text-brand-600 hover:underline text-sm inline-flex items-center justify-center gap-1 font-medium whitespace-nowrap"
      >
        <ExternalLink size={14} />
        View
      </button>
    ) : t.attachment_required ? (
      <span className="text-warning-600 text-xs font-medium whitespace-nowrap">Required</span>
    ) : dashWhenEmpty ? (
      <span className="text-slate-400">-</span>
    ) : null;

  const getRowActionFlags = (t: Task) => {
    const showComplete =
      t.assigned_to_id === user?.id &&
      t.status !== 'completed' &&
      t.status !== 'pending_verification';
    const isAssigner = t.assigned_by_id === user?.id;
    const isAdminRole = user?.role === UserRole.ADMIN;

    // Admins can edit/close anything; assigners can fix their own tasks.
    // Deleting tasks is admin-only.
    const canEditTask = isAssigner || isAdminRole;
    const canDeleteTask = isAdminRole;
    const canClosePermanently =
      t.recurring !== 'none' && t.status !== 'closed_permanently' && (isAssigner || isAdminRole);

    return { showComplete, canEditTask, canDeleteTask, canClosePermanently };
  };


  return (
    <div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="rounded-card border border-slate-200 bg-white px-4 py-3 shadow-card">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Due Today</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">
            {summaryLoading ? '...' : taskSummary.dueToday}
          </p>
        </div>
        <div className="rounded-card border border-danger-100 bg-danger-50/70 px-4 py-3 shadow-card">
          <p className="text-xs font-semibold uppercase tracking-wide text-danger-700">Overdue (Till Today)</p>
          <p className="mt-1 text-2xl font-bold text-danger-700">
            {summaryLoading ? '...' : taskSummary.overdue}
          </p>
        </div>
      </div>

      <FilterBar
        activeCount={
          [assignedToFilter, assignedByFilter, statusFilter, recurringFilter].filter(Boolean).length +
          (dateFilter !== 'all_time' ? 1 : 0)
        }
        actions={
          isManager && !isSelfTasksView ? (
            <CsvExportButton onClick={handleExportCsv} loading={exportingCsv} />
          ) : undefined
        }
      >
        <div className="w-full sm:w-56">
          <SearchableUserSelect
            users={allUsers}
            value={assignedToFilter}
            onChange={setAssignedToFilter}
            placeholder="Search Doer Name"
          />
        </div>

        <div className="w-full sm:w-56">
          <SearchableUserSelect
            users={allUsers}
            value={assignedByFilter}
            onChange={setAssignedByFilter}
            placeholder="Search Assigned By"
          />
        </div>

        <div className="w-full sm:w-44">
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">Status</option>
          <option value="pending">Pending</option>
          <option value="completed">Completed</option>
          <option value="overdue">Overdue</option>
          <option value="cancelled">Cancelled</option>
          <option value="closed_permanently">Closed Permanently</option>
          <option value="pending_verification">Pending Verification</option>
          <option value="correction_required">Correction Required</option>
        </Select>
        </div>

        <div className="w-full sm:w-44">
        <Select
          value={recurringFilter}
          onChange={(e) => setRecurringFilter(e.target.value)}
        >
          <option value="">All Recurring Types</option>
          <option value="none">None</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="fortnightly">Fortnightly</option>
          <option value="monthly">Monthly</option>
          <option value="quarterly">Quarterly</option>
          <option value="half_yearly">Half Yearly</option>
          <option value="yearly">Yearly</option>
        </Select>
        </div>

        <div className="w-full sm:w-40">
        <Select
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
        >
          <option value="all_time">All Time</option>
          <option value="today">Today</option>
          <option value="yesterday">Yesterday</option>
          <option value="last_7_days">Last 7 Days</option>
          <option value="last_30_days">Last 30 Days</option>
          <option value="custom">Custom Range</option>
        </Select>
        </div>

        {dateFilter === 'custom' && (
          <div className="flex items-center gap-2">
            <div className="w-full sm:w-38"><DateInput
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
            /></div>
            <span className="text-slate-500 text-sm">to</span>
            <div className="w-full sm:w-38"><DateInput
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
            /></div>
          </div>
        )}
      </FilterBar>
      {loading ? (
        <TableSkeleton rows={10} />
      ) : sortedTasks.length === 0 ? (
        <div className="bg-white rounded-card border border-slate-200 shadow-card">
          <EmptyState icon={Table2} title="No tasks found." description="Try adjusting the filters above." />
        </div>
      ) : (
      <>
      <div className="sm:hidden space-y-3">
        {sortedTasks.map((t) => {
          const onHoliday = isHoliday(t.due_date, holidays);
          const today = getTodayIST();
          const isOverdue =
            (t.status === 'overdue' || t.due_date < today) &&
            t.status !== 'completed' &&
            t.status !== 'cancelled' &&
            t.status !== 'closed_permanently';
          const flags = getRowActionFlags(t);
          return (
            <TaskCard
              key={t.id}
              title={t.title}
              description={t.description}
              status={t.status}
              tone={isOverdue ? 'overdue' : onHoliday ? 'holiday' : undefined}
              meta={
                <>
                  <TaskCardMeta label="Assigned to">{t.assigned_to_name}{t.assignee_deleted ? ' (deleted)' : ''}</TaskCardMeta>
                  <TaskCardMeta label="Assigned by">{t.assigned_by_name}</TaskCardMeta>
                  <TaskCardMeta label="Due">{formatDateValue(t.due_date)}{onHoliday ? ' · Holiday' : ''}</TaskCardMeta>
                  <TaskCardMeta label="Recurring">{formatRecurringLabel(getDisplayRecurring(t, taskById), 'None')}</TaskCardMeta>
                  {(t.verifier_name || t.verified_by || t.verification_required) && (
                    <TaskCardMeta label="Verifier">{t.verifier_name || t.verified_by || 'Required'}</TaskCardMeta>
                  )}
                  {t.doer_remark && <TaskCardMeta label="Remark">{t.doer_remark}</TaskCardMeta>}
                  {t.status === 'correction_required' && t.verification_rejection_comment && (
                    <TaskCardMeta label="Verifier note">{t.verification_rejection_comment}</TaskCardMeta>
                  )}
                </>
              }
              actions={
                <>
                  {flags.showComplete && (
                    <Button size="sm" variant="success" onClick={() => handleCompleteClick(t)}>
                      Complete
                    </Button>
                  )}
                  {flags.canClosePermanently && (
                    <Button size="sm" variant="danger" onClick={() => handleClosePermanentlyTask(t)}>
                      Close Permanently
                    </Button>
                  )}
                  {flags.canEditTask && (
                    <Button size="sm" variant="secondary" onClick={() => openEditModal(t)} title="Edit Task">
                      <Pencil size={14} />
                    </Button>
                  )}
                  {flags.canDeleteTask && (
                    <Button size="sm" variant="danger" onClick={() => handleDeleteTask(t.id)} title="Delete Task">
                      <Trash2 size={14} />
                    </Button>
                  )}
                  {renderAttachmentAction(t, false)}
                  {renderSopAction(t)}
                </>
              }
            />
          );
        })}
      </div>
      <div className="table-container task-table-container hidden sm:block">
        <table>
          <thead>
            <tr>
              <th className="sticky-col-1 text-center">Title</th>
              <th className="sticky-col-2 text-center">Description</th>
              <th className="whitespace-nowrap text-center">Assigned To</th>
              <th className="whitespace-nowrap text-center">Assigned By</th>
              <th className="whitespace-nowrap text-center">
                <button
                  type="button"
                  onClick={() => toggleDateSort('start_date')}
                  className="inline-flex items-center justify-center gap-1 hover:text-brand-700"
                >
                  Start Date
                  {renderSortIcon('start_date')}
                </button>
              </th>
              <th className="whitespace-nowrap text-center">
                <button
                  type="button"
                  onClick={() => toggleDateSort('due_date')}
                  className="inline-flex items-center justify-center gap-1 hover:text-brand-700"
                >
                  Due Date
                  {renderSortIcon('due_date')}
                </button>
              </th>
              <th className="whitespace-nowrap text-center">Recurring</th>
              <th className="whitespace-nowrap text-center">Status</th>
              <th className="whitespace-nowrap text-center">Doer's Remark</th>
              <th className="whitespace-nowrap text-center">Verifier</th>
              <th className="whitespace-nowrap text-center">Attachment</th>
              <th className="whitespace-nowrap text-center">Action</th>
            </tr>
          </thead>
          <tbody>
            {sortedTasks.map((t) => {
                const onHoliday = isHoliday(t.due_date, holidays);
                const today = getTodayIST();
                const isOverdue =
                  (t.status === 'overdue' || t.due_date < today) &&
                  t.status !== 'completed' &&
                  t.status !== 'cancelled' &&
                  t.status !== 'closed_permanently';
                return (
                  <tr
                    key={t.id}
                    className={`${isOverdue ? 'overdue-row' : ''} ${!isOverdue && onHoliday ? 'holiday-row' : ''} ${highlightId === t.id ? 'ring-2 ring-warning-300' : ''}`}
                  >
                    <td className="sticky-col-1">
                      <span className="font-medium text-slate-800">{t.title}</span>
                      {onHoliday && (
                        <span className="ml-2 text-xs text-warning-600">(Holiday)</span>
                      )}
                      {t.assignee_deleted && (
                        <span className="ml-2 text-xs px-2 py-0.5 rounded bg-slate-200 text-slate-600">Member deleted</span>
                      )}
                    </td>
                    <td className="sticky-col-2 whitespace-pre-wrap wrap-anywhere text-sm text-slate-700 align-top">
                      <div className="flex flex-col">
                        <span>{t.description || '-'}</span>
                        {renderSopAction(t)}
                      </div>
                    </td>
                    <td>
                      <span className="text-sm font-medium text-slate-700 whitespace-pre-wrap">
                        {t.assigned_to_name}
                        {t.assignee_deleted && (
                          <span className="ml-2 text-xs px-2 py-0.5 rounded bg-slate-200 text-slate-600">Member deleted</span>
                        )}
                      </span>
                    </td>

                    <td>
                      <span className="text-sm font-medium text-slate-700 whitespace-pre-wrap">
                        {t.assigned_by_name}
                      </span>
                    </td>
                    <td className="text-center whitespace-nowrap text-slate-600">
                      {t.start_date ? formatDateValue(t.start_date) : '-'}
                    </td>
                    <td className="text-center whitespace-nowrap text-slate-600 font-medium">
                      {formatDateValue(t.due_date)}
                    </td>
                    <td className="text-center">
                      <span className="inline-flex px-2 py-0.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-700 capitalize whitespace-nowrap">
                        {formatRecurringLabel(getDisplayRecurring(t, taskById), 'None')}
                      </span>
                    </td>
                    <td className="text-center">
                      <div className="flex flex-col items-center gap-1 max-w-[14rem] mx-auto">
                        <StatusBadge status={t.status} />
                        {t.status === 'correction_required' && t.verification_rejection_comment && (
                          <p className="text-xs text-warning-800 text-left w-full break-words" title={t.verification_rejection_comment}>
                            <span className="font-medium">Verifier: </span>
                            {t.verification_rejection_comment}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="text-center whitespace-pre-wrap wrap-anywhere text-sm text-slate-700">
                      {t.doer_remark || '-'}
                    </td>
                    <td>
                      <span className="text-sm font-medium text-slate-700 whitespace-pre-wrap">
                        {t.verifier_name || t.verified_by || (t.verification_required ? 'Required' : '-')}
                      </span>
                    </td>
                    <td className="text-center">{renderAttachmentAction(t)}</td>
                    <td className="py-3 px-2 text-right pr-4">
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-center justify-end py-2 h-full">
                        {(() => {
                          const flags = getRowActionFlags(t);
                          const hasAnyAction =
                            flags.showComplete || flags.canEditTask || flags.canDeleteTask || flags.canClosePermanently;
                          return (
                            <>
                              {flags.showComplete && (
                                <Button size="sm" variant="success" onClick={() => handleCompleteClick(t)} className="w-full sm:w-auto text-xs sm:text-sm px-2 py-1 whitespace-nowrap">
                                  Complete
                                </Button>
                              )}
                              {flags.canClosePermanently && (
                                <Button size="sm" variant="danger" onClick={() => handleClosePermanentlyTask(t)} className="w-full sm:w-auto text-xs sm:text-sm px-2 py-1 whitespace-nowrap">
                                  Close Permanently
                                </Button>
                              )}
                              {flags.canEditTask && (
                                <Button size="sm" variant="secondary" onClick={() => openEditModal(t)} className="!px-2" title="Edit Task">
                                  <Pencil size={15} />
                                </Button>
                              )}
                              {flags.canDeleteTask && (
                                <Button size="sm" variant="danger" onClick={() => handleDeleteTask(t.id)} className="!px-2" title="Delete Task">
                                  <Trash2 size={15} />
                                </Button>
                              )}
                              {!hasAnyAction && <span className="text-slate-400 text-center">-</span>}
                            </>
                          );
                        })()}
                      </div>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
      <div className="mt-4 hidden sm:block">{paginationControls}</div>
      </>
      )}
      <div className="mt-4 sm:hidden">{!loading && sortedTasks.length > 0 && paginationControls}</div>

      {completeTask && (
        <CompleteTaskModal
          task={completeTask}
          onClose={closeCompleteModal}
          onComplete={handleComplete}
          completing={completing}
        />
      )}

      {viewAttachment && (
        <AttachmentViewerModal
          urls={viewAttachment.urls}
          text={viewAttachment.text}
          onClose={() => setViewAttachment(null)}
        />
      )}

      {rejectTask && user && (
        <Modal
          open
          onClose={() => {
            setRejectTask(null);
            setRejectComment('');
          }}
          closeOnBackdrop={false}
          size="md"
          title="Reject verification"
          footer={
            <>
              <Button
                variant="secondary"
                onClick={() => {
                  setRejectTask(null);
                  setRejectComment('');
                }}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                disabled={!rejectComment.trim()}
                onClick={async () => {
                  if (!rejectComment.trim()) return;
                  try {
                    await api.updateTask(rejectTask.id, {
                      status: 'correction_required',
                      verification_rejection_comment: rejectComment.trim(),
                      verification_rejected_at: new Date().toISOString(),
                      verification_rejected_by: user.name,
                    } as Partial<Task>, { id: user.id, name: user.name, role: user.role }, 'Verification rejected');
                    setRejectTask(null);
                    setRejectComment('');
                    setLoading(true);
                    await loadPage(pageCursors[currentPage - 1] ?? null, currentPage);
                  } catch (err) {
                    console.error(err);
                  }
                }}
              >
                Submit rejection
              </Button>
            </>
          }
        >
          <p className="text-sm text-slate-600 mb-3">
            Add a comment for <strong>{rejectTask.assigned_to_name}</strong>. They will see it on the task.
          </p>
          <textarea
            value={rejectComment}
            onChange={(e) => setRejectComment(e.target.value)}
            rows={4}
            placeholder="Reason for rejection (required)…"
            className="w-full rounded-control border border-slate-200 px-3 py-2 text-sm"
          />
        </Modal>
      )}

      {editingTask && (
        <Modal
          open
          onClose={() => setEditingTask(null)}
          closeOnBackdrop={false}
          size="lg"
          title="Edit Task"
        >
            {editError && (
              <div className="mb-3 rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700">
                {editError}
              </div>
            )}
            {(() => {
              const isAssigneeLimitedEdit = isDoer && editingTask.assigned_to_id === user?.id;
              return (
                <form onSubmit={handleEditSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Title</label>
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      required
                      className="w-full h-10 rounded-control border border-slate-200 px-3 text-sm focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                    <textarea
                      value={editDesc}
                      onChange={(e) => setEditDesc(e.target.value)}
                      rows={3}
                      className="w-full rounded-control border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 focus:outline-none"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Assign To</label>
                      {isAssigneeLimitedEdit ? (
                        <p className="h-10 flex items-center text-sm text-slate-800 border border-slate-200 rounded-lg px-3 bg-slate-50">
                          {editingTask.assigned_to_name}
                        </p>
                      ) : (
                        <SearchableUserSelect
                          users={allUsers}
                          value={editAssignedToId}
                          onChange={setEditAssignedToId}
                          placeholder="Search member..."
                          required
                        />
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Start Date</label>
                      <input
                        type="date"
                        value={editStartDate}
                        onChange={(e) => setEditStartDate(e.target.value)}
                        className="w-full h-10 rounded-control border border-slate-200 px-3 text-sm focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 focus:outline-none"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Due Date</label>
                      <input
                        type="date"
                        value={editDueDate}
                        onChange={(e) => setEditDueDate(e.target.value)}
                        min={editStartDate || undefined}
                        required
                        className="w-full h-10 rounded-control border border-slate-200 px-3 text-sm focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 focus:outline-none"
                      />
                    </div>
                    {/*
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Priority</label>
                      <select
                        value={editPriority}
                        onChange={(e) => setEditPriority(e.target.value as Task['priority'])}
                        className="w-full h-10 rounded-control border border-slate-200 px-3 text-sm focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 focus:outline-none"
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                        <option value="urgent">Urgent</option>
                      </select>
                    </div>
                    */}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Recurring</label>
                      <select
                        value={editRecurring}
                        disabled
                        className="w-full h-10 rounded-control border border-slate-200 px-3 text-sm focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 focus:outline-none"
                      >
                        <option value="none">None</option>
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                        <option value="fortnightly">Fortnightly</option>
                        <option value="monthly">Monthly</option>
                        <option value="quarterly">Quarterly</option>
                        <option value="half_yearly">Half Yearly</option>
                        <option value="yearly">Yearly</option>
                      </select>
                      <p className="mt-1 text-xs text-slate-500">Recurring type cannot be changed after task creation.</p>
                    </div>
                    <div className="flex items-center gap-2 pt-7">
                      <input
                        id="edit-attachment-required"
                        type="checkbox"
                        checked={editAttachmentRequired}
                        onChange={(e) => setEditAttachmentRequired(e.target.checked)}
                        className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                      />
                      <label htmlFor="edit-attachment-required" className="text-sm font-medium text-slate-700">
                        Attachment required
                      </label>
                    </div>
                  </div>

                  {editAttachmentRequired && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Attachment Type</label>
                        <select
                          value={editAttachmentType}
                          onChange={(e) => setEditAttachmentType(e.target.value as 'media' | 'text')}
                          className="w-full h-10 rounded-control border border-slate-200 px-3 text-sm focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 focus:outline-none"
                        >
                          <option value="media">Media</option>
                          <option value="text">Text</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Attachment Note</label>
                        <input
                          type="text"
                          value={editAttachmentDescription}
                          onChange={(e) => setEditAttachmentDescription(e.target.value)}
                          placeholder="Describe required attachment"
                          className="w-full h-10 rounded-control border border-slate-200 px-3 text-sm focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 focus:outline-none"
                        />
                      </div>
                    </div>
                  )}

                  {!isAssigneeLimitedEdit && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="flex items-center gap-2">
                        <input
                          id="edit-verification-required"
                          type="checkbox"
                          checked={editVerificationRequired}
                          onChange={(e) => {
                            setEditVerificationRequired(e.target.checked);
                            if (!e.target.checked) {
                              setEditVerifierId('');
                            }
                          }}
                          className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                        />
                        <label htmlFor="edit-verification-required" className="text-sm font-medium text-slate-700">
                          Verification Required
                        </label>
                      </div>
                      {editVerificationRequired && (
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Verifier</label>
                          <SearchableUserSelect
                            users={allUsers}
                            value={editVerifierId}
                            onChange={setEditVerifierId}
                            placeholder="Search verifier..."
                            required={editVerificationRequired}
                            excludeUserId={editAssignedToId}
                          />
                        </div>
                      )}
                    </div>
                  )}
                  {editRecurring === 'daily' && (
                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                      <p className="text-xs text-slate-600 mb-2 font-medium">Recurring Days</p>
                      <div className="flex flex-wrap gap-2">
                        {DAYS.map((d) => (
                          <button
                            key={d.value}
                            type="button"
                            onClick={() => {
                              setEditRecurringDays((prev) =>
                                prev.includes(d.value)
                                  ? prev.filter((x) => x !== d.value)
                                  : [...prev, d.value].sort((a, b) => a - b)
                              );
                            }}
                            className={`px-2.5 py-1 rounded text-xs transition-colors ${editRecurringDays.includes(d.value)
                              ? 'bg-brand-600 text-white'
                              : 'bg-white border border-slate-300 text-slate-600 hover:bg-slate-100'
                              }`}
                          >
                            {d.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="flex justify-end gap-2 pt-4 mt-2 border-t border-slate-100">
                    <Button type="button" variant="secondary" onClick={() => setEditingTask(null)}>
                      Cancel
                    </Button>
                    <Button type="submit" isLoading={editSubmitting}>
                      Save Changes
                    </Button>
                  </div>
                </form>
              );
            })()}
        </Modal>
      )}

      {user && (
        <AuditSopModal
          isOpen={!!selectedAuditTask}
          onClose={() => setSelectedAuditTask(null)}
          user={user}
          task={selectedAuditTask || undefined}
          onUpdate={() => loadPage(pageCursors[currentPage - 1] ?? null, currentPage)}
        />
      )}
    </div>
  );
};

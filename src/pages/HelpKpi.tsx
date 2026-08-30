/*
 * Developed by Nerdshouse Technologies LLP — https://nerdshouse.com
 * © 2026 WhiteRock (Royal Enterprise). All rights reserved.
 *
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Star, CheckCircle2, Inbox } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import { Button } from '../components/ui/Button';
import { DateInput } from '../components/ui/DateInput';
import { TableSkeleton } from '../components/ui/Skeleton';
import { UserRole } from '../types';

const th = 'text-left py-3 px-4 text-xs font-semibold uppercase tracking-wide text-slate-400';
const thCenter = 'text-center py-3 px-4 text-xs font-semibold uppercase tracking-wide text-slate-400';

export const HelpKpi: React.FC = () => {
  const { user } = useAuth();
  const isAdminRole = user?.role === UserRole.ADMIN;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [data, setData] = useState<null | Awaited<ReturnType<typeof api.computeHelpKpis>>>(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.computeHelpKpis({
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });
      setData(res);
    } catch (e: any) {
      setError(e?.message || 'Failed to load MIS');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAdminRole) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdminRole]);

  const summary = useMemo(() => {
    if (!data) return null;
    const unresolved = data.doerWise.reduce((s, r) => s + r.unresolved_count, 0);
    const solved = data.helperWise.reduce((s, r) => s + r.total_solved, 0);
    const rated = data.helperWise.filter((r) => r.avg_rating != null);
    const avgRating = rated.length
      ? (rated.reduce((s, r) => s + (r.avg_rating as number), 0) / rated.length).toFixed(1)
      : null;
    return { unresolved, solved, avgRating };
  }, [data]);

  if (!user) return null;
  if (!isAdminRole) {
    return <div className="text-sm text-slate-500">Only admins can view the Help MIS.</div>;
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="text-sm text-danger-600 bg-danger-50 border border-danger-100 rounded-control p-3">
          {error}
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-card border border-slate-200 shadow-card p-4 md:p-5">
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-end">
          <div className="flex-1">
            <DateInput label="From" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div className="flex-1">
            <DateInput label="To" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <Button onClick={load} isLoading={loading}>Apply</Button>
            <Button variant="secondary" onClick={load} disabled={loading}>
              <span className="inline-flex items-center gap-2"><RefreshCw size={16} /> Refresh</span>
            </Button>
          </div>
        </div>
      </div>

      {loading ? (
        <TableSkeleton rows={5} />
      ) : !data ? null : (
        <>
          {/* Summary */}
          {summary && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white rounded-card border border-slate-200 shadow-card p-4 flex items-center gap-3">
                <span className="w-10 h-10 shrink-0 rounded-control bg-warning-50 flex items-center justify-center">
                  <Inbox size={18} className="text-warning-600" />
                </span>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Unresolved</p>
                  <p className="text-xl font-bold text-slate-900">{summary.unresolved}</p>
                </div>
              </div>
              <div className="bg-white rounded-card border border-slate-200 shadow-card p-4 flex items-center gap-3">
                <span className="w-10 h-10 shrink-0 rounded-control bg-success-50 flex items-center justify-center">
                  <CheckCircle2 size={18} className="text-success-600" />
                </span>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Solved</p>
                  <p className="text-xl font-bold text-slate-900">{summary.solved}</p>
                </div>
              </div>
              <div className="bg-white rounded-card border border-slate-200 shadow-card p-4 flex items-center gap-3">
                <span className="w-10 h-10 shrink-0 rounded-control bg-brand-50 flex items-center justify-center">
                  <Star size={18} className="text-brand-600" />
                </span>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Avg rating</p>
                  <p className="text-xl font-bold text-slate-900">{summary.avgRating ?? '—'}</p>
                </div>
              </div>
            </div>
          )}

          {/* Tables */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-card border border-slate-200 shadow-card overflow-hidden">
              <div className="p-4 md:p-5 border-b border-slate-100">
                <h3 className="font-semibold text-slate-900">Doer-wise</h3>
                <p className="text-sm text-slate-500">Unresolved tickets count</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className={th}>Doer</th>
                      <th className={thCenter}>Unresolved</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.doerWise.length === 0 ? (
                      <tr><td colSpan={2} className="py-6 px-4 text-sm text-slate-500 text-center">No data for this period.</td></tr>
                    ) : data.doerWise.map((r) => (
                      <tr key={r.doer_id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                        <td className="py-3 px-4 text-sm text-slate-700">{r.doer_name}</td>
                        <td className="py-3 px-4 text-center text-sm font-semibold text-slate-900 tabular-nums">{r.unresolved_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white rounded-card border border-slate-200 shadow-card overflow-hidden">
              <div className="p-4 md:p-5 border-b border-slate-100">
                <h3 className="font-semibold text-slate-900">Helper-wise</h3>
                <p className="text-sm text-slate-500">Avg rating, total solved, avg resolution time</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className={th}>Helper</th>
                      <th className={thCenter}>Avg rating</th>
                      <th className={thCenter}>Solved</th>
                      <th className={thCenter}>Avg mins</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.helperWise.length === 0 ? (
                      <tr><td colSpan={4} className="py-6 px-4 text-sm text-slate-500 text-center">No data for this period.</td></tr>
                    ) : data.helperWise.map((r) => (
                      <tr key={r.helper_id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                        <td className="py-3 px-4 text-sm text-slate-700">{r.helper_name}</td>
                        <td className="py-3 px-4 text-center text-sm font-semibold text-slate-900 tabular-nums">{r.avg_rating == null ? '—' : r.avg_rating}</td>
                        <td className="py-3 px-4 text-center text-sm font-semibold text-slate-900 tabular-nums">{r.total_solved}</td>
                        <td className="py-3 px-4 text-center text-sm font-semibold text-slate-900 tabular-nums">{r.avg_resolution_minutes == null ? '—' : r.avg_resolution_minutes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

/*
 * Developed by Nerdshouse Technologies LLP — https://nerdshouse.com
 * © 2026 WhiteRock (Royal Enterprise). All rights reserved.
 *
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */
import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import { Holiday, Absence, UserRole } from '../types';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Calendar, ChevronDown, ChevronUp, Plus, Trash2, UserMinus } from 'lucide-react';
import { EmptyState } from '../components/ui/EmptyState';
import { formatDateDDMMYYYY } from '../lib/utils';
import { Members } from './Members';

const LIST_MAX_HEIGHT = 'min(20rem, 50vh)';

export const Settings: React.FC = () => {
  const { user } = useAuth();
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [holidayDate, setHolidayDate] = useState('');
  const [holidayName, setHolidayName] = useState('');
  const [absenceFrom, setAbsenceFrom] = useState('');
  const [absenceTo, setAbsenceTo] = useState('');
  const [absenceReason, setAbsenceReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [holidaysOpen, setHolidaysOpen] = useState(true);
  const [absencesOpen, setAbsencesOpen] = useState(true);
  const [showAddHolidayModal, setShowAddHolidayModal] = useState(false);
  const [showMarkAbsentModal, setShowMarkAbsentModal] = useState(false);
  const [mainTab, setMainTab] = useState<'general' | 'members'>('general');

  const isManager = user?.role === UserRole.MANAGER || user?.role === UserRole.OWNER;

  useEffect(() => {
    api.getHolidays().then(setHolidays);
    api.getAbsences().then(setAbsences);
  }, []);

  const handleAddHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!holidayDate || !holidayName) return;
    setLoading(true);
    try {
      await api.addHoliday(holidayDate, holidayName);
      setHolidays(await api.getHolidays());
      setHolidayDate('');
      setHolidayName('');
      setShowAddHolidayModal(false);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteHoliday = async (id: string) => {
    if (!confirm('Delete this holiday?')) return;
    try {
      await api.deleteHoliday(id);
      setHolidays(await api.getHolidays());
    } catch (err) {
      console.error(err);
    }
  };

  const handleMarkAbsent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !absenceFrom || !absenceTo) return;
    setLoading(true);
    try {
      await api.addAbsence({
        user_id: user.id,
        user_name: user.name,
        from_date: absenceFrom,
        to_date: absenceTo,
        reason: absenceReason,
      });
      setAbsences(await api.getAbsences());
      setAbsenceFrom('');
      setAbsenceTo('');
      setAbsenceReason('');
      setShowMarkAbsentModal(false);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {isManager && (
        <div className="bg-slate-100 rounded-control p-1 overflow-x-auto mb-6 w-fit max-w-full">
          <div className="flex gap-2 min-w-max">
            <button
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap ${mainTab === 'general' ? 'bg-white shadow-sm text-brand-700' : 'text-slate-600 hover:bg-white/60'}`}
              onClick={() => setMainTab('general')}
            >
              General
            </button>
            <button
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap ${mainTab === 'members' ? 'bg-white shadow-sm text-brand-700' : 'text-slate-600 hover:bg-white/60'}`}
              onClick={() => setMainTab('members')}
            >
              Members
            </button>
          </div>
        </div>
      )}

      {mainTab === 'members' && isManager ? (
        <Members />
      ) : (
      <>
      <section className="max-w-4xl space-y-5">
        <p className="text-sm text-slate-500 -mt-1">
          Company holidays and personal absences. Tasks on these dates are excluded from KPI.
        </p>

        {/* Holidays */}
        <div className="bg-white rounded-card border border-slate-200 shadow-card overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-4">
            <button
              type="button"
              onClick={() => setHolidaysOpen((o) => !o)}
              className="flex items-center gap-3 text-left min-w-0"
            >
              <span className="w-9 h-9 shrink-0 rounded-control bg-brand-50 flex items-center justify-center">
                <Calendar size={18} className="text-brand-600" />
              </span>
              <span className="flex items-center gap-2 min-w-0">
                <span className="font-semibold text-slate-900 truncate">Holidays</span>
                <span className="inline-flex min-w-5 h-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold bg-slate-100 text-slate-600">
                  {holidays.length}
                </span>
                {holidaysOpen ? (
                  <ChevronUp size={16} className="text-slate-400 shrink-0" />
                ) : (
                  <ChevronDown size={16} className="text-slate-400 shrink-0" />
                )}
              </span>
            </button>
            {isManager && (
              <Button type="button" onClick={() => setShowAddHolidayModal(true)} size="sm">
                <Plus size={14} className="mr-1.5" />
                Add Holiday
              </Button>
            )}
          </div>
          {holidaysOpen && (
            holidays.length === 0 ? (
              <div className="border-t border-slate-100">
                <EmptyState
                  icon={Calendar}
                  title="No holidays yet"
                  description="Company holidays you add here are excluded from KPI calculations."
                />
              </div>
            ) : (
              <div
                className="border-t border-slate-100 overflow-y-auto overflow-x-auto"
                style={{ maxHeight: LIST_MAX_HEIGHT }}
              >
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white z-10">
                    <tr className="border-b border-slate-100">
                      <th className="text-left py-2.5 px-4 sm:px-5 text-xs font-semibold uppercase tracking-wide text-slate-400">Date</th>
                      <th className="text-left py-2.5 px-4 text-xs font-semibold uppercase tracking-wide text-slate-400">Name</th>
                      {isManager && <th className="w-16" aria-label="Actions" />}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {holidays.map((h) => (
                      <tr key={h.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3 px-4 sm:px-5 text-slate-600 whitespace-nowrap">{formatDateDDMMYYYY(h.date)}</td>
                        <td className="py-3 px-4 font-medium text-slate-800">{h.name}</td>
                        {isManager && (
                          <td className="py-2 px-4 text-right">
                            <button
                              type="button"
                              onClick={() => handleDeleteHoliday(h.id)}
                              className="p-2 rounded-control text-slate-400 hover:text-danger-600 hover:bg-danger-50 transition-colors"
                              title="Delete holiday"
                            >
                              <Trash2 size={15} />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </div>

        {/* Absence */}
        <div className="bg-white rounded-card border border-slate-200 shadow-card overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-4">
            <button
              type="button"
              onClick={() => setAbsencesOpen((o) => !o)}
              className="flex items-center gap-3 text-left min-w-0"
            >
              <span className="w-9 h-9 shrink-0 rounded-control bg-warning-50 flex items-center justify-center">
                <UserMinus size={18} className="text-warning-600" />
              </span>
              <span className="flex items-center gap-2 min-w-0">
                <span className="font-semibold text-slate-900 truncate">Absence records</span>
                <span className="inline-flex min-w-5 h-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold bg-slate-100 text-slate-600">
                  {absences.length}
                </span>
                {absencesOpen ? (
                  <ChevronUp size={16} className="text-slate-400 shrink-0" />
                ) : (
                  <ChevronDown size={16} className="text-slate-400 shrink-0" />
                )}
              </span>
            </button>
            <Button type="button" variant="secondary" onClick={() => setShowMarkAbsentModal(true)} size="sm">
              <Plus size={14} className="mr-1.5" />
              Mark myself absent
            </Button>
          </div>
          {absencesOpen && (
            absences.length === 0 ? (
              <div className="border-t border-slate-100">
                <EmptyState
                  icon={UserMinus}
                  title="No absence records"
                  description="Mark yourself absent so tasks during that period don't count against your KPI."
                />
              </div>
            ) : (
              <div
                className="border-t border-slate-100 overflow-y-auto overflow-x-auto"
                style={{ maxHeight: LIST_MAX_HEIGHT }}
              >
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white z-10">
                    <tr className="border-b border-slate-100">
                      <th className="text-left py-2.5 px-4 sm:px-5 text-xs font-semibold uppercase tracking-wide text-slate-400">Member</th>
                      <th className="text-left py-2.5 px-4 text-xs font-semibold uppercase tracking-wide text-slate-400">From</th>
                      <th className="text-left py-2.5 px-4 text-xs font-semibold uppercase tracking-wide text-slate-400">To</th>
                      <th className="text-left py-2.5 px-4 text-xs font-semibold uppercase tracking-wide text-slate-400">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {absences.map((a) => (
                      <tr key={a.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3 px-4 sm:px-5 font-medium text-slate-800 whitespace-nowrap">{a.user_name}</td>
                        <td className="py-3 px-4 text-slate-600 whitespace-nowrap">{formatDateDDMMYYYY(a.from_date)}</td>
                        <td className="py-3 px-4 text-slate-600 whitespace-nowrap">{formatDateDDMMYYYY(a.to_date)}</td>
                        <td className="py-3 px-4 text-slate-500">{a.reason || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </div>
      </section>

      {showAddHolidayModal && isManager && (
        <Modal
          open
          onClose={() => setShowAddHolidayModal(false)}
          size="md"
          title="Add Holiday"
        >
            <form onSubmit={handleAddHoliday} className="space-y-4">
              <Input
                label="Date"
                type="date"
                value={holidayDate}
                onChange={(e) => setHolidayDate(e.target.value)}
                required
              />
              <Input
                label="Name"
                value={holidayName}
                onChange={(e) => setHolidayName(e.target.value)}
                required
                placeholder="e.g. Diwali"
              />
              <div className="flex gap-2 pt-2">
                <Button type="submit" isLoading={loading}>
                  Add Holiday
                </Button>
                <Button type="button" variant="secondary" onClick={() => setShowAddHolidayModal(false)}>
                  Cancel
                </Button>
              </div>
            </form>
        </Modal>
      )}

      {showMarkAbsentModal && (
        <Modal
          open
          onClose={() => setShowMarkAbsentModal(false)}
          size="md"
          title="Mark myself absent"
        >
            <p className="text-sm text-slate-600 mb-4">Tasks during this period won&apos;t count in KPI.</p>
            <form onSubmit={handleMarkAbsent} className="space-y-4">
              <Input
                label="From Date"
                type="date"
                value={absenceFrom}
                onChange={(e) => setAbsenceFrom(e.target.value)}
                required
              />
              <Input
                label="To Date"
                type="date"
                value={absenceTo}
                onChange={(e) => setAbsenceTo(e.target.value)}
                required
              />
              <Input
                label="Reason (optional)"
                value={absenceReason}
                onChange={(e) => setAbsenceReason(e.target.value)}
                placeholder="Leave, sick, etc."
              />
              <div className="flex gap-2 pt-2">
                <Button type="submit" isLoading={loading}>
                  Submit
                </Button>
                <Button type="button" variant="secondary" onClick={() => setShowMarkAbsentModal(false)}>
                  Cancel
                </Button>
              </div>
            </form>
        </Modal>
      )}
      </>
      )}
    </div>
  );
};

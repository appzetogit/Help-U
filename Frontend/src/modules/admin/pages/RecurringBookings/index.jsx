import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { FiRepeat, FiLoader, FiPause, FiPlay, FiXCircle } from 'react-icons/fi';
import bookingFeaturesAdminService from '../../services/bookingFeaturesAdminService';
import { PageHeader, Card, Button, StatusPill, EmptyState, Pagination } from '../../components/adminUi';
import { inputClass, formatDateTime } from '../../components/adminFormat';

const STATUS = {
  active: 'bg-emerald-50 text-emerald-700',
  paused: 'bg-amber-50 text-amber-700',
  cancelled: 'bg-gray-100 text-gray-600',
  completed: 'bg-sky-50 text-sky-700'
};
const FREQ = { weekly: 'Weekly', biweekly: 'Every 2 weeks', monthly: 'Monthly' };

/**
 * All customers' recurring booking plans. Admins can pause, resume or cancel
 * a plan; visits already booked are not affected.
 */
const RecurringBookings = () => {
  const [status, setStatus] = useState('');
  const [frequency, setFrequency] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState({ data: [], stats: {}, pagination: {} });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await bookingFeaturesAdminService.listRecurring({ status: status || undefined, frequency: frequency || undefined, page });
      if (res.success) setResult(res);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load recurring bookings');
    } finally {
      setLoading(false);
    }
  }, [status, frequency, page]);

  useEffect(() => { load(); }, [load]);

  const act = async (plan, action) => {
    if (action === 'cancel' && !window.confirm('Cancel this plan? No further visits will be booked.')) return;
    setBusy(plan._id);
    try {
      const res = await bookingFeaturesAdminService.updateRecurring(plan._id, action);
      if (res.success) {
        toast.success('Plan updated');
        load();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Update failed');
    } finally {
      setBusy(null);
    }
  };

  const stats = result.stats || {};

  return (
    <div className="p-4 sm:p-6">
      <PageHeader icon={FiRepeat} title="Recurring Bookings" description="Repeating service plans set up by customers at checkout. Each visit is booked automatically ahead of time." />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {['active', 'paused', 'completed', 'cancelled'].map((s) => (
          <div key={s} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase text-gray-500">{s}</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{stats[s] || 0}</p>
          </div>
        ))}
      </div>

      <Card>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className={`${inputClass} w-40!`}>
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <select value={frequency} onChange={(e) => { setFrequency(e.target.value); setPage(1); }} className={`${inputClass} w-44!`}>
            <option value="">All frequencies</option>
            <option value="weekly">Weekly</option>
            <option value="biweekly">Every 2 weeks</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>

        {loading ? (
          <div className="flex h-40 items-center justify-center"><FiLoader className="h-6 w-6 animate-spin text-gray-400" /></div>
        ) : result.data.length === 0 ? (
          <EmptyState icon={FiRepeat} title="No recurring plans" />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="py-2 pr-4">Customer</th>
                  <th className="py-2 pr-4">Service</th>
                  <th className="py-2 pr-4">Schedule</th>
                  <th className="py-2 pr-4">Progress</th>
                  <th className="py-2 pr-4">Next visit</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {result.data.map((p) => (
                  <tr key={p._id} className="border-b border-gray-100 align-top last:border-0">
                    <td className="py-3 pr-4">
                      <p className="font-semibold text-gray-900">{p.userId?.name}</p>
                      <p className="text-xs text-gray-500">{p.userId?.phone}</p>
                    </td>
                    <td className="py-3 pr-4">
                      <p className="text-gray-900">{p.serviceName}</p>
                      <p className="text-xs text-gray-500">{p.serviceCategory}{p.discountPercentage > 0 ? ` · ${p.discountPercentage}% off` : ''}</p>
                    </td>
                    <td className="py-3 pr-4">
                      <p>{FREQ[p.frequency]}</p>
                      <p className="text-xs text-gray-500">{p.scheduledTime}</p>
                    </td>
                    <td className="py-3 pr-4">{p.occurrencesCreated} / {p.occurrencesPlanned}</td>
                    <td className="py-3 pr-4 text-xs">
                      {p.status === 'active' ? formatDateTime(p.nextOccurrenceAt) : '—'}
                      {p.lastError && <p className="mt-1 max-w-[200px] text-amber-700">{p.lastError}</p>}
                    </td>
                    <td className="py-3 pr-4"><StatusPill className={STATUS[p.status]}>{p.status}</StatusPill></td>
                    <td className="py-3 text-right">
                      {['active', 'paused'].includes(p.status) && (
                        <div className="inline-flex gap-1">
                          {p.status === 'active'
                            ? <Button variant="ghost" className="px-2" disabled={busy === p._id} onClick={() => act(p, 'pause')} aria-label="Pause"><FiPause /></Button>
                            : <Button variant="ghost" className="px-2 text-emerald-700" disabled={busy === p._id} onClick={() => act(p, 'resume')} aria-label="Resume"><FiPlay /></Button>}
                          <Button variant="ghost" className="px-2 text-red-600" disabled={busy === p._id} onClick={() => act(p, 'cancel')} aria-label="Cancel"><FiXCircle /></Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={result.pagination?.page || 1} pages={result.pagination?.pages} onChange={setPage} />
      </Card>
    </div>
  );
};

export default RecurringBookings;

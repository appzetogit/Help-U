import React, { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import { FiPercent, FiPlus, FiEdit2, FiTrash2, FiLoader, FiSearch } from 'react-icons/fi';
import bookingFeaturesAdminService from '../../services/bookingFeaturesAdminService';
import Modal from '../../components/Modal';
import GlobalDefaultCard from './GlobalDefaultCard';
import { PageHeader, Card, Toggle, Field, Button, StatusPill, EmptyState } from '../../components/adminUi';
import { inputClass, money } from '../../components/adminFormat';

const SCOPES = {
  category: { label: 'Category', className: 'bg-sky-50 text-sky-700' },
  worker: { label: 'Worker', className: 'bg-violet-50 text-violet-700' },
  worker_category: { label: 'Worker + Category', className: 'bg-amber-50 text-amber-700' }
};

const EMPTY = { scope: 'category', categoryId: '', workerId: '', worker: null, commissionType: 'percentage', commissionValue: '', partsPayoutPercentage: '', isActive: true, name: '', notes: '' };

const workerLabel = (w) => (w ? `${w.businessName || w.name}${w.phone ? ` · ${w.phone}` : ''}` : '');

/**
 * Worker search box: type at least two characters to search approved workers.
 */
const WorkerPicker = ({ value, onChange }) => {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  const search = (text) => {
    setQ(text);
    clearTimeout(timer.current);
    if (text.trim().length < 2) { setResults([]); return; }
    timer.current = setTimeout(() => {
      bookingFeaturesAdminService.searchWorkers(text.trim())
        .then((r) => setResults(r.data || []))
        .catch(() => setResults([]));
    }, 300);
  };

  if (value) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm">
        <span className="truncate">{workerLabel(value)}</span>
        <button type="button" className="text-xs font-semibold text-red-600" onClick={() => onChange(null)}>Change</button>
      </div>
    );
  }

  return (
    <div className="relative">
      <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
      <input value={q} onChange={(e) => search(e.target.value)} placeholder="Search by name or phone" className={`${inputClass} pl-9`} />
      {results.length > 0 && (
        <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
          {results.map((w) => (
            <button key={w._id} type="button" onClick={() => { onChange(w); setResults([]); setQ(''); }}
              className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50">
              {workerLabel(w)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const Commission = () => {
  const [rules, setRules] = useState([]);
  const [globalDefault, setGlobalDefault] = useState(null);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  // Preview calculator
  const [preview, setPreview] = useState({ worker: null, categoryId: '', serviceAmount: 1000, partsAmount: 0 });
  const [previewResult, setPreviewResult] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await bookingFeaturesAdminService.listCommissionRules();
      if (res.success) {
        setRules(res.data || []);
        setGlobalDefault(res.globalDefault);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load commission rules');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    bookingFeaturesAdminService.listCategories()
      .then((r) => setCategories((r.categories || []).map((c) => ({ id: c.id || c._id, title: c.title }))))
      .catch(() => {});
  }, [load]);

  const setField = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));

  const openEdit = (r) => setForm({
    ...EMPTY,
    ...r,
    categoryId: r.categoryId?._id || r.categoryId || '',
    workerId: r.workerId?._id || r.workerId || '',
    worker: r.workerId && typeof r.workerId === 'object' ? r.workerId : null,
    partsPayoutPercentage: r.partsPayoutPercentage ?? ''
  });

  const save = async () => {
    const needsCategory = ['category', 'worker_category'].includes(form.scope);
    const needsWorker = ['worker', 'worker_category'].includes(form.scope);
    if (needsCategory && !form.categoryId) return toast.error('Choose a category');
    if (needsWorker && !form.worker) return toast.error('Choose a worker');
    if (form.commissionValue === '' || Number(form.commissionValue) < 0) return toast.error('Enter the commission');
    if (form.commissionType === 'percentage' && Number(form.commissionValue) > 100) return toast.error('Percentage cannot exceed 100');

    const body = {
      name: form.name,
      scope: form.scope,
      categoryId: needsCategory ? form.categoryId : null,
      workerId: needsWorker ? form.worker?._id : null,
      commissionType: form.commissionType,
      commissionValue: Number(form.commissionValue),
      partsPayoutPercentage: form.partsPayoutPercentage === '' ? null : Number(form.partsPayoutPercentage),
      isActive: form.isActive,
      notes: form.notes
    };

    setSaving(true);
    try {
      const res = form._id
        ? await bookingFeaturesAdminService.updateCommissionRule(form._id, body)
        : await bookingFeaturesAdminService.createCommissionRule(body);
      if (res.success) {
        toast.success(res.message || 'Saved');
        setForm(null);
        load();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (r) => {
    try {
      await bookingFeaturesAdminService.updateCommissionRule(r._id, { isActive: !r.isActive });
      load();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Update failed');
    }
  };

  const remove = async (r) => {
    if (!window.confirm('Delete this rule? Bills already generated keep the commission they used.')) return;
    try {
      await bookingFeaturesAdminService.deleteCommissionRule(r._id);
      setRules((prev) => prev.filter((x) => x._id !== r._id));
      toast.success('Rule deleted');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Delete failed');
    }
  };

  const runPreview = async () => {
    try {
      const res = await bookingFeaturesAdminService.previewCommission({
        workerId: preview.worker?._id,
        categoryId: preview.categoryId || undefined,
        serviceAmount: preview.serviceAmount,
        partsAmount: preview.partsAmount
      });
      if (res.success) setPreviewResult(res.data);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Preview failed');
    }
  };

  const describe = (r) => (r.commissionType === 'fixed' ? `${money(r.commissionValue)} per booking` : `${r.commissionValue}% of service`);

  return (
    <div className="p-4 sm:p-6">
      <PageHeader
        icon={FiPercent}
        title="Commission"
        description="Platform commission on each bill. The most specific active rule wins: worker + category, then worker, then category, then the global default."
        actions={<Button onClick={() => setForm({ ...EMPTY })}><FiPlus /> New rule</Button>}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <GlobalDefaultCard
          globalDefault={globalDefault}
          onSaved={(next) => { setGlobalDefault(next); setPreviewResult(null); }}
        />

        <Card title="Check a split" className="lg:col-span-2">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Worker (optional)"><WorkerPicker value={preview.worker} onChange={(w) => setPreview((p) => ({ ...p, worker: w }))} /></Field>
            <Field label="Category (optional)">
              <select value={preview.categoryId} onChange={(e) => setPreview((p) => ({ ...p, categoryId: e.target.value }))} className={inputClass}>
                <option value="">Any</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </Field>
            <Field label="Service amount (₹, excl. GST)"><input type="number" min="0" value={preview.serviceAmount} onChange={(e) => setPreview((p) => ({ ...p, serviceAmount: e.target.value }))} className={inputClass} /></Field>
            <Field label="Parts amount (₹, excl. GST)"><input type="number" min="0" value={preview.partsAmount} onChange={(e) => setPreview((p) => ({ ...p, partsAmount: e.target.value }))} className={inputClass} /></Field>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <Button variant="secondary" onClick={runPreview}>Calculate</Button>
            {previewResult && (
              <div className="text-sm text-gray-700">
                Rule: <StatusPill className={(SCOPES[previewResult.commission.source] || { className: 'bg-gray-100 text-gray-700' }).className}>{SCOPES[previewResult.commission.source]?.label || 'Global default'}</StatusPill>
                <span className="ml-3">Worker earns <b>{money(previewResult.vendorTotalEarning)}</b></span>
                <span className="ml-3">Platform keeps <b>{money(previewResult.platformShare)}</b></span>
              </div>
            )}
          </div>
        </Card>
      </div>

      <Card title={`Rules (${rules.length})`} className="mt-6">
        {loading ? (
          <div className="flex h-40 items-center justify-center"><FiLoader className="h-6 w-6 animate-spin text-gray-400" /></div>
        ) : rules.length === 0 ? (
          <EmptyState icon={FiPercent} title="No overrides" description="Every bill uses the global default. Add a rule for a category, a worker, or a worker in one category." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="py-2 pr-4">Applies to</th>
                  <th className="py-2 pr-4">Commission</th>
                  <th className="py-2 pr-4">Parts payout</th>
                  <th className="py-2 pr-4">Active</th>
                  <th className="py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={r._id} className="border-b border-gray-100 last:border-0">
                    <td className="py-3 pr-4">
                      <StatusPill className={SCOPES[r.scope].className}>{SCOPES[r.scope].label}</StatusPill>
                      <p className="mt-1 text-gray-900">
                        {[r.workerId && workerLabel(r.workerId), r.categoryId?.title].filter(Boolean).join(' · ')}
                      </p>
                      {(r.name || r.notes) && <p className="text-xs text-gray-500">{r.name || r.notes}</p>}
                    </td>
                    <td className="py-3 pr-4 font-semibold">{describe(r)}</td>
                    <td className="py-3 pr-4">{r.partsPayoutPercentage == null ? <span className="text-gray-400">Default</span> : `${r.partsPayoutPercentage}%`}</td>
                    <td className="py-3 pr-4"><Toggle checked={r.isActive} onChange={() => toggleActive(r)} /></td>
                    <td className="py-3 text-right">
                      <div className="inline-flex gap-1">
                        <Button variant="ghost" className="px-2" onClick={() => openEdit(r)} aria-label="Edit"><FiEdit2 /></Button>
                        <Button variant="ghost" className="px-2 text-red-600" onClick={() => remove(r)} aria-label="Delete"><FiTrash2 /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal isOpen={!!form} onClose={() => !saving && setForm(null)} title={form?._id ? 'Edit commission rule' : 'New commission rule'} size="md">
        {form && (
          <div className="space-y-4">
            <Field label="Applies to">
              <select value={form.scope} onChange={(e) => setField('scope')(e.target.value)} className={inputClass}>
                <option value="category">A category (all workers)</option>
                <option value="worker">A worker (all categories)</option>
                <option value="worker_category">A worker in one category</option>
              </select>
            </Field>
            {['category', 'worker_category'].includes(form.scope) && (
              <Field label="Category">
                <select value={form.categoryId} onChange={(e) => setField('categoryId')(e.target.value)} className={inputClass}>
                  <option value="">Choose a category</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
              </Field>
            )}
            {['worker', 'worker_category'].includes(form.scope) && (
              <Field label="Worker"><WorkerPicker value={form.worker} onChange={setField('worker')} /></Field>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Commission type">
                <select value={form.commissionType} onChange={(e) => setField('commissionType')(e.target.value)} className={inputClass}>
                  <option value="percentage">Percentage of service</option>
                  <option value="fixed">Fixed ₹ per booking</option>
                </select>
              </Field>
              <Field label={form.commissionType === 'fixed' ? 'Commission (₹)' : 'Commission (%)'} hint="Kept by the platform from the service amount, excluding GST.">
                <input type="number" min="0" max={form.commissionType === 'percentage' ? 100 : undefined} value={form.commissionValue} onChange={(e) => setField('commissionValue')(e.target.value)} className={inputClass} />
              </Field>
            </div>
            <Field label="Worker's share of parts (%)" hint="Leave empty to use the global setting.">
              <input type="number" min="0" max="100" value={form.partsPayoutPercentage} onChange={(e) => setField('partsPayoutPercentage')(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Note (optional)"><input value={form.notes} onChange={(e) => setField('notes')(e.target.value)} maxLength={500} className={inputClass} /></Field>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-gray-700"><Toggle checked={form.isActive} onChange={setField('isActive')} /> Active</label>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setForm(null)} disabled={saving}>Cancel</Button>
                <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default Commission;

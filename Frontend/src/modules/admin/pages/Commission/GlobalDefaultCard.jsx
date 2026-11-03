import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import { FiInfo, FiEdit2, FiLoader } from 'react-icons/fi';
import bookingFeaturesAdminService from '../../services/bookingFeaturesAdminService';
import { Card, Field, Button } from '../../components/adminUi';
import { inputClass, money } from '../../components/adminFormat';

const TYPES = [
  { key: 'percentage', label: 'Percentage' },
  { key: 'fixed', label: 'Fixed ₹' }
];

const clamp = (n) => (Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0);

/**
 * The global default commission, the only place it is edited. Every bill uses it unless a more specific
 * rule (category, worker, or worker + category) applies. Written as what the platform keeps, so the
 * percentage reads the same here as in a rule.
 */
const GlobalDefaultCard = ({ globalDefault, onSaved }) => {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(null);

  const startEdit = () => {
    setForm({
      commissionType: globalDefault.commissionType === 'fixed' ? 'fixed' : 'percentage',
      percentageCommission: String(globalDefault.percentageCommission),
      fixedCommission: String(globalDefault.fixedCommission),
      partsPayoutPercentage: String(globalDefault.partsPayoutPercentage)
    });
    setEditing(true);
  };

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const save = async () => {
    setSaving(true);
    try {
      const res = await bookingFeaturesAdminService.updateCommissionDefault({
        commissionType: form.commissionType,
        percentageCommission: form.percentageCommission,
        fixedCommission: form.fixedCommission,
        partsPayoutPercentage: form.partsPayoutPercentage
      });
      if (res.success) {
        toast.success('Default commission saved');
        onSaved(res.globalDefault);
        setEditing(false);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const right = globalDefault && !editing
    ? <Button variant="secondary" className="!px-3 !py-1.5" onClick={startEdit}><FiEdit2 /> Edit</Button>
    : null;

  return (
    <Card title="Global default" icon={FiInfo} className="lg:col-span-1" right={right}>
      {!globalDefault && <FiLoader className="animate-spin text-gray-400" />}

      {globalDefault && !editing && (
        <div className="space-y-2 text-sm">
          {globalDefault.commissionType === 'fixed' ? (
            <p><span className="font-semibold">{money(globalDefault.fixedCommission)}</span> per booking kept by the platform</p>
          ) : (
            <p><span className="font-semibold">{globalDefault.percentageCommission}%</span> of service kept by the platform (worker gets {globalDefault.servicePayoutPercentage}%)</p>
          )}
          <p>Worker gets <span className="font-semibold">{globalDefault.partsPayoutPercentage}%</span> of parts</p>
          <p className="text-xs text-gray-500">Used for every bill unless a rule below applies. This is the only place commission is set.</p>
        </div>
      )}

      {globalDefault && editing && form && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-gray-100 p-1">
            {TYPES.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setForm((f) => ({ ...f, commissionType: t.key }))}
                className={`rounded-md py-1.5 text-xs font-bold transition-all ${form.commissionType === t.key ? 'bg-white text-[#163B66] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {form.commissionType === 'percentage' ? (
            <Field
              label="Platform commission on service (%)"
              hint={`The platform keeps this share of the service amount (excl. GST). Worker keeps ${Math.round((100 - clamp(Number(form.percentageCommission))) * 100) / 100}%.`}
            >
              <input type="number" min="0" max="100" step="0.01" value={form.percentageCommission} onChange={set('percentageCommission')} className={inputClass} />
            </Field>
          ) : (
            <Field label="Fixed commission per booking (₹)" hint="Kept by the platform from the service amount (excl. GST). The worker's share never goes below zero.">
              <input type="number" min="0" step="1" value={form.fixedCommission} onChange={set('fixedCommission')} className={inputClass} />
            </Field>
          )}

          <Field label="Worker's share of parts (%)" hint="The platform keeps the rest of the parts amount.">
            <input type="number" min="0" max="100" step="0.01" value={form.partsPayoutPercentage} onChange={set('partsPayoutPercentage')} className={inputClass} />
          </Field>

          <p className="text-[11px] text-gray-500">Applies to bills created from now on. Bills already generated keep the commission they used.</p>

          <div className="flex gap-2">
            <Button onClick={save} disabled={saving}>{saving ? <><FiLoader className="animate-spin" /> Saving...</> : 'Save'}</Button>
            <Button variant="secondary" onClick={() => setEditing(false)} disabled={saving}>Cancel</Button>
          </div>
        </div>
      )}
    </Card>
  );
};

export default GlobalDefaultCard;

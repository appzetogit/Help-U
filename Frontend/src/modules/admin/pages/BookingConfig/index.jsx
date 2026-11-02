import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'react-hot-toast';
import {
  FiSliders, FiLoader, FiFileText, FiImage, FiPlusCircle, FiAlertTriangle, FiMessageCircle,
  FiAlertOctagon, FiTarget, FiPercent, FiDollarSign, FiRepeat, FiSave, FiX, FiPlus, FiCalendar, FiClock, FiXCircle
} from 'react-icons/fi';
import bookingFeaturesAdminService from '../../services/bookingFeaturesAdminService';
import { PageHeader, Card, Toggle, Field, Button } from '../../components/adminUi';
import { DispatchModeCards } from '../../components/DispatchModeSwitch';
import { inputClass } from '../../components/adminFormat';

/**
 * Booking Configuration
 *
 * Every booking feature built for the user and worker apps is switched on/off
 * and tuned here: notes, problem media, add-ons, emergency bookings, chat,
 * disputes, worker assignment, commission default, payouts and recurring
 * bookings. Changes are saved together and pushed to open apps immediately.
 */

const NumberInput = ({ value, onChange, min, max, step = 1, suffix, disabled }) => (
  <div className="flex items-center gap-2">
    <input
      type="number"
      value={value ?? ''}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
      className={inputClass}
    />
    {suffix && <span className="shrink-0 text-xs text-gray-500">{suffix}</span>}
  </div>
);

const ToggleRow = ({ label, description, checked, onChange }) => (
  <div className="flex items-start justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50/60 p-4">
    <div className="min-w-0">
      <h3 className="text-sm font-semibold text-gray-900">{label}</h3>
      {description && <p className="mt-1 text-xs leading-relaxed text-gray-500">{description}</p>}
    </div>
    <Toggle checked={checked} onChange={onChange} />
  </div>
);

const FREQUENCIES = [
  { key: 'weekly', label: 'Weekly' },
  { key: 'biweekly', label: 'Every 2 weeks' },
  { key: 'monthly', label: 'Monthly' }
];

const BookingConfig = () => {
  const [config, setConfig] = useState(null);
  const [saved, setSaved] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newReason, setNewReason] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await bookingFeaturesAdminService.getConfig();
      if (res.success) {
        setConfig(res.config);
        setSaved(res.config);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not load booking configuration');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const set = (key) => (value) => setConfig((prev) => ({ ...prev, [key]: value }));

  // Only changed keys are sent, so a save never overwrites a value another
  // admin changed meanwhile on a field this admin did not touch.
  const changes = useMemo(() => {
    if (!config || !saved) return {};
    return Object.fromEntries(
      Object.entries(config).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(saved[k]))
    );
  }, [config, saved]);
  const dirty = Object.keys(changes).length > 0;

  const weightTotal = config
    ? (Number(config.assignmentDistanceWeight) || 0) + (Number(config.assignmentRatingWeight) || 0)
      + (Number(config.assignmentAcceptanceWeight) || 0) + (Number(config.assignmentCompletionWeight) || 0)
      + (Number(config.assignmentResponseTimeWeight) || 0)
    : 0;

  const save = async () => {
    if (!dirty) return;
    if (Object.values(changes).some((v) => v === '')) {
      toast.error('Please fill in every number field');
      return;
    }
    setSaving(true);
    try {
      const res = await bookingFeaturesAdminService.updateConfig(changes);
      if (res.success) {
        setConfig(res.config);
        setSaved(res.config);
        toast.success('Booking configuration saved');
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <FiLoader className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!config) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
          Could not load booking configuration.
          <button onClick={load} className="ml-3 rounded bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-700">Retry</button>
        </div>
      </div>
    );
  }

  const toggleFrequency = (key) => {
    const list = config.recurringFrequencies || [];
    const next = list.includes(key) ? list.filter((f) => f !== key) : [...list, key];
    if (next.length === 0) {
      toast.error('Keep at least one frequency');
      return;
    }
    set('recurringFrequencies')(next);
  };

  const addReason = () => {
    const r = newReason.trim();
    if (!r) return;
    if ((config.disputeReasons || []).includes(r)) return toast.error('That reason already exists');
    set('disputeReasons')([...(config.disputeReasons || []), r]);
    setNewReason('');
  };

  return (
    <div className="p-4 pb-28 sm:p-6 sm:pb-28">
      <PageHeader
        icon={FiSliders}
        title="Booking Configuration"
        description="Switch booking features on or off and set their limits. Saved changes reach the user and worker apps immediately."
      />

      <div className="space-y-6">
        {/* Notes */}
        <Card title="Customer Notes" icon={FiFileText}>
          <div className="grid gap-4 sm:grid-cols-2">
            <ToggleRow label="Instructions at checkout" description="Customers can add notes for the professional (gate code, parking, details of the problem)." checked={config.isCustomerNotesEnabled} onChange={set('isCustomerNotesEnabled')} />
            <Field label="Maximum length" hint="Characters, 50–2000.">
              <NumberInput value={config.customerNotesMaxLength} onChange={set('customerNotesMaxLength')} min={50} max={2000} suffix="chars" />
            </Field>
          </div>
        </Card>

        {/* Media */}
        <Card title="Problem Photos & Videos" icon={FiImage}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Photos per booking" hint="0 hides photo upload.">
              <NumberInput value={config.maxIssuePhotos} onChange={set('maxIssuePhotos')} min={0} max={10} />
            </Field>
            <ToggleRow label="Video upload" description="Customers can attach short videos of the problem." checked={config.isIssueVideoEnabled} onChange={set('isIssueVideoEnabled')} />
            <Field label="Videos per booking">
              <NumberInput value={config.maxIssueVideos} onChange={set('maxIssueVideos')} min={0} max={3} disabled={!config.isIssueVideoEnabled} />
            </Field>
            <Field label="Max video size">
              <NumberInput value={config.maxIssueVideoSizeMB} onChange={set('maxIssueVideoSizeMB')} min={1} max={100} suffix="MB" disabled={!config.isIssueVideoEnabled} />
            </Field>
            <Field label="Max video length">
              <NumberInput value={config.maxIssueVideoDurationSec} onChange={set('maxIssueVideoDurationSec')} min={5} max={300} suffix="sec" disabled={!config.isIssueVideoEnabled} />
            </Field>
          </div>
        </Card>

        {/* Add-ons */}
        <Card title="Add-ons" icon={FiPlusCircle}>
          <ToggleRow label="Add-ons at checkout" description="Show the extras configured on the Add-ons page for each service. Prices are taxed like the service and paid to the worker per their commission." checked={config.isAddOnsEnabled} onChange={set('isAddOnsEnabled')} />
        </Card>

        {/* Emergency */}
        <Card title="Emergency Bookings" icon={FiAlertTriangle}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <ToggleRow label="Emergency booking" description="Offered only on categories marked “Emergency available” in category settings." checked={config.isEmergencyEnabled} onChange={set('isEmergencyEnabled')} />
            <Field label="Surcharge type">
              <select value={config.emergencySurchargeType} onChange={(e) => set('emergencySurchargeType')(e.target.value)} className={inputClass}>
                <option value="fixed">Fixed amount (₹)</option>
                <option value="percentage">Percentage of service</option>
              </select>
            </Field>
            <Field label={config.emergencySurchargeType === 'percentage' ? 'Surcharge (%)' : 'Surcharge (₹)'} hint="Added to the service amount; GST applies.">
              <NumberInput value={config.emergencySurchargeValue} onChange={set('emergencySurchargeValue')} min={0} suffix={config.emergencySurchargeType === 'percentage' ? '%' : '₹'} />
            </Field>
            <Field label="Search radius" hint="Wider than the normal search.">
              <NumberInput value={config.emergencySearchRadius} onChange={set('emergencySearchRadius')} min={1} max={200} suffix="km" />
            </Field>
            <Field label="Workers alerted at once" hint="First alert wave size for emergencies.">
              <NumberInput value={config.emergencyFirstWaveSize} onChange={set('emergencyFirstWaveSize')} min={1} max={50} />
            </Field>
            <Field label="Search time limit" hint="Booking is cancelled if nobody accepts.">
              <NumberInput value={config.emergencyMaxSearchTime} onChange={set('emergencyMaxSearchTime')} min={1} max={60} suffix="min" />
            </Field>
          </div>
        </Card>

        {/* Chat */}
        <Card title="Customer ↔ Professional Chat" icon={FiMessageCircle}>
          <div className="grid gap-4 sm:grid-cols-2">
            <ToggleRow label="Booking chat" description="Customer and assigned professional can message each other inside the booking." checked={config.isChatEnabled} onChange={set('isChatEnabled')} />
            <ToggleRow label="Photos in chat" description="Allow sending images in chat." checked={config.isChatImageEnabled} onChange={set('isChatImageEnabled')} />
            <ToggleRow label="Hide phone numbers" description="Masks phone numbers typed in messages to keep contact on-platform." checked={config.chatMaskPhoneNumbers} onChange={set('chatMaskPhoneNumbers')} />
            <Field label="Close chat after booking ends" hint="Chat becomes read-only after this many hours. 0 closes it immediately.">
              <NumberInput value={config.chatCloseAfterHours} onChange={set('chatCloseAfterHours')} min={0} max={720} suffix="hours" />
            </Field>
          </div>
        </Card>

        {/* Disputes */}
        <Card title="Disputes" icon={FiAlertOctagon}>
          <div className="grid gap-4 sm:grid-cols-3">
            <ToggleRow label="Dispute reporting" description="Customers and professionals can report a problem on a finished or cancelled booking." checked={config.isDisputeEnabled} onChange={set('isDisputeEnabled')} />
            <Field label="Reporting window" hint="Days after the booking ends.">
              <NumberInput value={config.disputeWindowDays} onChange={set('disputeWindowDays')} min={1} max={90} suffix="days" />
            </Field>
            <Field label="Evidence photos per message">
              <NumberInput value={config.maxDisputeEvidence} onChange={set('maxDisputeEvidence')} min={0} max={10} />
            </Field>
          </div>
          <div className="mt-4">
            <span className="text-xs font-semibold text-gray-700">Reasons customers can choose</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {(config.disputeReasons || []).map((r) => (
                <span key={r} className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-medium text-gray-700">
                  {r}
                  <button
                    type="button"
                    aria-label={`Remove ${r}`}
                    onClick={() => {
                      if (config.disputeReasons.length <= 1) return toast.error('Keep at least one reason');
                      set('disputeReasons')(config.disputeReasons.filter((x) => x !== r));
                    }}
                    className="text-gray-400 hover:text-red-500"
                  >
                    <FiX className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="mt-2 flex max-w-md gap-2">
              <input
                value={newReason}
                onChange={(e) => setNewReason(e.target.value.slice(0, 100))}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addReason(); } }}
                placeholder="Add a reason"
                className={inputClass}
              />
              <Button variant="secondary" onClick={addReason}><FiPlus /> Add</Button>
            </div>
          </div>
        </Card>

        {/* Assignment */}
        <Card title="How bookings find professionals" icon={FiTarget}>
          <p className="text-[11px] text-gray-500 mb-3">
            One rule decides at a time. Switch it here or from the Zones page; it applies to every new booking straight away.
            Zones themselves (maps, surge, allowed services) are kept, just not used while "By distance" is on.
          </p>
          <DispatchModeCards value={config.dispatchMode || 'zone'} onChange={set('dispatchMode')} />
          <div className="mt-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5 text-[11px] text-gray-600 space-y-1">
            <p className="font-bold text-gray-700">Where the distances are set (used when sending "By distance"):</p>
            <p>
              Normal search radius:{' '}
              <a href="/admin/settings/financial" className="font-semibold text-sky-700 underline">Settings &rsaquo; Financial Info &rsaquo; Booking Timing &amp; Waves &rsaquo; Global Search Radius</a>
            </p>
            <p>Emergency search radius: <span className="font-semibold">Emergency Bookings</span> card on this page.</p>
            <p>A professional's own travel radius: <span className="font-semibold">Partner Service Area</span> card on this page.</p>
            <p className="text-gray-500">In "By zone" mode none of these are used.</p>
          </div>
        </Card>

        <Card title="Worker Assignment" icon={FiTarget}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Strategy" hint="Smart ranks nearby workers by the weights below; Distance alerts the closest first.">
              <select value={config.assignmentStrategy} onChange={(e) => set('assignmentStrategy')(e.target.value)} className={inputClass}>
                <option value="smart">Smart (distance, rating, acceptance, completion)</option>
                <option value="distance">Distance only</option>
              </select>
            </Field>
            <Field label="Minimum rating" hint="Workers below this (with 3+ reviews) are not alerted. 0 disables.">
              <NumberInput value={config.assignmentMinRating} onChange={set('assignmentMinRating')} min={0} max={5} step={0.1} suffix="★" />
            </Field>
            <Field label="Stats window" hint="Acceptance and completion rates look back this far.">
              <NumberInput value={config.assignmentStatsWindowDays} onChange={set('assignmentStatsWindowDays')} min={7} max={365} suffix="days" />
            </Field>
          </div>

          {config.assignmentStrategy === 'smart' && (
            <div className="mt-4 rounded-lg border border-gray-200 p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-700">Ranking weights</span>
                <span className={`text-xs font-semibold ${weightTotal > 0 ? 'text-gray-500' : 'text-red-600'}`}>Total {weightTotal} (relative, need not add to 100)</span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <Field label="Distance"><NumberInput value={config.assignmentDistanceWeight} onChange={set('assignmentDistanceWeight')} min={0} max={100} /></Field>
                <Field label="Rating"><NumberInput value={config.assignmentRatingWeight} onChange={set('assignmentRatingWeight')} min={0} max={100} /></Field>
                <Field label="Acceptance rate"><NumberInput value={config.assignmentAcceptanceWeight} onChange={set('assignmentAcceptanceWeight')} min={0} max={100} /></Field>
                <Field label="Completion rate"><NumberInput value={config.assignmentCompletionWeight} onChange={set('assignmentCompletionWeight')} min={0} max={100} /></Field>
                <Field label="Response speed" hint="How fast they usually accept. 0 leaves it out."><NumberInput value={config.assignmentResponseTimeWeight} onChange={set('assignmentResponseTimeWeight')} min={0} max={100} /></Field>
              </div>
            </div>
          )}

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Field label="Wave 1 size" hint="Workers alerted first (the wave timer is on the Settings page).">
              <NumberInput value={config.wave1Size} onChange={set('wave1Size')} min={1} max={50} />
            </Field>
            <Field label="Wave 2 size"><NumberInput value={config.wave2Size} onChange={set('wave2Size')} min={1} max={50} /></Field>
            <Field label="Wave 3 size" hint="Wave 4 alerts everyone left."><NumberInput value={config.wave3Size} onChange={set('wave3Size')} min={1} max={50} /></Field>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <ToggleRow label="Skip ahead on rejection" description="When everyone alerted rejects, alert the next wave immediately instead of waiting." checked={config.autoReassignOnReject} onChange={set('autoReassignOnReject')} />
            <ToggleRow label="Reassign when a worker cancels" description="If the assigned worker cancels before arriving, find another one instead of cancelling the customer's booking." checked={config.autoReassignOnWorkerCancel} onChange={set('autoReassignOnWorkerCancel')} />
            <Field label="Max reassignments per booking">
              <NumberInput value={config.maxReassignments} onChange={set('maxReassignments')} min={0} max={10} disabled={!config.autoReassignOnWorkerCancel} />
            </Field>
          </div>

          <div className="mt-6 pt-4 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-700">Admin assignment queue</p>
            <p className="text-[11px] text-gray-500 mt-0.5 mb-3">
              When nobody in the customer's zone can take a booking, it waits here for you to pick a professional by hand
              (Bookings → Needs assignment) instead of being cancelled. The professional you pick still accepts or declines.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <ToggleRow label="Send unassignable bookings to the admin" description="Off: a booking nobody can take is cancelled and refunded, as before." checked={config.isAdminAssignmentEnabled} onChange={set('isAdminAssignmentEnabled')} />
              <ToggleRow label="Also when the search ends with no acceptance" description="Professionals were alerted but none accepted in time: hand it to the admin instead of cancelling." checked={config.escalateToAdminOnTimeout} onChange={set('escalateToAdminOnTimeout')} />
              <Field label="Admin has (minutes) to assign" hint="After this the booking is cancelled and refunded. A visit booked for later never waits past its own time slot.">
                <NumberInput value={config.adminAssignmentWindowMins} onChange={set('adminAssignmentWindowMins')} min={5} max={1440} suffix="min" disabled={!config.isAdminAssignmentEnabled} />
              </Field>
              <Field label="Chosen professional has (minutes) to answer" hint="If they do not accept in this time, the booking returns to the queue.">
                <NumberInput value={config.adminAssignedResponseMins} onChange={set('adminAssignedResponseMins')} min={1} max={240} suffix="min" disabled={!config.isAdminAssignmentEnabled} />
              </Field>
            </div>
          </div>
        </Card>

        {/* Commission */}
        <Card title="Default Commission" icon={FiPercent}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Default commission type" hint="Percentage uses the service payout % on the Settings page. Category and worker overrides are on the Commission page.">
              <select value={config.defaultCommissionType} onChange={(e) => set('defaultCommissionType')(e.target.value)} className={inputClass}>
                <option value="percentage">Percentage (Settings → service payout %)</option>
                <option value="fixed">Fixed amount per booking</option>
              </select>
            </Field>
            {config.defaultCommissionType === 'fixed' && (
              <Field label="Fixed commission per booking" hint="Kept by the platform from the service amount (excluding GST).">
                <NumberInput value={config.defaultFixedCommission} onChange={set('defaultFixedCommission')} min={0} suffix="₹" />
              </Field>
            )}
          </div>
        </Card>

        {/* Payouts */}
        <Card title="Payouts" icon={FiDollarSign}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Minimum withdrawal" hint="Smallest amount a worker can request.">
              <NumberInput value={config.minWithdrawalAmount} onChange={set('minWithdrawalAmount')} min={0} suffix="₹" />
            </Field>
          </div>
        </Card>

        {/* Partner service area */}
        <Card title="Partner Service Area" icon={FiTarget}>
          <ToggleRow
            label="Let partners set their own service radius"
            description="A partner can choose how many km from his own home address he will travel. It is optional for each partner: empty means the platform search radius applies. When this is off, partners do not see the field and everyone uses the platform radius (saved choices are kept)."
            checked={config.isWorkerServiceRadiusEnabled}
            onChange={set('isWorkerServiceRadiusEnabled')}
          />
          {config.isWorkerServiceRadiusEnabled && (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Smallest radius a partner may choose" hint="Partners must pick at least this many km.">
                <NumberInput value={config.workerServiceRadiusMinKm} onChange={set('workerServiceRadiusMinKm')} min={1} suffix="km" />
              </Field>
              <Field label="Largest radius a partner may choose" hint="Also the farthest from home a partner can ever be matched. Must not be below the smallest.">
                <NumberInput value={config.workerServiceRadiusMaxKm} onChange={set('workerServiceRadiusMaxKm')} min={1} suffix="km" />
              </Field>
            </div>
          )}
          <p className="mt-3 rounded bg-gray-50 px-3 py-2 text-xs text-gray-600">
            A partner's own radius replaces the platform search radius for him (it can be larger or smaller), measured from his saved home address. Partners with no saved map location use the platform radius.
          </p>
        </Card>

        {/* Rescheduling */}
        <Card title="Rescheduling" icon={FiClock}>
          <ToggleRow
            label="Allow rescheduling"
            description="Customers can move a booking to another slot until the professional is on the way. When this is off nobody can reschedule."
            checked={config.isRescheduleEnabled}
            onChange={set('isRescheduleEnabled')}
          />
          {config.isRescheduleEnabled && (
            <>
              <div className="mt-4">
                <ToggleRow
                  label="Let partners ask for a new time"
                  description="The assigned partner can propose another slot. The booking only moves if the customer accepts."
                  checked={config.isWorkerRescheduleEnabled}
                  onChange={set('isWorkerRescheduleEnabled')}
                />
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field label="Reschedules allowed per booking" hint="0 = no limit. Counts every move, whether the customer or an accepted partner request.">
                  <NumberInput value={config.rescheduleMaxCount} onChange={set('rescheduleMaxCount')} min={0} max={20} />
                </Field>
                <Field label="Closes before the appointment" hint="0 = can be moved any time before the visit starts.">
                  <NumberInput value={config.rescheduleCutoffHours} onChange={set('rescheduleCutoffHours')} min={0} max={72} suffix="hours" />
                </Field>
              </div>
            </>
          )}
        </Card>

        {/* Wallet top-up */}
        <Card title="Wallet Top-up" icon={FiDollarSign}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Minimum top-up" hint="Smallest amount a customer can add to their wallet at once.">
              <NumberInput value={config.walletMinTopup} onChange={set('walletMinTopup')} min={1} suffix="₹" />
            </Field>
            <Field label="Maximum top-up" hint="Largest amount a customer can add at once. Must not be below the minimum.">
              <NumberInput value={config.walletMaxTopup} onChange={set('walletMaxTopup')} min={1} suffix="₹" />
            </Field>
          </div>
        </Card>

        {/* Time slots */}
        <Card title="Booking Time Slots" icon={FiClock}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="First slot starts at" hint="24-hour clock, e.g. 9 for 9 AM.">
              <NumberInput value={config.slotStartHour} onChange={set('slotStartHour')} min={0} max={23} suffix="o'clock" />
            </Field>
            <Field label="Last slot starts at" hint="The latest slot offered starts at this hour, e.g. 20 for 8 PM.">
              <NumberInput value={config.slotEndHour} onChange={set('slotEndHour')} min={1} max={24} suffix="o'clock" />
            </Field>
            <Field label="Slot length" hint="One slot is offered every this many minutes.">
              <NumberInput value={config.slotDurationMinutes} onChange={set('slotDurationMinutes')} min={15} max={240} step={15} suffix="min" />
            </Field>
            <Field label="Book up to" hint="How many days ahead (including today) customers can pick.">
              <NumberInput value={config.slotMaxDaysAhead} onChange={set('slotMaxDaysAhead')} min={1} max={30} suffix="days" />
            </Field>
            <Field label="Minimum notice" hint="A slot must start at least this long from now.">
              <NumberInput value={config.slotMinLeadMinutes} onChange={set('slotMinLeadMinutes')} min={0} max={1440} suffix="min" />
            </Field>
          </div>
        </Card>

        {/* Scheduled bookings */}
        <Card title="Scheduled Bookings & Worker Availability" icon={FiCalendar}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Keep searching until" hint="A future booking stays open until this long before its slot, then is cancelled if nobody accepted. Never shorter than the normal search time.">
              <NumberInput value={config.scheduledBookingCutoffHours} onChange={set('scheduledBookingCutoffHours')} min={0} max={72} suffix="hours before the slot" />
            </Field>
            <Field label="Expected job length" hint="Used to tell whether two bookings of one worker overlap.">
              <NumberInput value={config.scheduledJobDurationMinutes} onChange={set('scheduledJobDurationMinutes')} min={15} max={600} suffix="min" />
            </Field>
            <Field label="Travel buffer" hint="Extra time kept free around each job for travel.">
              <NumberInput value={config.scheduledTravelBufferMinutes} onChange={set('scheduledTravelBufferMinutes')} min={0} max={240} suffix="min" />
            </Field>
            <ToggleRow label="Scheduled bookings reach busy workers" description="Workers who are on a job right now still get alerts for future bookings (overlapping slots are always skipped)." checked={config.allowBusyWorkersForScheduled} onChange={set('allowBusyWorkersForScheduled')} />
            <ToggleRow label="Instant bookings skip busy workers" description="A worker who is at work right now does not get instant booking alerts." checked={config.excludeBusyWorkersForInstant} onChange={set('excludeBusyWorkersForInstant')} />
          </div>
        </Card>

        {/* Cancellation policy */}
        <Card title="Cancellation Policy" icon={FiXCircle}>
          <p className="mb-4 text-xs text-gray-600">
            Applies once a professional has been allotted; before that, cancelling is always free.
            Cancelling is free if the slot is at least the free-cancellation time away, or for a short grace time after the
            professional accepts (this is what lets customers undo an instant booking). After that the fee below applies.
            Once the professional is on the way, the flat fee below applies instead (never lower than the late fee).
          </p>
          <div className="grid gap-6 lg:grid-cols-2">
            {[
              { title: 'Customer', prefix: 'user', feeLabel: 'Cancellation fee', note: 'Collected from the refund, or added to the next booking if unpaid.' },
              { title: 'Professional', prefix: 'worker', feeLabel: 'Cancellation penalty', note: 'Deducted from the professional’s earnings. 0 means no penalty.' }
            ].map(({ title, prefix, feeLabel, note }) => {
              const type = prefix === 'user' ? config.userLateCancelFeeType : config.workerLateCancelPenaltyType;
              const valueKey = prefix === 'user' ? 'userLateCancelFeeValue' : 'workerLateCancelPenaltyValue';
              const typeKey = prefix === 'user' ? 'userLateCancelFeeType' : 'workerLateCancelPenaltyType';
              const maxKey = prefix === 'user' ? 'userLateCancelFeeMax' : 'workerLateCancelPenaltyMax';
              const hours = config[`${prefix}FreeCancelHours`];
              const grace = config[`${prefix}FreeCancelGraceMinutes`];
              const value = config[valueKey];
              const amount = type === 'percentage' ? `${value}% of the booking amount` : `₹${value}`;
              const cap = Number(config[maxKey]) > 0 && type === 'percentage' ? ` (at most ₹${config[maxKey]})` : '';
              return (
                <div key={prefix} className="rounded-lg border border-gray-200 p-4">
                  <h4 className="mb-3 text-sm font-bold text-gray-800">{title}</h4>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Free cancellation until" hint="Before the slot starts. 0 = no free window beyond the grace time.">
                      <NumberInput value={hours} onChange={set(`${prefix}FreeCancelHours`)} min={0} max={168} suffix="hours before" />
                    </Field>
                    <Field label="Grace after accepting" hint="Always free for this long after the professional accepts.">
                      <NumberInput value={grace} onChange={set(`${prefix}FreeCancelGraceMinutes`)} min={0} max={120} suffix="min" />
                    </Field>
                    <Field label={`${feeLabel} type`}>
                      <select value={type} onChange={(e) => set(typeKey)(e.target.value)} className={inputClass}>
                        <option value="fixed">Fixed amount (₹)</option>
                        <option value="percentage">Percentage of booking</option>
                      </select>
                    </Field>
                    <Field label={type === 'percentage' ? `${feeLabel} (%)` : `${feeLabel} (₹)`} hint={note}>
                      <NumberInput value={value} onChange={set(valueKey)} min={0} max={type === 'percentage' ? 100 : undefined} suffix={type === 'percentage' ? '%' : '₹'} />
                    </Field>
                    {type === 'percentage' && (
                      <Field label="Maximum" hint="Caps the percentage fee. 0 = no cap.">
                        <NumberInput value={config[maxKey]} onChange={set(maxKey)} min={0} suffix="₹" />
                      </Field>
                    )}
                    {prefix === 'user' && (
                      <Field label="Fee once the professional is on the way (₹)" hint="Charged exactly as set once they start travelling.">
                        <NumberInput value={config.cancellationPenalty} onChange={set('cancellationPenalty')} min={0} suffix="₹" />
                        {config.userLateCancelFeeType === 'fixed' && Number(config.cancellationPenalty) < Number(config.userLateCancelFeeValue) && (
                          <p className="mt-1 text-xs text-amber-700">This is lower than the late fee above (₹{Number(config.userLateCancelFeeValue)}), so cancelling after the professional leaves will cost the customer less than cancelling just before.</p>
                        )}
                      </Field>
                    )}
                    {prefix === 'user' && (
                      <div className="col-span-full rounded-lg bg-blue-50/70 border border-blue-200/60 p-3 text-xs text-blue-900 flex items-start gap-2.5">
                        <span className="font-semibold whitespace-nowrap">Professional arrived:</span>
                        <span>
                          Once the professional reaches the customer address, the cancellation fee is the <span className="font-semibold">Visiting Charge (₹{config.visitedCharges ?? 149})</span>. You can modify this in <a href="/admin/settings" className="font-semibold underline text-blue-700 hover:text-blue-900">Admin Settings &gt; Financial Configuration</a>.
                        </span>
                      </div>
                    )}
                  </div>
                  <p className="mt-3 rounded bg-gray-50 px-3 py-2 text-xs text-gray-700">
                    {title === 'Customer' ? 'A customer' : 'A professional'} who cancels{' '}
                    {Number(hours) > 0 ? `at least ${hours} hour${Number(hours) === 1 ? '' : 's'} before the slot` : 'before the job'}
                    {Number(grace) > 0 ? `, or within ${grace} min of acceptance,` : ''} pays nothing.
                    {' '}Otherwise: {Number(value) > 0 ? `${amount}${cap}` : 'nothing'}.
                  </p>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Recurring */}
        <Card title="Recurring Bookings" icon={FiRepeat}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <ToggleRow label="Recurring bookings" description="Customers can repeat a slot booking weekly, fortnightly or monthly." checked={config.isRecurringEnabled} onChange={set('isRecurringEnabled')} />
            <Field label="Max visits per plan">
              <NumberInput value={config.recurringMaxOccurrences} onChange={set('recurringMaxOccurrences')} min={2} max={52} />
            </Field>
            <Field label="Discount per visit" hint="On the service amount. 0 disables.">
              <NumberInput value={config.recurringDiscountPercentage} onChange={set('recurringDiscountPercentage')} min={0} max={50} suffix="%" />
            </Field>
            <Field label="Book each visit ahead by" hint="The visit is created and the worker search starts this early.">
              <NumberInput value={config.recurringLeadHours} onChange={set('recurringLeadHours')} min={1} max={168} suffix="hours" />
            </Field>
          </div>
          <div className="mt-4">
            <span className="text-xs font-semibold text-gray-700">Frequencies offered</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {FREQUENCIES.map((f) => {
                const active = (config.recurringFrequencies || []).includes(f.key);
                return (
                  <button
                    type="button"
                    key={f.key}
                    onClick={() => toggleFrequency(f.key)}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${active ? 'border-[#163B66] bg-[#163B66] text-white' : 'border-gray-300 bg-white text-gray-600'}`}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>
          </div>
        </Card>
      </div>

      {/* Sticky save bar */}
      <div className={`fixed bottom-16 lg:bottom-0 right-0 left-0 z-40 border-t border-gray-200 bg-white/95 px-4 py-3 backdrop-blur transition-transform lg:left-[278px] ${dirty ? 'translate-y-0' : 'translate-y-full'}`}>
        <div className="flex items-center justify-end gap-3">
          <span className="text-sm text-gray-600">{Object.keys(changes).length} unsaved change{Object.keys(changes).length === 1 ? '' : 's'}</span>
          <Button variant="secondary" onClick={() => setConfig(saved)} disabled={saving}>Discard</Button>
          <Button onClick={save} disabled={saving}>
            {saving ? <FiLoader className="animate-spin" /> : <FiSave />} Save changes
          </Button>
        </div>
      </div>
    </div>
  );
};

export default BookingConfig;

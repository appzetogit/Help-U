import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'react-hot-toast';
import {
  FiSliders, FiLoader, FiFileText, FiImage, FiPlusCircle, FiAlertTriangle, FiMessageCircle,
  FiAlertOctagon, FiTarget, FiDollarSign, FiRepeat, FiSave, FiX, FiPlus, FiCalendar, FiClock, FiXCircle,
  FiSearch, FiChevronDown, FiChevronRight
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
 * disputes, worker assignment, payouts and recurring
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

// Which tab each setting lives in (used for the "unsaved" dots on the tabs). Everything not matched is
// in "Booking flow".
const TAB_GROUPS = [
  { id: 'dispatch', label: 'Finding professionals', desc: 'Zone or distance, ranking, emergency, admin queue' },
  { id: 'flow', label: 'Booking flow', desc: 'Checkout options, time slots, scheduling, recurring' },
  { id: 'policies', label: 'Policies & support', desc: 'Cancellation, disputes, chat' },
  { id: 'money', label: 'Money', desc: 'Payouts, wallet' }
];

const groupOfKey = (key) => {
  if (/^(dispatchMode|searchRadius|maxSearchTime|waveDuration|assignment|wave\d|autoReassign|maxReassignments|isAdminAssignment|escalateToAdmin|adminAssign|isWorkerServiceRadius|workerServiceRadius|isEmergency|emergency)/.test(key)) return 'dispatch';
  if (/^(userFreeCancel|userLateCancel|cancellationPenalty|workerFreeCancel|workerLateCancel|isDispute|disputeWindow|maxDisputeEvidence|disputeReasons|isChat|chat)/.test(key)) return 'policies';
  if (/^(minWithdrawal|wallet|scrap)/.test(key)) return 'money';
  return 'flow';
};

// Words people would type to find a card (the title is always searched too).
const CARD_KEYWORDS = {
  'How bookings find professionals': 'dispatch zone distance radius search km wave timer search time limit emergency radius who gets the booking',
  'Worker Assignment': 'ranking strategy rating acceptance completion response speed weights wave size reassign cancel reject admin queue assign manually minimum rating',
  'Partner Service Area': 'partner own radius travel service range home address km',
  'Emergency Bookings': 'emergency urgent surcharge fee instant',
  'Customer Notes': 'notes instructions checkout',
  'Problem Photos & Videos': 'photos videos media upload images evidence',
  'Add-ons': 'addons add-ons extras optional',
  'Booking Time Slots': 'time slots hours schedule days ahead lead',
  'Scheduled Bookings & Worker Availability': 'scheduled busy availability overlap travel buffer cut-off job duration',
  'Recurring Bookings': 'recurring repeat weekly monthly subscription frequency',
  'Rescheduling': 'reschedule change time move',
  'Cancellation Policy': 'cancel cancellation fee penalty refund free window late',
  'Disputes': 'dispute complaint reasons evidence window',
  'Customer ↔ Professional Chat': 'chat message phone mask images',
  'Payouts': 'payout withdrawal minimum scrap',
  'Wallet Top-up': 'wallet top up topup minimum maximum balance'
};

/** A card on a tab. While searching, matching cards from every tab show, labelled with their tab. */
const Section = ({ show, label, children }) => {
  if (!show) return null;
  return (
    <div>
      {label && <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-blue-600">{label}</p>}
      {children}
    </div>
  );
};

/** Rarely-changed settings, closed by default (always open while searching so a match is never hidden). */
const Advanced = ({ label, force, children }) => {
  const [open, setOpen] = useState(false);
  const shown = open || force;
  return (
    <div className="mt-4 rounded-lg border border-gray-100">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 px-3 py-2.5 text-left text-xs font-semibold text-blue-700 hover:bg-blue-50/50"
      >
        {shown ? <FiChevronDown className="h-4 w-4" /> : <FiChevronRight className="h-4 w-4" />}
        {label}
      </button>
      {shown && <div className="space-y-4 border-t border-gray-100 p-3">{children}</div>}
    </div>
  );
};

const BookingConfig = () => {
  const [config, setConfig] = useState(null);
  const [saved, setSaved] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newReason, setNewReason] = useState('');
  const [query, setQuery] = useState('');
  // Remember the tab in the address (#money, ...) so a refresh or a shared link lands on it
  const [tab, setTab] = useState(() => {
    const fromHash = (typeof window !== 'undefined' ? window.location.hash : '').replace('#', '');
    return TAB_GROUPS.some((g) => g.id === fromHash) ? fromHash : 'dispatch';
  });
  const changeTab = (id) => {
    setTab(id);
    window.history.replaceState(null, '', `#${id}`);
  };

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
  const unsavedByGroup = useMemo(() => {
    const counts = {};
    Object.keys(changes).forEach((key) => {
      const g = groupOfKey(key);
      counts[g] = (counts[g] || 0) + 1;
    });
    return counts;
  }, [changes]);

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

  const searching = query.trim().length > 0;
  const groupLabel = (id) => TAB_GROUPS.find((g) => g.id === id)?.label || '';
  const matchesQuery = (title) => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const hay = `${title} ${CARD_KEYWORDS[title] || ''}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  };
  const showCard = (group, title) => (searching ? matchesQuery(title) : tab === group);
  const matchCount = searching ? Object.keys(CARD_KEYWORDS).filter(matchesQuery).length : 0;

  // 'zone' (the default) or 'distance': decides which distance settings are in use
  const zoneMode = (config.dispatchMode || 'zone') !== 'distance';

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


      {/* Find a setting without knowing which tab it is on */}
      <div className="mb-4 flex items-center gap-3">
        <div className="relative max-w-md flex-1">
          <FiSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder='Search settings, e.g. "radius", "refund", "wallet"'
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-8 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
          {searching && (
            <button type="button" onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700" aria-label="Clear search">
              <FiX className="h-4 w-4" />
            </button>
          )}
        </div>
        {searching && (
          <span className="text-xs text-gray-500">
            {matchCount === 0 ? 'No settings match.' : `${matchCount} match${matchCount === 1 ? '' : 'es'}, from all tabs.`}
          </span>
        )}
      </div>

      {/* Settings are grouped by what the admin is trying to do; one group is shown at a time */}
      <div className={`${searching ? 'hidden ' : ''}mb-6 flex gap-1 overflow-x-auto rounded-xl border border-gray-200 bg-white p-1.5 shadow-sm`}>
        {TAB_GROUPS.map((g) => {
          const active = tab === g.id;
          const unsaved = unsavedByGroup[g.id] || 0;
          return (
            <button
              key={g.id}
              type="button"
              onClick={() => changeTab(g.id)}
              className={`flex min-w-[10rem] flex-1 flex-col items-start rounded-lg px-4 py-2.5 text-left transition-colors ${
                active ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <span className="flex w-full items-center justify-between gap-2 text-sm font-semibold">
                {g.label}
                {unsaved > 0 && (
                  <span className={`min-w-[1.25rem] rounded-full px-1.5 text-center text-[10px] font-bold ${active ? 'bg-white text-blue-700' : 'bg-amber-500 text-white'}`}>
                    {unsaved}
                  </span>
                )}
              </span>
              <span className={`mt-0.5 hidden text-[11px] leading-snug sm:block ${active ? 'text-blue-100' : 'text-gray-400'}`}>{g.desc}</span>
            </button>
          );
        })}
      </div>

      <div className="space-y-6">
        <Section show={showCard('dispatch', 'How bookings find professionals')} label={searching ? groupLabel('dispatch') : null}>
            {/* Assignment */}
            <Card title="How bookings find professionals" icon={FiTarget}>
              <p className="text-[11px] text-gray-500 mb-3">
                The one place that decides who a booking is sent to. One rule is active at a time and it applies to every new
                booking straight away. Zones themselves (maps, surge, allowed services) are kept, just not used while "By distance" is on.
              </p>
              <DispatchModeCards value={config.dispatchMode || 'zone'} onChange={set('dispatchMode')} />

              <div className="mt-5 border-t border-gray-100 pt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Search limits</p>
                <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Field label="Search radius" hint={zoneMode ? 'Not used while sending by zone.' : 'How far around the address to look.'}>
                    <NumberInput value={config.searchRadius} onChange={set('searchRadius')} min={1} max={200} suffix="km" disabled={zoneMode} />
                  </Field>
                  <Field label="Emergency search radius" hint={zoneMode ? 'Not used while sending by zone.' : 'Wider than the normal search, for emergency bookings.'}>
                    <NumberInput value={config.emergencySearchRadius} onChange={set('emergencySearchRadius')} min={1} max={200} suffix="km" disabled={zoneMode} />
                  </Field>
                  <Field label="Search time limit" hint="Minutes to find a professional before the booking moves to the admin queue or is cancelled.">
                    <NumberInput value={config.maxSearchTime} onChange={set('maxSearchTime')} min={1} max={60} suffix="min" />
                  </Field>
                  <Field label="Wave timer" hint="Seconds before the next batch of professionals is alerted.">
                    <NumberInput value={config.waveDuration} onChange={set('waveDuration')} min={10} max={600} suffix="sec" />
                  </Field>
                </div>
                {zoneMode && (
                  <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                    Sending by zone: every professional in the customer's zone qualifies, however far. The distance fields above and the
                    partner travel radius below are greyed out because they are not used. Search time and wave timer apply in both modes.
                  </p>
                )}
              </div>
            </Card>
        </Section>
        <Section show={showCard('dispatch', 'Worker Assignment')} label={searching ? groupLabel('dispatch') : null}>
            <Card title="Worker Assignment" icon={FiTarget}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Strategy" hint="Smart ranks nearby workers by the weights below; Distance alerts the closest first.">
                  <select value={config.assignmentStrategy} onChange={(e) => set('assignmentStrategy')(e.target.value)} className={inputClass}>
                    <option value="smart">Smart (distance, rating, acceptance, completion)</option>
                    <option value="distance">Distance only</option>
                  </select>
                </Field>
                <Field label="Minimum rating" hint="Workers below this (with 3+ reviews) are not alerted. 0 disables.">
                  <NumberInput value={config.assignmentMinRating} onChange={set('assignmentMinRating')} min={0} max={5} step={0.1} suffix="★" />
                </Field>
              </div>

              <Advanced label="Advanced: stats window, ranking weights, alert waves, reassignment" force={searching}>
              <Field label="Stats window" hint="Acceptance and completion rates look back this far.">
                <NumberInput value={config.assignmentStatsWindowDays} onChange={set('assignmentStatsWindowDays')} min={7} max={365} suffix="days" />
              </Field>

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
                <Field label="Wave 1 size" hint="Workers alerted first (the wave timer is in the card above).">
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
              </Advanced>

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
        </Section>
        <Section show={showCard('dispatch', 'Partner Service Area')} label={searching ? groupLabel('dispatch') : null}>
            {/* Partner service area */}
            <Card title="Partner Service Area" icon={FiTarget}>
              {zoneMode && (
                <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                  Not used while bookings are sent by zone: a professional in the customer's zone qualifies whatever their own radius.
                  It applies again when you switch to "By distance".
                </p>
              )}
              <div className={zoneMode ? 'pointer-events-none opacity-50' : ''}>
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
              </div>
              <p className="mt-3 rounded bg-gray-50 px-3 py-2 text-xs text-gray-600">
                A partner's own radius replaces the platform search radius for him (it can be larger or smaller), measured from his saved home address. Partners with no saved map location use the platform radius.
              </p>
            </Card>
        </Section>
        <Section show={showCard('dispatch', 'Emergency Bookings')} label={searching ? groupLabel('dispatch') : null}>
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
                <Field label="Workers alerted at once" hint="First alert wave size for emergencies.">
                  <NumberInput value={config.emergencyFirstWaveSize} onChange={set('emergencyFirstWaveSize')} min={1} max={50} />
                </Field>
                <Field label="Search time limit" hint="Booking is cancelled if nobody accepts.">
                  <NumberInput value={config.emergencyMaxSearchTime} onChange={set('emergencyMaxSearchTime')} min={1} max={60} suffix="min" />
                </Field>
              </div>
            </Card>
        </Section>
        <Section show={showCard('flow', 'Customer Notes')} label={searching ? groupLabel('flow') : null}>
            {/* Notes */}
            <Card title="Customer Notes" icon={FiFileText}>
              <div className="grid gap-4 sm:grid-cols-2">
                <ToggleRow label="Instructions at checkout" description="Customers can add notes for the professional (gate code, parking, details of the problem)." checked={config.isCustomerNotesEnabled} onChange={set('isCustomerNotesEnabled')} />
                <Field label="Maximum length" hint="Characters, 50–2000.">
                  <NumberInput value={config.customerNotesMaxLength} onChange={set('customerNotesMaxLength')} min={50} max={2000} suffix="chars" />
                </Field>
              </div>
            </Card>
        </Section>
        <Section show={showCard('flow', 'Problem Photos & Videos')} label={searching ? groupLabel('flow') : null}>
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
        </Section>
        <Section show={showCard('flow', 'Add-ons')} label={searching ? groupLabel('flow') : null}>
            {/* Add-ons */}
            <Card title="Add-ons" icon={FiPlusCircle}>
              <ToggleRow label="Add-ons at checkout" description="Show the extras configured on the Add-ons page for each service. Prices are taxed like the service and paid to the worker per their commission." checked={config.isAddOnsEnabled} onChange={set('isAddOnsEnabled')} />
            </Card>
        </Section>
        <Section show={showCard('flow', 'Booking Time Slots')} label={searching ? groupLabel('flow') : null}>
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
        </Section>
        <Section show={showCard('flow', 'Scheduled Bookings & Worker Availability')} label={searching ? groupLabel('flow') : null}>
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
        </Section>
        <Section show={showCard('flow', 'Recurring Bookings')} label={searching ? groupLabel('flow') : null}>
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
        </Section>
        <Section show={showCard('flow', 'Rescheduling')} label={searching ? groupLabel('flow') : null}>
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
        </Section>
        <Section show={showCard('policies', 'Cancellation Policy')} label={searching ? groupLabel('policies') : null}>
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
        </Section>
        <Section show={showCard('policies', 'Disputes')} label={searching ? groupLabel('policies') : null}>
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
        </Section>
        <Section show={showCard('policies', 'Customer ↔ Professional Chat')} label={searching ? groupLabel('policies') : null}>
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
        </Section>
        <Section show={showCard('money', 'Payouts')} label={searching ? groupLabel('money') : null}>
            {/* Payouts */}
            <Card title="Payouts" icon={FiDollarSign}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Minimum withdrawal" hint="Smallest amount a worker can request.">
                  <NumberInput value={config.minWithdrawalAmount} onChange={set('minWithdrawalAmount')} min={0} suffix="₹" />
                </Field>
              </div>
            </Card>
        </Section>
        <Section show={showCard('money', 'Wallet Top-up')} label={searching ? groupLabel('money') : null}>
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
        </Section>
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

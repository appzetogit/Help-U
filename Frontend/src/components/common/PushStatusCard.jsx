import React, { useCallback, useEffect, useState } from 'react';
import { FiBell, FiBellOff, FiCheckCircle, FiAlertTriangle, FiRefreshCw, FiSend, FiLoader } from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import {
  getPushStatus,
  registerFCMTokenDetailed,
  sendTestPush,
  getNotificationPermissionState,
  isFlutterWebView
} from '../../services/pushNotificationService';

// Why a device is not registered, and what to do about it, in plain words
const REASON_HELP = {
  unsupported: 'This browser cannot receive notifications. Use Chrome or Edge, or install the Help U app.',
  app: 'Inside the Help U app, the app sets up notifications itself. Make sure notifications are allowed for Help U in your phone settings and that the app is up to date. If it still shows no device, log out and log in again.',
  'not-configured': 'Notifications are not set up in this version of the site. Please contact support.',
  denied: 'Notifications are blocked. Open your browser or phone settings, allow notifications for Help U, then tap Turn on again.',
  dismissed: 'The permission question was closed. Tap Turn on and choose Allow.',
  'no-token': 'This device could not be registered. Check your connection and tap Turn on again.',
  'not-logged-in': 'You are not signed in on this device. Log in again, then tap Turn on.',
  server: 'We could not save this device. Please try again in a moment.',
  error: 'Something went wrong while turning notifications on. Please try again.'
};

/**
 * Says whether notifications can reach this person, and why not when they cannot: whether the phone has allowed
 * them, how many devices are registered, and a button to send a test to their own devices. Counts only; the
 * device tokens never leave the server.
 * userType: 'user' | 'worker'
 */
const PushStatusCard = ({ userType = 'user', className = '' }) => {
  const [status, setStatus] = useState(null);   // { totalDevices, webDevices, mobileDevices }
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState(null);       // 'enable' | 'test'
  const [lastReason, setLastReason] = useState(null);
  const [testResult, setTestResult] = useState(null);

  const permission = getNotificationPermissionState(); // granted | denied | default | unsupported
  const inApp = isFlutterWebView();

  const refresh = useCallback(async () => {
    try {
      const res = await getPushStatus(userType);
      setStatus(res);
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, [userType]);

  // First check when the card appears (the answer arrives asynchronously)
  useEffect(() => {
    let alive = true;
    getPushStatus(userType)
      .then((res) => { if (alive) { setStatus(res); setLoadError(false); } })
      .catch(() => { if (alive) setLoadError(true); });
    return () => { alive = false; };
  }, [userType]);

  const turnOn = async () => {
    setBusy('enable');
    setTestResult(null);
    const result = await registerFCMTokenDetailed(userType, true);
    setLastReason(result.ok ? null : result.reason);
    if (result.ok) toast.success('Notifications are on for this device');
    await refresh();
    setBusy(null);
  };

  const test = async () => {
    setBusy('test');
    const res = await sendTestPush(userType);
    setTestResult(res.success
      ? { ok: true, text: `Sent to ${res.devices} device${res.devices === 1 ? '' : 's'}. It should arrive within a few seconds. If it does not, check this phone's notification settings for Help U.` }
      : { ok: false, text: res.error || 'The test could not be sent.' });
    setBusy(null);
  };

  const devices = status?.totalDevices ?? 0;
  const hasDevice = devices > 0;
  // What to tell the person right now
  let tone = 'amber';
  let headline = 'Checking…';
  let help = null;

  if (loadError) {
    headline = 'Could not check your notifications';
    help = 'Check your connection and try again.';
  } else if (status) {
    if (hasDevice && permission !== 'denied') {
      tone = 'green';
      headline = `Notifications are on · ${devices} device${devices === 1 ? '' : 's'} registered`;
    } else if (permission === 'denied') {
      tone = 'red';
      headline = 'Notifications are blocked on this device';
      help = REASON_HELP.denied;
    } else if (inApp) {
      headline = hasDevice ? 'Notifications are on' : 'This phone is not registered yet';
      help = hasDevice ? null : REASON_HELP.app;
    } else {
      headline = 'This device is not set up for notifications';
      help = REASON_HELP[lastReason] || (permission === 'default' ? REASON_HELP.dismissed : 'Tap Turn on to start receiving booking alerts here.');
    }
  }

  const tones = {
    green: 'border-green-200 bg-green-50 text-green-800',
    amber: 'border-amber-200 bg-amber-50 text-amber-800',
    red: 'border-red-200 bg-red-50 text-red-800'
  };
  const Icon = tone === 'green' ? FiCheckCircle : tone === 'red' ? FiBellOff : FiAlertTriangle;

  return (
    <div className={`rounded-xl border p-4 ${tones[tone]} ${className}`} data-testid="push-status">
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-5 w-5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">{headline}</p>
          {status && (
            <p className="mt-0.5 text-xs opacity-80">
              {status.webDevices} browser · {status.mobileDevices} phone app · permission: {permission === 'unsupported' ? 'not available here' : permission === 'default' ? 'not asked yet' : permission}
            </p>
          )}
          {help && <p className="mt-2 text-xs leading-relaxed">{help}</p>}
          {testResult && (
            <p className={`mt-2 text-xs leading-relaxed font-semibold ${testResult.ok ? 'text-green-700' : 'text-red-700'}`}>{testResult.text}</p>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {!inApp && (
          <button type="button" onClick={turnOn} disabled={!!busy || permission === 'denied'} className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-gray-800 shadow-sm disabled:opacity-50">
            {busy === 'enable' ? <FiLoader className="h-3.5 w-3.5 animate-spin" /> : <FiBell className="h-3.5 w-3.5" />}
            {hasDevice ? 'Repair this device' : 'Turn on'}
          </button>
        )}
        <button type="button" onClick={test} disabled={!!busy || !hasDevice} className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-gray-800 shadow-sm disabled:opacity-50">
          {busy === 'test' ? <FiLoader className="h-3.5 w-3.5 animate-spin" /> : <FiSend className="h-3.5 w-3.5" />}
          Send a test notification
        </button>
        <button type="button" onClick={refresh} disabled={!!busy} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold opacity-80 hover:opacity-100" aria-label="Check again">
          <FiRefreshCw className="h-3.5 w-3.5" /> Check again
        </button>
      </div>
    </div>
  );
};

export default PushStatusCard;

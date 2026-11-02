import React from 'react';
import { FiMapPin, FiRefreshCw, FiPhone, FiMail } from 'react-icons/fi';
import { useZone } from '../../context/ZoneContext';

// Used until the admin-edited content arrives (or when it cannot be loaded)
const FALLBACK = {
  title: "We're not in your area yet",
  message: "Our services are currently not available at this location. We're expanding quickly - check back soon or choose a different address.",
  imageUrl: '',
  primaryButtonText: 'Change Location / Address',
  showRetryButton: true,
  retryButtonText: 'Retry Location Detection',
  footerText: 'Make sure location services are enabled on your device.',
  showSupportContact: true,
  accentColor: '#2563eb',
  backgroundColor: '#f9fafb'
};

/**
 * The "outside our service area" page. Everything on it (text, picture, buttons, colours) is set by
 * the admin under Zones -> Out-of-zone page; `content` overrides the live values (used by the
 * admin preview).
 *
 * embedded: render inside a screen that already has its own header (no full-height takeover).
 */
const OutOfZoneScreen = ({ onChangeLocation, content, support, embedded = false }) => {
  const zone = useZone() || {};
  const { detectFromBrowser, zoneLoading } = zone;
  const page = { ...FALLBACK, ...(content || zone.outOfZonePage || {}) };
  const contact = support || zone.outOfZoneSupport || null;
  const accent = page.accentColor || FALLBACK.accentColor;

  const hasContact = page.showSupportContact && contact && (contact.phone || contact.email);

  return (
    <div
      className={`${embedded ? 'min-h-[60vh] rounded-3xl mx-4 sm:mx-5' : 'min-h-screen'} flex items-center justify-center px-6 py-10`}
      style={{ backgroundColor: page.backgroundColor }}
    >
      <div className="max-w-sm w-full text-center">
        {page.imageUrl ? (
          <img
            src={page.imageUrl}
            alt=""
            className="w-48 max-w-full h-auto max-h-48 object-contain mx-auto mb-6"
            loading="lazy"
          />
        ) : (
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"
            style={{ backgroundColor: `${accent}1a` }}
          >
            <FiMapPin className="w-10 h-10" style={{ color: accent }} />
          </div>
        )}

        <h2 className="text-xl font-bold text-gray-900 mb-2">{page.title}</h2>
        <p className="text-sm text-gray-500 leading-relaxed mb-6 whitespace-pre-line">{page.message}</p>

        <div className="flex flex-col gap-3">
          {onChangeLocation && page.primaryButtonText && (
            <button
              type="button"
              onClick={onChangeLocation}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 text-white font-semibold text-sm rounded-xl transition-all active:scale-95 shadow-sm hover:opacity-90"
              style={{ backgroundColor: accent }}
            >
              <FiMapPin className="w-4 h-4" />
              {page.primaryButtonText}
            </button>
          )}

          {page.showRetryButton && (
            <button
              type="button"
              onClick={detectFromBrowser}
              disabled={zoneLoading || !detectFromBrowser}
              className={`inline-flex items-center justify-center gap-2 px-6 py-3 font-semibold text-sm rounded-xl transition-all active:scale-95 ${
                onChangeLocation ? 'bg-gray-100 hover:bg-gray-200 text-gray-700' : 'text-white shadow-sm hover:opacity-90'
              }`}
              style={onChangeLocation ? undefined : { backgroundColor: accent }}
            >
              <FiRefreshCw className={`w-4 h-4 ${zoneLoading ? 'animate-spin' : ''}`} />
              {zoneLoading ? 'Detecting...' : page.retryButtonText}
            </button>
          )}
        </div>

        {hasContact && (
          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-gray-500">
            {contact.phone && (
              <a href={`tel:${contact.phone}`} className="inline-flex items-center gap-1 hover:underline">
                <FiPhone className="w-3.5 h-3.5" /> {contact.phone}
              </a>
            )}
            {contact.email && (
              <a href={`mailto:${contact.email}`} className="inline-flex items-center gap-1 hover:underline">
                <FiMail className="w-3.5 h-3.5" /> {contact.email}
              </a>
            )}
          </div>
        )}

        {page.footerText && <p className="text-xs text-gray-400 mt-4">{page.footerText}</p>}
      </div>
    </div>
  );
};

export default OutOfZoneScreen;

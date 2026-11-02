import React, { useEffect, useState } from 'react';
import { FiX, FiSave, FiUpload, FiTrash2, FiRotateCcw } from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import zoneService from '../../services/zoneService';
import { serviceService } from '../../../../services/catalogService';
import OutOfZoneScreen from '../../../../components/common/OutOfZoneScreen';
import ModalLock from '../../../../components/common/ModalLock';

const DEFAULT_PAGE = {
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

const inputClass =
  'w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-xs';

const Field = ({ label, hint, children }) => (
  <label className="block">
    <span className="block text-[11px] font-bold text-gray-700 mb-1">{label}</span>
    {children}
    {hint && <span className="block text-[10px] text-gray-400 mt-1">{hint}</span>}
  </label>
);

const Toggle = ({ label, checked, onChange }) => (
  <label className="flex items-center justify-between gap-3 py-1.5 cursor-pointer">
    <span className="text-xs font-semibold text-gray-700">{label}</span>
    <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} className="w-4 h-4 accent-blue-600" />
  </label>
);

/**
 * Admin editor for the page customers see when their location is outside every active zone.
 * Saved text, picture, buttons and colours go live straight away in the user app.
 */
const OutOfZonePageModal = ({ onClose }) => {
  const [page, setPage] = useState(DEFAULT_PAGE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await zoneService.getOutOfZonePage();
        if (alive && res?.success) setPage({ ...DEFAULT_PAGE, ...res.outOfZonePage });
      } catch {
        toast.error('Failed to load the page');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const set = (key) => (value) => setPage((prev) => ({ ...prev, [key]: value }));

  const handleUpload = async (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file');
      return;
    }
    try {
      setUploading(true);
      const res = await serviceService.uploadImage(file, 'out-of-zone');
      if (res?.imageUrl) {
        set('imageUrl')(res.imageUrl);
        toast.success('Picture uploaded');
      } else {
        toast.error('Upload failed. Check the file size and format.');
      }
    } catch {
      toast.error('Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const res = await zoneService.updateOutOfZonePage(page);
      if (res?.success) {
        setPage({ ...DEFAULT_PAGE, ...res.outOfZonePage });
        toast.success('Out-of-zone page saved. Customers see it now.');
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to save the page');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <ModalLock />
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-sm font-bold text-gray-900">Out-of-zone page</h2>
            <p className="text-[11px] text-gray-500">
              Shown to customers whose location is outside every active zone. They cannot book from here.
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-lg">
            <FiX className="w-4 h-4" />
          </button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-xs text-gray-500">Loading…</div>
        ) : (
          <div className="flex-1 overflow-y-auto grid lg:grid-cols-2 gap-5 p-5">
            {/* Editor */}
            <div className="space-y-3">
              <Field label="Heading">
                <input className={inputClass} maxLength={120} value={page.title} onChange={(e) => set('title')(e.target.value)} />
              </Field>
              <Field label="Message" hint={`${page.message.length}/600`}>
                <textarea className={`${inputClass} resize-none`} rows={4} maxLength={600} value={page.message} onChange={(e) => set('message')(e.target.value)} />
              </Field>

              <Field label="Picture (optional)" hint="Replaces the pin icon. A wide or square illustration works best.">
                <div className="flex items-center gap-2">
                  <label className={`px-3 py-2 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50 cursor-pointer inline-flex items-center gap-1.5 ${uploading ? 'opacity-60 pointer-events-none' : ''}`}>
                    <FiUpload className="w-3.5 h-3.5" />
                    {uploading ? 'Uploading…' : 'Upload'}
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => { handleUpload(e.target.files?.[0]); e.target.value = ''; }} />
                  </label>
                  <input className={inputClass} placeholder="…or paste an image link" value={page.imageUrl} onChange={(e) => set('imageUrl')(e.target.value)} />
                  {page.imageUrl && (
                    <button type="button" onClick={() => set('imageUrl')('')} title="Remove picture" className="p-2 text-red-500 hover:bg-red-50 rounded-lg shrink-0">
                      <FiTrash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Main button text" hint="Opens the address picker">
                  <input className={inputClass} maxLength={40} value={page.primaryButtonText} onChange={(e) => set('primaryButtonText')(e.target.value)} />
                </Field>
                <Field label="Retry button text">
                  <input className={inputClass} maxLength={40} value={page.retryButtonText} onChange={(e) => set('retryButtonText')(e.target.value)} disabled={!page.showRetryButton} />
                </Field>
              </div>

              <Field label="Small print">
                <input className={inputClass} maxLength={200} value={page.footerText} onChange={(e) => set('footerText')(e.target.value)} />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Button colour">
                  <div className="flex items-center gap-2">
                    <input type="color" value={page.accentColor} onChange={(e) => set('accentColor')(e.target.value)} className="w-9 h-9 rounded border border-gray-200 cursor-pointer p-0.5 bg-white" />
                    <input className={inputClass} value={page.accentColor} onChange={(e) => set('accentColor')(e.target.value)} />
                  </div>
                </Field>
                <Field label="Background colour">
                  <div className="flex items-center gap-2">
                    <input type="color" value={page.backgroundColor} onChange={(e) => set('backgroundColor')(e.target.value)} className="w-9 h-9 rounded border border-gray-200 cursor-pointer p-0.5 bg-white" />
                    <input className={inputClass} value={page.backgroundColor} onChange={(e) => set('backgroundColor')(e.target.value)} />
                  </div>
                </Field>
              </div>

              <div className="rounded-xl border border-gray-100 px-3 divide-y divide-gray-50">
                <Toggle label="Show the “retry location” button" checked={page.showRetryButton} onChange={set('showRetryButton')} />
                <Toggle label="Show support phone / email (from Settings)" checked={page.showSupportContact} onChange={set('showSupportContact')} />
              </div>

              <button
                type="button"
                onClick={() => setPage(DEFAULT_PAGE)}
                className="text-[11px] font-semibold text-gray-500 hover:text-gray-800 inline-flex items-center gap-1"
              >
                <FiRotateCcw className="w-3 h-3" /> Reset to the default wording
              </button>
            </div>

            {/* Live preview, exactly what the customer gets */}
            <div>
              <p className="text-[11px] font-bold text-gray-700 mb-1.5">Preview</p>
              <div className="rounded-2xl border border-gray-200 overflow-hidden bg-white">
                <OutOfZoneScreen
                  embedded
                  content={page}
                  support={page.showSupportContact ? { phone: 'Your support phone', email: 'your-support@email' } : null}
                  onChangeLocation={() => {}}
                />
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100 bg-gray-50/60 shrink-0">
          <button type="button" onClick={onClose} className="px-3.5 py-2 rounded-lg border border-gray-300 text-xs font-semibold text-gray-600 hover:bg-gray-50">
            Close
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading || uploading}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold shadow-sm inline-flex items-center gap-1.5"
          >
            <FiSave className="w-3.5 h-3.5" />
            {saving ? 'Saving…' : 'Save page'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default OutOfZonePageModal;

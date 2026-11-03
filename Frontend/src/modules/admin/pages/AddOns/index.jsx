import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { FiPlusCircle, FiPlus, FiEdit2, FiTrash2, FiLoader, FiSearch } from 'react-icons/fi';
import bookingFeaturesAdminService from '../../services/bookingFeaturesAdminService';
import Modal from '../../components/Modal';
import PageGuide from '../../components/PageGuide';
import { PageHeader, Card, Toggle, Field, Button, StatusPill, EmptyState } from '../../components/adminUi';
import { inputClass, money } from '../../components/adminFormat';
import { serviceService } from '../../../../services/catalogService';

const EMPTY = {
  title: '', description: '', price: '', maxQuantity: 1, imageUrl: '',
  appliesToAll: false, categoryIds: [], serviceIds: [], isActive: true, sortOrder: 0
};

const idOf = (v) => (typeof v === 'object' && v ? v._id || v.id : v);

/**
 * Multi-select of checkboxes with a filter box, for categories and services.
 */
const CheckList = ({ options, selected, onChange, placeholder }) => {
  const [q, setQ] = useState('');
  const shown = options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase()));
  const toggle = (id) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  return (
    <div className="rounded-lg border border-gray-300">
      <div className="border-b border-gray-200 p-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} className={`${inputClass} py-1.5`} />
      </div>
      <div className="max-h-44 overflow-y-auto p-2">
        {shown.length === 0 && <p className="px-1 py-2 text-xs text-gray-500">Nothing found</p>}
        {shown.map((o) => (
          <label key={o.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-gray-50">
            <input type="checkbox" checked={selected.includes(o.id)} onChange={() => toggle(o.id)} />
            <span className="truncate">{o.label}</span>
            {o.sub && <span className="ml-auto shrink-0 text-[11px] text-gray-400">{o.sub}</span>}
          </label>
        ))}
      </div>
      <div className="border-t border-gray-200 px-3 py-1.5 text-[11px] text-gray-500">{selected.length} selected</div>
    </div>
  );
};

const AddOns = () => {
  const [addOns, setAddOns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categories, setCategories] = useState([]);
  const [services, setServices] = useState([]);
  const [form, setForm] = useState(null); // null = closed; { ...EMPTY, _id? }
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await bookingFeaturesAdminService.listAddOns();
      if (res.success) setAddOns(res.data || []);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load add-ons');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    bookingFeaturesAdminService.listCategories()
      .then((r) => setCategories((r.categories || []).map((c) => ({ id: c.id || c._id, label: c.title }))))
      .catch(() => {});
    bookingFeaturesAdminService.listServices()
      .then((r) => setServices((r.services || []).map((s) => ({ id: s._id, label: s.title, sub: s.categoryId?.title || s.brandId?.title || '' }))))
      .catch(() => {});
  }, [load]);

  const openNew = () => setForm({ ...EMPTY });
  const openEdit = (a) => setForm({
    ...EMPTY,
    ...a,
    price: a.price,
    categoryIds: (a.categoryIds || []).map(idOf),
    serviceIds: (a.serviceIds || []).map(idOf)
  });

  const setField = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));

  const uploadImage = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const res = await serviceService.uploadImage(file, 'addons');
      const url = res?.success && res.imageUrl;
      if (!url) throw new Error(res?.message || 'Upload failed');
      setField('imageUrl')(url);
    } catch {
      toast.error('Image upload failed');
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!form.title.trim()) return toast.error('Title is required');
    if (form.price === '' || Number(form.price) < 0) return toast.error('Enter a valid price');
    if (!form.appliesToAll && form.categoryIds.length === 0 && form.serviceIds.length === 0) {
      return toast.error('Choose categories or services, or make it available on all services');
    }
    setSaving(true);
    const body = {
      title: form.title, description: form.description, price: Number(form.price), maxQuantity: Number(form.maxQuantity) || 1,
      imageUrl: form.imageUrl || null, appliesToAll: form.appliesToAll, categoryIds: form.categoryIds,
      serviceIds: form.serviceIds, isActive: form.isActive, sortOrder: Number(form.sortOrder) || 0
    };
    try {
      const res = form._id
        ? await bookingFeaturesAdminService.updateAddOn(form._id, body)
        : await bookingFeaturesAdminService.createAddOn(body);
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

  const toggleActive = async (a) => {
    try {
      await bookingFeaturesAdminService.updateAddOn(a._id, { isActive: !a.isActive });
      setAddOns((prev) => prev.map((x) => (x._id === a._id ? { ...x, isActive: !a.isActive } : x)));
    } catch (error) {
      toast.error(error.response?.data?.message || 'Update failed');
    }
  };

  const remove = async (a) => {
    if (!window.confirm(`Delete add-on "${a.title}"? Past bookings keep their copy.`)) return;
    try {
      await bookingFeaturesAdminService.deleteAddOn(a._id);
      setAddOns((prev) => prev.filter((x) => x._id !== a._id));
      toast.success('Add-on deleted');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Delete failed');
    }
  };

  const shown = addOns.filter((a) => a.title.toLowerCase().includes(search.toLowerCase()));

  const targetLabel = (a) => {
    if (a.appliesToAll) return 'All services';
    const parts = [];
    if (a.categoryIds?.length) parts.push(`${a.categoryIds.length} categor${a.categoryIds.length === 1 ? 'y' : 'ies'}`);
    if (a.serviceIds?.length) parts.push(`${a.serviceIds.length} service${a.serviceIds.length === 1 ? '' : 's'}`);
    return parts.join(' · ') || '—';
  };

  return (
    <div className="p-4 sm:p-6">
      <PageHeader
        icon={FiPlusCircle}
        title="Add-ons"
        description="Extras customers can add to a service at checkout. Turn the feature on or off in Booking Configuration."
        actions={<Button onClick={openNew}><FiPlus /> New add-on</Button>}
      />

      <div className="mb-6">
        <PageGuide
          id="addons"
          title="What are add-ons?"
          intro="Optional extras a customer can tick at checkout, on top of the service they chose, for example “Extra AC unit”, “Deep cleaning of filters” or “Wall mounting”."
          points={[
            "Customers see the add-ons that apply to their service and pick a quantity, up to the maximum you set. The price is added to their total, with GST.",
            "Choose where each add-on appears: every service, certain categories, or specific services. You must pick at least one, or it cannot be saved.",
            "The professional sees the chosen add-ons on the booking, and the amount is part of the bill, so it is split like any service charge (Settings → Commission).",
            "Add-ons are chosen at checkout, not during the visit. For work found on site, use the Worker Services list.",
            "Switch the whole feature on or off in Booking Config. Turning an add-on off here hides it from new bookings only."
          ]}
        />
      </div>

      <Card>
        <div className="mb-4 flex items-center gap-2">
          <div className="relative w-full max-w-xs">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search add-ons" className={`${inputClass} pl-9`} />
          </div>
        </div>

        {loading ? (
          <div className="flex h-40 items-center justify-center"><FiLoader className="h-6 w-6 animate-spin text-gray-400" /></div>
        ) : shown.length === 0 ? (
          <EmptyState icon={FiPlusCircle} title="No add-ons yet" description="Create one to offer extras like an extra unit, deep cleaning or installation." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="py-2 pr-4">Add-on</th>
                  <th className="py-2 pr-4">Price</th>
                  <th className="py-2 pr-4">Max qty</th>
                  <th className="py-2 pr-4">Offered on</th>
                  <th className="py-2 pr-4">Active</th>
                  <th className="py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((a) => (
                  <tr key={a._id} className="border-b border-gray-100 last:border-0">
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-3">
                        {a.imageUrl ? <img src={a.imageUrl} alt="" className="h-10 w-10 rounded-lg object-cover" /> : <div className="h-10 w-10 rounded-lg bg-gray-100" />}
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-900">{a.title}</p>
                          {a.description && <p className="max-w-xs truncate text-xs text-gray-500">{a.description}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 pr-4 font-semibold">{money(a.price)}</td>
                    <td className="py-3 pr-4">{a.maxQuantity}</td>
                    <td className="py-3 pr-4"><StatusPill className="bg-sky-50 text-sky-700">{targetLabel(a)}</StatusPill></td>
                    <td className="py-3 pr-4"><Toggle checked={a.isActive} onChange={() => toggleActive(a)} /></td>
                    <td className="py-3 text-right">
                      <div className="inline-flex gap-1">
                        <Button variant="ghost" className="px-2" onClick={() => openEdit(a)} aria-label="Edit"><FiEdit2 /></Button>
                        <Button variant="ghost" className="px-2 text-red-600" onClick={() => remove(a)} aria-label="Delete"><FiTrash2 /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal isOpen={!!form} onClose={() => !saving && setForm(null)} title={form?._id ? 'Edit add-on' : 'New add-on'} size="lg">
        {form && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Title"><input value={form.title} onChange={(e) => setField('title')(e.target.value)} className={inputClass} maxLength={120} /></Field>
              <Field label="Price (₹, excl. GST)"><input type="number" min="0" value={form.price} onChange={(e) => setField('price')(e.target.value)} className={inputClass} /></Field>
            </div>
            <Field label="Description"><textarea value={form.description} onChange={(e) => setField('description')(e.target.value)} rows={2} maxLength={500} className={inputClass} /></Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Max quantity" hint="1 = simple yes/no extra"><input type="number" min="1" max="20" value={form.maxQuantity} onChange={(e) => setField('maxQuantity')(e.target.value)} className={inputClass} /></Field>
              <Field label="Sort order" hint="Lower shows first"><input type="number" value={form.sortOrder} onChange={(e) => setField('sortOrder')(e.target.value)} className={inputClass} /></Field>
              <Field label="Image (optional)">
                <div className="flex items-center gap-2">
                  {form.imageUrl && <img src={form.imageUrl} alt="" className="h-9 w-9 rounded object-cover" />}
                  <label className="cursor-pointer text-xs font-semibold text-sky-700">
                    {uploading ? 'Uploading…' : form.imageUrl ? 'Change' : 'Upload'}
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => uploadImage(e.target.files?.[0])} />
                  </label>
                  {form.imageUrl && <button type="button" className="text-xs text-red-600" onClick={() => setField('imageUrl')('')}>Remove</button>}
                </div>
              </Field>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50/60 p-3">
              <div>
                <p className="text-sm font-semibold text-gray-900">Offer on all services</p>
                <p className="text-xs text-gray-500">Otherwise pick categories and/or services below.</p>
              </div>
              <Toggle checked={form.appliesToAll} onChange={setField('appliesToAll')} />
            </div>

            {!form.appliesToAll && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Categories"><CheckList options={categories} selected={form.categoryIds} onChange={setField('categoryIds')} placeholder="Filter categories" /></Field>
                <Field label="Services"><CheckList options={services} selected={form.serviceIds} onChange={setField('serviceIds')} placeholder="Filter services" /></Field>
              </div>
            )}

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <Toggle checked={form.isActive} onChange={setField('isActive')} /> Active
              </label>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setForm(null)} disabled={saving}>Cancel</Button>
                <Button onClick={save} disabled={saving || uploading}>{saving ? 'Saving…' : 'Save'}</Button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default AddOns;

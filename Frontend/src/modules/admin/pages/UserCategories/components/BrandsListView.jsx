import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  FiPlus,
  FiEdit2,
  FiTrash2,
  FiSearch,
  FiRefreshCw,
  FiChevronUp,
  FiChevronDown,
  FiTag,
  FiUpload,
  FiCheck,
  FiX
} from "react-icons/fi";
import { toast } from "react-hot-toast";
import { brandService, categoryService, publicCatalogService } from "../../../../../services/catalogService";
import DependencyModal from "./DependencyModal";
import Modal from "./Modal";
import ToggleSwitch from "./ToggleSwitch";
import { slugify, toAssetUrl } from "../utils";

const BrandsListView = ({ selectedCity, onRefreshHealth, initialCategory = "" }) => {
  const [brands, setBrands] = useState([]);
  const [categories, setCategories] = useState([]);
  // Every category and sub-category (all cities): names for a brand's categories, and "everything under a
  // category" for the filter. `categories` above stays the city's top-level list used by the pickers.
  const [allCats, setAllCats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState(initialCategory || "all");

  // Create / Edit Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBrand, setEditingBrand] = useState(null);
  const [form, setForm] = useState({
    title: "",
    slug: "",
    categoryId: "",
    categoryIds: [],
    iconUrl: "",
    badge: "",
  });
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef(null);

  // Dependency Modal State
  const [depModal, setDepModal] = useState({
    isOpen: false,
    item: null,
    report: null,
    loading: false,
  });

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const params = {};
      if (selectedCity) params.cityId = selectedCity;
      const [brandRes, catRes, allRes] = await Promise.all([
        brandService.getAll(params),
        categoryService.getAll(params),
        categoryService.getAll({ parentId: "all", includeDeleted: true }).catch(() => null),
      ]);

      if (allRes?.success) setAllCats(allRes.categories || []);
      if (brandRes?.success) setBrands(brandRes.brands || []);
      if (catRes?.success) setCategories(catRes.categories || []);
    } catch (err) {
      console.error("Brands fetch error:", err);
      toast.error("Failed to load brands and sections");
    } finally {
      setLoading(false);
    }
  }, [selectedCity]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Filtered brands
  const filteredBrands = useMemo(() => {
    let list = Array.isArray(brands) ? brands.filter(Boolean) : [];

    if (selectedCategoryFilter !== "all") {
      const wanted = new Set([String(selectedCategoryFilter)]);
      allCats.forEach((c) => {
        const p = typeof c.parentId === "object" ? c.parentId?._id || c.parentId?.id : c.parentId;
        if (p && String(p) === String(selectedCategoryFilter)) wanted.add(String(c.id || c._id));
      });
      list = list.filter((b) => {
        if (!b) return false;
        const directId = typeof b.categoryId === "object" ? b.categoryId?._id || b.categoryId?.id : b.categoryId;
        if (wanted.has(String(directId))) return true;
        if (Array.isArray(b.categoryIds)) {
          return b.categoryIds.some((cid) => {
            if (!cid) return false;
            const id = typeof cid === "object" ? cid?._id || cid?.id : cid;
            return wanted.has(String(id));
          });
        }
        return false;
      });
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (b) =>
          b && (
            (b.title || "").toLowerCase().includes(q) ||
            (b.slug || "").toLowerCase().includes(q)
          )
      );
    }

    return list.sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
  }, [brands, selectedCategoryFilter, search, allCats]);

  // Status toggle
  const handleToggleStatus = async (brand) => {
    const id = brand.id || brand._id;
    const nextStatus = brand.status === "active" ? "inactive" : "active";
    try {
      const res = await brandService.bulkStatus([id], nextStatus);
      if (res?.success) {
        toast.success(`Brand set to ${nextStatus}`);
        publicCatalogService.invalidateCache();
        setBrands((prev) =>
          prev.map((b) => ((b.id || b._id) === id ? { ...b, status: nextStatus } : b))
        );
        if (onRefreshHealth) onRefreshHealth();
      } else {
        toast.error(res?.message || "Status change failed");
      }
    } catch (err) {
      console.error("Status toggle error:", err);
      toast.error("Failed to update status");
    }
  };

  // Reorder up/down
  const handleMoveOrder = async (index, direction) => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= filteredBrands.length) return;

    const listCopy = [...filteredBrands];
    const temp = listCopy[index];
    listCopy[index] = listCopy[targetIndex];
    listCopy[targetIndex] = temp;

    const items = listCopy.map((b, i) => ({
      id: b.id || b._id,
      displayOrder: i + 1,
    }));

    try {
      const res = await brandService.bulkReorder(items);
      if (res?.success) {
        toast.success("Order updated!");
        publicCatalogService.invalidateCache();
        fetchData();
      }
    } catch (err) {
      console.error("Reorder error:", err);
      toast.error("Failed to update brand order");
    }
  };

  // Create / Edit
  const handleOpenCreate = () => {
    setEditingBrand(null);
    setForm({
      title: "",
      slug: "",
      categoryId: selectedCategoryFilter !== "all" ? selectedCategoryFilter : "",
      categoryIds: selectedCategoryFilter !== "all" ? [selectedCategoryFilter] : [],
      iconUrl: "",
      badge: "",
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (brand) => {
    setEditingBrand(brand);
    const catId = typeof brand.categoryId === "object" ? brand.categoryId?._id || brand.categoryId?.id : (brand.categoryId || "");
    const catIds = Array.isArray(brand.categoryIds)
      ? brand.categoryIds.map((c) => (typeof c === "object" ? c._id || c.id : c))
      : (catId ? [catId] : []);

    setForm({
      title: brand.title || "",
      slug: brand.slug || "",
      categoryId: catId,
      categoryIds: catIds,
      iconUrl: brand.iconUrl || "",
      badge: brand.badge || "",
    });
    setIsModalOpen(true);
  };

  // Image Upload
  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploadingImage(true);
      const res = await brandService.uploadImage(file, "brands");
      if (res?.success && res.imageUrl) {
        setForm((prev) => ({ ...prev, iconUrl: res.imageUrl }));
        toast.success("Icon uploaded!");
      } else {
        toast.error(res?.message || "Failed to upload image");
      }
    } catch (err) {
      console.error("Upload error:", err);
      toast.error("Image upload failed");
    } finally {
      setUploadingImage(false);
    }
  };

  // Save Brand
  const handleSaveBrand = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) {
      toast.error("Title is required");
      return;
    }

    try {
      setSaving(true);
      const payload = {
        title: form.title.trim(),
        slug: form.slug.trim() || slugify(form.title),
        categoryId: form.categoryId || (form.categoryIds[0] || undefined),
        categoryIds: form.categoryIds.length > 0 ? form.categoryIds : (form.categoryId ? [form.categoryId] : []),
        iconUrl: form.iconUrl,
        badge: form.badge,
      };

      let res;
      if (editingBrand) {
        const id = editingBrand.id || editingBrand._id;
        res = await brandService.update(id, payload);
      } else {
        res = await brandService.create(payload);
      }

      if (res?.success) {
        toast.success(editingBrand ? "Brand updated!" : "Brand created!");
        publicCatalogService.invalidateCache();
        setIsModalOpen(false);
        fetchData();
        if (onRefreshHealth) onRefreshHealth();
      } else {
        toast.error(res?.message || "Failed to save brand");
      }
    } catch (err) {
      console.error("Save brand error:", err);
      toast.error(err?.response?.data?.message || "Failed to save brand");
    } finally {
      setSaving(false);
    }
  };

  // Delete
  const handleOpenDelete = async (brand) => {
    const id = brand.id || brand._id;
    setDepModal({
      isOpen: true,
      item: brand,
      report: null,
      loading: true,
    });

    try {
      const depRes = await brandService.getDependencies(id);
      setDepModal((prev) => ({
        ...prev,
        report: depRes?.dependencies || depRes || {},
        loading: false,
      }));
    } catch (err) {
      console.error("Brand dependencies error:", err);
      setDepModal((prev) => ({
        ...prev,
        report: { hasDependencies: false },
        loading: false,
      }));
    }
  };

  const handleConfirmArchive = async () => {
    if (!depModal.item) return;
    const id = depModal.item.id || depModal.item._id;
    setDepModal((prev) => ({ ...prev, loading: true }));
    try {
      const res = await brandService.archive(id);
      if (res?.success) {
        toast.success("Brand archived successfully!");
        publicCatalogService.invalidateCache();
        setDepModal({ isOpen: false, item: null, report: null, loading: false });
        fetchData();
        if (onRefreshHealth) onRefreshHealth();
      } else {
        toast.error(res?.message || "Archive failed");
        setDepModal((prev) => ({ ...prev, loading: false }));
      }
    } catch (err) {
      console.error("Archive error:", err);
      toast.error(err?.response?.data?.message || "Failed to archive brand");
      setDepModal((prev) => ({ ...prev, loading: false }));
    }
  };

  const handleConfirmForceDelete = async () => {
    if (!depModal.item) return;
    const id = depModal.item.id || depModal.item._id;
    setDepModal((prev) => ({ ...prev, loading: true }));
    try {
      const res = await brandService.delete(id, true);
      if (res?.success) {
        toast.success("Brand permanently deleted!");
        publicCatalogService.invalidateCache();
        setDepModal({ isOpen: false, item: null, report: null, loading: false });
        fetchData();
        if (onRefreshHealth) onRefreshHealth();
      } else {
        toast.error(res?.message || "Delete failed");
        setDepModal((prev) => ({ ...prev, loading: false }));
      }
    } catch (err) {
      console.error("Delete error:", err);
      toast.error(err?.response?.data?.message || "Failed to delete brand");
      setDepModal((prev) => ({ ...prev, loading: false }));
    }
  };

  return (
    <div className="space-y-4">
      {/* Control Bar */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-500 uppercase">Category:</span>
            <select
              value={selectedCategoryFilter}
              onChange={(e) => setSelectedCategoryFilter(e.target.value)}
              className="text-xs px-3 py-1.5 border border-gray-300 rounded-lg bg-gray-50 text-gray-700 font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
            >
              <option value="all">All Categories ({brands.length} Brands)</option>
              {categories.map((c) => (
                <option key={c.id || c._id} value={c.id || c._id}>
                  {c.title}
                </option>
              ))}
            </select>
          </div>

          <div className="relative flex-1 md:w-60">
            <input
              type="text"
              placeholder="Search brands / sections..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full text-xs px-3 py-1.5 pl-8 border border-gray-300 rounded-lg bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <FiSearch className="absolute left-2.5 top-2 text-gray-400 w-3.5 h-3.5" />
          </div>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto justify-end">
          <button
            type="button"
            onClick={fetchData}
            disabled={loading}
            className="p-2 text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            title="Refresh"
          >
            <FiRefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>

          <button
            type="button"
            onClick={handleOpenCreate}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors"
          >
            <FiPlus className="w-4 h-4" />
            Add Section / Brand
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="animate-pulse flex items-center justify-between py-2.5 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-gray-200 rounded-lg" />
                  <div className="w-40 h-4 bg-gray-200 rounded" />
                </div>
                <div className="w-24 h-6 bg-gray-200 rounded-full" />
              </div>
            ))}
          </div>
        ) : filteredBrands.length === 0 ? (
          <div className="p-12 text-center">
            <FiTag className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <h3 className="text-sm font-bold text-gray-700">No sections or brands found</h3>
            <p className="text-xs text-gray-400 mt-1">Try resetting filter or add a new brand.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-gray-600 font-semibold uppercase tracking-wider">
                  <th className="py-3 px-3 w-14 text-center">Order</th>
                  <th className="py-3 px-4">Brand / Section</th>
                  <th className="py-3 px-4">Mapped Categories</th>
                  <th className="py-3 px-3 text-center">Badge</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-700">
                {filteredBrands.map((brand, idx) => {
                  const id = brand.id || brand._id;
                  const catTitles = (allCats.length ? allCats : categories)
                    .filter((c) => {
                      const cId = String(c.id || c._id);
                      const directId = String(typeof brand.categoryId === "object" ? brand.categoryId?._id || brand.categoryId?.id : brand.categoryId);
                      if (cId === directId) return true;
                      if (Array.isArray(brand.categoryIds)) {
                        return brand.categoryIds.some((cid) => {
                          const i = String(typeof cid === "object" ? cid?._id || cid?.id : cid);
                          return i === cId;
                        });
                      }
                      return false;
                    })
                    .map((c) => c.title);

                  return (
                    <tr key={id} className="hover:bg-blue-50/30 transition-colors">
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleMoveOrder(idx, "up")}
                            disabled={idx === 0}
                            className="p-1 text-gray-400 hover:text-blue-600 disabled:opacity-20"
                            title="Move up"
                          >
                            <FiChevronUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveOrder(idx, "down")}
                            disabled={idx === filteredBrands.length - 1}
                            className="p-1 text-gray-400 hover:text-blue-600 disabled:opacity-20"
                            title="Move down"
                          >
                            <FiChevronDown className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>

                      <td className="py-2.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2.5">
                          {brand.iconUrl ? (
                            <img
                              src={toAssetUrl(brand.iconUrl)}
                              alt={brand.title}
                              className="w-8 h-8 rounded-lg object-contain bg-gray-50 border border-gray-200 p-0.5"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center font-bold text-xs text-gray-400">
                              {brand.title?.charAt(0) || "—"}
                            </div>
                          )}
                          <div>
                            <span className="font-bold text-gray-900 block">{brand.title}</span>
                            <span className="text-[10px] text-gray-400 font-mono">
                              /{brand.slug || "no-slug"}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="py-2.5 px-4 whitespace-nowrap text-gray-600">
                        {catTitles.length > 0 ? (
                          <div className="flex flex-wrap gap-1 max-w-xs">
                            {catTitles.map((t, i) => (
                              <span
                                key={i}
                                className="inline-block px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 text-[10px] font-medium"
                              >
                                {t}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-gray-400 italic">None</span>
                        )}
                      </td>

                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        {brand.badge ? (
                          <span className="inline-block px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold">
                            {brand.badge}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>

                      <td className="py-2.5 px-4 text-center whitespace-nowrap">
                        <ToggleSwitch
                          checked={brand.status === "active"}
                          onChange={() => handleToggleStatus(brand)}
                        />
                      </td>

                      <td className="py-2.5 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(brand)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Edit Brand"
                          >
                            <FiEdit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenDelete(brand)}
                            className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            title="Delete / Archive Brand"
                          >
                            <FiTrash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title={editingBrand ? "Edit Brand / Section" : "Add Brand / Section"}
          size="md"
        >
          <form onSubmit={handleSaveBrand} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1">
                Brand Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Daikin, LG, Salon Express"
                value={form.title}
                onChange={(e) => {
                  const val = e.target.value;
                  setForm((prev) => ({
                    ...prev,
                    title: val,
                    slug: editingBrand ? prev.slug : slugify(val),
                  }));
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1">
                  Slug
                </label>
                <input
                  type="text"
                  placeholder="daikin"
                  value={form.slug}
                  onChange={(e) => setForm((prev) => ({ ...prev, slug: slugify(e.target.value) }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1">
                  Badge (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Popular, 20% Off"
                  value={form.badge}
                  onChange={(e) => setForm((prev) => ({ ...prev, badge: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1">
                Parent Category <span className="text-red-500">*</span>
              </label>
              <select
                required
                value={form.categoryId}
                onChange={(e) => {
                  const val = e.target.value;
                  setForm((prev) => ({
                    ...prev,
                    categoryId: val,
                    categoryIds: val ? [val] : [],
                  }));
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                <option value="">-- Choose Category --</option>
                {categories.map((c) => (
                  <option key={c.id || c._id} value={c.id || c._id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1">
                Brand Logo / Icon
              </label>
              <div className="flex items-center gap-3">
                {form.iconUrl ? (
                  <img
                    src={toAssetUrl(form.iconUrl)}
                    alt="Logo"
                    className="w-10 h-10 rounded-lg object-contain border border-gray-200 bg-gray-50"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-lg border border-dashed border-gray-300 flex items-center justify-center text-xs text-gray-400">
                    None
                  </div>
                )}
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleImageUpload}
                  accept="image/*"
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingImage}
                  className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  <FiUpload className="w-3.5 h-3.5" />
                  {uploadingImage ? "Uploading..." : "Upload Logo"}
                </button>
              </div>
            </div>

            <div className="pt-3 border-t border-gray-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                disabled={saving}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-xs font-semibold hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || uploadingImage}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-colors"
              >
                {saving ? "Saving..." : editingBrand ? "Update Brand" : "Create Brand"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Dependency Modal */}
      <DependencyModal
        isOpen={depModal.isOpen}
        onClose={() => setDepModal({ isOpen: false, item: null, report: null, loading: false })}
        report={depModal.report}
        entityName={depModal.item?.title || "Brand"}
        entityType="brand"
        onConfirmArchive={handleConfirmArchive}
        onConfirmForceDelete={handleConfirmForceDelete}
        loading={depModal.loading}
      />
    </div>
  );
};

export default BrandsListView;

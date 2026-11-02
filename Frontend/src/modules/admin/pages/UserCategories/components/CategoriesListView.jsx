import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  FiPlus,
  FiEdit2,
  FiTrash2,
  FiSearch,
  FiRefreshCw,
  FiMove,
  FiChevronUp,
  FiChevronDown,
  FiLayers,
  FiCheck,
  FiX,
  FiUpload
} from "react-icons/fi";
import { toast } from "react-hot-toast";
import { categoryService, publicCatalogService } from "../../../../../services/catalogService";
import DependencyModal from "./DependencyModal";
import Modal from "./Modal";
import ToggleSwitch from "./ToggleSwitch";
import DetailFieldsEditor from "./DetailFieldsEditor";
import { slugify, toAssetUrl } from "../utils";
import IconUploadWithPreview from "../../../components/IconUploadWithPreview";

// level: "root" = top-level categories only, "sub" = sub-categories only (each has its own tab),
// anything else = both (the old combined view).
const CategoriesListView = ({ level = "all", selectedCity, onRefreshHealth, onOpen, initialParent = "" }) => {
  const noun = level === "sub" ? "Sub-category" : "Category";
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterParent, setFilterParent] = useState(initialParent || "all"); // "all", "root", or parentId

  // Create / Edit Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [form, setForm] = useState({
    title: "",
    slug: "",
    parentId: "",
    hasBrands: false,
    showOnHome: true,
    isEmergencyAvailable: false,
    homeIconUrl: "",
    homeBadge: "",
    etaDefaultMinutes: "",
    displayRating: "",
    bookingsLabel: "",
    heroTag: "",
    heroTitle: "",
    heroStartingPrice: "",
    heroImageUrl: "",
    detailFields: [],
  });
  const [saving, setSaving] = useState(false);

  // "N workers" badge: who they are
  const [workersModal, setWorkersModal] = useState({ isOpen: false, category: null, loading: false, workers: [], total: 0 });
  const openWorkers = async (category) => {
    setWorkersModal({ isOpen: true, category, loading: true, workers: [], total: 0 });
    try {
      const res = await categoryService.getWorkers(category.id || category._id, selectedCity || undefined);
      setWorkersModal({ isOpen: true, category, loading: false, workers: res?.workers || [], total: res?.total || 0 });
    } catch (err) {
      console.error("Category workers error:", err);
      toast.error("Could not load the workers");
      setWorkersModal({ isOpen: false, category: null, loading: false, workers: [], total: 0 });
    }
  };

  // Dependency Modal State
  const [depModal, setDepModal] = useState({
    isOpen: false,
    item: null,
    report: null,
    loading: false,
  });

  const fetchCategories = useCallback(async () => {
    try {
      setLoading(true);
      // withCounts: what is inside each category (sub-categories, brands, services, workers)
      const params = { parentId: 'all', withCounts: true };
      if (selectedCity) params.cityId = selectedCity;
      const res = await categoryService.getAll(params);
      if (res?.success) {
        setCategories(res.categories || []);
      } else {
        setCategories([]);
      }
    } catch (err) {
      console.error("Categories fetch error:", err);
      toast.error("Failed to load categories");
    } finally {
      setLoading(false);
    }
  }, [selectedCity]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  // Listen for cross-component category creation events (e.g. from ServiceWizard)
  useEffect(() => {
    const handleCategoryCreated = (e) => {
      const newCat = e?.detail;
      if (newCat) {
        // Optimistically add new category to local state so it appears immediately
        setCategories((prev) => {
          const id = newCat.id || newCat._id;
          if (prev.some((c) => (c.id || c._id) === id)) return prev;
          return [...prev, newCat];
        });
      }
      fetchCategories();
    };
    const handleCatalogUpdated = () => {
      fetchCategories();
    };
    window.addEventListener('categoryCreated', handleCategoryCreated);
    window.addEventListener('adminUserAppCatalogUpdated', handleCatalogUpdated);
    return () => {
      window.removeEventListener('categoryCreated', handleCategoryCreated);
      window.removeEventListener('adminUserAppCatalogUpdated', handleCatalogUpdated);
    };
  }, [fetchCategories]);

  // Root categories
  const rootCategories = useMemo(() => {
    return (categories || []).filter((c) => c && !c.parentId);
  }, [categories]);

  // Filtered categories
  const filteredCategories = useMemo(() => {
    let list = Array.isArray(categories) ? categories.filter(Boolean) : [];

    if (level === "root") {
      list = list.filter((c) => c && !c.parentId);
    } else if (level === "sub") {
      list = list.filter((c) => c && c.parentId);
      if (filterParent !== "all" && filterParent !== "root") {
        list = list.filter((c) => {
          const pId = typeof c.parentId === "object" ? c.parentId?._id || c.parentId?.id : c.parentId;
          return String(pId) === String(filterParent);
        });
      }
    } else if (filterParent === "root") {
      list = list.filter((c) => c && !c.parentId);
    } else if (filterParent !== "all") {
      list = list.filter((c) => {
        if (!c) return false;
        const pId = typeof c.parentId === "object" ? c.parentId?._id || c.parentId?.id : c.parentId;
        return String(pId) === String(filterParent);
      });
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (c) =>
          c && (
            (c.title || "").toLowerCase().includes(q) ||
            (c.slug || "").toLowerCase().includes(q)
          )
      );
    }

    return list.sort((a, b) => (a?.homeOrder || 0) - (b?.homeOrder || 0));
  }, [categories, filterParent, search, level]);

  // Status toggle
  const handleToggleStatus = async (category) => {
    const id = category.id || category._id;
    const nextStatus = category.status === "active" ? "inactive" : "active";
    try {
      const res = await categoryService.bulkStatus([id], nextStatus);
      if (res?.success) {
        toast.success(`Category set to ${nextStatus}`);
        publicCatalogService.invalidateCache();
        setCategories((prev) =>
          prev.map((c) => ((c.id || c._id) === id ? { ...c, status: nextStatus } : c))
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

  // Reordering: move item up or down
  const handleMoveOrder = async (index, direction) => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= filteredCategories.length) return;

    const listCopy = [...filteredCategories];
    const temp = listCopy[index];
    listCopy[index] = listCopy[targetIndex];
    listCopy[targetIndex] = temp;

    // Build payload
    const items = listCopy.map((cat, i) => ({
      id: cat.id || cat._id,
      homeOrder: i + 1,
    }));

    try {
      const res = await categoryService.bulkReorder(items);
      if (res?.success) {
        toast.success("Order updated!");
        publicCatalogService.invalidateCache();
        fetchCategories();
      }
    } catch (err) {
      console.error("Reorder error:", err);
      toast.error("Failed to update order");
    }
  };

  // Open Create / Edit Modal
  const handleOpenCreate = () => {
    setEditingCategory(null);
    setForm({
      title: "",
      slug: "",
      parentId: level === "root" ? "" : (filterParent !== "all" && filterParent !== "root" ? filterParent : ""),
      hasBrands: false,
      showOnHome: true,
      isEmergencyAvailable: false,
      homeIconUrl: "",
      homeBadge: "",
      etaDefaultMinutes: "",
      displayRating: "",
      bookingsLabel: "",
      heroTag: "",
      heroTitle: "",
      heroStartingPrice: "",
      heroImageUrl: "",
      detailFields: [],
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (category) => {
    setEditingCategory(category);
    const pId = typeof category.parentId === "object" ? category.parentId?._id || category.parentId?.id : (category.parentId || "");
    setForm({
      title: category.title || "",
      slug: category.slug || "",
      parentId: pId,
      hasBrands: !!category.hasBrands,
      showOnHome: category.showOnHome !== false,
      isEmergencyAvailable: !!category.isEmergencyAvailable,
      homeIconUrl: category.homeIconUrl || category.iconUrl || "",
      homeBadge: category.homeBadge || "",
      etaDefaultMinutes: category.etaDefaultMinutes != null ? String(category.etaDefaultMinutes) : "",
      displayRating: category.displayRating || "",
      bookingsLabel: category.bookingsLabel || "",
      heroTag: category.heroBanner?.tag || "",
      heroTitle: category.heroBanner?.title || "",
      heroStartingPrice: category.heroBanner?.startingPrice || "",
      heroImageUrl: category.heroBanner?.imageUrl || "",
      // keyLocked: saved fields keep their key when the label is renamed
      detailFields: (category.detailFields || []).map((f) => ({ ...f, keyLocked: true })),
    });
    setIsModalOpen(true);
  };

  // Save Category
  const handleSaveCategory = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) {
      toast.error("Title is required");
      return;
    }
    if (level === "sub" && !form.parentId) {
      toast.error("Choose the category this sub-category belongs to");
      return;
    }

    try {
      setSaving(true);
      const parsedEta = form.etaDefaultMinutes !== "" && !isNaN(Number(form.etaDefaultMinutes))
        ? Number(form.etaDefaultMinutes)
        : null;

      const payload = {
        title: form.title.trim(),
        slug: form.slug.trim() || slugify(form.title),
        parentId: form.parentId || null,
        hasBrands: !!form.hasBrands,
        showOnHome: !!form.showOnHome,
        isEmergencyAvailable: !!form.isEmergencyAvailable,
        homeIconUrl: form.homeIconUrl,
        homeBadge: form.homeBadge,
        etaDefaultMinutes: parsedEta,
        displayRating: form.displayRating.trim(),
        bookingsLabel: form.bookingsLabel.trim(),
        heroBanner: {
          tag: form.heroTag?.trim() || "",
          title: form.heroTitle?.trim() || "",
          startingPrice: form.heroStartingPrice?.trim() || "",
          imageUrl: form.heroImageUrl?.trim() || ""
        },
        detailFields: (form.detailFields || []).map((f) => {
          const out = { ...f };
          delete out.keyLocked;
          return out;
        })
      };

      let res;
      if (editingCategory) {
        const id = editingCategory.id || editingCategory._id;
        res = await categoryService.update(id, payload);
      } else {
        res = await categoryService.create(payload);
      }

      if (res?.success) {
        toast.success(editingCategory ? "Category updated!" : "Category created!");
        publicCatalogService.invalidateCache();
        setIsModalOpen(false);
        fetchCategories();
        if (onRefreshHealth) onRefreshHealth();
      } else {
        toast.error(res?.message || "Failed to save category");
      }
    } catch (err) {
      console.error("Save category error:", err);
      toast.error(err?.response?.data?.message || "Failed to save category");
    } finally {
      setSaving(false);
    }
  };

  // Delete Category (Dependency Check)
  const handleOpenDelete = async (category) => {
    const id = category.id || category._id;
    setDepModal({
      isOpen: true,
      item: category,
      report: null,
      loading: true,
    });

    try {
      const depRes = await categoryService.getDependencies(id);
      setDepModal((prev) => ({
        ...prev,
        report: depRes?.dependencies || depRes || {},
        loading: false,
      }));
    } catch (err) {
      console.error("Category dependencies error:", err);
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
      const res = await categoryService.archive(id);
      if (res?.success) {
        toast.success("Category archived successfully!");
        publicCatalogService.invalidateCache();
        setDepModal({ isOpen: false, item: null, report: null, loading: false });
        fetchCategories();
        if (onRefreshHealth) onRefreshHealth();
      } else {
        toast.error(res?.message || "Archive failed");
        setDepModal((prev) => ({ ...prev, loading: false }));
      }
    } catch (err) {
      console.error("Archive error:", err);
      toast.error(err?.response?.data?.message || "Failed to archive category");
      setDepModal((prev) => ({ ...prev, loading: false }));
    }
  };

  const handleConfirmForceDelete = async () => {
    if (!depModal.item) return;
    const id = depModal.item.id || depModal.item._id;
    setDepModal((prev) => ({ ...prev, loading: true }));
    try {
      const res = await categoryService.delete(id, true);
      if (res?.success) {
        toast.success("Category deleted!");
        publicCatalogService.invalidateCache();
        setDepModal({ isOpen: false, item: null, report: null, loading: false });
        fetchCategories();
        if (onRefreshHealth) onRefreshHealth();
      } else {
        toast.error(res?.message || "Delete failed");
        setDepModal((prev) => ({ ...prev, loading: false }));
      }
    } catch (err) {
      console.error("Delete error:", err);
      toast.error(err?.response?.data?.message || "Failed to delete category");
      setDepModal((prev) => ({ ...prev, loading: false }));
    }
  };

  return (
    <div className="space-y-4">
      {/* Control Bar */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {level === "root" ? (
            <span className="text-xs font-semibold text-gray-600">
              {rootCategories.length} {rootCategories.length === 1 ? "category" : "categories"}
              {selectedCity ? " in this city" : " in all cities"}
            </span>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-gray-500 uppercase">{level === "sub" ? "Under:" : "View:"}</span>
              <select
                value={filterParent}
                onChange={(e) => setFilterParent(e.target.value)}
                className="text-xs px-3 py-1.5 border border-gray-300 rounded-lg bg-gray-50 text-gray-700 font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                {level === "sub" ? (
                  <option value="all">All sub-categories ({categories.filter((c) => c && c.parentId).length})</option>
                ) : (
                  <>
                    <option value="all">All Categories ({categories.length})</option>
                    <option value="root">Root Categories Only ({rootCategories.length})</option>
                  </>
                )}
                {rootCategories.map((rc) => (
                  <option key={rc.id || rc._id} value={rc.id || rc._id}>
                    {level === "sub" ? rc.title : `Sub-categories of: ${rc.title}`}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="relative flex-1 md:w-60">
            <input
              type="text"
              placeholder={level === "sub" ? "Search sub-categories..." : "Search categories..."}
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
            onClick={fetchCategories}
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
            Add {noun}
          </button>
        </div>
      </div>

      {/* Table of Categories */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="animate-pulse flex items-center justify-between py-2.5 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-gray-200 rounded-lg" />
                  <div className="w-40 h-4 bg-gray-200 rounded" />
                </div>
                <div className="w-24 h-6 bg-gray-200 rounded-full" />
              </div>
            ))}
          </div>
        ) : filteredCategories.length === 0 ? (
          <div className="p-12 text-center">
            <FiLayers className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <h3 className="text-sm font-bold text-gray-700">
              {level === "sub" ? "No sub-categories found" : "No categories found"}
            </h3>
            <p className="text-xs text-gray-400 mt-1">
              {level === "sub"
                ? "Sub-categories follow their category's cities. Pick another city, or add one under a category available here."
                : selectedCity
                  ? "No category is available in this city. Add one, or choose another city."
                  : "Try resetting search or create a new category."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-gray-600 font-semibold uppercase tracking-wider">
                  <th className="py-3 px-3 w-14 text-center">Order</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Parent</th>
                  <th className="py-3 px-4">What is inside</th>
                  <th className="py-3 px-3 text-center">Appliance Flow (Brands)</th>
                  <th className="py-3 px-3 text-center">Home Page</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-700">
                {filteredCategories.map((category, idx) => {
                  const id = category.id || category._id;
                  const parent = categories.find((c) => {
                    if (!c) return false;
                    const cId = c.id || c._id;
                    const pId = typeof category.parentId === "object" ? category.parentId?._id || category.parentId?.id : category.parentId;
                    return String(cId) === String(pId);
                  });

                  return (
                    <tr key={id} className="hover:bg-blue-50/30 transition-colors">
                      {/* Reorder Up/Down */}
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
                            disabled={idx === filteredCategories.length - 1}
                            className="p-1 text-gray-400 hover:text-blue-600 disabled:opacity-20"
                            title="Move down"
                          >
                            <FiChevronDown className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>

                      {/* Title & Icon */}
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2.5">
                          {category.homeIconUrl || category.icon || category.iconUrl || category.imageUrl ? (
                            <div className="w-9 h-9 rounded-xl border border-gray-200/80 bg-slate-50 overflow-hidden flex items-center justify-center p-1 shrink-0 shadow-2xs">
                              <img
                                src={toAssetUrl(category.homeIconUrl || category.icon || category.iconUrl || category.imageUrl)}
                                alt={category.title}
                                className="w-full h-full object-contain"
                              />
                            </div>
                          ) : (
                            <div className="w-9 h-9 rounded-xl bg-gray-100 border border-gray-200 flex items-center justify-center font-bold text-xs text-gray-500 shrink-0">
                              {category.title?.charAt(0) || "—"}
                            </div>
                          )}
                          <div>
                            <span className="font-bold text-gray-900 block">{category.title}</span>
                            <span className="text-[10px] text-gray-400 font-mono">
                              /{category.slug || "no-slug"}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Parent Category */}
                      <td className="py-2.5 px-4 whitespace-nowrap text-gray-500">
                        {parent ? (
                          <span className="inline-block px-2 py-0.5 rounded bg-gray-100 text-gray-700 font-medium">
                            {parent.title}
                          </span>
                        ) : category.parentId ? (
                          // Has a parent that is not in the list (another city / archived): never call it a root
                          <span className="text-[11px] text-amber-700 font-semibold bg-amber-50 px-2 py-0.5 rounded">
                            Parent not available here
                          </span>
                        ) : (
                          <span className="text-[11px] text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded">
                            Top-Level (Root)
                          </span>
                        )}
                      </td>

                      {/* What is inside. Each badge opens what it counts (counts come from the server, so they match the other tabs) */}
                      <td className="py-2.5 px-4 min-w-[300px]">
                        {category.counts ? (
                          <div className="flex flex-wrap items-center gap-1">
                            {level !== "sub" && category.counts.subCategories.total > 0 && (
                              <button
                                type="button"
                                onClick={() => onOpen?.("subcategories", category)}
                                className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[10px] font-bold border border-indigo-100 hover:bg-indigo-100 hover:border-indigo-300 transition-colors"
                                title="Open its sub-categories"
                              >
                                {category.counts.subCategories.total} sub-categor{category.counts.subCategories.total === 1 ? "y" : "ies"} ›
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => onOpen?.("brands", category)}
                              className="px-2 py-0.5 rounded bg-sky-50 text-sky-700 text-[10px] font-bold border border-sky-100 hover:bg-sky-100 hover:border-sky-300 transition-colors"
                              title="Open its sections / brands"
                            >
                              {category.counts.brands} brand{category.counts.brands === 1 ? "" : "s"} ›
                            </button>
                            <button
                              type="button"
                              onClick={() => onOpen?.("services", category)}
                              className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-colors ${category.counts.services.total === 0 ? "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100" : "bg-emerald-50 text-emerald-700 border-emerald-100 hover:bg-emerald-100 hover:border-emerald-300"}`}
                              title={`Open its services (${category.counts.services.active} active of ${category.counts.services.total}${level === "sub" ? "" : ", including its sub-categories"})`}
                            >
                              {category.counts.services.total} service{category.counts.services.total === 1 ? "" : "s"}
                              {category.counts.services.total !== category.counts.services.active ? ` (${category.counts.services.active} active)` : ""} ›
                            </button>
                            <button
                              type="button"
                              onClick={() => openWorkers(category)}
                              className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-colors ${category.counts.workers === 0 ? "bg-red-50 text-red-700 border-red-200 hover:bg-red-100" : "bg-violet-50 text-violet-700 border-violet-100 hover:bg-violet-100 hover:border-violet-300"}`}
                              title="See the professionals who can take bookings in this category"
                            >
                              {category.counts.workers === 0 ? "No workers" : `${category.counts.workers} worker${category.counts.workers === 1 ? "" : "s"}`} ›
                            </button>
                            <button
                              type="button"
                              onClick={() => onOpen?.("addService", category)}
                              className="px-2 py-0.5 rounded text-[10px] font-bold border border-dashed border-blue-300 text-blue-700 hover:bg-blue-50 transition-colors"
                              title={`Add a service in ${category.title}`}
                            >
                              + Add service
                            </button>
                          </div>
                        ) : (
                          <span className="text-gray-300 text-xs">-</span>
                        )}
                      </td>

                      {/* hasBrands flag */}
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        {category.hasBrands ? (
                          <span className="inline-block px-2 py-0.5 text-[10px] font-bold rounded-full bg-blue-100 text-blue-800">
                            YES (Brands Flow)
                          </span>
                        ) : (
                          <span className="text-[11px] text-gray-400">Standard</span>
                        )}
                      </td>

                      {/* showOnHome flag */}
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        {category.showOnHome !== false ? (
                          <span className="inline-block px-1.5 py-0.5 text-[10px] font-bold rounded bg-emerald-50 text-emerald-700">
                            Visible
                          </span>
                        ) : (
                          <span className="text-[11px] text-gray-400">Hidden</span>
                        )}
                      </td>

                      {/* Status Toggle */}
                      <td className="py-2.5 px-4 text-center whitespace-nowrap">
                        <ToggleSwitch
                          checked={category.status === "active"}
                          onChange={() => handleToggleStatus(category)}
                        />
                      </td>

                      {/* Actions */}
                      <td className="py-2.5 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(category)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Edit Category"
                          >
                            <FiEdit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenDelete(category)}
                            className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            title="Delete / Archive Category"
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

      {/* Who can take bookings in this category */}
      {workersModal.isOpen && (
        <Modal
          isOpen
          onClose={() => setWorkersModal((prev) => ({ ...prev, isOpen: false }))}
          title={`Workers for ${workersModal.category?.title || "this category"}`}
        >
          {workersModal.loading ? (
            <p className="py-8 text-center text-sm text-gray-500">Loading…</p>
          ) : workersModal.workers.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-600">
              No approved professional can take bookings here yet. They appear once a professional ticks this category
              (or one of its services) in their profile.
            </p>
          ) : (
            <div className="max-h-96 overflow-y-auto divide-y divide-gray-100">
              {workersModal.workers.map((w) => (
                <a
                  key={w.id}
                  href={`/admin/workers/all?worker=${encodeURIComponent(w.id)}`}
                  className="flex items-center justify-between gap-3 py-2.5 hover:bg-gray-50 px-1 rounded"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {w.businessName || w.name}
                      {w.businessName && w.name ? <span className="font-normal text-gray-500"> · {w.name}</span> : null}
                    </p>
                    <p className="text-xs text-gray-500">{[w.phone, w.city].filter(Boolean).join(" · ")}</p>
                  </div>
                  <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full shrink-0 ${w.isOnline ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                    {w.isOnline ? "Online" : "Offline"}
                  </span>
                </a>
              ))}
              {workersModal.total > workersModal.workers.length && (
                <p className="pt-2 text-xs text-gray-400 text-center">Showing {workersModal.workers.length} of {workersModal.total}.</p>
              )}
            </div>
          )}
        </Modal>
      )}

      {/* Create / Edit Category Modal */}
      {isModalOpen && (
        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title={editingCategory ? `Edit ${noun}` : `Add New ${noun}`}
          size="md"
        >
          <form onSubmit={handleSaveCategory} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1">
                Category Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Appliance Repair"
                value={form.title}
                onChange={(e) => {
                  const val = e.target.value;
                  setForm((prev) => ({
                    ...prev,
                    title: val,
                    slug: editingCategory ? prev.slug : slugify(val),
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
                  placeholder="appliance-repair"
                  value={form.slug}
                  onChange={(e) => setForm((prev) => ({ ...prev, slug: slugify(e.target.value) }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              {level !== "root" && (
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1">
                  {level === "sub" ? "Belongs to category *" : "Parent Category"}
                </label>
                <select
                  value={form.parentId}
                  onChange={(e) => setForm((prev) => ({ ...prev, parentId: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  {level === "sub"
                    ? <option value="">-- Choose a category --</option>
                    : <option value="">-- None (Top-Level Category) --</option>}
                  {rootCategories
                    .filter((c) => (c.id || c._id) !== (editingCategory?.id || editingCategory?._id))
                    .map((c) => (
                      <option key={c.id || c._id} value={c.id || c._id}>
                        {c.title}
                      </option>
                    ))}
                </select>
              </div>
              )}
            </div>

            <IconUploadWithPreview
              value={form.homeIconUrl}
              onChange={(url) => setForm((prev) => ({ ...prev, homeIconUrl: url }))}
              folder="categories"
              label="Category Icon (1:1 Squircle)"
              helperText="Upload a transparent PNG or SVG icon. Use the transparency buttons above to test on light, dark and alpha checkerboard backgrounds."
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1">
                  Default Arrival ETA (Minutes)
                </label>
                <input
                  type="number"
                  min="0"
                  placeholder="e.g. 55"
                  value={form.etaDefaultMinutes}
                  onChange={(e) => setForm((prev) => ({ ...prev, etaDefaultMinutes: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
                <span className="text-[11px] text-gray-500 block mt-0.5">Shown in green pill badge on Home tile</span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1">
                  Display Rating (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. 4.88"
                  value={form.displayRating}
                  onChange={(e) => setForm((prev) => ({ ...prev, displayRating: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1">
                Bookings Count Label (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. 1.8 M bookings"
                value={form.bookingsLabel}
                onChange={(e) => setForm((prev) => ({ ...prev, bookingsLabel: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            <div className="pt-2 border-t border-gray-100">
              <label className="block text-xs font-bold text-gray-800 uppercase tracking-wide mb-2">
                Hero Promotion Banner (Catalog Header)
              </label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-gray-600 mb-1">Tag</label>
                  <input
                    type="text"
                    placeholder="e.g. LUXE BEAUTY"
                    value={form.heroTag}
                    onChange={(e) => setForm((prev) => ({ ...prev, heroTag: e.target.value }))}
                    className="w-full px-3 py-1.5 border border-gray-300 rounded text-xs bg-white focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-[11px] font-medium text-gray-600 mb-1">Hero Title</label>
                  <input
                    type="text"
                    placeholder="e.g. Korean Glass Glow Ritual"
                    value={form.heroTitle}
                    onChange={(e) => setForm((prev) => ({ ...prev, heroTitle: e.target.value }))}
                    className="w-full px-3 py-1.5 border border-gray-300 rounded text-xs bg-white focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-gray-600 mb-1">Starting Price (₹)</label>
                  <input
                    type="text"
                    placeholder="e.g. 499"
                    value={form.heroStartingPrice}
                    onChange={(e) => setForm((prev) => ({ ...prev, heroStartingPrice: e.target.value }))}
                    className="w-full px-3 py-1.5 border border-gray-300 rounded text-xs bg-white focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-[11px] font-medium text-gray-600 mb-1">Hero Image URL</label>
                  <input
                    type="text"
                    placeholder="e.g. /services/hair-studio-facial.jpg"
                    value={form.heroImageUrl}
                    onChange={(e) => setForm((prev) => ({ ...prev, heroImageUrl: e.target.value }))}
                    className="w-full px-3 py-1.5 border border-gray-300 rounded text-xs bg-white focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-gray-100 space-y-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.hasBrands}
                  onChange={(e) => setForm((prev) => ({ ...prev, hasBrands: e.target.checked }))}
                  className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                />
                <div>
                  <span className="text-xs font-bold text-gray-900 block">
                    Has Brands (Appliance Flow)
                  </span>
                  <span className="text-[11px] text-gray-500 block">
                    Enable this if this category organizes services under brands/models (e.g. AC Repair with LG, Daikin).
                  </span>
                </div>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.showOnHome}
                  onChange={(e) => setForm((prev) => ({ ...prev, showOnHome: e.target.checked }))}
                  className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                />
                <span className="text-xs font-medium text-gray-700">Show on Home Page</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isEmergencyAvailable}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, isEmergencyAvailable: e.target.checked }))
                  }
                  className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                />
                <span className="text-xs font-medium text-gray-700">Available for Emergency Services</span>
              </label>
            </div>

            <div className="pt-3 border-t border-gray-100">
              <h4 className="text-xs font-bold text-gray-800">Details customers fill in the cart</h4>
              <p className="text-[11px] text-gray-500 mt-0.5 mb-2">
                Questions such as appliance brand or vehicle type. They apply to every service in this
                category and its sub-categories, and appear on the booking for the worker.
              </p>
              <DetailFieldsEditor
                value={form.detailFields}
                onChange={(detailFields) => setForm((prev) => ({ ...prev, detailFields }))}
              />
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
                disabled={saving}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-colors"
              >
                {saving ? "Saving..." : editingCategory ? "Update Category" : "Create Category"}
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
        entityName={depModal.item?.title || "Category"}
        entityType="category"
        onConfirmArchive={handleConfirmArchive}
        onConfirmForceDelete={handleConfirmForceDelete}
        loading={depModal.loading}
      />
    </div>
  );
};

export default CategoriesListView;

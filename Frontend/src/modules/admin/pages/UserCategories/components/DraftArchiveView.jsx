import React, { useEffect, useState, useMemo } from "react";
import {
  FiArchive,
  FiRotateCcw,
  FiTrash2,
  FiFilter,
  FiSearch,
  FiRefreshCw,
  FiCheckCircle,
  FiAlertTriangle,
  FiBox,
  FiTag,
  FiLayers,
  FiEye,
  FiUploadCloud
} from "react-icons/fi";
import { toast } from "react-hot-toast";
import {
  serviceService,
  categoryService,
  brandService,
  publicCatalogService
} from "../../../../../services/catalogService";
import DependencyModal from "./DependencyModal";
import { toAssetUrl } from "../utils";

/**
 * DraftArchiveView
 * Consolidated screen for draft and archived/soft-deleted items across Services, Categories, and Brands.
 * Allows 1-click restore, publish, and dependency-checked force deletion.
 */
const DraftArchiveView = ({ onRefreshMain }) => {
  const [activeType, setActiveType] = useState("services"); // "services" | "categories" | "brands"
  const [statusFilter, setStatusFilter] = useState("all"); // "all" | "draft" | "deleted"
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  // Data states
  const [services, setServices] = useState([]);
  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);

  // Dependency modal state
  const [depModal, setDepModal] = useState({
    isOpen: false,
    item: null,
    report: null,
    type: "service",
    loading: false,
  });

  const [busyId, setBusyId] = useState(null);

  const fetchItems = async () => {
    setLoading(true);
    try {
      // Fetch all items across entities
      const [svcRes, catRes, brandRes] = await Promise.all([
        serviceService.getAll({}),
        categoryService.getAll({ includeDeleted: true }), // the archive tab lists archived categories
        brandService.getAll({}),
      ]);

      if (svcRes?.success) setServices(svcRes.services || []);
      if (catRes?.success) setCategories(catRes.categories || []);
      if (brandRes?.success) setBrands(brandRes.brands || []);
    } catch (err) {
      console.error("Failed to load draft/archived items:", err);
      toast.error("Failed to load draft & archived catalog items");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, []);

  // Filter items matching draft or deleted
  const draftOrDeletedServices = useMemo(() => {
    return services.filter((s) => {
      const isDraft = s.publishStatus === "draft";
      const isDeleted = s.status === "deleted";
      if (!isDraft && !isDeleted) return false;
      if (statusFilter === "draft" && !isDraft) return false;
      if (statusFilter === "deleted" && !isDeleted) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchTitle = (s.title || "").toLowerCase().includes(q);
        const matchId = String(s.id || s._id || "").toLowerCase().includes(q);
        return matchTitle || matchId;
      }
      return true;
    });
  }, [services, statusFilter, search]);

  const draftOrDeletedCategories = useMemo(() => {
    return categories.filter((c) => {
      const isDeleted = c.status === "deleted";
      if (!isDeleted) return false; // Category model uses status: deleted
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchTitle = (c.title || "").toLowerCase().includes(q);
        return matchTitle;
      }
      return true;
    });
  }, [categories, search]);

  const draftOrDeletedBrands = useMemo(() => {
    return brands.filter((b) => {
      const isDeleted = b.status === "deleted";
      if (!isDeleted) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchTitle = (b.title || "").toLowerCase().includes(q);
        return matchTitle;
      }
      return true;
    });
  }, [brands, search]);

  // Restore handler
  const handleRestore = async (item, type) => {
    const id = item.id || item._id;
    setBusyId(id);
    try {
      let res;
      if (type === "service") res = await serviceService.restore(id);
      else if (type === "category") res = await categoryService.restore(id);
      else if (type === "brand") res = await brandService.restore(id);

      if (res?.success) {
        toast.success(`${type} restored successfully!`);
        publicCatalogService.invalidateCache();
        await fetchItems();
        if (onRefreshMain) onRefreshMain();
      } else {
        toast.error(res?.message || "Failed to restore");
      }
    } catch (err) {
      console.error("Restore error:", err);
      toast.error(err?.response?.data?.message || "Failed to restore item");
    } finally {
      setBusyId(null);
    }
  };

  // Publish draft handler
  const handlePublishDraft = async (service) => {
    const id = service.id || service._id;
    setBusyId(id);
    try {
      const res = await serviceService.update(id, { publishStatus: "published", status: "active" });
      if (res?.success) {
        toast.success("Service published successfully!");
        publicCatalogService.invalidateCache();
        await fetchItems();
        if (onRefreshMain) onRefreshMain();
      } else {
        toast.error(res?.message || "Failed to publish service");
      }
    } catch (err) {
      console.error("Publish error:", err);
      toast.error(err?.response?.data?.message || "Failed to publish draft");
    } finally {
      setBusyId(null);
    }
  };

  // Open Dependency Modal for permanent delete
  const handleOpenDelete = async (item, type) => {
    const id = item.id || item._id;
    setDepModal({
      isOpen: true,
      item,
      report: null,
      type,
      loading: true,
    });

    try {
      let depRes;
      if (type === "service") depRes = await serviceService.getDependencies(id);
      else if (type === "category") depRes = await categoryService.getDependencies(id);
      else if (type === "brand") depRes = await brandService.getDependencies(id);

      setDepModal((prev) => ({
        ...prev,
        report: depRes?.dependencies || depRes || {},
        loading: false,
      }));
    } catch (err) {
      console.error("Dependencies error:", err);
      setDepModal((prev) => ({
        ...prev,
        report: { hasDependencies: false },
        loading: false,
      }));
    }
  };

  const handleConfirmForceDelete = async () => {
    if (!depModal.item) return;
    const id = depModal.item.id || depModal.item._id;
    const type = depModal.type;
    setDepModal((prev) => ({ ...prev, loading: true }));

    try {
      let res;
      if (type === "service") res = await serviceService.delete(id, true);
      else if (type === "category") res = await categoryService.delete(id, true);
      else if (type === "brand") res = await brandService.delete(id, true);

      if (res?.success) {
        toast.success(`${type} permanently deleted`);
        publicCatalogService.invalidateCache();
        setDepModal({ isOpen: false, item: null, report: null, type: "service", loading: false });
        await fetchItems();
        if (onRefreshMain) onRefreshMain();
      } else {
        toast.error(res?.message || "Delete failed");
        setDepModal((prev) => ({ ...prev, loading: false }));
      }
    } catch (err) {
      console.error("Permanent delete error:", err);
      toast.error(err?.response?.data?.message || "Failed to permanently delete item");
      setDepModal((prev) => ({ ...prev, loading: false }));
    }
  };

  const currentItems =
    activeType === "services"
      ? draftOrDeletedServices
      : activeType === "categories"
      ? draftOrDeletedCategories
      : draftOrDeletedBrands;

  return (
    <div className="space-y-4">
      {/* Entity Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-xl border border-gray-200 shadow-sm">
        <div className="flex items-center gap-1.5 p-1 bg-gray-100 rounded-lg">
          <button
            type="button"
            onClick={() => setActiveType("services")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 ${
              activeType === "services" ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-900"
            }`}
          >
            <FiBox className="w-3.5 h-3.5 text-blue-500" />
            Services ({draftOrDeletedServices.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveType("categories")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 ${
              activeType === "categories" ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-900"
            }`}
          >
            <FiLayers className="w-3.5 h-3.5 text-emerald-500" />
            Categories ({draftOrDeletedCategories.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveType("brands")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 ${
              activeType === "brands" ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-900"
            }`}
          >
            <FiTag className="w-3.5 h-3.5 text-purple-500" />
            Sections & Brands ({draftOrDeletedBrands.length})
          </button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 flex-1 max-w-md justify-end">
          {activeType === "services" && (
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-xs px-2.5 py-1.5 border border-gray-300 rounded-lg bg-gray-50 text-gray-700 font-medium"
            >
              <option value="all">All States</option>
              <option value="draft">Drafts Only</option>
              <option value="deleted">Archived / Deleted</option>
            </select>
          )}

          <div className="relative flex-1">
            <input
              type="text"
              placeholder="Search items..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full text-xs px-3 py-1.5 pl-8 border border-gray-300 rounded-lg bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <FiSearch className="absolute left-2.5 top-2 text-gray-400 w-3.5 h-3.5" />
          </div>

          <button
            type="button"
            onClick={fetchItems}
            disabled={loading}
            className="p-1.5 text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            title="Refresh"
          >
            <FiRefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* List */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="animate-pulse flex items-center justify-between py-3 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gray-200 rounded-lg" />
                  <div className="space-y-1.5">
                    <div className="w-32 h-4 bg-gray-200 rounded" />
                    <div className="w-20 h-3 bg-gray-100 rounded" />
                  </div>
                </div>
                <div className="w-28 h-8 bg-gray-200 rounded-lg" />
              </div>
            ))}
          </div>
        ) : currentItems.length === 0 ? (
          <div className="p-12 text-center">
            <FiArchive className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <h3 className="text-sm font-bold text-gray-700">No draft or archived items</h3>
            <p className="text-xs text-gray-400 mt-1">
              Items archived or saved in draft state will appear here for safe restoration or permanent removal.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {currentItems.map((item) => {
              const id = item.id || item._id;
              const isDraft = item.publishStatus === "draft";
              const isDeleted = item.status === "deleted";
              const isBusy = busyId === id;

              return (
                <div
                  key={id}
                  className="p-4 hover:bg-gray-50/70 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3">
                    {item.iconUrl || item.homeIconUrl ? (
                      <img
                        src={toAssetUrl(item.iconUrl || item.homeIconUrl)}
                        alt={item.title}
                        className="w-11 h-11 rounded-lg object-contain bg-gray-50 border border-gray-200 p-1"
                      />
                    ) : (
                      <div className="w-11 h-11 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center font-bold text-sm text-gray-400">
                        {item.title?.charAt(0) || "—"}
                      </div>
                    )}

                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-gray-900">{item.title}</h4>
                        {isDraft && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                            DRAFT
                          </span>
                        )}
                        {isDeleted && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200">
                            ARCHIVED
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-400 font-mono mt-0.5">
                        ID: {String(id).slice(0, 16)}... | Slug: {item.slug || "none"}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 self-end sm:self-center">
                    {isDraft && activeType === "services" && (
                      <button
                        type="button"
                        onClick={() => handlePublishDraft(item)}
                        disabled={isBusy}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors disabled:opacity-50"
                      >
                        <FiUploadCloud className="w-3.5 h-3.5" />
                        Publish
                      </button>
                    )}

                    {isDeleted && (
                      <button
                        type="button"
                        onClick={() =>
                          handleRestore(
                            item,
                            activeType === "services"
                              ? "service"
                              : activeType === "categories"
                              ? "category"
                              : "brand"
                          )
                        }
                        disabled={isBusy}
                        className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors disabled:opacity-50"
                      >
                        <FiRotateCcw className={`w-3.5 h-3.5 ${isBusy ? "animate-spin" : ""}`} />
                        Restore
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() =>
                        handleOpenDelete(
                          item,
                          activeType === "services"
                            ? "service"
                            : activeType === "categories"
                            ? "category"
                            : "brand"
                        )
                      }
                      disabled={isBusy}
                      className="px-3 py-1.5 text-xs font-semibold text-rose-600 hover:text-white hover:bg-rose-600 border border-rose-300 rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <FiTrash2 className="w-3.5 h-3.5" />
                      Delete Permanently
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Dependency Modal */}
      <DependencyModal
        isOpen={depModal.isOpen}
        onClose={() =>
          setDepModal({ isOpen: false, item: null, report: null, type: "service", loading: false })
        }
        report={depModal.report}
        entityName={depModal.item?.title || "Item"}
        entityType={depModal.type}
        onConfirmForceDelete={handleConfirmForceDelete}
        loading={depModal.loading}
      />
    </div>
  );
};

export default DraftArchiveView;

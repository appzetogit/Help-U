import React, { useEffect, useState, useMemo, useCallback } from "react";
import {
  FiGrid,
  FiList,
  FiPlus,
  FiSearch,
  FiRefreshCw,
  FiFilter,
  FiChevronRight,
  FiChevronUp,
  FiChevronDown,
  FiEdit2,
  FiTrash2,
  FiCopy,
  FiMove,
  FiBox,
  FiLayers,
  FiTag,
  FiArchive,
  FiActivity,
  FiAlertTriangle,
  FiUsers,
  FiCalendar,
  FiCheck,
  FiX,
  FiEye,
  FiEyeOff,
  FiDollarSign,
  FiCheckSquare,
  FiSquare
} from "react-icons/fi";
import { toast } from "react-hot-toast";
import {
  categoryService,
  brandService,
  serviceService,
  catalogHealthService,
  publicCatalogService
} from "../../../../../services/catalogService";
import { cityService } from "../../../../admin/services/cityService";
import CatalogHealthBar from "../components/CatalogHealthBar";
import DependencyModal from "../components/DependencyModal";
import BulkMoveModal from "../components/BulkMoveModal";
import ServiceWizardModal from "../components/ServiceWizardModal";
import CategoriesListView from "../components/CategoriesListView";
import BrandsListView from "../components/BrandsListView";
import DraftArchiveView from "../components/DraftArchiveView";
import AuditLogView from "../components/AuditLogView";
import ToggleSwitch from "../components/ToggleSwitch";
import { toAssetUrl } from "../utils";

/**
 * ServiceManagementPage - Phase 3 Unified Catalog Management Page
 *
 * 5 Tabs:
 *   1. Services (Main Catalog List with table/card view, appliance layout, bulk actions, filters)
 *   2. Categories (Hierarchy, appliance toggle, reorder, status)
 *   3. Sections and brands (Brands management, reorder, mapping)
 *   4. Draft and archive (Restore, publish, dependency-checked purge)
 *   5. Audit log (Activity stream, diff viewer)
 */
const ServiceManagementPage = ({ selectedCity: propCity }) => {
  // ─── TABS ─────────────────────────────────────────────────────────────
  // Follows the catalog hierarchy: categories -> sub-categories -> sections/brands -> services
  const [activeTab, setActiveTab] = useState("categories"); // "categories" | "subcategories" | "brands" | "services" | "draft-archive" | "audit-log"

  // ─── HEALTH METRICS ───────────────────────────────────────────────────
  const [healthData, setHealthData] = useState({});
  const [loadingHealth, setLoadingHealth] = useState(false);
  const [activeStatFilter, setActiveStatFilter] = useState("all"); // "all" | "active" | "draft" | "needs-attention"

  // ─── COMMON DATA ──────────────────────────────────────────────────────
  const [cities, setCities] = useState([]);
  const [selectedCity, setSelectedCity] = useState(propCity || "");
  // ONE list of categories (every level, already limited to the selected city by the server).
  // Categories, sub-categories, the tab counts and the filters below are all derived from it, so
  // they can never disagree with each other.
  const [allCategories, setAllCategories] = useState([]);
  const categories = useMemo(() => allCategories.filter((c) => c && !c.parentId), [allCategories]);
  const allSubCategories = useMemo(() => allCategories.filter((c) => c && c.parentId), [allCategories]);
  const [brands, setBrands] = useState([]);

  // ─── SERVICES STATE ───────────────────────────────────────────────────
  const [services, setServices] = useState([]);
  const [loadingServices, setLoadingServices] = useState(true);
  const [servicesError, setServicesError] = useState(null);

  // ─── VIEW & FILTER STATE ──────────────────────────────────────────────
  const [viewMode, setViewMode] = useState("table"); // "table" | "card"
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedSubCategory, setSelectedSubCategory] = useState("all");
  const [selectedBrand, setSelectedBrand] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all"); // "all" | "active" | "inactive" | "deleted"
  const [selectedPublishStatus, setSelectedPublishStatus] = useState("all"); // "all" | "published" | "draft"

  // Left brand list active item for hasBrands=true categories (Appliance flow)
  const [activeApplianceBrandId, setActiveApplianceBrandId] = useState(null);

  // ─── BULK SELECTION STATE ─────────────────────────────────────────────
  const [selectedServiceIds, setSelectedServiceIds] = useState([]);

  // ─── MODAL STATES ─────────────────────────────────────────────────────
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [editingService, setEditingService] = useState(null);

  const [depModal, setDepModal] = useState({
    isOpen: false,
    item: null,
    report: null,
    loading: false,
  });

  const [isBulkMoveOpen, setIsBulkMoveOpen] = useState(false);
  const [bulkMoveTargetIds, setBulkMoveTargetIds] = useState([]);
  const [movingBulk, setMovingBulk] = useState(false);

  // ─── PAGINATION ───────────────────────────────────────────────────────
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);

  // ─── LOAD HEALTH METRICS ──────────────────────────────────────────────
  // The cards follow the selected city so they agree with the list under them.
  const loadHealth = useCallback(async () => {
    try {
      setLoadingHealth(true);
      const res = await catalogHealthService.getHealth({ cityId: selectedCity || undefined });
      if (res?.success) {
        setHealthData(res);
      }
    } catch (err) {
      console.error("Health fetch error:", err);
    } finally {
      setLoadingHealth(false);
    }
  }, [selectedCity]);

  // ─── LOAD CITIES & BASE METADATA ──────────────────────────────────────
  useEffect(() => {
    const initMeta = async () => {
      try {
        const cityRes = await cityService.getAll();
        if (cityRes?.success) {
          setCities((cityRes.cities || []).filter((c) => c.isActive));
        }
      } catch (err) {
        console.error("Meta load error:", err);
      }
    };

    initMeta();
  }, []);

  // Categories and brands in the filters (and the tab counts) follow the selected city
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const cityParams = selectedCity ? { cityId: selectedCity } : {};
        const [catRes, brandRes] = await Promise.all([
          categoryService.getAll({ parentId: "all", ...cityParams }),
          brandService.getAll(cityParams),
        ]);
        if (!alive) return;
        if (catRes?.success) setAllCategories(catRes.categories || []);
        if (brandRes?.success) setBrands(brandRes.brands || []);
      } catch (err) {
        console.error("Meta load error:", err);
      }
    })();
    return () => { alive = false; };
  }, [selectedCity]);

  useEffect(() => {
    loadHealth();
  }, [loadHealth]);

  // Listen for category updates across components
  useEffect(() => {
    const handleCategoryUpdate = async () => {
      try {
        const catRes = await categoryService.getAll({ parentId: "all", ...(selectedCity ? { cityId: selectedCity } : {}) });
        if (catRes?.success) {
          setAllCategories(catRes.categories || []);
        }
      } catch (err) {
        console.error("Categories update error:", err);
      }
    };

    window.addEventListener("categoryCreated", handleCategoryUpdate);
    window.addEventListener("adminUserAppCatalogUpdated", handleCategoryUpdate);
    return () => {
      window.removeEventListener("categoryCreated", handleCategoryUpdate);
      window.removeEventListener("adminUserAppCatalogUpdated", handleCategoryUpdate);
    };
  }, [selectedCity]);

  // Follow the header's city whenever the HEADER changes it (including its first, asynchronous
  // value). A pick made in this page's own City filter stays until the header changes again. This
  // used to compare against the page's own city on every render, which snapped the filter straight
  // back, so "All Cities" or any other city could never be chosen here.
  useEffect(() => {
    setSelectedCity(propCity || "");
    setPage(1);
  }, [propCity]);

  // ─── SUB-CATEGORIES OF THE CHOSEN CATEGORY (from the same list) ───────
  const subCategories = useMemo(() => {
    if (!selectedCategory || selectedCategory === "all") return [];
    return allSubCategories.filter((c) => {
      const pId = typeof c.parentId === "object" ? c.parentId?._id || c.parentId?.id : c.parentId;
      return String(pId) === String(selectedCategory);
    });
  }, [allSubCategories, selectedCategory]);

  useEffect(() => {
    setSelectedSubCategory("all");
  }, [selectedCategory, selectedCity]);

  // Check if current category hasBrands === true
  const activeCategoryObj = useMemo(() => {
    if (!selectedCategory || selectedCategory === "all") return null;
    return (categories || []).find((c) => c && String(c.id || c._id) === String(selectedCategory)) || null;
  }, [categories, selectedCategory]);

  const isApplianceCategory = activeCategoryObj?.hasBrands === true;

  // Filtered brands for the active category
  const categoryBrands = useMemo(() => {
    if (!selectedCategory || selectedCategory === "all") return brands || [];
    const catIdStr = String(selectedCategory);
    return (brands || []).filter((b) => {
      if (!b) return false;
      const directId = String(typeof b.categoryId === "object" ? b.categoryId?._id || b.categoryId?.id : b.categoryId);
      if (directId === catIdStr) return true;
      if (Array.isArray(b.categoryIds)) {
        return b.categoryIds.some((cid) => {
          if (!cid) return false;
          const id = String(typeof cid === "object" ? cid?._id || cid?.id : cid);
          return id === catIdStr;
        });
      }
      return false;
    });
  }, [brands, selectedCategory]);

  // Auto-select first brand when appliance flow is active
  useEffect(() => {
    if (isApplianceCategory && categoryBrands.length > 0) {
      if (!activeApplianceBrandId || !categoryBrands.some((b) => (b.id || b._id) === activeApplianceBrandId)) {
        setActiveApplianceBrandId(categoryBrands[0].id || categoryBrands[0]._id);
      }
    } else if (!isApplianceCategory) {
      setActiveApplianceBrandId(null);
    }
  }, [isApplianceCategory, categoryBrands, activeApplianceBrandId]);

  // ─── FETCH SERVICES ───────────────────────────────────────────────────
  const fetchServices = useCallback(async () => {
    setLoadingServices(true);
    setServicesError(null);
    try {
      const params = {};
      if (selectedCity) params.cityId = selectedCity;
      if (selectedStatus !== "all") params.status = selectedStatus;
      if (selectedPublishStatus !== "all") params.publishStatus = selectedPublishStatus;
      if (selectedCategory !== "all") params.categoryId = selectedCategory;

      // The API pages its answer (never more than 200 rows); the table filters and pages locally,
      // so fetch every page. Without this only the first 50 services ever appeared.
      const PAGE = 200;
      const all = [];
      let pageNo = 1;
      let pages = 1;
      let failedMessage = null;
      do {
        const res = await serviceService.getWithStats({ ...params, page: pageNo, limit: PAGE });
        if (!res?.success) {
          failedMessage = res?.message || "Failed to load services";
          break;
        }
        all.push(...(res.services || []));
        pages = res.pages || 1;
        pageNo += 1;
      } while (pageNo <= pages && pageNo <= 25);

      if (failedMessage && all.length === 0) {
        setServices([]);
        setServicesError(failedMessage);
      } else {
        setServices(all);
      }
    } catch (err) {
      console.error("Services fetch error:", err);
      setServicesError(err?.response?.data?.message || err.message || "Failed to load services");
      toast.error("Failed to load services");
    } finally {
      setLoadingServices(false);
    }
  }, [selectedCity, selectedStatus, selectedPublishStatus, selectedCategory]);

  useEffect(() => {
    fetchServices();
  }, [fetchServices]);

  // ─── NEEDS ATTENTION IDS MAP ──────────────────────────────────────────
  const needsAttentionMap = useMemo(() => {
    const map = new Map();
    if (Array.isArray(healthData.needsAttention)) {
      healthData.needsAttention.forEach((item) => {
        // The API names it serviceId
        const id = String(item.serviceId || item.id || item._id);
        map.set(id, item.reasons || ["needs-attention"]);
      });
    }
    return map;
  }, [healthData]);

  // ─── CLIENT FILTERING ─────────────────────────────────────────────────
  const filteredServices = useMemo(() => {
    let list = [...services];

    // If appliance category is active, filter by activeApplianceBrandId
    if (isApplianceCategory && activeApplianceBrandId) {
      list = list.filter((s) => {
        const bId = String(typeof s.brandId === "object" ? s.brandId?._id || s.brandId?.id : s.brandId);
        return bId === String(activeApplianceBrandId);
      });
    } else if (selectedBrand !== "all") {
      list = list.filter((s) => {
        const bId = String(typeof s.brandId === "object" ? s.brandId?._id || s.brandId?.id : s.brandId);
        return bId === String(selectedBrand);
      });
    }

    // Sub-category filter
    if (selectedSubCategory !== "all") {
      list = list.filter((s) => {
        const cId = String(typeof s.categoryId === "object" ? s.categoryId?._id || s.categoryId?.id : s.categoryId);
        return cId === String(selectedSubCategory);
      });
    }

    // Stat card click filter
    if (activeStatFilter === "needs-attention") {
      list = list.filter((s) => {
        const sId = String(s.id || s._id);
        return needsAttentionMap.has(sId) || !s.workersMapped || s.workersMapped === 0 || !s.iconUrl || !s.basePrice;
      });
    } else if (activeStatFilter === "draft") {
      list = list.filter((s) => s.publishStatus === "draft");
    } else if (activeStatFilter === "active") {
      list = list.filter((s) => s.status === "active");
    }

    // Search query: title, slug, ID
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      list = list.filter(
        (s) =>
          (s.title || "").toLowerCase().includes(q) ||
          (s.slug || "").toLowerCase().includes(q) ||
          String(s.id || s._id || "").toLowerCase().includes(q)
      );
    }

    return list;
  }, [
    services,
    isApplianceCategory,
    activeApplianceBrandId,
    selectedBrand,
    selectedSubCategory,
    activeStatFilter,
    needsAttentionMap,
    searchTerm,
  ]);

  // Pagination slice
  const paginatedServices = useMemo(() => {
    const startIndex = (page - 1) * pageSize;
    return filteredServices.slice(startIndex, startIndex + pageSize);
  }, [filteredServices, page, pageSize]);

  const totalPages = Math.ceil(filteredServices.length / pageSize) || 1;

  // ─── SELECTION HELPERS ────────────────────────────────────────────────
  const allCurrentSelected = useMemo(() => {
    if (paginatedServices.length === 0) return false;
    return paginatedServices.every((s) => selectedServiceIds.includes(s.id || s._id));
  }, [paginatedServices, selectedServiceIds]);

  const handleToggleSelectAll = () => {
    if (allCurrentSelected) {
      const currentIds = new Set(paginatedServices.map((s) => s.id || s._id));
      setSelectedServiceIds((prev) => prev.filter((id) => !currentIds.has(id)));
    } else {
      const nextIds = new Set(selectedServiceIds);
      paginatedServices.forEach((s) => nextIds.add(s.id || s._id));
      setSelectedServiceIds(Array.from(nextIds));
    }
  };

  const handleToggleSelectOne = (id) => {
    setSelectedServiceIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // ─── ROW ACTIONS ──────────────────────────────────────────────────────
  // Single status toggle
  const handleToggleStatus = async (service) => {
    const id = service.id || service._id;
    const nextStatus = service.status === "active" ? "inactive" : "active";
    try {
      const res = await serviceService.bulkStatus([id], nextStatus);
      if (res?.success) {
        toast.success(`Service marked ${nextStatus}`);
        publicCatalogService.invalidateCache();
        setServices((prev) =>
          prev.map((s) => ((s.id || s._id) === id ? { ...s, status: nextStatus } : s))
        );
        loadHealth();
      } else {
        toast.error(res?.message || "Status change failed");
      }
    } catch (err) {
      console.error("Status change error:", err);
      toast.error("Failed to update status");
    }
  };

  // Duplicate service
  const handleDuplicate = async (service) => {
    const id = service.id || service._id;
    try {
      const res = await serviceService.duplicate(id);
      if (res?.success) {
        toast.success("Service duplicated as draft!");
        publicCatalogService.invalidateCache();
        fetchServices();
        loadHealth();
      } else {
        toast.error(res?.message || "Duplicate failed");
      }
    } catch (err) {
      console.error("Duplicate error:", err);
      toast.error(err?.response?.data?.message || "Failed to duplicate service");
    }
  };

  // Open Dependency Modal for Delete / Archive
  const handleOpenDelete = async (service) => {
    const id = service.id || service._id;
    setDepModal({
      isOpen: true,
      item: service,
      report: null,
      loading: true,
    });

    try {
      const depRes = await serviceService.getDependencies(id);
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

  const handleConfirmArchive = async () => {
    if (!depModal.item) return;
    const id = depModal.item.id || depModal.item._id;
    setDepModal((prev) => ({ ...prev, loading: true }));
    try {
      const res = await serviceService.archive(id);
      if (res?.success) {
        toast.success("Service safely archived!");
        publicCatalogService.invalidateCache();
        setDepModal({ isOpen: false, item: null, report: null, loading: false });
        fetchServices();
        loadHealth();
      } else {
        toast.error(res?.message || "Archive failed");
        setDepModal((prev) => ({ ...prev, loading: false }));
      }
    } catch (err) {
      console.error("Archive error:", err);
      toast.error(err?.response?.data?.message || "Failed to archive service");
      setDepModal((prev) => ({ ...prev, loading: false }));
    }
  };

  const handleConfirmForceDelete = async () => {
    if (!depModal.item) return;
    const id = depModal.item.id || depModal.item._id;
    setDepModal((prev) => ({ ...prev, loading: true }));
    try {
      const res = await serviceService.delete(id, true);
      if (res?.success) {
        toast.success("Service deleted!");
        publicCatalogService.invalidateCache();
        setDepModal({ isOpen: false, item: null, report: null, loading: false });
        fetchServices();
        loadHealth();
      } else {
        toast.error(res?.message || "Delete failed");
        setDepModal((prev) => ({ ...prev, loading: false }));
      }
    } catch (err) {
      console.error("Force delete error:", err);
      toast.error(err?.response?.data?.message || "Failed to delete service");
      setDepModal((prev) => ({ ...prev, loading: false }));
    }
  };

  // Reordering up/down
  const handleMoveServiceOrder = (index, direction) => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= paginatedServices.length) return;

    const listCopy = [...services];
    const sourceItem = paginatedServices[index];
    const targetItem = paginatedServices[targetIndex];

    const sIdx = listCopy.findIndex((x) => (x.id || x._id) === (sourceItem.id || sourceItem._id));
    const tIdx = listCopy.findIndex((x) => (x.id || x._id) === (targetItem.id || targetItem._id));

    if (sIdx !== -1 && tIdx !== -1) {
      const temp = listCopy[sIdx];
      listCopy[sIdx] = listCopy[tIdx];
      listCopy[tIdx] = temp;
      setServices(listCopy);
      toast.success("Order rearranged locally");
    }
  };

  // ─── BULK ACTIONS ─────────────────────────────────────────────────────
  const handleBulkStatusChange = async (newStatus) => {
    if (selectedServiceIds.length === 0) return;
    try {
      const res = await serviceService.bulkStatus(selectedServiceIds, newStatus);
      if (res?.success) {
        toast.success(`Updated ${selectedServiceIds.length} services to ${newStatus}`);
        publicCatalogService.invalidateCache();
        setSelectedServiceIds([]);
        fetchServices();
        loadHealth();
      } else {
        toast.error(res?.message || "Bulk status update failed");
      }
    } catch (err) {
      console.error("Bulk status error:", err);
      toast.error("Failed to update status");
    }
  };

  const handleOpenBulkMove = () => {
    if (selectedServiceIds.length === 0) return;
    setBulkMoveTargetIds(selectedServiceIds);
    setIsBulkMoveOpen(true);
  };

  const handleConfirmBulkMove = async ({ brandId, categoryId }) => {
    try {
      setMovingBulk(true);
      const res = await serviceService.bulkMove({
        ids: bulkMoveTargetIds,
        brandId,
        categoryId,
      });

      if (res?.success) {
        toast.success(`Moved ${bulkMoveTargetIds.length} services successfully!`);
        publicCatalogService.invalidateCache();
        setIsBulkMoveOpen(false);
        setSelectedServiceIds([]);
        fetchServices();
        loadHealth();
      } else {
        toast.error(res?.message || "Failed to move services");
      }
    } catch (err) {
      console.error("Bulk move error:", err);
      toast.error(err?.response?.data?.message || "Failed to move services");
    } finally {
      setMovingBulk(false);
    }
  };

  const handleBulkArchive = async () => {
    if (selectedServiceIds.length === 0) return;
    try {
      await Promise.all(selectedServiceIds.map((id) => serviceService.archive(id)));
      toast.success(`Archived ${selectedServiceIds.length} services`);
      publicCatalogService.invalidateCache();
      setSelectedServiceIds([]);
      fetchServices();
      loadHealth();
    } catch (err) {
      console.error("Bulk archive error:", err);
      toast.error("Error archiving services");
    }
  };

  // ─── RENDER BREADCRUMB ────────────────────────────────────────────────
  const renderBreadcrumb = () => {
    const selectedCatObj = (categories || []).find((c) => c && String(c.id || c._id) === String(selectedCategory));
    const selectedSubObj = (subCategories || []).find((c) => c && String(c.id || c._id) === String(selectedSubCategory));
    const selectedBrandObj = (brands || []).find(
      (b) =>
        b &&
        String(b.id || b._id) ===
        String(isApplianceCategory ? activeApplianceBrandId : selectedBrand)
    );

    return (
      <div className="flex items-center gap-1.5 text-xs text-gray-500 bg-gray-50 px-3 py-2 rounded-lg border border-gray-200">
        <button
          type="button"
          onClick={() => {
            setSelectedCategory("all");
            setSelectedSubCategory("all");
            setSelectedBrand("all");
          }}
          className="font-medium text-blue-600 hover:underline"
        >
          All Catalog
        </button>

        {selectedCatObj && (
          <>
            <FiChevronRight className="w-3.5 h-3.5 text-gray-400" />
            <button
              type="button"
              onClick={() => {
                setSelectedSubCategory("all");
                setSelectedBrand("all");
              }}
              className={`font-medium ${
                !selectedSubObj && !selectedBrandObj ? "text-gray-900 font-bold" : "text-blue-600 hover:underline"
              }`}
            >
              {selectedCatObj.title}
            </button>
          </>
        )}

        {selectedSubObj && (
          <>
            <FiChevronRight className="w-3.5 h-3.5 text-gray-400" />
            <button
              type="button"
              onClick={() => setSelectedBrand("all")}
              className={`font-medium ${
                !selectedBrandObj ? "text-gray-900 font-bold" : "text-blue-600 hover:underline"
              }`}
            >
              {selectedSubObj.title}
            </button>
          </>
        )}

        {selectedBrandObj && (
          <>
            <FiChevronRight className="w-3.5 h-3.5 text-gray-400" />
            <span className="text-gray-900 font-bold">{selectedBrandObj.title}</span>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* ─── TOP HEADER ────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2.5">
            <FiBox className="text-[#2874F0]" />
            Catalog & Service Management
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Dynamic catalog control: manage services, category hierarchies, pricing, brands, and public visibility.
          </p>
        </div>

        <div className="flex items-center gap-2 self-stretch md:self-auto justify-end">
          <button
            type="button"
            onClick={() => {
              fetchServices();
              loadHealth();
            }}
            disabled={loadingServices}
            className="p-2.5 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-xl text-xs font-semibold shadow-sm transition-colors flex items-center gap-1.5"
            title="Refresh All"
          >
            <FiRefreshCw className={`w-3.5 h-3.5 ${loadingServices ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setEditingService(null);
              setIsWizardOpen(true);
            }}
            className="px-4 py-2.5 bg-[#2874F0] hover:bg-blue-600 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-500/20 flex items-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <FiPlus className="w-4 h-4" />
            Create Service
          </button>
        </div>
      </div>

      {/* ─── STAT CARDS (HEALTH BAR) ────────────────────────────────────── */}
      <CatalogHealthBar
        health={healthData}
        activeFilter={activeStatFilter}
        onFilterChange={(f) => {
          setActiveStatFilter(f);
          setPage(1);
        }}
        loading={loadingHealth}
      />

      {/* If "Needs Attention" filter is active, show banner */}
      {activeStatFilter === "needs-attention" && (
        <div className="bg-rose-50 border border-rose-200 p-3.5 rounded-xl flex items-center justify-between gap-3 text-xs text-rose-800">
          <div className="flex items-center gap-2">
            <FiAlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>
              <strong>Filtered by Needs Attention:</strong> Showing services with unmapped workers, missing thumbnail, missing price, or inactive parent categories.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setActiveStatFilter("all")}
            className="px-2.5 py-1 bg-white border border-rose-300 rounded text-rose-700 font-bold hover:bg-rose-100"
          >
            Clear Filter
          </button>
        </div>
      )}

      {/* ─── MAIN TABS, in catalog order: categories -> sub-categories -> brands -> services ─── */}
      <div className="flex items-center gap-1 border-b border-gray-200 bg-white px-2 pt-2 rounded-t-xl overflow-x-auto">
        {[
          { id: "categories", label: "Categories", count: categories.length, Icon: FiLayers },
          { id: "subcategories", label: "Sub-categories", count: allSubCategories.length, Icon: FiGrid },
          { id: "brands", label: "Sections and brands", count: brands.length, Icon: FiTag },
          { id: "services", label: "Services", count: services.length, Icon: FiBox },
          { id: "draft-archive", label: "Draft and archive", Icon: FiArchive },
          { id: "audit-log", label: "Audit log", Icon: FiActivity },
        ].map(({ id, label, count, Icon: TabIcon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={`px-4 py-2.5 text-xs font-bold transition-all relative flex items-center gap-2 shrink-0 ${
              activeTab === id
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-gray-500 hover:text-gray-900"
            }`}
          >
            <TabIcon className="w-4 h-4" />
            {label}{count !== undefined ? ` (${count})` : ""}
          </button>
        ))}
      </div>

      {/* ─── TAB 1: SERVICES (MAIN LIST) ────────────────────────────────── */}
      {activeTab === "services" && (
        <div className="space-y-4">
          {/* Breadcrumb Navigation */}
          {renderBreadcrumb()}

          {/* Filter Bar */}
          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5 text-xs">
              {/* City Filter */}
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                  City
                </label>
                <select
                  value={selectedCity}
                  onChange={(e) => {
                    setSelectedCity(e.target.value);
                    setPage(1);
                  }}
                  className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg bg-gray-50 text-gray-800 font-medium focus:bg-white focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Cities</option>
                  {cities.map((c) => {
                    const cId = c._id || c.id;
                    return (
                      <option key={cId} value={cId}>
                        {c.name}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Category Filter */}
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                  Category
                </label>
                <select
                  value={selectedCategory}
                  onChange={(e) => {
                    setSelectedCategory(e.target.value);
                    setSelectedSubCategory("all");
                    setSelectedBrand("all");
                    setPage(1);
                  }}
                  className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg bg-gray-50 text-gray-800 font-medium focus:bg-white focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Categories</option>
                  {categories.map((c) => {
                    const cId = c.id || c._id;
                    return (
                      <option key={cId} value={cId}>
                        {c.title} {c.hasBrands ? "★ (Brands)" : ""}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Sub-Category Filter */}
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                  Sub-Category
                </label>
                <select
                  disabled={subCategories.length === 0}
                  value={selectedSubCategory}
                  onChange={(e) => {
                    setSelectedSubCategory(e.target.value);
                    setPage(1);
                  }}
                  className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg bg-gray-50 text-gray-800 font-medium focus:bg-white focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  <option value="all">
                    {subCategories.length === 0 ? "None Available" : "All Sub-Categories"}
                  </option>
                  {subCategories.map((sc) => {
                    const scId = sc.id || sc._id;
                    return (
                      <option key={scId} value={scId}>
                        {sc.title}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Brand / Section Filter (if not appliance flow) */}
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                  Section / Brand
                </label>
                <select
                  value={selectedBrand}
                  onChange={(e) => {
                    setSelectedBrand(e.target.value);
                    setPage(1);
                  }}
                  className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg bg-gray-50 text-gray-800 font-medium focus:bg-white focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Brands ({brands.length})</option>
                  {categoryBrands.map((b) => {
                    const bId = b.id || b._id;
                    return (
                      <option key={bId} value={bId}>
                        {b.title}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Status Filter */}
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                  Status
                </label>
                <select
                  value={selectedStatus}
                  onChange={(e) => {
                    setSelectedStatus(e.target.value);
                    setPage(1);
                  }}
                  className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg bg-gray-50 text-gray-800 font-medium focus:bg-white focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Statuses</option>
                  <option value="active">Active Only</option>
                  <option value="inactive">Inactive Only</option>
                  <option value="deleted">Archived</option>
                </select>
              </div>

              {/* Publish Status Filter */}
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                  Publish State
                </label>
                <select
                  value={selectedPublishStatus}
                  onChange={(e) => {
                    setSelectedPublishStatus(e.target.value);
                    setPage(1);
                  }}
                  className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg bg-gray-50 text-gray-800 font-medium focus:bg-white focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">Published & Drafts</option>
                  <option value="published">Published</option>
                  <option value="draft">Drafts</option>
                </select>
              </div>
            </div>

            {/* Search and View Toggle Bar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-gray-100">
              <div className="relative flex-1 w-full sm:max-w-md">
                <input
                  type="text"
                  placeholder="Search by title, slug, or ID..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setPage(1);
                  }}
                  className="w-full text-xs px-3 py-2 pl-8 border border-gray-300 rounded-lg bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                />
                <FiSearch className="absolute left-2.5 top-2.5 text-gray-400 w-3.5 h-3.5" />
              </div>

              <div className="flex items-center gap-2 self-end sm:self-center">
                <span className="text-xs text-gray-500 font-medium">
                  {filteredServices.length} service{filteredServices.length !== 1 ? "s" : ""}
                </span>

                {/* Card vs Table View Toggle */}
                <div className="p-0.5 bg-gray-100 border border-gray-200 rounded-lg flex items-center">
                  <button
                    type="button"
                    onClick={() => setViewMode("table")}
                    className={`p-1.5 rounded-md transition-all ${
                      viewMode === "table" ? "bg-white text-blue-600 shadow-xs" : "text-gray-500 hover:text-gray-800"
                    }`}
                    title="Table View"
                  >
                    <FiList className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("card")}
                    className={`p-1.5 rounded-md transition-all ${
                      viewMode === "card" ? "bg-white text-blue-600 shadow-xs" : "text-gray-500 hover:text-gray-800"
                    }`}
                    title="Card View"
                  >
                    <FiGrid className="w-4 h-4" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedCity("");
                    setSelectedCategory("all");
                    setSelectedSubCategory("all");
                    setSelectedBrand("all");
                    setSelectedStatus("all");
                    setSelectedPublishStatus("all");
                    setActiveStatFilter("all");
                    setSearchTerm("");
                    setPage(1);
                  }}
                  className="text-xs text-gray-500 hover:text-gray-800 underline px-1"
                >
                  Reset
                </button>
              </div>
            </div>
          </div>

          {/* ─── APPLIANCE FLOW (2-COLUMN) OR REGULAR FULL-WIDTH ───────────── */}
          <div className={`grid gap-4 items-start ${isApplianceCategory ? "grid-cols-1 lg:grid-cols-4" : "grid-cols-1"}`}>
            {/* Left Brand Column (Only when hasBrands=true category is chosen) */}
            {isApplianceCategory && (
              <div className="lg:col-span-1 bg-white p-3 rounded-xl border border-gray-200 shadow-sm space-y-2">
                <div className="flex items-center justify-between px-1 pb-2 border-b border-gray-100">
                  <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">
                    Brands ({categoryBrands.length})
                  </span>
                  <span className="text-[10px] text-blue-600 font-bold bg-blue-50 px-1.5 py-0.5 rounded">
                    Appliance Flow
                  </span>
                </div>

                <div className="max-h-[550px] overflow-y-auto space-y-1.5 pr-1">
                  {categoryBrands.length === 0 ? (
                    <div className="text-center py-6 text-xs text-gray-400">
                      No brands in this category
                    </div>
                  ) : (
                    categoryBrands.map((brand) => {
                      const bId = brand.id || brand._id;
                      const isSelected = activeApplianceBrandId === bId;
                      return (
                        <div
                          key={bId}
                          onClick={() => {
                            setActiveApplianceBrandId(bId);
                            setPage(1);
                          }}
                          className={`p-2.5 rounded-lg border cursor-pointer transition-all flex items-center gap-2.5 ${
                            isSelected
                              ? "bg-blue-50/70 border-blue-500 shadow-xs ring-1 ring-blue-300"
                              : "bg-white border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                          }`}
                        >
                          {brand.iconUrl ? (
                            <img
                              src={toAssetUrl(brand.iconUrl)}
                              alt={brand.title}
                              className="w-7 h-7 rounded-md object-contain bg-white border border-gray-100 p-0.5"
                            />
                          ) : (
                            <div className="w-7 h-7 rounded-md bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-400">
                              {brand.title?.charAt(0) || "—"}
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <span
                              className={`text-xs font-bold block truncate ${
                                isSelected ? "text-blue-700" : "text-gray-800"
                              }`}
                            >
                              {brand.title}
                            </span>
                            <span className="text-[10px] text-gray-400 font-mono block truncate">
                              /{brand.slug || "slug"}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* Right / Main Content Column */}
            <div className={isApplianceCategory ? "lg:col-span-3 space-y-3" : "space-y-3"}>
              {/* Table or Card View Container */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                {loadingServices ? (
                  <div className="p-8 space-y-3">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div
                        key={i}
                        className="animate-pulse flex items-center justify-between py-3 border-b border-gray-100"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-gray-200 rounded-lg" />
                          <div className="space-y-1.5">
                            <div className="w-36 h-4 bg-gray-200 rounded" />
                            <div className="w-24 h-3 bg-gray-100 rounded" />
                          </div>
                        </div>
                        <div className="w-20 h-4 bg-gray-200 rounded" />
                        <div className="w-16 h-6 bg-gray-200 rounded-full" />
                      </div>
                    ))}
                  </div>
                ) : servicesError ? (
                  <div className="p-12 text-center">
                    <FiAlertTriangle className="w-10 h-10 text-rose-500 mx-auto mb-2" />
                    <h3 className="text-sm font-bold text-gray-800">Error loading catalog</h3>
                    <p className="text-xs text-gray-500 mt-1">{servicesError}</p>
                    <button
                      onClick={fetchServices}
                      className="mt-3 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-sm"
                    >
                      Retry Loading
                    </button>
                  </div>
                ) : filteredServices.length === 0 ? (
                  <div className="p-12 text-center">
                    <FiBox className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                    <h3 className="text-sm font-bold text-gray-700">No services match your filters</h3>
                    <p className="text-xs text-gray-400 mt-1">
                      Try clearing your search query or reset your category/status filters.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCategory("all");
                        setSelectedBrand("all");
                        setSelectedStatus("all");
                        setSelectedPublishStatus("all");
                        setActiveStatFilter("all");
                        setSearchTerm("");
                      }}
                      className="mt-3 px-3.5 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded-lg"
                    >
                      Reset All Filters
                    </button>
                  </div>
                ) : viewMode === "table" ? (
                  /* ─── TABLE VIEW ─────────────────────────────────────── */
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200 text-gray-600 font-semibold uppercase tracking-wider">
                          <th className="py-3 px-3 text-center w-10">
                            <button
                              type="button"
                              onClick={handleToggleSelectAll}
                              className="text-gray-500 hover:text-blue-600"
                            >
                              {allCurrentSelected ? (
                                <FiCheckSquare className="w-4 h-4 text-blue-600" />
                              ) : (
                                <FiSquare className="w-4 h-4" />
                              )}
                            </button>
                          </th>
                          <th className="py-3 px-2 text-center w-12">Order</th>
                          <th className="py-3 px-3">Service</th>
                          <th className="py-3 px-3">Category</th>
                          <th className="py-3 px-3">Price / Model</th>
                          <th className="py-3 px-3 text-center">Variants</th>
                          <th className="py-3 px-3 text-center">Workers Mapped</th>
                          <th className="py-3 px-3 text-center">Bookings (30d)</th>
                          <th className="py-3 px-3 text-center">Status</th>
                          <th className="py-3 px-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 text-gray-700">
                        {paginatedServices.map((service, idx) => {
                          const id = service.id || service._id;
                          const isSelected = selectedServiceIds.includes(id);
                          const isDraft = service.publishStatus === "draft";
                          const isArchived = service.status === "deleted";
                          const reasons = needsAttentionMap.get(String(id)) || [];
                          const workersCount = service.workersMapped || 0;

                          // Category & Brand info
                          const catTitle =
                            typeof service.categoryId === "object"
                              ? service.categoryId?.title
                              : allCategories.find((c) => String(c.id || c._id) === String(typeof service.categoryId === "object" ? service.categoryId?._id || service.categoryId?.id : service.categoryId))?.title || "—";

                          const brandTitle =
                            typeof service.brandId === "object"
                              ? service.brandId?.title
                              : brands.find((b) => (b.id || b._id) === service.brandId)?.title || "";

                          return (
                            <tr
                              key={id}
                              className={`transition-colors ${
                                isSelected ? "bg-blue-50/60" : "hover:bg-blue-50/30"
                              }`}
                            >
                              {/* Bulk Checkbox */}
                              <td className="py-3 px-3 text-center whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={() => handleToggleSelectOne(id)}
                                  className="text-gray-500 hover:text-blue-600"
                                >
                                  {isSelected ? (
                                    <FiCheckSquare className="w-4 h-4 text-blue-600" />
                                  ) : (
                                    <FiSquare className="w-4 h-4" />
                                  )}
                                </button>
                              </td>

                              {/* Reorder Up/Down */}
                              <td className="py-3 px-2 text-center whitespace-nowrap">
                                <div className="flex items-center justify-center gap-0.5">
                                  <button
                                    type="button"
                                    onClick={() => handleMoveServiceOrder(idx, "up")}
                                    disabled={idx === 0}
                                    className="p-1 text-gray-400 hover:text-blue-600 disabled:opacity-20"
                                    title="Move Up"
                                  >
                                    <FiChevronUp className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleMoveServiceOrder(idx, "down")}
                                    disabled={idx === paginatedServices.length - 1}
                                    className="p-1 text-gray-400 hover:text-blue-600 disabled:opacity-20"
                                    title="Move Down"
                                  >
                                    <FiChevronDown className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>

                              {/* Service Name & Thumbnail */}
                              <td className="py-3 px-3">
                                <div className="flex items-center gap-2.5 max-w-xs">
                                  {service.iconUrl ? (
                                    <img
                                      src={toAssetUrl(service.iconUrl)}
                                      alt={service.title}
                                      className="w-9 h-9 rounded-lg object-contain bg-gray-50 border border-gray-200 p-0.5 shrink-0"
                                    />
                                  ) : (
                                    <div className="w-9 h-9 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center font-bold text-xs text-gray-400 shrink-0">
                                      {service.title?.charAt(0) || "—"}
                                    </div>
                                  )}
                                  <div className="min-w-0">
                                    <span className="font-bold text-gray-900 block truncate" title={service.title}>
                                      {service.title}
                                    </span>
                                    <div className="flex items-center gap-1.5 mt-0.5">
                                      <span className="text-[10px] text-gray-400 font-mono truncate">
                                        /{service.slug || "no-slug"}
                                      </span>
                                      {isDraft && (
                                        <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800">
                                          DRAFT
                                        </span>
                                      )}
                                      {isArchived && (
                                        <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-rose-100 text-rose-800">
                                          ARCHIVED
                                        </span>
                                      )}
                                      {reasons.length > 0 && (
                                        <span
                                          className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-rose-50 text-rose-700 border border-rose-200"
                                          title={`Needs attention: ${reasons.join(", ")}`}
                                        >
                                          ⚠️ {reasons[0]}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </td>

                              {/* Category & Section */}
                              <td className="py-3 px-3 whitespace-nowrap">
                                <div className="space-y-0.5">
                                  <span className="inline-block px-1.5 py-0.5 rounded bg-gray-100 text-gray-800 font-medium">
                                    {catTitle}
                                  </span>
                                  {brandTitle && (
                                    <span className="block text-[10px] text-gray-500 font-medium">
                                      {brandTitle}
                                    </span>
                                  )}
                                </div>
                              </td>

                              {/* Price or Starts At */}
                              <td className="py-3 px-3 whitespace-nowrap">
                                <div>
                                  <div className="font-bold text-gray-900 flex items-baseline gap-1">
                                    {service.pricingType === "starting_from" && (
                                      <span className="text-[10px] font-normal text-gray-500">Starts at</span>
                                    )}
                                    <span>₹{service.discountPrice ?? service.basePrice ?? 0}</span>
                                    {service.discountPrice && service.basePrice > service.discountPrice && (
                                      <span className="text-[10px] text-gray-400 line-through">
                                        ₹{service.basePrice}
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-[10px] text-gray-400 capitalize">
                                    {service.pricingType?.replace("_", " ") || "fixed"}
                                  </span>
                                </div>
                              </td>

                              {/* Variants Count */}
                              <td className="py-3 px-3 text-center whitespace-nowrap">
                                {Array.isArray(service.variants) && service.variants.length > 0 ? (
                                  <span
                                    className="inline-block px-2 py-0.5 text-[10px] font-bold rounded-full bg-purple-50 text-purple-700 border border-purple-200"
                                    title={service.variants.map((v) => `${v.title}: ₹${v.price}`).join("\n")}
                                  >
                                    {service.variants.length} variant{service.variants.length > 1 ? "s" : ""}
                                  </span>
                                ) : (
                                  <span className="text-gray-400">—</span>
                                )}
                              </td>

                              {/* Workers Mapped */}
                              <td className="py-3 px-3 text-center whitespace-nowrap">
                                <span
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-bold rounded-full ${
                                    workersCount > 0
                                      ? "bg-emerald-50 text-emerald-700"
                                      : "bg-rose-100 text-rose-700 border border-rose-300 animate-pulse"
                                  }`}
                                >
                                  <FiUsers className="w-3 h-3" />
                                  {workersCount}
                                </span>
                              </td>

                              {/* Bookings Last 30 Days */}
                              <td className="py-3 px-3 text-center whitespace-nowrap">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold text-gray-700 bg-gray-100 rounded-full">
                                  <FiCalendar className="w-3 h-3 text-gray-400" />
                                  {service.bookingsLast30Days || 0}
                                </span>
                              </td>

                              {/* Status Toggle */}
                              <td className="py-3 px-3 text-center whitespace-nowrap">
                                <ToggleSwitch
                                  checked={service.status === "active"}
                                  onChange={() => handleToggleStatus(service)}
                                />
                              </td>

                              {/* Actions Dropdown / Buttons */}
                              <td className="py-3 px-3 text-right whitespace-nowrap">
                                <div className="flex items-center justify-end gap-1">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingService(service);
                                      setIsWizardOpen(true);
                                    }}
                                    className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                    title="Edit Service"
                                  >
                                    <FiEdit2 className="w-3.5 h-3.5" />
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleDuplicate(service)}
                                    className="p-1.5 text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                                    title="Duplicate Service"
                                  >
                                    <FiCopy className="w-3.5 h-3.5" />
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      setBulkMoveTargetIds([id]);
                                      setIsBulkMoveOpen(true);
                                    }}
                                    className="p-1.5 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                                    title="Move Category / Brand"
                                  >
                                    <FiMove className="w-3.5 h-3.5" />
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleOpenDelete(service)}
                                    className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                    title="Delete / Archive"
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
                ) : (
                  /* ─── CARD VIEW ──────────────────────────────────────── */
                  <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                    {paginatedServices.map((service, idx) => {
                      const id = service.id || service._id;
                      const isSelected = selectedServiceIds.includes(id);
                      const isDraft = service.publishStatus === "draft";
                      const isArchived = service.status === "deleted";
                      const reasons = needsAttentionMap.get(String(id)) || [];
                      const workersCount = service.workersMapped || 0;

                      return (
                        <div
                          key={id}
                          className={`p-4 rounded-xl border transition-all flex flex-col justify-between ${
                            isSelected
                              ? "bg-blue-50/50 border-blue-500 shadow-sm"
                              : "bg-white border-gray-200 hover:border-blue-300 hover:shadow-xs"
                          }`}
                        >
                          <div>
                            {/* Card Header */}
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2.5">
                                <button
                                  type="button"
                                  onClick={() => handleToggleSelectOne(id)}
                                  className="text-gray-400 hover:text-blue-600"
                                >
                                  {isSelected ? (
                                    <FiCheckSquare className="w-4 h-4 text-blue-600" />
                                  ) : (
                                    <FiSquare className="w-4 h-4" />
                                  )}
                                </button>
                                {service.iconUrl ? (
                                  <img
                                    src={toAssetUrl(service.iconUrl)}
                                    alt={service.title}
                                    className="w-10 h-10 rounded-lg object-contain bg-gray-50 border border-gray-200 p-1"
                                  />
                                ) : (
                                  <div className="w-10 h-10 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center font-bold text-xs text-gray-400">
                                    {service.title?.charAt(0) || "—"}
                                  </div>
                                )}
                                <div>
                                  <h4 className="text-xs font-bold text-gray-900 leading-snug line-clamp-1">
                                    {service.title}
                                  </h4>
                                  <span className="text-[10px] text-gray-400 font-mono block">
                                    /{service.slug || "slug"}
                                  </span>
                                </div>
                              </div>

                              <ToggleSwitch
                                checked={service.status === "active"}
                                onChange={() => handleToggleStatus(service)}
                              />
                            </div>

                            {/* Badges / Attention */}
                            <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                              {isDraft && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                                  DRAFT
                                </span>
                              )}
                              {isArchived && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-800">
                                  ARCHIVED
                                </span>
                              )}
                              {reasons.map((r, i) => (
                                <span
                                  key={i}
                                  className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200"
                                >
                                  ⚠️ {r}
                                </span>
                              ))}
                            </div>

                            {/* Details Grid */}
                            <div className="grid grid-cols-2 gap-2 text-[11px] mt-3 pt-3 border-t border-gray-100">
                              <div>
                                <span className="text-gray-400 block text-[10px] uppercase font-semibold">
                                  Price
                                </span>
                                <span className="font-bold text-gray-900">
                                  {service.pricingType === "starting_from" ? "Starts ₹" : "₹"}
                                  {service.discountPrice ?? service.basePrice ?? 0}
                                </span>
                              </div>
                              <div>
                                <span className="text-gray-400 block text-[10px] uppercase font-semibold">
                                  Workers Mapped
                                </span>
                                <span
                                  className={`font-bold ${
                                    workersCount > 0 ? "text-emerald-700" : "text-rose-600 font-extrabold"
                                  }`}
                                >
                                  {workersCount} mapped
                                </span>
                              </div>
                              <div>
                                <span className="text-gray-400 block text-[10px] uppercase font-semibold">
                                  Variants
                                </span>
                                <span className="font-medium text-gray-700">
                                  {service.variants?.length || 0} variants
                                </span>
                              </div>
                              <div>
                                <span className="text-gray-400 block text-[10px] uppercase font-semibold">
                                  Bookings (30d)
                                </span>
                                <span className="font-medium text-gray-700">
                                  {service.bookingsLast30Days || 0} booked
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Card Footer Actions */}
                          <div className="pt-3 mt-3 border-t border-gray-100 flex items-center justify-between">
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleMoveServiceOrder(idx, "up")}
                                disabled={idx === 0}
                                className="p-1 text-gray-400 hover:text-blue-600 disabled:opacity-20"
                                title="Move Up"
                              >
                                <FiChevronUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleMoveServiceOrder(idx, "down")}
                                disabled={idx === paginatedServices.length - 1}
                                className="p-1 text-gray-400 hover:text-blue-600 disabled:opacity-20"
                                title="Move Down"
                              >
                                <FiChevronDown className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingService(service);
                                  setIsWizardOpen(true);
                                }}
                                className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                title="Edit"
                              >
                                <FiEdit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDuplicate(service)}
                                className="p-1.5 text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                                title="Duplicate"
                              >
                                <FiCopy className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenDelete(service)}
                                className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                title="Delete"
                              >
                                <FiTrash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="p-3 border-t border-gray-200 bg-gray-50 flex items-center justify-between text-xs text-gray-600">
                    <span>
                      Page {page} of {totalPages} ({filteredServices.length} total)
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page <= 1}
                        className="px-3 py-1 bg-white border border-gray-300 rounded text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                      >
                        Previous
                      </button>
                      <button
                        type="button"
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={page >= totalPages}
                        className="px-3 py-1 bg-white border border-gray-300 rounded text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ─── FLOATING BULK SELECTION BAR ──────────────────────────────── */}
          {selectedServiceIds.length > 0 && (
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-2xl border border-slate-700 flex items-center gap-4 animate-in slide-in-from-bottom-5">
              <span className="text-xs font-bold text-slate-200 whitespace-nowrap">
                {selectedServiceIds.length} service{selectedServiceIds.length > 1 ? "s" : ""} selected
              </span>

              <div className="h-4 w-px bg-slate-700" />

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleBulkStatusChange("active")}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
                >
                  <FiCheck className="w-3.5 h-3.5" />
                  Activate
                </button>

                <button
                  type="button"
                  onClick={() => handleBulkStatusChange("inactive")}
                  className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
                >
                  <FiEyeOff className="w-3.5 h-3.5" />
                  Deactivate
                </button>

                <button
                  type="button"
                  onClick={handleOpenBulkMove}
                  className="px-3 py-1.5 bg-[#2874F0] hover:bg-blue-600 text-white rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
                >
                  <FiMove className="w-3.5 h-3.5" />
                  Move Category / Brand
                </button>

                <button
                  type="button"
                  onClick={handleBulkArchive}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
                >
                  <FiArchive className="w-3.5 h-3.5" />
                  Archive
                </button>
              </div>

              <div className="h-4 w-px bg-slate-700" />

              <button
                type="button"
                onClick={() => setSelectedServiceIds([])}
                className="text-xs text-slate-400 hover:text-white underline"
              >
                Deselect
              </button>
            </div>
          )}
        </div>
      )}

      {/* ─── TAB 2: CATEGORIES ────────────────────────────────────────── */}
      {activeTab === "categories" && (
        <CategoriesListView level="root" selectedCity={selectedCity} onRefreshHealth={loadHealth} />
      )}

      {/* ─── TAB 2: SUB-CATEGORIES ────────────────────────────────────── */}
      {activeTab === "subcategories" && (
        <CategoriesListView level="sub" selectedCity={selectedCity} onRefreshHealth={loadHealth} />
      )}

      {/* ─── TAB 3: SECTIONS AND BRANDS ───────────────────────────────── */}
      {activeTab === "brands" && (
        <BrandsListView selectedCity={selectedCity} onRefreshHealth={loadHealth} />
      )}

      {/* ─── TAB 4: DRAFT AND ARCHIVE ─────────────────────────────────── */}
      {activeTab === "draft-archive" && (
        <DraftArchiveView
          onRefreshMain={() => {
            fetchServices();
            loadHealth();
          }}
        />
      )}

      {/* ─── TAB 5: AUDIT LOG ─────────────────────────────────────────── */}
      {activeTab === "audit-log" && <AuditLogView />}

      {/* ─── SERVICE WIZARD MODAL (EDIT / CREATE) ─────────────────────── */}
      <ServiceWizardModal
        isOpen={isWizardOpen}
        onClose={() => {
          setIsWizardOpen(false);
          setEditingService(null);
        }}
        service={editingService}
        categories={categories}
        brands={brands}
        cities={cities}
        selectedCity={selectedCity}
        onSaved={() => {
          fetchServices();
          loadHealth();
        }}
      />

      {/* ─── DEPENDENCY MODAL (DELETE / ARCHIVE) ───────────────────────── */}
      <DependencyModal
        isOpen={depModal.isOpen}
        onClose={() => setDepModal({ isOpen: false, item: null, report: null, loading: false })}
        report={depModal.report}
        entityName={depModal.item?.title || "Service"}
        entityType="service"
        onConfirmArchive={handleConfirmArchive}
        onConfirmForceDelete={handleConfirmForceDelete}
        loading={depModal.loading}
      />

      {/* ─── BULK MOVE MODAL ──────────────────────────────────────────── */}
      <BulkMoveModal
        isOpen={isBulkMoveOpen}
        onClose={() => setIsBulkMoveOpen(false)}
        selectedCount={bulkMoveTargetIds.length}
        brands={brands}
        categories={categories}
        onConfirmMove={handleConfirmBulkMove}
        loading={movingBulk}
      />
    </div>
  );
};

export default ServiceManagementPage;

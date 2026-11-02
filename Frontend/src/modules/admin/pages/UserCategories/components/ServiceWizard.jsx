import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  FiX,
  FiSave,
  FiUpload,
  FiPlus,
  FiTrash2,
  FiAlertTriangle,
  FiCheck,
  FiLayers,
  FiDollarSign,
  FiFileText,
  FiImage,
  FiArrowLeft,
  FiArrowRight,
  FiSearch,
  FiStar,
  FiClock,
  FiTag,
  FiShield,
  FiHelpCircle,
  FiUsers,
  FiSend,
  FiCornerDownRight,
  FiCheckCircle,
  FiAlertCircle,
  FiChevronRight,
  FiChevronLeft,
  FiMove,
  FiEye,
  FiInfo,
  FiBookmark
} from "react-icons/fi";
import { toast } from "react-hot-toast";
import {
  categoryService,
  brandService,
  serviceService,
  publicCatalogService
} from "../../../../../services/catalogService";
import { cityService } from "../../../../admin/services/cityService";
import { configService } from "../../../../../services/configService";
import { slugify, toAssetUrl } from "../utils";
import ToggleSwitch from "./ToggleSwitch";
import IconUploadWithPreview from "../../../components/IconUploadWithPreview";
import ModalLock from '../../../../../components/common/ModalLock';

// Pricing Types supported by backend
const PRICING_TYPES = [
  { value: "fixed", label: "Fixed Price", hint: "Single fixed amount charged at checkout." },
  { value: "hourly", label: "Hourly Rate", hint: "Multiplied by hours requested." },
  { value: "starting_from", label: "Starting From", hint: "Starts at ₹X, final bill set on completion." },
  { value: "inspection_fee", label: "Inspection Fee", hint: "Initial visit fee only, quote given on-site." },
  { value: "quote_required", label: "Quote Required", hint: "Custom quote inquiry (no direct checkout)." }
];

const STEPS = [
  { id: 1, label: "Category", icon: FiLayers, desc: "Parent service group" },
  { id: 2, label: "Sub-category", icon: FiCornerDownRight, desc: "Specialization or direct" },
  { id: 3, label: "Brand / Section", icon: FiTag, desc: "Brand or catalog section" },
  { id: 4, label: "Details", icon: FiFileText, desc: "Pricing, media, specs" },
  { id: 5, label: "Variants", icon: FiDollarSign, desc: "Tiers, packages, options" },
  { id: 6, label: "Publish", icon: FiSend, desc: "Review, workers & status" }
];

const INITIAL_SERVICE_STATE = {
  // Step 1
  categoryId: "",
  categoryObj: null,

  // Step 2
  subCategoryId: null, // null means flat under categoryId
  subCategoryObj: null,

  // Step 3
  brandId: "",
  brandObj: null,
  selectedBrandIds: [],
  isSectionSkipped: false,

  // Step 4: Details
  title: "",
  description: "",
  images: [], // array of URLs, first is primary
  iconUrl: "",
  pricingType: "fixed",
  basePrice: "",
  originalPrice: "",
  discountLabel: "",
  hourlyRate: "",
  minHours: 1,
  maxHours: 8,
  inspectionFee: "",
  quoteContactNote: "",
  gstPercentage: 18,
  durationMinutes: "",
  inclusions: [],
  exclusions: [],
  faqs: [], // [{ question, answer }]
  warranty: "",
  cancellationPolicy: "",
  isPackage: false,
  displayRating: "4.8",
  reviewsLabel: "1.2k reviews",
  cityIds: [],
  status: "active",
  publishStatus: "published",

  // Step 5: Variants
  variants: []
};

/**
 * ServiceWizard — Modern 6-Step Create & Edit Service Wizard
 */
export const ServiceWizard = ({
  isOpen,
  onClose,
  service = null,
  categories: propCategories = [],
  brands: propBrands = [],
  cities: propCities = [],
  selectedCity = "",
  // Open a NEW service with this category (and sub-category) already chosen
  presetCategoryId = "",
  presetSubCategoryId = "",
  onSaved
}) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState(INITIAL_SERVICE_STATE);
  const [initialSnapshot, setInitialSnapshot] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Metadata collections
  const [categories, setCategories] = useState([]);
  const [subCategories, setSubCategories] = useState([]);
  const [loadingSubCategories, setLoadingSubCategories] = useState(false);
  const [brands, setBrands] = useState([]);
  const [cities, setCities] = useState([]);

  // Stats for publish step
  const [workersMapped, setWorkersMapped] = useState(null);
  const [loadingWorkersCount, setLoadingWorkersCount] = useState(false);

  // Step 1: Category search & inline create modal
  const [categorySearch, setCategorySearch] = useState("");
  const [showCreateCategoryModal, setShowCreateCategoryModal] = useState(false);
  const [newCatTitle, setNewCatTitle] = useState("");
  const [newCatSlug, setNewCatSlug] = useState("");
  const [newCatSlugManual, setNewCatSlugManual] = useState(false);
  const [newCatSlugStatus, setNewCatSlugStatus] = useState(null); // { available: true/false, message: '' }
  const [checkingCatSlug, setCheckingCatSlug] = useState(false);
  const [newCatIconUrl, setNewCatIconUrl] = useState("");
  const [newCatHeroBanner, setNewCatHeroBanner] = useState({ tag: "", title: "", startingPrice: "", imageUrl: "" });
  const [newCatDisplayRating, setNewCatDisplayRating] = useState("4.8");
  const [newCatBookingsLabel, setNewCatBookingsLabel] = useState("10k+ bookings");
  const [newCatEtaMinutes, setNewCatEtaMinutes] = useState(30);
  const [newCatCityIds, setNewCatCityIds] = useState([]);
  const [newCatStatus, setNewCatStatus] = useState("active");
  const [newCatHasBrands, setNewCatHasBrands] = useState(false);
  const [savingNewCategory, setSavingNewCategory] = useState(false);
  const [uploadingCatIcon, setUploadingCatIcon] = useState(false);
  const [uploadingCatHero, setUploadingCatHero] = useState(false);

  // Step 2: Sub-category inline create modal
  const [showCreateSubCategoryModal, setShowCreateSubCategoryModal] = useState(false);
  const [newSubTitle, setNewSubTitle] = useState("");
  const [newSubSlug, setNewSubSlug] = useState("");
  const [newSubSlugManual, setNewSubSlugManual] = useState(false);
  const [newSubSlugStatus, setNewSubSlugStatus] = useState(null);
  const [checkingSubSlug, setCheckingSubSlug] = useState(false);
  const [newSubIconUrl, setNewSubIconUrl] = useState("");
  const [newSubBadge, setNewSubBadge] = useState("");
  const [newSubOrder, setNewSubOrder] = useState(0);
  const [newSubStatus, setNewSubStatus] = useState("active");
  const [savingNewSubCategory, setSavingNewSubCategory] = useState(false);
  const [uploadingSubIcon, setUploadingSubIcon] = useState(false);

  // Step 3: Brand or Section search & inline create modals
  const [brandSearch, setBrandSearch] = useState("");
  const [showCreateBrandModal, setShowCreateBrandModal] = useState(false);
  const [newBrandTitle, setNewBrandTitle] = useState("");
  const [newBrandLogo, setNewBrandLogo] = useState("");
  const [newBrandBadge, setNewBrandBadge] = useState("");
  const [newBrandStatus, setNewBrandStatus] = useState("active");
  const [savingNewBrand, setSavingNewBrand] = useState(false);
  const [uploadingBrandLogo, setUploadingBrandLogo] = useState(false);

  const [showCreateSectionModal, setShowCreateSectionModal] = useState(false);
  const [newSectionTitle, setNewSectionTitle] = useState("");
  const [newSectionDisplayOrder, setNewSectionDisplayOrder] = useState(0);
  const [newSectionBannerPromo, setNewSectionBannerPromo] = useState({
    title: "",
    subtitle: "",
    originalPrice: "",
    imageUrl: ""
  });
  const [savingNewSection, setSavingNewSection] = useState(false);
  const [uploadingSectionImage, setUploadingSectionImage] = useState(false);

  // Step 4: Detail tag inputs
  const [newInclusionText, setNewInclusionText] = useState("");
  const [newExclusionText, setNewExclusionText] = useState("");
  const [newFaqQuestion, setNewFaqQuestion] = useState("");
  const [newFaqAnswer, setNewFaqAnswer] = useState("");
  const [uploadingServiceImages, setUploadingServiceImages] = useState(false);
  const serviceImageInputRef = useRef(null);

  // ─── INITIALIZE METADATA & FORM ──────────────────────────────────────────
  useEffect(() => {
    const initData = async () => {
      try {
        const [catRes, brandRes, cityRes, cfgRes] = await Promise.all([
          categoryService.getAll({ parentId: null }),
          brandService.getAll({}),
          cityService.getAll(),
          configService.getSettings()
        ]);

        if (catRes?.success) setCategories(catRes.categories || []);
        if (brandRes?.success) setBrands(brandRes.brands || []);
        if (cityRes?.success) setCities((cityRes.cities || []).filter((c) => c.isActive !== false));

        const defaultGst =
          cfgRes?.settings?.bookingConfig?.serviceGstPercentage ??
          cfgRes?.settings?.serviceGstPercentage ??
          18;

        if (!service) {
          setFormData((prev) => ({ ...prev, gstPercentage: defaultGst }));
        }
      } catch (err) {
        console.error("Error initializing wizard data:", err);
      }
    };

    if (isOpen) {
      initData();
    }
  }, [isOpen, service]);

  // Sync prop changes
  useEffect(() => {
    if (propCategories.length > 0) setCategories(propCategories.filter((c) => !c.parentId));
    if (propBrands.length > 0) setBrands(propBrands);
    if (propCities.length > 0) setCities(propCities.filter((c) => c.isActive !== false));
  }, [propCategories, propBrands, propCities]);

  // Prepopulate form when editing or opening fresh
  useEffect(() => {
    if (!isOpen) return;

    if (service) {
      // Find category
      const directCatId =
        typeof service.categoryId === "object"
          ? service.categoryId?._id || service.categoryId?.id
          : service.categoryId;

      // Find brand
      const directBrandId =
        typeof service.brandId === "object"
          ? service.brandId?._id || service.brandId?.id
          : service.brandId;

      const imgs = Array.isArray(service.images) && service.images.length > 0
        ? [...service.images]
        : service.iconUrl ? [service.iconUrl] : [];

      const prefilled = {
        categoryId: directCatId || "",
        categoryObj: null,
        subCategoryId: null,
        subCategoryObj: null,
        brandId: directBrandId || "",
        brandObj: null,
        selectedBrandIds: directBrandId ? [directBrandId] : [],
        isSectionSkipped: false,

        title: service.title || "",
        description: service.description || "",
        images: imgs,
        iconUrl: imgs[0] || service.iconUrl || "",
        pricingType: service.pricingType || "fixed",
        basePrice: service.basePrice !== undefined && service.basePrice !== null ? String(service.basePrice) : "",
        originalPrice: service.originalPrice !== undefined && service.originalPrice !== null ? String(service.originalPrice) : "",
        discountLabel: service.discountLabel || "",
        hourlyRate: service.hourlyRate !== undefined && service.hourlyRate !== null ? String(service.hourlyRate) : "",
        minHours: service.minHours || 1,
        maxHours: service.maxHours || 8,
        inspectionFee: service.inspectionFee !== undefined && service.inspectionFee !== null ? String(service.inspectionFee) : "",
        quoteContactNote: service.quoteContactNote || "",
        gstPercentage: service.gstPercentage !== undefined ? service.gstPercentage : 18,
        durationMinutes: service.durationMinutes !== undefined && service.durationMinutes !== null ? String(service.durationMinutes) : "",
        inclusions: Array.isArray(service.inclusions) ? [...service.inclusions] : [],
        exclusions: Array.isArray(service.exclusions) ? [...service.exclusions] : [],
        faqs: Array.isArray(service.faqs) ? JSON.parse(JSON.stringify(service.faqs)) : [],
        warranty: service.warranty || "",
        cancellationPolicy: service.cancellationPolicy || "",
        isPackage: Boolean(service.isPackage),
        displayRating: service.displayRating || "",
        reviewsLabel: service.reviewsLabel || "1.2k reviews",
        cityIds: Array.isArray(service.cityIds) ? service.cityIds.map((c) => typeof c === "object" ? c._id || c.id : c) : [],
        status: service.status || "active",
        publishStatus: service.publishStatus || "published",
        variants: Array.isArray(service.variants)
          ? service.variants.map((v) => ({
              _id: v._id,
              title: v.title || "",
              price: v.price !== undefined ? String(v.price) : "",
              originalPrice: v.originalPrice !== undefined && v.originalPrice !== null ? String(v.originalPrice) : "",
              durationMinutes: v.durationMinutes !== undefined && v.durationMinutes !== null ? String(v.durationMinutes) : "",
              pricingType: v.pricingType || "fixed",
              inclusions: Array.isArray(v.inclusions) ? [...v.inclusions] : [],
              imageUrl: v.imageUrl || "",
              isActive: v.isActive !== false
            }))
          : []
      };

      setFormData(prefilled);
      setInitialSnapshot(JSON.stringify(prefilled));
      setIsDirty(false);
      setCurrentStep(1);

      // Check if service already has workers mapped count
      if (service.workersMapped !== undefined) {
        setWorkersMapped(service.workersMapped);
      }
    } else {
      const fresh = presetCategoryId
        ? { ...INITIAL_SERVICE_STATE, categoryId: presetCategoryId, subCategoryId: presetSubCategoryId || null }
        : INITIAL_SERVICE_STATE;
      setFormData(fresh);
      setInitialSnapshot(JSON.stringify(fresh));
      setIsDirty(false);
      // Started from a category (or sub-category) row: that answer is already known, so open at the first step
      // that still needs one instead of asking for it again. The path stays visible, with "Change".
      setCurrentStep(presetSubCategoryId ? 3 : presetCategoryId ? 2 : 1);
      setWorkersMapped(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, service]);

  // Load sub-categories whenever selected category changes
  useEffect(() => {
    if (!formData.categoryId) {
      setSubCategories([]);
      return;
    }

    const loadSubs = async () => {
      try {
        setLoadingSubCategories(true);
        const res = await categoryService.getChildren(formData.categoryId);
        if (res?.success) {
          setSubCategories(res.categories || []);
        } else {
          setSubCategories([]);
        }
      } catch (err) {
        console.error("Failed to fetch sub-categories:", err);
        setSubCategories([]);
      } finally {
        setLoadingSubCategories(false);
      }
    };

    loadSubs();
  }, [formData.categoryId]);

  // Active Category & Brand Objects
  const activeCategory = useMemo(() => {
    if (!formData.categoryId) return null;
    return categories.find((c) => String(c.id || c._id) === String(formData.categoryId)) || null;
  }, [categories, formData.categoryId]);

  const hasBrands = activeCategory?.hasBrands === true;

  // Filtered brands / sections for current category
  const categoryBrands = useMemo(() => {
    if (!formData.categoryId) return [];
    const catIdStr = String(formData.categoryId);
    return brands.filter((b) => {
      const direct = String(typeof b.categoryId === "object" ? b.categoryId?._id || b.categoryId?.id : b.categoryId);
      if (direct === catIdStr) return true;
      if (Array.isArray(b.categoryIds)) {
        return b.categoryIds.some((cid) => String(typeof cid === "object" ? cid?._id || cid?.id : cid) === catIdStr);
      }
      return false;
    });
  }, [brands, formData.categoryId]);

  // Helper to update form fields & compute dirty state
  const updateField = (field, val) => {
    setFormData((prev) => {
      const next = { ...prev, [field]: val };

      // Auto calculate discount percentage when basePrice and originalPrice change
      if (field === "basePrice" || field === "originalPrice") {
        const bp = Number(field === "basePrice" ? val : next.basePrice);
        const op = Number(field === "originalPrice" ? val : next.originalPrice);
        if (op > bp && bp > 0) {
          const pct = Math.round(((op - bp) / op) * 100);
          next.discountLabel = `${pct}% OFF`;
        } else if (!next.discountLabelEdited) {
          next.discountLabel = "";
        }
      }

      setIsDirty(JSON.stringify(next) !== initialSnapshot);
      return next;
    });
  };

  // Safe close handler
  const handleAttemptClose = () => {
    if (isDirty) {
      setShowDiscardConfirm(true);
    } else {
      onClose();
    }
  };

  // ─── DEBOUNCED SLUG AVAILABILITY CHECKS ──────────────────────────────────
  useEffect(() => {
    if (!newCatTitle.trim()) {
      setNewCatSlug("");
      setNewCatSlugStatus(null);
      return;
    }

    if (!newCatSlugManual) {
      setNewCatSlug(slugify(newCatTitle));
    }
  }, [newCatTitle, newCatSlugManual]);

  useEffect(() => {
    if (!newCatSlug.trim() || !showCreateCategoryModal) {
      setNewCatSlugStatus(null);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setCheckingCatSlug(true);
        const res = await categoryService.checkSlugAvailable({ slug: newCatSlug });
        if (res?.success) {
          setNewCatSlugStatus({
            available: res.available,
            message: res.message || (res.available ? "Slug is available" : "Slug already in use")
          });
        }
      } catch (err) {
        setNewCatSlugStatus({ available: false, message: "Error checking slug" });
      } finally {
        setCheckingCatSlug(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [newCatSlug, showCreateCategoryModal]);

  // Sub-category slug namespacing & check
  useEffect(() => {
    if (!newSubTitle.trim() || !activeCategory) {
      setNewSubSlug("");
      setNewSubSlugStatus(null);
      return;
    }

    if (!newSubSlugManual) {
      setNewSubSlug(`${activeCategory.slug}-${slugify(newSubTitle)}`);
    }
  }, [newSubTitle, newSubSlugManual, activeCategory]);

  useEffect(() => {
    if (!newSubSlug.trim() || !showCreateSubCategoryModal || !formData.categoryId) {
      setNewSubSlugStatus(null);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setCheckingSubSlug(true);
        const res = await categoryService.checkSlugAvailable({
          slug: newSubSlug,
          parentId: formData.categoryId
        });
        if (res?.success) {
          setNewSubSlugStatus({
            available: res.available,
            message: res.message || (res.available ? "Slug is available" : "Slug already in use")
          });
        }
      } catch (err) {
        setNewSubSlugStatus({ available: false, message: "Error checking sub-category slug" });
      } finally {
        setCheckingSubSlug(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [newSubSlug, showCreateSubCategoryModal, formData.categoryId]);

  // ─── INLINE CATEGORY CREATION ─────────────────────────────────────────────
  const handleSaveNewCategory = async (e) => {
    e.preventDefault();
    if (!newCatTitle.trim()) {
      toast.error("Category title is required");
      return;
    }

    try {
      setSavingNewCategory(true);
      const payload = {
        title: newCatTitle.trim(),
        slug: newCatSlug.trim() || slugify(newCatTitle),
        imageUrl: newCatIconUrl || null,
        homeIconUrl: newCatIconUrl || null,
        displayRating: newCatDisplayRating,
        bookingsLabel: newCatBookingsLabel,
        etaDefaultMinutes: newCatEtaMinutes ? Number(newCatEtaMinutes) : null,
        cityIds: newCatCityIds && newCatCityIds.length > 0 ? newCatCityIds : (selectedCity ? [selectedCity] : []),
        status: newCatStatus,
        hasBrands: Boolean(newCatHasBrands),
        heroBanner: {
          tag: newCatHeroBanner.tag || "",
          title: newCatHeroBanner.title || "",
          startingPrice: newCatHeroBanner.startingPrice || "",
          imageUrl: newCatHeroBanner.imageUrl || ""
        }
      };

      const res = await categoryService.create(payload);
      if (res?.success && res.category) {
        toast.success(`Category "${newCatTitle}" created!`);
        publicCatalogService.invalidateCache();

        // Notify other components (CategoriesPage, CategoriesListView) about the new category
        window.dispatchEvent(new CustomEvent('categoryCreated', { detail: res.category }));
        window.dispatchEvent(new Event('adminUserAppCatalogUpdated'));

        // Refresh categories
        const catListRes = await categoryService.getAll({ parentId: null });
        const refreshedList = catListRes?.categories || [];
        setCategories(refreshedList);

        // Immediately select the newly created category
        const newCatId = res.category.id || res.category._id;
        updateField("categoryId", newCatId);
        updateField("categoryObj", res.category);

        // Reset inline modal state
        setShowCreateCategoryModal(false);
        setNewCatTitle("");
        setNewCatSlug("");
        setNewCatIconUrl("");
        setNewCatHeroBanner({ tag: "", title: "", startingPrice: "", imageUrl: "" });
        setNewCatHasBrands(false);
      } else {
        toast.error(res?.message || "Failed to create category");
      }
    } catch (err) {
      console.error("Create category error:", err);
      toast.error(err?.response?.data?.message || "Failed to create category");
    } finally {
      setSavingNewCategory(false);
    }
  };

  // ─── INLINE SUB-CATEGORY CREATION ─────────────────────────────────────────
  const handleSaveNewSubCategory = async (e) => {
    e.preventDefault();
    if (!newSubTitle.trim()) {
      toast.error("Sub-category title is required");
      return;
    }

    try {
      setSavingNewSubCategory(true);
      const payload = {
        title: newSubTitle.trim(),
        slug: newSubSlug.trim() || `${activeCategory?.slug || "sub"}-${slugify(newSubTitle)}`,
        parentId: formData.categoryId,
        imageUrl: newSubIconUrl || null,
        homeIconUrl: newSubIconUrl || null,
        subCategoryBadge: newSubBadge.trim(),
        homeOrder: Number(newSubOrder) || 0,
        status: newSubStatus
      };

      const res = await categoryService.create(payload);
      if (res?.success && res.category) {
        toast.success(`Sub-category "${newSubTitle}" created!`);
        publicCatalogService.invalidateCache();

        // Notify other components about the new sub-category
        window.dispatchEvent(new CustomEvent('categoryCreated', { detail: res.category }));
        window.dispatchEvent(new Event('adminUserAppCatalogUpdated'));

        // Refresh sub-categories list
        const subsRes = await categoryService.getChildren(formData.categoryId);
        setSubCategories(subsRes?.categories || []);

        // Immediately select this sub-category
        const newSubId = res.category.id || res.category._id;
        updateField("subCategoryId", newSubId);
        updateField("subCategoryObj", res.category);

        setShowCreateSubCategoryModal(false);
        setNewSubTitle("");
        setNewSubSlug("");
        setNewSubBadge("");
        setNewSubIconUrl("");
      } else {
        toast.error(res?.message || "Failed to create sub-category");
      }
    } catch (err) {
      console.error("Create sub-category error:", err);
      toast.error(err?.response?.data?.message || "Failed to create sub-category");
    } finally {
      setSavingNewSubCategory(false);
    }
  };

  // ─── INLINE BRAND CREATION (Appliance mode) ────────────────────────────────
  const handleSaveNewBrand = async (e) => {
    e.preventDefault();
    if (!newBrandTitle.trim()) {
      toast.error("Brand title is required");
      return;
    }

    try {
      setSavingNewBrand(true);
      const payload = {
        title: newBrandTitle.trim(),
        slug: slugify(newBrandTitle),
        iconUrl: newBrandLogo || null,
        badge: newBrandBadge.trim() || null,
        categoryIds: [formData.categoryId],
        status: newBrandStatus
      };

      const res = await brandService.create(payload);
      if (res?.success && res.brand) {
        toast.success(`Brand "${newBrandTitle}" created!`);
        publicCatalogService.invalidateCache();

        // Refresh brands
        const brandListRes = await brandService.getAll({});
        setBrands(brandListRes?.brands || []);

        const newBrandId = res.brand.id || res.brand._id;
        updateField("brandId", newBrandId);
        updateField("brandObj", res.brand);
        updateField("isSectionSkipped", false);

        setShowCreateBrandModal(false);
        setNewBrandTitle("");
        setNewBrandLogo("");
        setNewBrandBadge("");
      } else {
        toast.error(res?.message || "Failed to create brand");
      }
    } catch (err) {
      console.error("Create brand error:", err);
      toast.error(err?.response?.data?.message || "Failed to create brand");
    } finally {
      setSavingNewBrand(false);
    }
  };

  // ─── INLINE SECTION CREATION (Non-appliance mode) ──────────────────────────
  const handleSaveNewSection = async (e) => {
    e.preventDefault();
    if (!newSectionTitle.trim()) {
      toast.error("Section title is required");
      return;
    }

    try {
      setSavingNewSection(true);
      const payload = {
        title: newSectionTitle.trim(),
        slug: `${activeCategory?.slug || "sec"}-${slugify(newSectionTitle)}`,
        categoryIds: [formData.categoryId],
        displayOrder: Number(newSectionDisplayOrder) || 0,
        bannerPromo: {
          title: newSectionBannerPromo.title || "",
          subtitle: newSectionBannerPromo.subtitle || "",
          originalPrice: newSectionBannerPromo.originalPrice ? Number(newSectionBannerPromo.originalPrice) : null,
          imageUrl: newSectionBannerPromo.imageUrl || ""
        },
        status: "active"
      };

      const res = await brandService.create(payload);
      if (res?.success && res.brand) {
        toast.success(`Section "${newSectionTitle}" created!`);
        publicCatalogService.invalidateCache();

        // Refresh brands
        const brandListRes = await brandService.getAll({});
        setBrands(brandListRes?.brands || []);

        const newSecId = res.brand.id || res.brand._id;
        updateField("brandId", newSecId);
        updateField("brandObj", res.brand);
        updateField("isSectionSkipped", false);

        setShowCreateSectionModal(false);
        setNewSectionTitle("");
        setNewSectionDisplayOrder(0);
        setNewSectionBannerPromo({ title: "", subtitle: "", originalPrice: "", imageUrl: "" });
      } else {
        toast.error(res?.message || "Failed to create section");
      }
    } catch (err) {
      console.error("Create section error:", err);
      toast.error(err?.response?.data?.message || "Failed to create section");
    } finally {
      setSavingNewSection(false);
    }
  };

  // ─── MEDIA MULTI-UPLOAD (Step 4) ──────────────────────────────────────────
  const handleServiceImagesUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    try {
      setUploadingServiceImages(true);
      const uploadedUrls = [];

      for (const file of files) {
        const res = await serviceService.uploadImage(file, "services");
        if (res?.success && res.imageUrl) {
          uploadedUrls.push(res.imageUrl);
        }
      }

      if (uploadedUrls.length > 0) {
        setFormData((prev) => {
          const nextImages = [...prev.images, ...uploadedUrls];
          const next = {
            ...prev,
            images: nextImages,
            iconUrl: nextImages[0] || prev.iconUrl
          };
          setIsDirty(JSON.stringify(next) !== initialSnapshot);
          return next;
        });
        toast.success(`Uploaded ${uploadedUrls.length} image(s)!`);
      }
    } catch (err) {
      console.error("Images upload error:", err);
      toast.error("Failed to upload service image(s)");
    } finally {
      setUploadingServiceImages(false);
      if (serviceImageInputRef.current) serviceImageInputRef.current.value = "";
    }
  };

  const handleMakeImagePrimary = (index) => {
    if (index === 0) return;
    setFormData((prev) => {
      const nextImages = [...prev.images];
      const [chosen] = nextImages.splice(index, 1);
      nextImages.unshift(chosen);
      const next = {
        ...prev,
        images: nextImages,
        iconUrl: nextImages[0]
      };
      setIsDirty(JSON.stringify(next) !== initialSnapshot);
      return next;
    });
  };

  const handleRemoveImage = (index) => {
    setFormData((prev) => {
      const nextImages = prev.images.filter((_, i) => i !== index);
      const next = {
        ...prev,
        images: nextImages,
        iconUrl: nextImages[0] || ""
      };
      setIsDirty(JSON.stringify(next) !== initialSnapshot);
      return next;
    });
  };

  const handleMoveImage = (index, direction) => {
    const target = direction === "left" ? index - 1 : index + 1;
    if (target < 0 || target >= formData.images.length) return;
    setFormData((prev) => {
      const nextImages = [...prev.images];
      const temp = nextImages[index];
      nextImages[index] = nextImages[target];
      nextImages[target] = temp;
      const next = {
        ...prev,
        images: nextImages,
        iconUrl: nextImages[0] || ""
      };
      setIsDirty(JSON.stringify(next) !== initialSnapshot);
      return next;
    });
  };

  // ─── INCLUSIONS / EXCLUSIONS / FAQS (Step 4) ──────────────────────────────
  const handleAddInclusion = () => {
    if (!newInclusionText.trim()) return;
    updateField("inclusions", [...formData.inclusions, newInclusionText.trim()]);
    setNewInclusionText("");
  };

  const handleRemoveInclusion = (idx) => {
    updateField("inclusions", formData.inclusions.filter((_, i) => i !== idx));
  };

  const handleAddExclusion = () => {
    if (!newExclusionText.trim()) return;
    updateField("exclusions", [...formData.exclusions, newExclusionText.trim()]);
    setNewExclusionText("");
  };

  const handleRemoveExclusion = (idx) => {
    updateField("exclusions", formData.exclusions.filter((_, i) => i !== idx));
  };

  const handleAddFaq = () => {
    if (!newFaqQuestion.trim() || !newFaqAnswer.trim()) {
      toast.error("Both FAQ question and answer are required");
      return;
    }
    updateField("faqs", [...formData.faqs, { question: newFaqQuestion.trim(), answer: newFaqAnswer.trim() }]);
    setNewFaqQuestion("");
    setNewFaqAnswer("");
  };

  const handleRemoveFaq = (idx) => {
    updateField("faqs", formData.faqs.filter((_, i) => i !== idx));
  };

  // ─── VARIANTS MANAGEMENT (Step 5) ─────────────────────────────────────────
  const handleAddVariant = () => {
    const newVariant = {
      title: "",
      price: "",
      originalPrice: "",
      durationMinutes: "",
      pricingType: formData.pricingType || "fixed",
      inclusions: [],
      imageUrl: "",
      isActive: true
    };
    updateField("variants", [...formData.variants, newVariant]);
  };

  const handleUpdateVariant = (index, field, val) => {
    const updated = [...formData.variants];
    updated[index] = { ...updated[index], [field]: val };
    updateField("variants", updated);
  };

  const handleRemoveVariant = (index) => {
    updateField("variants", formData.variants.filter((_, i) => i !== index));
  };

  const handleMoveVariant = (index, direction) => {
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= formData.variants.length) return;
    const updated = [...formData.variants];
    const temp = updated[index];
    updated[index] = updated[target];
    updated[target] = temp;
    updateField("variants", updated);
  };

  // Lowest active variant calculation for "Starts at ₹X"
  const lowestActiveVariantPrice = useMemo(() => {
    const activeVars = formData.variants.filter((v) => v.isActive && Number(v.price) >= 0 && v.price !== "");
    if (activeVars.length === 0) return null;
    const prices = activeVars.map((v) => Number(v.price));
    return Math.min(...prices);
  }, [formData.variants]);

  // ─── PER-STEP VALIDATION ──────────────────────────────────────────────────
  const stepErrors = useMemo(() => {
    const errors = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };

    // Step 1: Category
    if (!formData.categoryId) {
      errors[1].push("Category is required");
    }

    // Step 2: Sub-category (optional, flat is permitted)

    // Step 3: Brand or Section
    if (hasBrands && (!formData.brandId && (!formData.selectedBrandIds || formData.selectedBrandIds.length === 0))) {
      errors[3].push("Please select at least one brand for this category");
    }

    // Step 4: Details
    if (!formData.title.trim()) {
      errors[4].push("Service title is required");
    }
    if (formData.pricingType !== "quote_required") {
      if (formData.basePrice === "" || isNaN(Number(formData.basePrice)) || Number(formData.basePrice) < 0) {
        errors[4].push("Valid base price is required (>= 0)");
      }
    }
    if (formData.gstPercentage === "" || isNaN(Number(formData.gstPercentage)) || Number(formData.gstPercentage) < 0) {
      errors[4].push("Valid GST percentage is required");
    }
    if (formData.originalPrice !== "" && Number(formData.originalPrice) < Number(formData.basePrice)) {
      // Warning only, server allows it
    }

    // Step 5: Variants validation (server parity)
    if (formData.variants.length > 0) {
      const seenTitles = new Set();
      let hasActive = false;
      formData.variants.forEach((v, idx) => {
        const t = String(v.title || "").trim().toLowerCase();
        if (!t) errors[5].push(`Variant #${idx + 1} is missing title`);
        if (seenTitles.has(t)) errors[5].push(`Duplicate variant title: "${v.title}"`);
        seenTitles.add(t);

        const p = Number(v.price);
        if (v.price === "" || isNaN(p) || p < 0) {
          errors[5].push(`Variant "${v.title || `#${idx + 1}`}" price must be >= 0`);
        }
        if (v.isActive) hasActive = true;
      });

      if (!hasActive) {
        errors[5].push("At least one variant must be active");
      }
    }

    return errors;
  }, [formData, hasBrands]);

  const isStepValid = (stepNum) => (stepErrors[stepNum] || []).length === 0;

  const totalErrorsCount = useMemo(() => {
    return Object.values(stepErrors).reduce((acc, errs) => acc + errs.length, 0);
  }, [stepErrors]);

  // Fetch workers mapped count in publish step
  useEffect(() => {
    if (currentStep === 6 && activeCategory?.title) {
      const fetchWorkers = async () => {
        try {
          setLoadingWorkersCount(true);
          const res = await serviceService.getWithStats({
            categoryId: formData.categoryId,
            limit: 100
          });
          if (res?.success && Array.isArray(res.services)) {
            // Check if current service is in the list
            const currentId = service?.id || service?._id;
            const matched = res.services.find((s) => String(s.id || s._id) === String(currentId));
            if (matched && matched.workersMapped !== undefined) {
              setWorkersMapped(matched.workersMapped);
            } else if (res.services.length > 0) {
              setWorkersMapped(res.services[0].workersMapped || 0);
            } else {
              setWorkersMapped(0);
            }
          }
        } catch (err) {
          console.error("Workers mapped fetch error:", err);
        } finally {
          setLoadingWorkersCount(false);
        }
      };

      fetchWorkers();
    }
  }, [currentStep, activeCategory, formData.categoryId, service]);

  // ─── FINAL SUBMISSION HANDLER (Step 6) ────────────────────────────────────
  const handleFinalSubmit = async (targetPublishStatus) => {
    // Run validation across all steps
    if (totalErrorsCount > 0) {
      toast.error("Please fix validation errors before saving");
      // Jump to first step with errors
      for (let s = 1; s <= 5; s++) {
        if (!isStepValid(s)) {
          setCurrentStep(s);
          break;
        }
      }
      return;
    }

    try {
      setIsSubmitting(true);

      // Resolve effective brandId:
      // If brandId is empty or section was skipped, ensure a default brand exists for this category
      let effectiveBrandId = formData.brandId;
      if (!effectiveBrandId) {
        // Find existing brand under this category
        if (categoryBrands.length > 0) {
          effectiveBrandId = categoryBrands[0].id || categoryBrands[0]._id;
        } else {
          // Auto-create a default general brand for this category
          const defaultBrandRes = await brandService.create({
            title: activeCategory?.title || "All Services",
            slug: `${activeCategory?.slug || "general"}-services`,
            categoryIds: [formData.categoryId],
            displayOrder: 0,
            status: "active"
          });
          if (defaultBrandRes?.success && defaultBrandRes.brand) {
            effectiveBrandId = defaultBrandRes.brand.id || defaultBrandRes.brand._id;
          } else {
            toast.error("Could not resolve section/brand for this service");
            setIsSubmitting(false);
            return;
          }
        }
      }

      // Effective categoryId: if subCategoryId is chosen, use it; otherwise top-level categoryId
      const effectiveCategoryId = formData.subCategoryId || formData.categoryId;

      // Effective cityIds: inherit from category if blank
      let effectiveCityIds = formData.cityIds;
      if (!effectiveCityIds || effectiveCityIds.length === 0) {
        effectiveCityIds = activeCategory?.cityIds || [];
      }

      const payload = {
        title: formData.title.trim(),
        description: formData.description.trim(),
        categoryId: effectiveCategoryId,
        brandId: effectiveBrandId,
        cityIds: effectiveCityIds,
        pricingType: formData.pricingType,
        basePrice: Number(formData.basePrice) || 0,
        originalPrice: formData.originalPrice !== "" ? Number(formData.originalPrice) : undefined,
        discountLabel: formData.discountLabel.trim(),
        hourlyRate: formData.pricingType === "hourly" ? Number(formData.hourlyRate || formData.basePrice) : undefined,
        minHours: formData.pricingType === "hourly" ? Number(formData.minHours) : undefined,
        maxHours: formData.pricingType === "hourly" ? Number(formData.maxHours) : undefined,
        inspectionFee: formData.pricingType === "inspection_fee" ? Number(formData.inspectionFee) : undefined,
        quoteContactNote: formData.pricingType === "quote_required" ? formData.quoteContactNote.trim() : undefined,
        gstPercentage: Number(formData.gstPercentage) || 0,
        durationMinutes: formData.durationMinutes !== "" ? Number(formData.durationMinutes) : undefined,
        inclusions: formData.inclusions,
        exclusions: formData.exclusions,
        faqs: formData.faqs,
        warranty: formData.warranty.trim(),
        cancellationPolicy: formData.cancellationPolicy.trim(),
        isPackage: Boolean(formData.isPackage),
        displayRating: formData.displayRating.trim(),
        reviewsLabel: formData.reviewsLabel.trim(),
        status: formData.status,
        publishStatus: targetPublishStatus,
        iconUrl: formData.images[0] || formData.iconUrl || "",
        images: formData.images,
        variants: formData.variants.map((v, i) => ({
          title: v.title.trim(),
          price: Number(v.price) || 0,
          originalPrice: v.originalPrice !== "" ? Number(v.originalPrice) : null,
          durationMinutes: v.durationMinutes !== "" ? Number(v.durationMinutes) : null,
          pricingType: v.pricingType || formData.pricingType,
          inclusions: v.inclusions || [],
          imageUrl: v.imageUrl || "",
          isActive: v.isActive !== false,
          order: i
        }))
      };

      let res;
      const targetId = service?.id || service?._id;
      if (targetId) {
        res = await serviceService.update(targetId, payload);
      } else {
        const brandIdsToCreate = (hasBrands && formData.selectedBrandIds && formData.selectedBrandIds.length > 1)
          ? formData.selectedBrandIds
          : [effectiveBrandId];

        if (brandIdsToCreate.length > 1) {
          const createPromises = brandIdsToCreate.map((bId) =>
            serviceService.create({ ...payload, brandId: bId })
          );
          const results = await Promise.all(createPromises);
          res = results[0] || { success: true };
          res.multiCount = brandIdsToCreate.length;
        } else {
          res = await serviceService.create(payload);
        }
      }

      if (res?.success) {
        const actionLabel = targetPublishStatus === "draft" ? "saved as draft" : "published";
        if (res.multiCount) {
          toast.success(`Service ${actionLabel} successfully across all ${res.multiCount} selected brands!`);
        } else {
          toast.success(`Service ${actionLabel} successfully!`);
        }
        publicCatalogService.invalidateCache();
        setIsDirty(false);
        onClose();
        if (onSaved) onSaved();
      } else {
        toast.error(res?.message || "Failed to save service");
      }
    } catch (err) {
      console.error("Save service error:", err);
      toast.error(err?.response?.data?.message || "Failed to save service");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs select-none">
      <ModalLock />
      <div id="service-wizard-modal" className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[92vh] max-h-[92vh] flex flex-col relative overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* ─── MODAL HEADER & STEPPER ──────────────────────────────────────── */}
        <div className="border-b border-gray-200 bg-gradient-to-r from-blue-50/70 via-indigo-50/40 to-white px-5 py-4 shrink-0">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-600 text-white uppercase tracking-wider">
                  {service ? "Edit Mode" : "New Service"}
                </span>
                <h2 className="text-lg font-bold text-gray-900 truncate">
                  {service ? service.title || "Edit Service" : "Add Service Wizard"}
                </h2>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                Step {currentStep} of 6 — {STEPS[currentStep - 1]?.label} ({STEPS[currentStep - 1]?.desc})
              </p>
            </div>

            <button
              type="button"
              onClick={handleAttemptClose}
              className="p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-white/80 border border-transparent hover:border-gray-200 transition-colors cursor-pointer"
              title="Close wizard"
            >
              <FiX className="w-5 h-5" />
            </button>
          </div>

          {/* Stepper Navigation Bar */}
          <div className="grid grid-cols-6 gap-1 sm:gap-2 pt-1">
            {STEPS.map((s) => {
              const Icon = s.icon;
              const isActive = currentStep === s.id;
              const isPast = currentStep > s.id;
              const hasErrors = (stepErrors[s.id] || []).length > 0;

              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setCurrentStep(s.id)}
                  className={`flex flex-col items-center justify-center p-2 rounded-xl transition-all cursor-pointer relative text-center ${
                    isActive
                      ? "bg-blue-600 text-white shadow-md shadow-blue-500/20 scale-[1.02]"
                      : isPast
                      ? "bg-white/80 hover:bg-blue-50 text-gray-700 border border-gray-200/80"
                      : "bg-gray-50/80 hover:bg-gray-100 text-gray-400 border border-gray-200/50"
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <Icon className={`w-3.5 h-3.5 ${isActive ? "text-white" : isPast ? "text-blue-600" : "text-gray-400"}`} />
                    <span className="text-xs font-bold hidden sm:inline">{s.label}</span>
                  </div>

                  {/* Badge Indicator */}
                  {hasErrors && (
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-rose-500 ring-2 ring-white" />
                  )}
                  {isPast && !hasErrors && (
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ─── STEP BODY (SCROLLABLE) ──────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 bg-slate-50/40">
          {/* ========================================================================= */}
          {/* STEP 1: CATEGORY SELECTION                                               */}
          {/* ========================================================================= */}
          {/* The path chosen so far, so later steps never feel like starting over */}
          {currentStep > 1 && formData.categoryId && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-blue-100 bg-blue-50/60 px-3.5 py-2 text-xs">
              <span className="text-blue-900">
                <span className="font-semibold text-blue-700">Adding to:</span>{" "}
                <span className="font-bold">{activeCategory?.title || "Category"}</span>
                {formData.subCategoryId && (
                  <>
                    {" "}<span className="text-blue-400">›</span>{" "}
                    <span className="font-bold">
                      {formData.subCategoryObj?.title
                        || subCategories.find((sc) => String(sc.id || sc._id) === String(formData.subCategoryId))?.title
                        || "Sub-category"}
                    </span>
                  </>
                )}
              </span>
              <button
                type="button"
                onClick={() => setCurrentStep(1)}
                className="font-bold text-blue-700 hover:underline"
              >
                Change
              </button>
            </div>
          )}

          {currentStep === 1 && (
            <div className="space-y-5 animate-in fade-in duration-200">
              {/* Step 1 Admin Guide */}
              <div className="p-3 bg-blue-50/70 rounded-xl border border-blue-200 text-[11px] text-blue-950 space-y-1">
                <div className="font-bold flex items-center gap-1.5 text-blue-900">
                  <FiInfo className="w-3.5 h-3.5 text-blue-600" />
                  Step 1: Category Selection Guide (Admin Help)
                </div>
                <p className="text-blue-900/80 leading-relaxed">
                  <strong>Yeh kis liye hai?</strong> Yeh service kis main category me aati hai (jaise <em>AC Repair</em>, <em>Salon Luxe</em>, <em>Home Deep Cleaning</em>).<br/>
                  <strong>Brands Mode vs Standard:</strong> Agar category me alag-alag companies hain (jaise <em>LG, Samsung, Whirlpool</em>), toh Category "Brands Mode" me hoti hai. Normal services ke liye "Standard" mode hota hai.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                    <FiLayers className="text-blue-600" /> Choose Category
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Select the top-level catalog category for this service, or create a brand-new one.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative">
                    <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-3.5 h-3.5" />
                    <input
                      type="text"
                      placeholder="Search categories..."
                      value={categorySearch}
                      onChange={(e) => setCategorySearch(e.target.value)}
                      className="pl-8 pr-3 py-1.5 text-xs bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-44 sm:w-56"
                    />
                  </div>

                  <button
                    id="wizard-create-category-btn"
                    type="button"
                    onClick={() => setShowCreateCategoryModal(true)}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer shrink-0"
                  >
                    <FiPlus className="w-3.5 h-3.5" />
                    + Create New Category
                  </button>
                </div>
              </div>

              {/* Categories Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {categories
                  .filter((cat) => cat.status !== "deleted" || String(formData.categoryId) === String(cat.id || cat._id))
                  .filter((cat) => {
                    if (!categorySearch.trim()) return true;
                    const q = categorySearch.toLowerCase();
                    return (cat.title || "").toLowerCase().includes(q) || (cat.slug || "").toLowerCase().includes(q);
                  })
                  .map((cat) => {
                    const catId = cat.id || cat._id;
                    const isSelected = String(formData.categoryId) === String(catId);

                    return (
                      <div
                        key={catId}
                        onClick={() => {
                          updateField("categoryId", catId);
                          updateField("categoryObj", cat);
                          // Clear sub-category if changing parent
                          if (String(formData.categoryId) !== String(catId)) {
                            updateField("subCategoryId", null);
                            updateField("subCategoryObj", null);
                            updateField("brandId", "");
                            updateField("brandObj", null);
                          }
                        }}
                        className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between relative group ${
                          isSelected
                            ? "bg-blue-50/80 border-blue-500 ring-2 ring-blue-500/20 shadow-sm"
                            : "bg-white hover:bg-gray-50 border-gray-200"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-11 h-11 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center shrink-0 overflow-hidden">
                            {cat.homeIconUrl || cat.imageUrl ? (
                              <img
                                src={toAssetUrl(cat.homeIconUrl || cat.imageUrl)}
                                alt={cat.title}
                                className="w-full h-full object-contain p-1"
                              />
                            ) : (
                              <FiLayers className="w-5 h-5 text-gray-400" />
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <h4 className="text-xs font-bold text-gray-900 truncate">{cat.title}</h4>
                            <p className="text-[11px] text-gray-400 font-mono mt-0.5 truncate">{cat.slug}</p>
                            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                              <span
                                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                                  cat.hasBrands
                                    ? "bg-purple-100 text-purple-700"
                                    : "bg-emerald-100 text-emerald-700"
                                }`}
                              >
                                {cat.hasBrands ? "Brands Mode" : "Standard"}
                              </span>
                              <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                                {cat.status}
                              </span>
                            </div>
                          </div>
                        </div>

                        {isSelected && (
                          <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-xs">
                            <FiCheck className="w-3.5 h-3.5 stroke-[3]" />
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>

              {stepErrors[1]?.length > 0 && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                  <FiAlertCircle className="w-4 h-4 shrink-0" />
                  <span>Please select a category to proceed.</span>
                </div>
              )}
            </div>
          )}

          {/* ========================================================================= */}
          {/* STEP 2: SUB-CATEGORY SELECTION                                           */}
          {/* ========================================================================= */}
          {currentStep === 2 && (
            <div className="space-y-5 animate-in fade-in duration-200">
              <div className="p-3 bg-blue-50/60 rounded-xl border border-blue-200/80 flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-gray-500 font-medium">Selected Category:</span>
                  <span className="font-bold text-blue-900">{activeCategory?.title || "None selected"}</span>
                  <span className="text-gray-400">({activeCategory?.slug})</span>
                </div>
                <button
                  type="button"
                  onClick={() => setCurrentStep(1)}
                  className="text-xs font-semibold text-blue-600 hover:underline cursor-pointer"
                >
                  Change
                </button>
              </div>

              {/* Step 2 Admin Guide */}
              <div className="p-3 bg-blue-50/70 rounded-xl border border-blue-200 text-[11px] text-blue-950 space-y-1">
                <div className="font-bold flex items-center gap-1.5 text-blue-900">
                  <FiInfo className="w-3.5 h-3.5 text-blue-600" />
                  Step 2: Sub-category Guide (Admin Help)
                </div>
                <p className="text-blue-900/80 leading-relaxed">
                  <strong>Yeh kis liye hai?</strong> Category ke andar services ko alag tabs/pills me group karne ke liye (jaise <em>Waxing, Facial, Pedicure</em>).<br/>
                  Agar category simple hai aur sub-categories ki zaroorat nahi hai, toh <strong>"No sub-category"</strong> select karein.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                    <FiCornerDownRight className="text-blue-600" /> Choose Sub-category
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Choose an existing sub-category, or select "No sub-category" to attach directly to {activeCategory?.title}.
                  </p>
                </div>

                <button
                  id="wizard-add-subcategory-btn"
                  type="button"
                  onClick={() => setShowCreateSubCategoryModal(true)}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer shrink-0"
                >
                  <FiPlus className="w-3.5 h-3.5" />
                  + Add New Sub-category
                </button>
              </div>

              {/* Sub-categories Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {/* Option 1: No sub-category (Flat) */}
                <div
                  onClick={() => {
                    updateField("subCategoryId", null);
                    updateField("subCategoryObj", null);
                  }}
                  className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between relative ${
                    formData.subCategoryId === null
                      ? "bg-blue-50/80 border-blue-500 ring-2 ring-blue-500/20 shadow-sm"
                      : "bg-white hover:bg-gray-50 border-gray-200"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center shrink-0">
                      <FiCheckCircle className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-gray-900">No sub-category</h4>
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        Direct service under {activeCategory?.title}. Leaves parentId as top-level categoryId.
                      </p>
                    </div>
                  </div>

                  {formData.subCategoryId === null && (
                    <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-xs">
                      <FiCheck className="w-3.5 h-3.5 stroke-[3]" />
                    </div>
                  )}
                </div>

                {/* Existing Sub-categories */}
                {loadingSubCategories ? (
                  <div className="p-4 rounded-xl border border-gray-200 bg-white flex items-center justify-center text-xs text-gray-400">
                    Loading sub-categories...
                  </div>
                ) : (
                  subCategories.map((sub) => {
                    const subId = sub.id || sub._id;
                    const isSelected = String(formData.subCategoryId) === String(subId);

                    return (
                      <div
                        key={subId}
                        onClick={() => {
                          updateField("subCategoryId", subId);
                          updateField("subCategoryObj", sub);
                        }}
                        className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between relative ${
                          isSelected
                            ? "bg-blue-50/80 border-blue-500 ring-2 ring-blue-500/20 shadow-sm"
                            : "bg-white hover:bg-gray-50 border-gray-200"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center shrink-0 overflow-hidden">
                            {sub.homeIconUrl || sub.imageUrl ? (
                              <img
                                src={toAssetUrl(sub.homeIconUrl || sub.imageUrl)}
                                alt={sub.title}
                                className="w-full h-full object-contain p-1"
                              />
                            ) : (
                              <FiCornerDownRight className="w-5 h-5 text-gray-400" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <h4 className="text-xs font-bold text-gray-900 truncate">{sub.title}</h4>
                            <p className="text-[11px] text-gray-400 font-mono mt-0.5 truncate">{sub.slug}</p>
                            {sub.subCategoryBadge && (
                              <span className="inline-block mt-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                                {sub.subCategoryBadge}
                              </span>
                            )}
                          </div>
                        </div>

                        {isSelected && (
                          <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-xs">
                            <FiCheck className="w-3.5 h-3.5 stroke-[3]" />
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* STEP 3: BRAND OR SECTION                                                  */}
          {/* ========================================================================= */}
          {currentStep === 3 && (
            <div className="space-y-5 animate-in fade-in duration-200">
              {hasBrands ? (
                /* APPLIANCE MODE: Select or Create Brand */
                <div className="space-y-4">
                  <div className="p-3 bg-purple-50/70 rounded-xl border border-purple-200 flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-purple-900">Appliance Brand Flow</h4>
                      <p className="text-[11px] text-purple-700 mt-0.5">
                        This category uses brands (e.g. LG, Samsung, Whirlpool). Services are organised under specific brands.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setShowCreateBrandModal(true)}
                      className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
                    >
                      <FiPlus className="w-3.5 h-3.5" />
                      + Add New Brand
                    </button>
                  </div>

                  {/* Multi-Brand Selection Controls */}
                  <div className="flex items-center justify-between gap-3 px-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-gray-700">
                        Select Brands:
                      </span>
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
                        {(formData.selectedBrandIds?.length || (formData.brandId ? 1 : 0))} / {categoryBrands.length} Selected
                      </span>
                      {(formData.selectedBrandIds?.length > 1) && (
                        <span className="text-[11px] text-emerald-600 font-medium hidden sm:inline">
                          ✓ Service will be created for all selected brands
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const allIds = categoryBrands.map(b => b.id || b._id);
                          updateField("selectedBrandIds", allIds);
                          if (allIds[0]) updateField("brandId", allIds[0]);
                          updateField("isSectionSkipped", false);
                        }}
                        className="px-2.5 py-1 text-xs font-bold text-purple-700 hover:bg-purple-100 rounded-lg transition-colors cursor-pointer border border-purple-200 bg-purple-50"
                      >
                        ✓ Select All Brands
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          updateField("selectedBrandIds", []);
                          updateField("brandId", "");
                        }}
                        className="px-2.5 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                      >
                        Clear
                      </button>
                    </div>
                  </div>

                  {/* Brand Cards Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {categoryBrands.map((b) => {
                      const bId = b.id || b._id;
                      const selectedList = formData.selectedBrandIds && formData.selectedBrandIds.length > 0
                        ? formData.selectedBrandIds
                        : (formData.brandId ? [formData.brandId] : []);
                      const isSelected = selectedList.map(String).includes(String(bId));

                      return (
                        <div
                          key={bId}
                          onClick={() => {
                            let nextSelected;
                            if (isSelected) {
                              nextSelected = selectedList.filter(id => String(id) !== String(bId));
                            } else {
                              nextSelected = [...selectedList, bId];
                            }
                            updateField("selectedBrandIds", nextSelected);
                            updateField("brandId", nextSelected[0] || "");
                            updateField("brandObj", b);
                            updateField("isSectionSkipped", false);
                          }}
                          className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between relative ${
                            isSelected
                              ? "bg-purple-50/80 border-purple-500 ring-2 ring-purple-500/20 shadow-sm"
                              : "bg-white hover:bg-gray-50 border-gray-200"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center shrink-0 overflow-hidden">
                              {b.iconUrl ? (
                                <img
                                  src={toAssetUrl(b.iconUrl)}
                                  alt={b.title}
                                  className="w-full h-full object-contain p-1"
                                />
                              ) : (
                                <FiTag className="w-5 h-5 text-gray-400" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <h4 className="text-xs font-bold text-gray-900 truncate">{b.title}</h4>
                              <p className="text-[10px] text-gray-400 mt-0.5 truncate">{b.slug}</p>
                            </div>
                          </div>

                          {isSelected && (
                            <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-purple-600 text-white flex items-center justify-center shadow-xs">
                              <FiCheck className="w-3.5 h-3.5 stroke-[3]" />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {stepErrors[3]?.length > 0 && (
                    <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                      <FiAlertCircle className="w-4 h-4 shrink-0" />
                      <span>{stepErrors[3][0]}</span>
                    </div>
                  )}
                </div>
              ) : (
                /* STANDARD MODE: Optional Section or Skip */
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                        <FiTag className="text-blue-600" /> Section Grouping (Optional)
                      </h3>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Group services into display sections with promotional banners, or skip to place services directly in the catalog.
                      </p>
                    </div>

                    <button
                      id="wizard-add-section-btn"
                      type="button"
                      onClick={() => setShowCreateSectionModal(true)}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
                    >
                      <FiPlus className="w-3.5 h-3.5" />
                      + Add New Section
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {/* Skip Section Option */}
                    <div
                      onClick={() => {
                        updateField("brandId", "");
                        updateField("brandObj", null);
                        updateField("isSectionSkipped", true);
                      }}
                      className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between relative ${
                        formData.isSectionSkipped || (!formData.brandId && !hasBrands)
                          ? "bg-blue-50/80 border-blue-500 ring-2 ring-blue-500/20 shadow-sm"
                          : "bg-white hover:bg-gray-50 border-gray-200"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center shrink-0">
                          <FiCheckCircle className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-gray-900">Skip Section</h4>
                          <p className="text-[11px] text-gray-500 mt-0.5">
                            No custom section header or promo banner. Uses default catalog grouping.
                          </p>
                        </div>
                      </div>

                      {(formData.isSectionSkipped || (!formData.brandId && !hasBrands)) && (
                        <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-xs">
                          <FiCheck className="w-3.5 h-3.5 stroke-[3]" />
                        </div>
                      )}
                    </div>

                    {/* Existing Sections */}
                    {categoryBrands.map((sec) => {
                      const secId = sec.id || sec._id;
                      const isSelected = String(formData.brandId) === String(secId) && !formData.isSectionSkipped;

                      return (
                        <div
                          key={secId}
                          onClick={() => {
                            updateField("brandId", secId);
                            updateField("brandObj", sec);
                            updateField("isSectionSkipped", false);
                          }}
                          className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between relative ${
                            isSelected
                              ? "bg-blue-50/80 border-blue-500 ring-2 ring-blue-500/20 shadow-sm"
                              : "bg-white hover:bg-gray-50 border-gray-200"
                          }`}
                        >
                          <div>
                            <div className="flex items-center justify-between">
                              <h4 className="text-xs font-bold text-gray-900 truncate">{sec.title}</h4>
                              <span className="text-[10px] text-gray-400 font-mono">
                                Order: {sec.displayOrder || 0}
                              </span>
                            </div>

                            {sec.bannerPromo?.title && (
                              <div className="mt-2 p-2 bg-gray-50 rounded-lg border border-gray-100 text-[11px] text-gray-600">
                                <span className="font-semibold text-gray-800">Banner:</span> {sec.bannerPromo.title}
                              </div>
                            )}
                          </div>

                          {isSelected && (
                            <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-xs">
                              <FiCheck className="w-3.5 h-3.5 stroke-[3]" />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ========================================================================= */}
          {/* STEP 4: DETAILS & PRICING                                                 */}
          {/* ========================================================================= */}
          {currentStep === 4 && (
            <div className="space-y-6 animate-in fade-in duration-200">
              {/* Basic Details */}
              <div className="bg-white p-4 rounded-xl border border-gray-200 space-y-4 shadow-2xs">
                <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
                  <FiFileText className="text-blue-600" /> Basic Details
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1">
                      Service Title <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Split AC Deep Jet Clean"
                      value={formData.title}
                      onChange={(e) => updateField("title", e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1">
                      Duration (Minutes)
                    </label>
                    <input
                      type="number"
                      min="0"
                      placeholder="e.g. 45"
                      value={formData.durationMinutes}
                      onChange={(e) => updateField("durationMinutes", e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1">
                    Description
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Brief description visible to customers..."
                    value={formData.description}
                    onChange={(e) => updateField("description", e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Media Gallery */}
              <div className="bg-white p-4 rounded-xl border border-gray-200 space-y-3 shadow-2xs">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
                      <FiImage className="text-blue-600" /> Service Images & Banner Gallery
                    </h4>
                    <p className="text-[11px] text-gray-500">
                      <strong>Admin Tip:</strong> Pehli image (Primary) customer catalog card par thumbnail banegi. Baaki sabhi images User App ke 'View Details' sheet me <strong>swipeable banner carousel</strong> me show hongi!
                    </p>
                  </div>

                  <input
                    type="file"
                    ref={serviceImageInputRef}
                    multiple
                    accept="image/*"
                    onChange={handleServiceImagesUpload}
                    className="hidden"
                  />

                  <button
                    type="button"
                    onClick={() => serviceImageInputRef.current?.click()}
                    disabled={uploadingServiceImages}
                    className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <FiUpload className="w-3.5 h-3.5" />
                    {uploadingServiceImages ? "Uploading..." : "Upload Images"}
                  </button>
                </div>

                {formData.images.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3 pt-2">
                    {formData.images.map((img, idx) => (
                      <div
                        key={idx}
                        className={`relative rounded-xl border p-1 group overflow-hidden bg-gray-50 flex flex-col items-center ${
                          idx === 0 ? "border-emerald-500 ring-2 ring-emerald-500/20" : "border-gray-200"
                        }`}
                      >
                        <div className="w-full aspect-square rounded-lg overflow-hidden bg-white">
                          <img
                            src={toAssetUrl(img)}
                            alt={`Preview ${idx + 1}`}
                            className="w-full h-full object-cover"
                          />
                        </div>

                        {idx === 0 ? (
                          <span className="absolute top-2 left-2 bg-emerald-600 text-white text-[9px] font-extrabold px-1.5 py-0.5 rounded shadow-xs uppercase">
                            Primary
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleMakeImagePrimary(idx)}
                            className="absolute top-2 left-2 bg-black/60 hover:bg-black text-white text-[9px] font-bold px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                          >
                            Set Primary
                          </button>
                        )}

                        <div className="flex items-center justify-between w-full mt-1.5 px-1">
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              disabled={idx === 0}
                              onClick={() => handleMoveImage(idx, "left")}
                              className="p-1 rounded text-gray-500 hover:text-gray-800 disabled:opacity-30 cursor-pointer"
                              title="Move left"
                            >
                              <FiChevronLeft className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={idx === formData.images.length - 1}
                              onClick={() => handleMoveImage(idx, "right")}
                              className="p-1 rounded text-gray-500 hover:text-gray-800 disabled:opacity-30 cursor-pointer"
                              title="Move right"
                            >
                              <FiChevronRight className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleRemoveImage(idx)}
                            className="p-1 rounded text-rose-500 hover:text-rose-700 hover:bg-rose-50 cursor-pointer"
                            title="Delete image"
                          >
                            <FiTrash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-6 border-2 border-dashed border-gray-200 rounded-xl text-center text-xs text-gray-400">
                    No images uploaded yet. Click "+ Upload Images" above.
                  </div>
                )}
              </div>

              {/* Pricing & GST */}
              <div className="bg-white p-4 rounded-xl border border-gray-200 space-y-4 shadow-2xs">
                <div>
                  <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
                    <FiDollarSign className="text-blue-600" /> Pricing Model & Taxation
                  </h4>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    Select how this service will be charged and billed to customers.
                  </p>
                </div>

                {/* Pricing Types Explanatory Guide */}
                <div className="p-3 bg-blue-50/70 rounded-xl border border-blue-200 text-[11px] text-blue-950 space-y-1.5 leading-relaxed">
                  <div className="font-bold flex items-center gap-1.5 text-blue-900">
                    <FiInfo className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                    Pricing Types Guide (Admin Help):
                  </div>
                  <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 text-blue-900/85 pt-1">
                    <li className="p-2 rounded-lg bg-white/70 border border-blue-100">
                      <strong className="text-blue-950">Fixed Price:</strong> Ek tay rate (e.g., ₹499 for AC Jet Clean). Customer direct yehi pay karega, no hidden charges.
                    </li>
                    <li className="p-2 rounded-lg bg-white/70 border border-blue-100">
                      <strong className="text-blue-950">Hourly Rate:</strong> Per-hour charges (e.g., ₹200/hr for electrician/plumbing). Final bill calculates based on total hours.
                    </li>
                    <li className="p-2 rounded-lg bg-white/70 border border-blue-100">
                      <strong className="text-blue-950">Starting From:</strong> Minimum base estimate (e.g., Starts at ₹299). Technician inspects scope on-site before finalizing bill.
                    </li>
                    <li className="p-2 rounded-lg bg-white/70 border border-blue-100">
                      <strong className="text-blue-950">Inspection Fee:</strong> Initial visit & diagnostic fee only (e.g., ₹199). Adjusted against final repair bill if work is approved.
                    </li>
                    <li className="md:col-span-2 p-2 rounded-lg bg-white/70 border border-blue-100">
                      <strong className="text-blue-950">Quote Required:</strong> Custom quotation inquiry for large or complex commercial projects (no direct checkout).
                    </li>
                  </ul>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-5 gap-2">
                  {PRICING_TYPES.map((pt) => {
                    const isSelected = formData.pricingType === pt.value;
                    return (
                      <div
                        key={pt.value}
                        onClick={() => updateField("pricingType", pt.value)}
                        className={`p-3 rounded-xl border transition-all cursor-pointer ${
                          isSelected
                            ? "bg-blue-50/80 border-blue-500 ring-2 ring-blue-500/20"
                            : "bg-white hover:bg-gray-50 border-gray-200"
                        }`}
                      >
                        <span className="block text-xs font-bold text-gray-900">{pt.label}</span>
                        <span className="block text-[10px] text-gray-500 mt-0.5 leading-snug">{pt.hint}</span>
                      </div>
                    );
                  })}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 pt-2 border-t border-gray-100">
                  {formData.pricingType !== "quote_required" && (
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1">
                        Base Price (₹) <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        placeholder="e.g. 499"
                        value={formData.basePrice}
                        onChange={(e) => updateField("basePrice", e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1">
                      Original Price (₹) <span className="text-gray-400 font-normal">(Struck)</span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      placeholder="e.g. 699"
                      value={formData.originalPrice}
                      onChange={(e) => updateField("originalPrice", e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1">
                      Discount Label
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 25% OFF"
                      value={formData.discountLabel}
                      onChange={(e) => {
                        setFormData((prev) => ({ ...prev, discountLabelEdited: true }));
                        updateField("discountLabel", e.target.value);
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1">
                      GST Rate (%) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      placeholder="18"
                      value={formData.gstPercentage}
                      onChange={(e) => updateField("gstPercentage", e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Conditional Pricing Fields */}
                {formData.pricingType === "hourly" && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-3 bg-blue-50/50 rounded-xl border border-blue-100">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Hourly Rate (₹)</label>
                      <input
                        type="number"
                        min="0"
                        placeholder={formData.basePrice || "Hourly rate"}
                        value={formData.hourlyRate}
                        onChange={(e) => updateField("hourlyRate", e.target.value)}
                        className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-xs bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Min Hours</label>
                      <input
                        type="number"
                        min="1"
                        value={formData.minHours}
                        onChange={(e) => updateField("minHours", e.target.value)}
                        className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-xs bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Max Hours</label>
                      <input
                        type="number"
                        min="1"
                        value={formData.maxHours}
                        onChange={(e) => updateField("maxHours", e.target.value)}
                        className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-xs bg-white"
                      />
                    </div>
                  </div>
                )}

                {formData.pricingType === "inspection_fee" && (
                  <div className="p-3 bg-amber-50/60 rounded-xl border border-amber-200">
                    <label className="block text-xs font-semibold text-gray-800 mb-1">
                      Inspection / Visit Fee (₹)
                    </label>
                    <input
                      type="number"
                      min="0"
                      placeholder="e.g. 199"
                      value={formData.inspectionFee}
                      onChange={(e) => updateField("inspectionFee", e.target.value)}
                      className="w-full sm:w-60 px-3 py-1.5 border border-gray-300 rounded-lg text-xs bg-white"
                    />
                  </div>
                )}

                {formData.pricingType === "quote_required" && (
                  <div className="p-3 bg-gray-50 rounded-xl border border-gray-200">
                    <label className="block text-xs font-semibold text-gray-800 mb-1">Quote Contact Note</label>
                    <input
                      type="text"
                      placeholder="e.g. Call us for a custom site survey & quote"
                      value={formData.quoteContactNote}
                      onChange={(e) => updateField("quoteContactNote", e.target.value)}
                      className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-xs bg-white"
                    />
                  </div>
                )}
              </div>

              {/* Inclusions vs Exclusions Dispute Prevention Banner */}
              <div className="p-3.5 bg-amber-50/70 rounded-xl border border-amber-200/90 text-[11px] text-amber-950 space-y-1.5 leading-relaxed shadow-2xs">
                <div className="font-bold flex items-center gap-1.5 text-amber-900">
                  <FiAlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  Why Adding Exclusions Prevents On-Site Customer Disputes:
                </div>
                <p className="text-amber-900/85">
                  <strong>Inclusions</strong> batata hai ki is price me worker kya-kya kaam karega (e.g. deep chemical jet wash, cooling coil clean).<br/>
                  <strong>Exclusions</strong> batata hai ki kya covered <u>NAHI</u> hai (e.g. spare parts cost, new copper piping, gas charging). Exclusions pehle se clearly likhne se customer ko pehle se pata rehta hai aur technician ke customer ke ghar pahuchne par koi price dispute ya misunderstanding nahi hoti!
                </p>
              </div>

              {/* Inclusions & Exclusions */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Inclusions */}
                <div className="bg-white p-4 rounded-xl border border-gray-200 space-y-3 shadow-2xs">
                  <div>
                    <h4 className="text-xs font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-1.5">
                      <FiCheckCircle className="text-emerald-600" /> What's Included (Shamil Hai)
                    </h4>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      Customer ko batayein ki is booking me worker kya-kya kaam karega (e.g. Foam jet wash, coil cleaning).
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="e.g. High-pressure foam jet wash"
                      value={newInclusionText}
                      onChange={(e) => setNewInclusionText(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddInclusion())}
                      className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-xs bg-white"
                    />
                    <button
                      type="button"
                      onClick={handleAddInclusion}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold cursor-pointer"
                    >
                      Add
                    </button>
                  </div>

                  <div className="space-y-1.5 max-h-36 overflow-y-auto">
                    {formData.inclusions.map((item, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-2 rounded-lg bg-emerald-50/60 border border-emerald-100 text-xs text-emerald-900"
                      >
                        <span className="truncate pr-2">• {item}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveInclusion(idx)}
                          className="text-gray-400 hover:text-rose-600 p-0.5 cursor-pointer"
                        >
                          <FiTrash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Exclusions */}
                <div className="bg-white p-4 rounded-xl border border-gray-200 space-y-3 shadow-2xs">
                  <div>
                    <h4 className="text-xs font-bold text-rose-800 uppercase tracking-wider flex items-center gap-1.5">
                      <FiAlertCircle className="text-rose-600" /> What's Excluded (Shamil Nahi Hai)
                    </h4>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      Jo kaam is price me nahi aayega wo yahan likhein taaki customer-worker me vivaad na ho (e.g. Spare parts extra charge).
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="e.g. Spare parts & copper piping cost extra"
                      value={newExclusionText}
                      onChange={(e) => setNewExclusionText(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddExclusion())}
                      className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-xs bg-white"
                    />
                    <button
                      type="button"
                      onClick={handleAddExclusion}
                      className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold cursor-pointer"
                    >
                      Add
                    </button>
                  </div>

                  <div className="space-y-1.5 max-h-36 overflow-y-auto">
                    {formData.exclusions.map((item, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-2 rounded-lg bg-rose-50/60 border border-rose-100 text-xs text-rose-900"
                      >
                        <span className="truncate pr-2">• {item}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveExclusion(idx)}
                          className="text-gray-400 hover:text-rose-600 p-0.5 cursor-pointer"
                        >
                          <FiTrash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Policies & Metadata */}
              <div className="bg-white p-4 rounded-xl border border-gray-200 space-y-4 shadow-2xs">
                <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
                  <FiShield className="text-blue-600" /> Warranty & Policies
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Warranty Details (Trust Builder)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 30 days Help-U service warranty"
                      value={formData.warranty}
                      onChange={(e) => updateField("warranty", e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Cancellation Policy
                    </label>
                    <p className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
                      Every service follows the platform cancellation policy, so customers always see what is actually charged.
                      Change it in Booking Configuration &rsaquo; Cancellation Policy.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-gray-100">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Display Rating</label>
                    <input
                      type="text"
                      placeholder="e.g. 4.85"
                      value={formData.displayRating}
                      onChange={(e) => updateField("displayRating", e.target.value)}
                      className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-xs bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Reviews Label</label>
                    <input
                      type="text"
                      placeholder="e.g. 1.2k reviews"
                      value={formData.reviewsLabel}
                      onChange={(e) => updateField("reviewsLabel", e.target.value)}
                      className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-xs bg-white"
                    />
                  </div>

                  <div className="col-span-full pt-3">
                    <div className="p-4 rounded-xl bg-gradient-to-r from-purple-50 via-indigo-50 to-purple-50 border border-purple-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black text-purple-950 uppercase tracking-wide flex items-center gap-1.5">
                            <FiBookmark className="w-3.5 h-3.5 text-purple-600" />
                            Is Combo / Super Saver Package
                          </span>
                          <span className="px-2 py-0.5 rounded-md bg-purple-200 text-purple-800 text-[10px] font-black uppercase">
                            Package Mode
                          </span>
                        </div>
                        <p className="text-[11px] text-purple-900 font-medium leading-relaxed">
                          Turn ON when bundling 2+ services together at a special price (e.g., Waxing + Facial Combo). This shows a prominent 'PACKAGE' badge and package customization view on the user app.
                        </p>
                        <p className="text-[10px] text-purple-700/80 leading-relaxed">
                          <strong>User App par kya hoga?</strong> Customer app par rich combo card show hoga jisme top green/purple package banner, inclusions breakdown aur "Edit your package" option aayega.
                        </p>
                      </div>
                      <div className="shrink-0">
                        <ToggleSwitch
                          checked={formData.isPackage}
                          onChange={(val) => updateField("isPackage", val)}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* STEP 5: VARIANTS                                                          */}
          {/* ========================================================================= */}
          {currentStep === 5 && (
            <div className="space-y-5 animate-in fade-in duration-200">
              {/* Summary & Explanatory Banner */}
              <div className="p-4 bg-gradient-to-r from-purple-50 via-indigo-50 to-blue-50 rounded-xl border border-purple-200 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h4 className="text-xs font-extrabold text-purple-900 uppercase tracking-wider flex items-center gap-1.5">
                      <FiDollarSign className="text-purple-600" />
                      Variants Configuration (Tiers, Sizes, Room Types)
                    </h4>
                    <p className="text-xs text-purple-700 mt-0.5 font-medium">
                      {lowestActiveVariantPrice !== null
                        ? `Customer catalog will display "Starts at ₹${lowestActiveVariantPrice.toLocaleString("en-IN")}"`
                        : `Currently using single base price: ₹${Number(formData.basePrice || 0).toLocaleString("en-IN")}`}
                    </p>
                  </div>

                  <button
                    id="wizard-add-variant-btn"
                    type="button"
                    onClick={handleAddVariant}
                    className="px-3.5 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer shrink-0"
                  >
                    <FiPlus className="w-3.5 h-3.5" />
                    + Add Variant Option
                  </button>
                </div>

                <div className="p-3.5 bg-white/95 rounded-xl border border-purple-200 text-[12px] text-gray-700 space-y-2 leading-relaxed shadow-2xs">
                  <div className="font-bold text-purple-950 flex items-center gap-1.5 text-[12px]">
                    <FiInfo className="text-purple-600 w-4 h-4 shrink-0" />
                    <span>Variant Guidance & User App Behavior</span>
                  </div>
                  <p className="text-gray-800 font-medium">
                    Use variants when a service has different sizes, capacities, or tiers (e.g. 1 Ton vs 1.5 Ton AC, or 1 Bathroom vs 2 Bathrooms). User app will display &lsquo;Starts at ₹X&rsquo; and allow customers to pick their variant before adding to cart.
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-gray-600 pl-1 text-[11px]">
                    <li><strong>Customer View:</strong> The service card displays <em>&ldquo;Starts at ₹{lowestActiveVariantPrice !== null ? lowestActiveVariantPrice.toLocaleString("en-IN") : Number(formData.basePrice || 0).toLocaleString("en-IN")}&rdquo;</em> with an interactive <strong>Options</strong> button.</li>
                    <li><strong>Selection Sheet:</strong> Tapping Options opens a drawer sheet showing each active variant with its duration, inclusions, and price.</li>
                    <li><strong>Cart Integration:</strong> Adding a variant saves <code>variantId</code> and the variant snapshot into the customer&rsquo;s cart without merging different variants.</li>
                  </ul>
                </div>
              </div>

              {/* Variants List */}
              {formData.variants.length > 0 ? (
                <div className="space-y-3">
                  {formData.variants.map((v, idx) => (
                    <div
                      key={idx}
                      className={`p-4 rounded-xl border transition-all bg-white shadow-2xs space-y-3 ${
                        v.isActive ? "border-gray-200" : "border-gray-200/60 opacity-60 bg-gray-50/50"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-purple-100 text-purple-700 text-[10px] font-bold flex items-center justify-center">
                            {idx + 1}
                          </span>
                          <span className="text-xs font-bold text-gray-800">
                            {v.title || `Untitled Variant #${idx + 1}`}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <ToggleSwitch
                            checked={v.isActive}
                            onChange={(checked) => handleUpdateVariant(idx, "isActive", checked)}
                            label={v.isActive ? "Active" : "Inactive"}
                          />

                          <div className="flex items-center gap-0.5 ml-2 border-l pl-2 border-gray-200">
                            <button
                              type="button"
                              disabled={idx === 0}
                              onClick={() => handleMoveVariant(idx, "up")}
                              className="p-1 rounded text-gray-400 hover:text-gray-700 disabled:opacity-30 cursor-pointer"
                            >
                              <FiChevronLeft className="w-4 h-4 rotate-90" />
                            </button>
                            <button
                              type="button"
                              disabled={idx === formData.variants.length - 1}
                              onClick={() => handleMoveVariant(idx, "down")}
                              className="p-1 rounded text-gray-400 hover:text-gray-700 disabled:opacity-30 cursor-pointer"
                            >
                              <FiChevronRight className="w-4 h-4 rotate-90" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveVariant(idx)}
                              className="p-1 rounded text-rose-500 hover:text-rose-700 hover:bg-rose-50 cursor-pointer"
                              title="Delete variant"
                            >
                              <FiTrash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2 border-t border-gray-100">
                        <div>
                          <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                            Variant Title <span className="text-rose-500">*</span>
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. 1.5 Ton AC"
                            value={v.title}
                            onChange={(e) => handleUpdateVariant(idx, "title", e.target.value)}
                            className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-xs bg-white"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                            Price (₹) <span className="text-rose-500">*</span>
                          </label>
                          <input
                            type="number"
                            min="0"
                            placeholder="e.g. 599"
                            value={v.price}
                            onChange={(e) => handleUpdateVariant(idx, "price", e.target.value)}
                            className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-xs bg-white"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-gray-700 mb-1">Original Price (₹)</label>
                          <input
                            type="number"
                            min="0"
                            placeholder="e.g. 799"
                            value={v.originalPrice || ""}
                            onChange={(e) => handleUpdateVariant(idx, "originalPrice", e.target.value)}
                            className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-xs bg-white"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-gray-700 mb-1">Duration (Mins)</label>
                          <input
                            type="number"
                            min="0"
                            placeholder="e.g. 60"
                            value={v.durationMinutes || ""}
                            onChange={(e) => handleUpdateVariant(idx, "durationMinutes", e.target.value)}
                            className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-xs bg-white"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 border-2 border-dashed border-gray-200 rounded-xl text-center space-y-2 bg-white">
                  <FiDollarSign className="w-8 h-8 text-gray-300 mx-auto" />
                  <h4 className="text-xs font-bold text-gray-700">No Variants Added</h4>
                  <p className="text-[11px] text-gray-400 max-w-sm mx-auto">
                    If this service has a single price, you can skip this step. Add variants if you offer multiple sizes or packages.
                  </p>
                </div>
              )}

              {stepErrors[5]?.length > 0 && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs space-y-1">
                  {stepErrors[5].map((err, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <FiAlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{err}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ========================================================================= */}
          {/* STEP 6: PUBLISH & PREVIEW                                                 */}
          {/* ========================================================================= */}
          {currentStep === 6 && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Left 6 cols: Exact User App Card Preview */}
                <div className="lg:col-span-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
                      <FiEye className="text-blue-600" /> Customer App Live Preview
                    </h4>
                    <span className="text-[11px] text-gray-400">Exact Urban Company UI layout</span>
                  </div>

                  {/* Real User Card Replica */}
                  <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between gap-3">
                      {/* Left: Info */}
                      <div className="flex-1 min-w-0">
                        {formData.isPackage && (
                          <span className="inline-block text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 uppercase tracking-wider mb-1.5">
                            Package
                          </span>
                        )}

                        <h3 className="text-sm sm:text-base font-bold text-gray-900 leading-snug">
                          {formData.title || "Untitled Service"}
                        </h3>

                        {/* Rating & Reviews */}
                        {/* The customer app shows a rating only when one is entered here */}
                        {(formData.displayRating || formData.reviewsLabel) && (
                          <div className="flex items-center gap-1 text-[11px] text-gray-600 mt-1">
                            {formData.displayRating && (
                              <span className="flex items-center text-amber-500 font-bold">
                                <FiStar className="w-3 h-3 fill-amber-400 stroke-none mr-0.5" />
                                {formData.displayRating}
                              </span>
                            )}
                            {formData.reviewsLabel && <span className="text-gray-400">({formData.reviewsLabel})</span>}
                          </div>
                        )}

                        {/* Price & Duration */}
                        <div className="flex items-baseline gap-2 mt-2">
                          <span className="text-sm sm:text-base font-extrabold text-gray-900">
                            {lowestActiveVariantPrice !== null
                              ? `Starts at ₹${lowestActiveVariantPrice.toLocaleString("en-IN")}`
                              : `₹${Number(formData.basePrice || 0).toLocaleString("en-IN")}`}
                          </span>

                          {formData.originalPrice && Number(formData.originalPrice) > Number(formData.basePrice) && (
                            <span className="text-xs text-gray-400 line-through">
                              ₹{Number(formData.originalPrice).toLocaleString("en-IN")}
                            </span>
                          )}

                          {formData.discountLabel && (
                            <span className="text-xs font-bold text-emerald-600">
                              {formData.discountLabel}
                            </span>
                          )}

                          {formData.durationMinutes && (
                            <span className="text-xs text-gray-400">
                              • {formData.durationMinutes} mins
                            </span>
                          )}
                        </div>

                        {/* Inclusions Bullets */}
                        {formData.inclusions.length > 0 && (
                          <ul className="mt-3 space-y-1 text-xs text-gray-600 border-t border-gray-100 pt-2.5">
                            {formData.inclusions.slice(0, 3).map((inc, i) => (
                              <li key={i} className="flex items-start gap-1.5">
                                <span className="text-gray-400">•</span>
                                <span className="truncate">{inc}</span>
                              </li>
                            ))}
                          </ul>
                        )}

                        <div className="mt-3">
                          <span className="text-xs font-bold text-[#6B38FB] hover:underline cursor-pointer">
                            View details
                          </span>
                        </div>
                      </div>

                      {/* Right: Media & Simulated Add Button */}
                      <div className="flex flex-col items-center justify-between shrink-0 w-20 sm:w-24">
                        <div className="w-20 h-20 rounded-xl overflow-hidden bg-gray-50 border border-gray-100 mb-2 relative">
                          {formData.images[0] || formData.iconUrl ? (
                            <img
                              src={toAssetUrl(formData.images[0] || formData.iconUrl)}
                              alt="Thumbnail"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-300">
                              <FiImage className="w-6 h-6" />
                            </div>
                          )}
                        </div>

                        <div className="w-full h-7 rounded-lg border border-[#6B38FB] bg-white text-[#6B38FB] font-bold text-xs flex items-center justify-center shadow-2xs">
                          Add
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Hierarchy Breadcrumb */}
                  <div className="p-3 bg-white rounded-xl border border-gray-200 text-xs space-y-1 shadow-2xs">
                    <span className="text-gray-400 font-semibold block text-[10px] uppercase tracking-wider">
                      Catalog Path:
                    </span>
                    <div className="flex items-center gap-1.5 flex-wrap font-medium text-gray-700">
                      <span className="text-blue-600 font-bold">{activeCategory?.title || "Category"}</span>
                      <FiChevronRight className="w-3 h-3 text-gray-400" />
                      <span>{formData.subCategoryObj?.title || (formData.subCategoryId ? "Sub-category" : "Direct")}</span>
                      <FiChevronRight className="w-3 h-3 text-gray-400" />
                      <span>
                        {hasBrands && formData.selectedBrandIds && formData.selectedBrandIds.length > 1
                          ? `${formData.selectedBrandIds.length} Brands Selected`
                          : (formData.brandObj?.title || (hasBrands ? "Brand" : "General Section"))}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right 6 cols: Validation Checklist & Workers & Submit */}
                <div className="lg:col-span-6 space-y-4">
                  {/* Workers Mapped Alert / Badge */}
                  <div className={`p-4 rounded-xl border transition-all ${
                    workersMapped === 0
                      ? "bg-amber-50/80 border-amber-300 text-amber-900"
                      : "bg-emerald-50/80 border-emerald-300 text-emerald-900"
                  }`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FiUsers className="w-4 h-4" />
                        <span className="text-xs font-bold">Workers Mapped to this Category:</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-extrabold ${
                        workersMapped === 0 ? "bg-amber-200 text-amber-900" : "bg-emerald-200 text-emerald-900"
                      }`}>
                        {loadingWorkersCount ? "Checking..." : `${workersMapped ?? 0} Workers`}
                      </span>
                    </div>

                    {workersMapped === 0 && (
                      <p className="text-[11px] text-amber-800 mt-2 leading-relaxed">
                        ⚠️ 0 workers are mapped to category "{activeCategory?.title}". Bookings will not receive automatic worker assignments until workers have this service category added to their profile skills.
                      </p>
                    )}
                  </div>

                  {/* Step-by-Step Validation Status */}
                  <div className="bg-white p-4 rounded-xl border border-gray-200 space-y-3 shadow-2xs">
                    <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider">
                      Wizard Validation Status
                    </h4>

                    <div className="space-y-2">
                      {STEPS.slice(0, 5).map((s) => {
                        const valid = isStepValid(s.id);
                        return (
                          <div
                            key={s.id}
                            className={`flex items-center justify-between p-2.5 rounded-lg border text-xs transition-colors ${
                              valid
                                ? "bg-emerald-50/50 border-emerald-100 text-emerald-900"
                                : "bg-rose-50/50 border-rose-200 text-rose-900"
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              {valid ? (
                                <FiCheckCircle className="text-emerald-600 w-4 h-4 shrink-0" />
                              ) : (
                                <FiAlertCircle className="text-rose-600 w-4 h-4 shrink-0" />
                              )}
                              <span className="font-semibold">Step {s.id}: {s.label}</span>
                            </div>

                            {!valid && (
                              <button
                                type="button"
                                onClick={() => setCurrentStep(s.id)}
                                className="text-[11px] font-bold text-rose-600 hover:underline cursor-pointer"
                              >
                                Fix Errors →
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {totalErrorsCount > 0 && (
                      <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                        {totalErrorsCount} validation error(s) must be resolved before publishing.
                      </div>
                    )}
                  </div>

                  {/* Actions Bar */}
                  <div className="p-4 bg-white rounded-xl border border-gray-200 space-y-3 shadow-2xs">
                    <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wide">
                      Final Submission
                    </h4>

                    <div className="grid grid-cols-2 gap-3">
                      <button
                        id="wizard-draft-btn"
                        type="button"
                        disabled={isSubmitting}
                        onClick={() => handleFinalSubmit("draft")}
                        className="w-full px-4 py-2.5 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-gray-800 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                      >
                        <FiSave className="w-4 h-4" />
                        {isSubmitting ? "Saving..." : "Save Draft"}
                      </button>

                      <button
                        id="wizard-publish-btn"
                        type="button"
                        disabled={isSubmitting}
                        onClick={() => handleFinalSubmit("published")}
                        className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-md shadow-blue-500/20 transition-all cursor-pointer"
                      >
                        <FiSend className="w-4 h-4" />
                        {isSubmitting ? "Publishing..." : "Publish Service"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ─── MODAL FOOTER ────────────────────────────────────────────────── */}
        <div className="p-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between shrink-0">
          <button
            id="wizard-prev-btn"
            type="button"
            disabled={currentStep === 1 || isSubmitting}
            onClick={() => setCurrentStep((prev) => Math.max(1, prev - 1))}
            className="px-4 py-2 border border-gray-300 rounded-xl text-xs font-semibold text-gray-700 hover:bg-white disabled:opacity-30 transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <FiArrowLeft className="w-3.5 h-3.5" />
            Previous
          </button>

          <div className="flex items-center gap-2">
            <button
              id="wizard-cancel-btn"
              type="button"
              onClick={handleAttemptClose}
              disabled={isSubmitting}
              className="px-4 py-2 border border-gray-300 rounded-xl text-xs font-semibold text-gray-600 hover:bg-white transition-colors cursor-pointer"
            >
              Cancel
            </button>

            {currentStep < 6 ? (
              <button
                id="wizard-next-btn"
                type="button"
                disabled={isSubmitting}
                onClick={() => {
                  if (!isStepValid(currentStep)) {
                    toast.error("Please complete the required fields in this step");
                    return;
                  }
                  setCurrentStep((prev) => Math.min(6, prev + 1));
                }}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
              >
                Next
                <FiArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : null}
          </div>
        </div>

        {/* ─── INLINE MODAL 1: CREATE CATEGORY ─────────────────────────────── */}
        {showCreateCategoryModal && (
          <div className="fixed inset-0 z-[10000] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <ModalLock />
            <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-xl w-full max-h-[85vh] overflow-y-auto border border-gray-200 space-y-4 animate-in zoom-in-95">
              <div className="flex items-center justify-between border-b pb-3 border-gray-100">
                <h3 className="text-base font-bold text-gray-900">+ Create New Category</h3>
                <button
                  type="button"
                  onClick={() => setShowCreateCategoryModal(false)}
                  className="p-1 rounded-lg text-gray-400 hover:text-gray-700 cursor-pointer"
                >
                  <FiX className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveNewCategory} className="space-y-4 text-xs">
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">
                    Category Title <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Home Painting"
                    value={newCatTitle}
                    onChange={(e) => setNewCatTitle(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-gray-700 mb-1">
                    Slug (Auto-validated)
                  </label>
                  <input
                    type="text"
                    placeholder="home-painting"
                    value={newCatSlug}
                    onChange={(e) => {
                      setNewCatSlugManual(true);
                      setNewCatSlug(slugify(e.target.value));
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 focus:bg-white"
                  />
                  {checkingCatSlug && <span className="text-[10px] text-gray-400">Checking availability...</span>}
                  {newCatSlugStatus && (
                    <span
                      className={`text-[11px] font-semibold mt-1 block ${
                        newCatSlugStatus.available ? "text-emerald-600" : "text-rose-600"
                      }`}
                    >
                      {newCatSlugStatus.available ? "✓ " : "✗ "}
                      {newCatSlugStatus.message}
                    </span>
                  )}
                </div>

                <IconUploadWithPreview
                  value={newCatIconUrl}
                  onChange={(url) => setNewCatIconUrl(url)}
                  folder="categories"
                  label="Category Icon (1:1 Squircle)"
                  helperText="Upload transparent PNG/SVG icon. Use checkerboard/dark toggle to verify alpha transparency."
                />

                {/* Hero Banner Fields */}
                <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 space-y-2">
                  <span className="font-bold text-gray-800 block">Hero Banner</span>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder="Tag (e.g. Festive Offer)"
                      value={newCatHeroBanner.tag}
                      onChange={(e) => setNewCatHeroBanner((p) => ({ ...p, tag: e.target.value }))}
                      className="px-2 py-1.5 border border-gray-300 rounded bg-white text-xs"
                    />
                    <input
                      type="text"
                      placeholder="Starting Price (e.g. ₹499)"
                      value={newCatHeroBanner.startingPrice}
                      onChange={(e) => setNewCatHeroBanner((p) => ({ ...p, startingPrice: e.target.value }))}
                      className="px-2 py-1.5 border border-gray-300 rounded bg-white text-xs"
                    />
                  </div>
                  <input
                    type="text"
                    placeholder="Banner Headline Title"
                    value={newCatHeroBanner.title}
                    onChange={(e) => setNewCatHeroBanner((p) => ({ ...p, title: e.target.value }))}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded bg-white text-xs"
                  />
                  <label className="px-3 py-1 bg-white border border-gray-300 hover:bg-gray-100 text-gray-700 rounded text-[11px] font-semibold cursor-pointer inline-block">
                    {uploadingCatHero ? "Uploading Banner..." : "Upload Banner Image"}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setUploadingCatHero(true);
                        const res = await serviceService.uploadImage(file, "categories");
                        if (res?.success) setNewCatHeroBanner((p) => ({ ...p, imageUrl: res.imageUrl }));
                        setUploadingCatHero(false);
                      }}
                    />
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-gray-700 mb-1">Display Rating</label>
                    <input
                      type="text"
                      value={newCatDisplayRating}
                      onChange={(e) => setNewCatDisplayRating(e.target.value)}
                      className="w-full px-3 py-1.5 border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-gray-700 mb-1">ETA Default Minutes</label>
                    <input
                      type="number"
                      value={newCatEtaMinutes}
                      onChange={(e) => setNewCatEtaMinutes(e.target.value)}
                      className="w-full px-3 py-1.5 border border-gray-300 rounded-lg"
                    />
                  </div>
                </div>

                {/* Uses Brands Switch */}
                <div className="p-3 bg-blue-50/50 rounded-xl border border-blue-200/80 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-gray-900 block">Uses Brands</span>
                    <span className="text-[11px] text-gray-500">
                      Enable for appliance categories (LG, Samsung).
                    </span>
                  </div>
                  <ToggleSwitch
                    checked={newCatHasBrands}
                    onChange={(val) => setNewCatHasBrands(val)}
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t">
                  <button
                    type="button"
                    onClick={() => setShowCreateCategoryModal(false)}
                    className="px-3 py-1.5 border rounded-lg text-gray-600 hover:bg-gray-100"
                  >
                    Cancel
                  </button>
                  <button
                    id="modal-save-category-btn"
                    type="submit"
                    disabled={savingNewCategory || newCatSlugStatus?.available === false}
                    className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold disabled:opacity-50"
                  >
                    {savingNewCategory ? "Creating..." : "Save Category"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ─── INLINE MODAL 2: CREATE SUB-CATEGORY ─────────────────────────── */}
        {showCreateSubCategoryModal && (
          <div className="fixed inset-0 z-[10000] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <ModalLock />
            <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full border border-gray-200 space-y-4 animate-in zoom-in-95">
              <div className="flex items-center justify-between border-b pb-3 border-gray-100">
                <h3 className="text-base font-bold text-gray-900">+ Add New Sub-category</h3>
                <button
                  type="button"
                  onClick={() => setShowCreateSubCategoryModal(false)}
                  className="p-1 rounded-lg text-gray-400 hover:text-gray-700 cursor-pointer"
                >
                  <FiX className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveNewSubCategory} className="space-y-4 text-xs">
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">
                    Sub-category Title <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Waxing Essentials"
                    value={newSubTitle}
                    onChange={(e) => setNewSubTitle(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-gray-700 mb-1">
                    Namespaced Slug (Auto-validated)
                  </label>
                  <input
                    type="text"
                    value={newSubSlug}
                    onChange={(e) => {
                      setNewSubSlugManual(true);
                      setNewSubSlug(slugify(e.target.value));
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 focus:bg-white"
                  />
                  {checkingSubSlug && <span className="text-[10px] text-gray-400">Validating...</span>}
                  {newSubSlugStatus && (
                    <span
                      className={`text-[11px] font-semibold mt-1 block ${
                        newSubSlugStatus.available ? "text-emerald-600" : "text-rose-600"
                      }`}
                    >
                      {newSubSlugStatus.available ? "✓ " : "✗ "}
                      {newSubSlugStatus.message}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-gray-700 mb-1">Badge (Pill text)</label>
                    <input
                      type="text"
                      placeholder="e.g. UPTO 20% OFF"
                      value={newSubBadge}
                      onChange={(e) => setNewSubBadge(e.target.value)}
                      className="w-full px-3 py-1.5 border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-gray-700 mb-1">Display Order</label>
                    <input
                      type="number"
                      value={newSubOrder}
                      onChange={(e) => setNewSubOrder(e.target.value)}
                      className="w-full px-3 py-1.5 border border-gray-300 rounded-lg"
                    />
                  </div>
                </div>

                <IconUploadWithPreview
                  value={newSubIconUrl}
                  onChange={(url) => setNewSubIconUrl(url)}
                  folder="categories"
                  label="Sub-category Icon (1:1 Squircle)"
                  helperText="Upload transparent PNG/SVG icon. Use checkerboard/dark toggle to verify alpha transparency."
                />

                <div className="flex items-center justify-end gap-2 pt-3 border-t">
                  <button
                    type="button"
                    onClick={() => setShowCreateSubCategoryModal(false)}
                    className="px-3 py-1.5 border rounded-lg text-gray-600 hover:bg-gray-100"
                  >
                    Cancel
                  </button>
                  <button
                    id="modal-save-subcategory-btn"
                    type="submit"
                    disabled={savingNewSubCategory || newSubSlugStatus?.available === false}
                    className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold disabled:opacity-50"
                  >
                    {savingNewSubCategory ? "Creating..." : "Save Sub-category"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ─── INLINE MODAL 3: CREATE BRAND (Appliance) ────────────────────── */}
        {showCreateBrandModal && (
          <div className="fixed inset-0 z-[10000] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <ModalLock />
            <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full border border-gray-200 space-y-4 animate-in zoom-in-95">
              <div className="flex items-center justify-between border-b pb-3 border-gray-100">
                <h3 className="text-base font-bold text-gray-900">+ Add New Brand</h3>
                <button
                  type="button"
                  onClick={() => setShowCreateBrandModal(false)}
                  className="p-1 rounded-lg text-gray-400 hover:text-gray-700 cursor-pointer"
                >
                  <FiX className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveNewBrand} className="space-y-4 text-xs">
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">
                    Brand Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Daikin, LG, Samsung"
                    value={newBrandTitle}
                    onChange={(e) => setNewBrandTitle(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-gray-700 mb-1">Brand Logo Upload</label>
                  <div className="flex items-center gap-3">
                    {newBrandLogo ? (
                      <img
                        src={toAssetUrl(newBrandLogo)}
                        alt="Brand Logo"
                        className="w-12 h-12 rounded-lg object-contain border p-1 bg-gray-50"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-lg border border-dashed flex items-center justify-center text-gray-400">
                        None
                      </div>
                    )}
                    <label className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-semibold cursor-pointer">
                      {uploadingBrandLogo ? "Uploading..." : "Choose Logo"}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          setUploadingBrandLogo(true);
                          const res = await brandService.uploadImage(file, "brands");
                          if (res?.success) setNewBrandLogo(res.imageUrl);
                          setUploadingBrandLogo(false);
                        }}
                      />
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-gray-700 mb-1">Badge (optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. Upto 20% OFF, New, Bestseller"
                    value={newBrandBadge}
                    onChange={(e) => setNewBrandBadge(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">Shows on the brand's pill in the user catalog.</p>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t">
                  <button
                    type="button"
                    onClick={() => setShowCreateBrandModal(false)}
                    className="px-3 py-1.5 border rounded-lg text-gray-600 hover:bg-gray-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingNewBrand}
                    className="px-4 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-bold disabled:opacity-50"
                  >
                    {savingNewBrand ? "Creating..." : "Save Brand"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ─── INLINE MODAL 4: CREATE SECTION (Non-Appliance) ──────────────── */}
        {showCreateSectionModal && (
          <div className="fixed inset-0 z-[10000] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <ModalLock />
            <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full border border-gray-200 space-y-4 animate-in zoom-in-95">
              <div className="flex items-center justify-between border-b pb-3 border-gray-100">
                <h3 className="text-base font-bold text-gray-900">+ Add New Section</h3>
                <button
                  type="button"
                  onClick={() => setShowCreateSectionModal(false)}
                  className="p-1 rounded-lg text-gray-400 hover:text-gray-700 cursor-pointer"
                >
                  <FiX className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveNewSection} className="space-y-4 text-xs">
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">
                    Section Title <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Deep Cleaning, Express Services"
                    value={newSectionTitle}
                    onChange={(e) => setNewSectionTitle(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-gray-700 mb-1">Display Order</label>
                  <input
                    type="number"
                    value={newSectionDisplayOrder}
                    onChange={(e) => setNewSectionDisplayOrder(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>

                {/* Banner Promo Fields */}
                <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 space-y-2">
                  <span className="font-bold text-gray-800 block">Section Promo Banner (Optional)</span>
                  <input
                    type="text"
                    placeholder="Banner Headline (e.g. Save 20% on Combos)"
                    value={newSectionBannerPromo.title}
                    onChange={(e) => setNewSectionBannerPromo((p) => ({ ...p, title: e.target.value }))}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded bg-white text-xs"
                  />
                  <input
                    type="text"
                    placeholder="Subtitle"
                    value={newSectionBannerPromo.subtitle}
                    onChange={(e) => setNewSectionBannerPromo((p) => ({ ...p, subtitle: e.target.value }))}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded bg-white text-xs"
                  />
                  <label className="px-3 py-1 bg-white border border-gray-300 hover:bg-gray-100 text-gray-700 rounded text-[11px] font-semibold cursor-pointer inline-block">
                    {uploadingSectionImage ? "Uploading..." : "Upload Banner Image"}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setUploadingSectionImage(true);
                        const res = await brandService.uploadImage(file, "brands");
                        if (res?.success) setNewSectionBannerPromo((p) => ({ ...p, imageUrl: res.imageUrl }));
                        setUploadingSectionImage(false);
                      }}
                    />
                  </label>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t">
                  <button
                    type="button"
                    onClick={() => setShowCreateSectionModal(false)}
                    className="px-3 py-1.5 border rounded-lg text-gray-600 hover:bg-gray-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingNewSection}
                    className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold disabled:opacity-50"
                  >
                    {savingNewSection ? "Creating..." : "Save Section"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ─── UNSAVED CHANGES CONFIRMATION MODAL ──────────────────────────── */}
        {showDiscardConfirm && (
          <div className="fixed inset-0 z-[10001] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <ModalLock />
            <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full border border-gray-200 text-center animate-in zoom-in-95">
              <FiAlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-2" />
              <h3 className="text-base font-bold text-gray-900">Discard unsaved changes?</h3>
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                You have unsaved changes in this service wizard. If you close now, your edits will be lost.
              </p>
              <div className="mt-5 flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowDiscardConfirm(false)}
                  className="px-3.5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-xl text-xs font-semibold cursor-pointer"
                >
                  Keep Editing
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowDiscardConfirm(false);
                    onClose();
                  }}
                  className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold cursor-pointer"
                >
                  Discard Changes
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ServiceWizard;

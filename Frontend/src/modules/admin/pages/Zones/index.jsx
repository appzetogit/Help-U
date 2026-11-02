import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  GoogleMap,
  Polygon,
  Polyline,
  Marker,
} from "@react-google-maps/api";
import { useAppGoogleMaps } from "../../../../hooks/useGoogleMapsConfig";
import {
  FiPlus,
  FiTrash2,
  FiEdit2,
  FiMap,
  FiX,
  FiSave,
  FiFilter,
  FiRefreshCw,
  FiZap,
  FiSearch,
  FiUsers,
  FiLayers,
  FiCheck,
  FiAlertCircle,
  FiRotateCcw,
} from "react-icons/fi";
import { toast } from "react-hot-toast";
import zoneService from "../../services/zoneService";
import { cityService } from "../../services/cityService";
import { categoryService } from "../../../../services/catalogService";
import ModalLock from '../../../../components/common/ModalLock';
import OutOfZonePageModal from './OutOfZonePageModal';
import DispatchModeSwitch from '../../components/DispatchModeSwitch';

const LIBRARIES = ["places", "geometry"];

const MAP_CONTAINER = { width: "100%", height: "100%" };
const DEFAULT_CENTER = { lat: 28.6139, lng: 77.209 };
const DEFAULT_ZOOM = 11;

const ZONE_COLORS = [
  "#2563EB", "#059669", "#D97706", "#DC2626", "#7C3AED",
  "#DB2777", "#0D9488", "#EA580C", "#4F46E5", "#65A30D",
];

const SURGE_PRESETS = [1.2, 1.5, 1.8, 2.0, 2.5];

// Class Error Boundary to catch any unexpected React crash and prevent blank page
class ZonesErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ZonesPage Error Boundary caught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center bg-white rounded-2xl m-6 border border-gray-200 shadow-sm">
          <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mb-3">
            <FiAlertCircle className="w-6 h-6" />
          </div>
          <h2 className="text-base font-bold text-gray-900 mb-1">Zone Management View Error</h2>
          <p className="text-xs text-gray-500 max-w-md mb-4">
            {this.state.error?.message || "An unexpected error occurred while loading map or zone data."}
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition-colors shadow-sm"
          >
            Reload Page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const ZonesPage = () => {
  const { isLoaded, loadError } = useAppGoogleMaps({
    libraries: LIBRARIES,
  });

  const [zones, setZones] = useState([]);
  const [showOutOfZoneEditor, setShowOutOfZoneEditor] = useState(false);
  const [dispatchMode, setDispatchMode] = useState('zone');
  const [cities, setCities] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCityId, setSelectedCityId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [categorySearchQuery, setCategorySearchQuery] = useState("");
  const [mapCenter, setMapCenter] = useState(DEFAULT_CENTER);

  // Form state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingZone, setEditingZone] = useState(null);
  const [form, setForm] = useState({
    name: "",
    cityId: "",
    coordinates: null,
    allowedCategories: [],
    surgePricing: { enabled: false, multiplier: 1 },
    status: "active",
  });
  const [saving, setSaving] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawingPoints, setDrawingPoints] = useState([]);
  const [hoveredZoneId, setHoveredZoneId] = useState(null);

  // Quick Add City state
  const [showAddCityModal, setShowAddCityModal] = useState(false);
  const [newCityForm, setNewCityForm] = useState({ name: "", state: "Madhya Pradesh" });
  const [addingCity, setAddingCity] = useState(false);

  const mapRef = useRef(null);
  const editablePolygonRef = useRef(null);
  const pathListenersRef = useRef([]);

  // Fetch cities callback
  const fetchCities = useCallback(async () => {
    try {
      const cityRes = await cityService.getAll();
      if (cityRes?.success) {
        setCities((cityRes.cities || []).filter((c) => c.isActive !== false));
      }
    } catch (err) {
      console.error("Fetch cities error:", err);
    }
  }, []);

  // Fetch initial cities & categories
  useEffect(() => {
    const init = async () => {
      try {
        const [, catRes] = await Promise.all([
          fetchCities(),
          categoryService.getAll({ parentId: null }),
        ]);
        if (catRes?.success) setCategories(catRes.categories || []);
      } catch (err) {
        console.error("Init error:", err);
      }
    };
    init();
  }, [fetchCities]);

  // Handle Quick Add City
  const handleQuickAddCity = async (e) => {
    e?.preventDefault();
    const trimmedName = (newCityForm.name || "").trim();
    const trimmedState = (newCityForm.state || "").trim() || "Madhya Pradesh";
    if (!trimmedName) {
      toast.error("Please enter a city name");
      return;
    }

    // 1. Check if city already exists in loaded cities
    const existing = (cities || []).find(
      (c) => c.name?.toLowerCase().trim() === trimmedName.toLowerCase()
    );
    if (existing) {
      const existingId = existing.id || existing._id;
      toast.success(`City "${existing.name}" is already available and selected!`);
      handleFormCityChange(existingId);
      setSelectedCityId(existingId);
      setShowAddCityModal(false);
      setNewCityForm({ name: "", state: "Madhya Pradesh" });
      return;
    }

    try {
      setAddingCity(true);
      const res = await cityService.create({
        name: trimmedName,
        state: trimmedState,
        country: "India",
        isActive: true,
      });
      if (res?.success) {
        const cityName = res.city?.name || trimmedName;
        toast.success(
          res.alreadyExisted
            ? `City "${cityName}" is already available and selected!`
            : `City "${cityName}" added successfully!`
        );
        await fetchCities();
        const targetId = res.city?._id || res.city?.id;
        if (targetId) {
          handleFormCityChange(targetId);
          setSelectedCityId(targetId);
        }
        setShowAddCityModal(false);
        setNewCityForm({ name: "", state: "Madhya Pradesh" });
      } else {
        toast.error(res?.message || "Failed to add city");
      }
    } catch (err) {
      console.error("Quick add city error:", err);
      // Check if city exists now in list or error message indicates it
      const matchedCity = (cities || []).find(
        (c) => c.name?.toLowerCase().trim() === trimmedName.toLowerCase()
      );
      if (matchedCity) {
        const matchedId = matchedCity.id || matchedCity._id;
        toast.success(`City "${matchedCity.name}" is already available and selected!`);
        handleFormCityChange(matchedId);
        setSelectedCityId(matchedId);
        setShowAddCityModal(false);
        setNewCityForm({ name: "", state: "Madhya Pradesh" });
      } else {
        toast.error(err.response?.data?.message || err.message || "Failed to add city");
      }
    } finally {
      setAddingCity(false);
    }
  };

  const fetchZones = useCallback(async () => {
    try {
      setLoading(true);
      const params = {};
      if (selectedCityId) params.cityId = selectedCityId;
      const res = await zoneService.getAll(params);
      if (res?.success) setZones(res.zones || []);
    } catch (err) {
      console.error("Fetch zones error:", err);
      toast.error("Failed to load zones");
    } finally {
      setLoading(false);
    }
  }, [selectedCityId]);

  useEffect(() => {
    fetchZones();
  }, [fetchZones]);

  // Center map on selected city
  useEffect(() => {
    if (!selectedCityId || !isLoaded || !window.google?.maps?.Geocoder) return;
    const city = (cities || []).find((c) => (c.id || c._id) === selectedCityId);
    if (city) {
      const geocoder = new window.google.maps.Geocoder();
      geocoder.geocode({ address: `${city.name}, ${city.state || ""}, ${city.country || "India"}` }, (results, status) => {
        if (status === "OK" && results && results[0]) {
          const loc = results[0].geometry.location;
          const pos = { lat: loc.lat(), lng: loc.lng() };
          setMapCenter(pos);
          if (mapRef.current) {
            mapRef.current.panTo(pos);
            mapRef.current.setZoom(12);
          }
        }
      });
    }
  }, [selectedCityId, cities, isLoaded]);

  // Center on city when selected in form
  const handleFormCityChange = (cityId) => {
    setForm((p) => ({ ...p, cityId }));
    if (!cityId || !isLoaded || !window.google?.maps?.Geocoder) return;
    const city = (cities || []).find((c) => (c.id || c._id) === cityId);
    if (city) {
      const geocoder = new window.google.maps.Geocoder();
      geocoder.geocode({ address: `${city.name}, ${city.state || ""}, ${city.country || "India"}` }, (results, status) => {
        if (status === "OK" && results && results[0]) {
          const loc = results[0].geometry.location;
          const pos = { lat: loc.lat(), lng: loc.lng() };
          setMapCenter(pos);
          if (mapRef.current) {
            mapRef.current.panTo(pos);
            mapRef.current.setZoom(12);
          }
        }
      });
    }
  };

  // Convert GeoJSON [lng, lat] to Google Maps {lat, lng} for static polygon display
  const geoJsonToLatLng = useCallback((coords) => {
    if (!coords || !Array.isArray(coords) || !Array.isArray(coords[0])) return [];
    return coords[0]
      .filter((pt) => Array.isArray(pt) && pt.length >= 2 && !isNaN(pt[0]) && !isNaN(pt[1]))
      .map(([lng, lat]) => ({ lat: Number(lat), lng: Number(lng) }));
  }, []);

  // Convert GeoJSON to unique vertices for editable polygon (excludes trailing closing duplicate)
  const geoJsonToUniqueLatLng = useCallback((coords) => {
    if (!coords || !Array.isArray(coords) || !Array.isArray(coords[0])) return [];
    const pts = coords[0].filter((pt) => Array.isArray(pt) && pt.length >= 2 && !isNaN(pt[0]) && !isNaN(pt[1]));
    if (pts.length <= 1) return [];
    const isClosed = pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1];
    const unique = isClosed && pts.length > 3 ? pts.slice(0, -1) : pts;
    return unique.map(([lng, lat]) => ({ lat: Number(lat), lng: Number(lng) }));
  }, []);

  // Zoom map to fit a specific zone
  const handleSelectZone = useCallback((zone) => {
    const id = zone.id || zone._id;
    setHoveredZoneId(id);
    if (!mapRef.current || !zone?.coordinates?.coordinates?.[0]?.length) return;
    try {
      const bounds = new window.google.maps.LatLngBounds();
      zone.coordinates.coordinates[0].forEach(([lng, lat]) => {
        if (!isNaN(lat) && !isNaN(lng)) {
          bounds.extend({ lat: Number(lat), lng: Number(lng) });
        }
      });
      mapRef.current.fitBounds(bounds, { top: 60, right: 60, bottom: 60, left: 60 });
    } catch {
      // ignore
    }
  }, []);

  // Native map click-to-draw handler (Rock solid, 0 library dependencies!)
  const handleMapClick = (e) => {
    if (!isDrawing || !e || !e.latLng) return;
    const lat = typeof e.latLng.lat === "function" ? e.latLng.lat() : e.latLng.lat;
    const lng = typeof e.latLng.lng === "function" ? e.latLng.lng() : e.latLng.lng;
    if (isNaN(lat) || isNaN(lng)) return;
    setDrawingPoints((prev) => [...prev, { lat: Number(lat), lng: Number(lng) }]);
  };

  const finishDrawing = () => {
    if (drawingPoints.length < 3) {
      toast.error("Please click at least 3 points on the map to define a zone.");
      return;
    }
    const ring = drawingPoints.map((p) => [
      Number(p.lng.toFixed(6)),
      Number(p.lat.toFixed(6)),
    ]);
    ring.push([...ring[0]]); // Close the GeoJSON ring
    setForm((prev) => ({ ...prev, coordinates: [ring] }));
    setDrawingPoints([]);
    setIsDrawing(false);
    toast.success(`Zone boundary created with ${drawingPoints.length} vertices! Drag handles on map to fine-tune.`);
  };

  const undoLastDrawingPoint = () => {
    setDrawingPoints((prev) => prev.slice(0, -1));
  };

  const cancelDrawing = () => {
    setDrawingPoints([]);
    setIsDrawing(false);
    toast("Drawing cancelled", { icon: "↩️" });
  };

  // Quick preset: instantly place a 4-point rectangular zone around map center
  const handleCreateQuickBox = () => {
    const center = mapRef.current?.getCenter();
    const lat = center ? (typeof center.lat === "function" ? center.lat() : center.lat) : (mapCenter.lat || 28.6139);
    const lng = center ? (typeof center.lng === "function" ? center.lng() : center.lng) : (mapCenter.lng || 77.209);
    const dLat = 0.025; // ~2.5km box
    const dLng = 0.025;
    const ring = [
      [Number((lng - dLng).toFixed(6)), Number((lat - dLat).toFixed(6))],
      [Number((lng + dLng).toFixed(6)), Number((lat - dLat).toFixed(6))],
      [Number((lng + dLng).toFixed(6)), Number((lat + dLat).toFixed(6))],
      [Number((lng - dLng).toFixed(6)), Number((lat + dLat).toFixed(6))],
      [Number((lng - dLng).toFixed(6)), Number((lat - dLat).toFixed(6))],
    ];
    setForm((prev) => ({ ...prev, coordinates: [ring] }));
    setDrawingPoints([]);
    setIsDrawing(false);
    toast.success("Zone box placed! Drag any corner on the map to resize.");
  };

  const syncTimerRef = useRef(null);

  // Listen to vertex drag/edit events on the preview polygon
  const onEditablePolygonLoad = useCallback((polygon) => {
    editablePolygonRef.current = polygon;
    const path = polygon.getPath();

    // Clean previous listeners
    pathListenersRef.current.forEach((l) => window.google?.maps?.event?.removeListener(l));
    pathListenersRef.current = [];

    const syncCoords = () => {
      try {
        const p = polygon.getPath();
        const updated = [];
        for (let i = 0; i < p.getLength(); i++) {
          const pt = p.getAt(i);
          updated.push([Number(pt.lng().toFixed(6)), Number(pt.lat().toFixed(6))]);
        }
        if (updated.length >= 3) {
          const first = updated[0];
          const last = updated[updated.length - 1];
          const isClosed = first[0] === last[0] && first[1] === last[1];
          const ring = isClosed ? updated : [...updated, [...first]];
          setForm((prev) => ({ ...prev, coordinates: [ring] }));
        }
      } catch (err) {
        console.error("Error syncing editable polygon coords:", err);
      }
    };

    const debouncedSync = () => {
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
      syncTimerRef.current = setTimeout(syncCoords, 100);
    };

    if (path) {
      pathListenersRef.current = [
        path.addListener("set_at", debouncedSync),
        path.addListener("insert_at", debouncedSync),
        path.addListener("remove_at", debouncedSync),
      ];
    }
  }, []);

  const handleOpenCreate = () => {
    setEditingZone(null);
    setForm({
      name: "",
      cityId: selectedCityId || "",
      coordinates: null,
      allowedCategories: [],
      surgePricing: { enabled: false, multiplier: 1 },
      status: "active",
    });
    setDrawingPoints([]);
    setCategorySearchQuery("");
    setIsDrawing(false);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (zone) => {
    setEditingZone(zone);
    const cityId = typeof zone.cityId === "object" ? zone.cityId?._id || zone.cityId?.id : zone.cityId;
    setForm({
      name: zone.name || "",
      cityId: cityId || "",
      coordinates: zone.coordinates?.coordinates || null,
      allowedCategories: (zone.allowedCategories || []).map((c) =>
        typeof c === "object" ? c?._id || c?.id : c
      ).filter(Boolean),
      surgePricing: zone.surgePricing || { enabled: false, multiplier: 1 },
      status: zone.status || "active",
    });
    setDrawingPoints([]);
    setCategorySearchQuery("");
    setIsDrawing(false);
    setIsFormOpen(true);
    handleSelectZone(zone);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setEditingZone(null);
    setIsDrawing(false);
    setDrawingPoints([]);
    pathListenersRef.current.forEach((l) => window.google?.maps?.event?.removeListener(l));
    pathListenersRef.current = [];
  };

  const startDrawing = () => {
    if (!form.cityId) {
      toast("Please select an operating city first to focus the map.", { icon: "ℹ️" });
    }
    setForm((prev) => ({ ...prev, coordinates: null }));
    setDrawingPoints([]);
    setIsDrawing(true);
    toast("Drawing mode active: Click anywhere on the map to add corner points.", { icon: "📍" });
  };

  const handleSave = async () => {
    if (!form.name.trim()) return toast.error("Zone name is required");
    if (!form.cityId) return toast.error("Please select an operating city");
    if (!form.coordinates || !Array.isArray(form.coordinates[0]) || form.coordinates[0].length < 4) {
      return toast.error("Please draw a zone boundary on the map (at least 3 vertices)");
    }

    try {
      setSaving(true);
      const payload = {
        name: form.name.trim(),
        cityId: form.cityId,
        coordinates: form.coordinates,
        allowedCategories: form.allowedCategories || [],
        surgePricing: form.surgePricing || { enabled: false, multiplier: 1 },
        status: form.status || "active",
      };

      if (editingZone) {
        const id = editingZone.id || editingZone._id;
        const res = await zoneService.update(id, payload);
        if (res?.success) {
          toast.success("Zone updated successfully");
          handleCloseForm();
          fetchZones();
        } else {
          toast.error(res?.message || "Failed to update zone");
        }
      } else {
        const res = await zoneService.create(payload);
        if (res?.success) {
          toast.success("Zone created successfully");
          handleCloseForm();
          fetchZones();
        } else {
          toast.error(res?.message || "Failed to create zone");
        }
      }
    } catch (err) {
      console.error("Save zone error:", err);
      const errorMsg = err?.response?.data?.errors?.[0]?.msg || err?.response?.data?.message || "Failed to save zone";
      toast.error(errorMsg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (zone) => {
    if (!window.confirm(`Delete zone "${zone.name}"? This cannot be undone.`)) return;
    try {
      const id = zone.id || zone._id;
      const res = await zoneService.delete(id);
      if (res?.success) {
        toast.success("Zone deleted");
        fetchZones();
      }
    } catch (err) {
      toast.error("Failed to delete zone");
    }
  };

  const handleToggleStatus = async (zone) => {
    try {
      const id = zone.id || zone._id;
      const res = await zoneService.toggleStatus(id);
      if (res?.success) {
        toast.success(res.message || "Zone status updated");
        fetchZones();
      }
    } catch (err) {
      toast.error("Failed to toggle zone status");
    }
  };

  const handleCategoryToggle = (catId) => {
    setForm((prev) => {
      const current = prev.allowedCategories || [];
      const list = current.includes(catId)
        ? current.filter((c) => c !== catId)
        : [...current, catId];
      return { ...prev, allowedCategories: list };
    });
  };

  const handleSelectAllCategories = () => {
    const allIds = filteredCategories.map((c) => c.id || c._id);
    setForm((prev) => ({
      ...prev,
      allowedCategories: Array.from(new Set([...(prev.allowedCategories || []), ...allIds])),
    }));
  };

  const handleClearCategories = () => {
    setForm((prev) => ({ ...prev, allowedCategories: [] }));
  };

  // Filtered categories for the drawer checklist
  const filteredCategories = useMemo(() => {
    if (!categorySearchQuery.trim()) return categories;
    const q = categorySearchQuery.toLowerCase();
    return (categories || []).filter((c) => (c.title || "").toLowerCase().includes(q));
  }, [categories, categorySearchQuery]);

  // Filtered zones for the left sidebar
  const filteredZones = useMemo(() => {
    if (!searchQuery.trim()) return zones;
    const q = searchQuery.toLowerCase();
    return (zones || []).filter((z) => (z.name || "").toLowerCase().includes(q));
  }, [zones, searchQuery]);

  const activeCount = useMemo(() => (zones || []).filter((z) => z.status === "active").length, [zones]);

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center h-96 p-6 text-center">
        <FiAlertCircle className="w-12 h-12 text-rose-500 mb-3" />
        <h3 className="text-base font-bold text-gray-900">Google Maps Failed to Load</h3>
        <p className="text-xs text-gray-500 mt-1 max-w-md">
          Please check that VITE_GOOGLE_MAPS_API_KEY is properly configured with Maps JavaScript API.
        </p>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        <span className="ml-3 text-sm text-gray-600 font-medium">Loading Google Maps...</span>
      </div>
    );
  }

  const hasCoordinates = Array.isArray(form.coordinates?.[0]) && form.coordinates[0].length >= 4;

  return (
    <div className="h-[calc(100vh-80px)] flex flex-col bg-gray-50">
      {/* Top Header Bar */}
      <div className="bg-white border-b border-gray-200 px-5 py-3 flex items-center justify-between shrink-0 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
            <FiMap className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-gray-900">Admin Zone Management</h1>
              <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                {zones.length} {zones.length === 1 ? "Zone" : "Zones"}
              </span>
              <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                {activeCount} Active
              </span>
            </div>
            <p className="text-[11px] text-gray-500">
              Draw geographic operational zones, configure surge pricing, and map allowed services
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {/* City Filter & Add City */}
          <div className="flex items-center gap-1.5">
            <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1">
              <FiFilter className="w-3.5 h-3.5 text-gray-500" />
              <select
                value={selectedCityId}
                onChange={(e) => setSelectedCityId(e.target.value)}
                className="text-xs bg-transparent border-none focus:outline-none font-medium text-gray-700 cursor-pointer"
              >
                <option value="">All Operating Cities</option>
                {(cities || []).map((city) => (
                  <option key={city.id || city._id} value={city.id || city._id}>
                    {city.name} ({city.state || "India"})
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => setShowAddCityModal(true)}
              title="Add New Operating City"
              className="px-2.5 py-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg border border-blue-200 transition-colors flex items-center gap-1 shadow-sm"
            >
              <FiPlus className="w-3.5 h-3.5" />
              <span>City</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowOutOfZoneEditor(true)}
            title="Edit the page customers see outside every zone"
            className="px-2.5 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-50 rounded-lg border border-amber-200 transition-colors flex items-center gap-1 shadow-sm"
          >
            <FiMap className="w-3.5 h-3.5" />
            <span>Out-of-zone page</span>
          </button>

          <button
            onClick={fetchZones}
            title="Refresh Zones"
            className="p-2 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200"
          >
            <FiRefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>

          <button
            onClick={handleOpenCreate}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all"
          >
            <FiPlus className="w-4 h-4" />
            Add Zone
          </button>
        </div>
      </div>

      {/* Which rule sends bookings: zones, or distance. Only one applies at a time. */}
      <div className="bg-white border-b border-gray-200 px-5 py-2 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <p className="text-[11px] text-gray-600">
          <span className="font-bold text-gray-800">Booking dispatch:</span>{' '}
          {dispatchMode === 'distance'
            ? 'by distance. Zones are saved but NOT used right now - nothing is blocked or limited by them.'
            : 'by zone. Bookings go to professionals in the customer\'s zone; addresses outside every zone are refused.'}
        </p>
        <DispatchModeSwitch compact onChanged={setDispatchMode} onLoaded={setDispatchMode} />
      </div>

      {/* Main Container: Left Zone List + Right Fullscreen Map */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Side: Zone List */}
        <div className="w-80 xl:w-96 border-r border-gray-200 bg-white flex flex-col shrink-0">
          {/* Zone Search */}
          <div className="p-3 border-b border-gray-100 bg-gray-50/70">
            <div className="relative">
              <FiSearch className="absolute left-3 top-2.5 w-3.5 h-3.5 text-gray-400" />
              <input
                type="text"
                placeholder="Search zones..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Zones Scrollable List */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-4 space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="animate-pulse p-3.5 bg-gray-50 rounded-xl border border-gray-100">
                    <div className="h-4 bg-gray-200 rounded w-2/3 mb-2" />
                    <div className="h-3 bg-gray-200 rounded w-1/3 mb-3" />
                    <div className="h-5 bg-gray-200 rounded w-1/2" />
                  </div>
                ))}
              </div>
            ) : filteredZones.length === 0 ? (
              <div className="p-8 text-center">
                <div className="w-12 h-12 rounded-2xl bg-gray-100 text-gray-400 flex items-center justify-center mx-auto mb-3">
                  <FiMap className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-bold text-gray-800">No zones found</h3>
                <p className="text-xs text-gray-400 mt-1 max-w-[200px] mx-auto">
                  {selectedCityId ? "No zones created for this city yet." : "Click '+ Add Zone' to draw your first boundary."}
                </p>
                <button
                  onClick={handleOpenCreate}
                  className="mt-3 px-3 py-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg text-xs font-semibold"
                >
                  Create Zone
                </button>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {filteredZones.map((zone, idx) => {
                  const id = zone.id || zone._id;
                  const cityName = typeof zone.cityId === "object" ? zone.cityId?.name : "";
                  const catCount = (zone.allowedCategories || []).length;
                  const color = ZONE_COLORS[idx % ZONE_COLORS.length];
                  const isHovered = hoveredZoneId === id;
                  const isEditingThis = editingZone && (editingZone.id || editingZone._id) === id;

                  return (
                    <div
                      key={id}
                      onClick={() => handleSelectZone(zone)}
                      onMouseEnter={() => setHoveredZoneId(id)}
                      onMouseLeave={() => setHoveredZoneId(null)}
                      className={`p-3.5 transition-all cursor-pointer border-l-4 ${
                        isEditingThis
                          ? "bg-blue-50/80 border-blue-600 shadow-sm"
                          : isHovered
                          ? "bg-gray-50 border-gray-400"
                          : "hover:bg-gray-50/60 border-transparent"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm"
                              style={{ backgroundColor: color }}
                            />
                            <h4 className="text-xs font-bold text-gray-900 truncate">{zone.name}</h4>
                          </div>

                          {cityName && (
                            <p className="text-[11px] text-gray-500 mt-0.5 ml-4 flex items-center gap-1">
                              <span className="truncate">{cityName}</span>
                            </p>
                          )}

                          {/* Badges */}
                          <div className="flex items-center gap-1.5 mt-2 flex-wrap ml-4">
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                zone.status === "active"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : "bg-gray-100 text-gray-600"
                              }`}
                            >
                              {zone.status === "active" ? "Active" : "Inactive"}
                            </span>

                            <span className="text-[10px] font-semibold text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                              <FiLayers className="w-2.5 h-2.5" />
                              {catCount} {catCount === 1 ? "Service" : "Services"}
                            </span>

                            {zone.workerCount !== undefined && (
                              <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full flex items-center gap-1 border border-indigo-100">
                                <FiUsers className="w-2.5 h-2.5" />
                                {zone.workerCount} {zone.workerCount === 1 ? "Worker" : "Workers"}
                              </span>
                            )}

                            {zone.surgePricing?.enabled && (
                              <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                                <FiZap className="w-2.5 h-2.5 text-amber-600" />
                                {zone.surgePricing.multiplier}x
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1 shrink-0">
                          {/* Toggle status */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleStatus(zone);
                            }}
                            title={zone.status === "active" ? "Pause Zone" : "Activate Zone"}
                            className="p-1.5 text-gray-400 hover:text-gray-700 rounded-md hover:bg-gray-100"
                          >
                            <span
                              className={`w-2 h-2 rounded-full inline-block ${
                                zone.status === "active" ? "bg-emerald-500" : "bg-gray-400"
                              }`}
                            />
                          </button>

                          {/* Edit button */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenEdit(zone);
                            }}
                            title="Edit Zone"
                            className="p-1.5 text-gray-400 hover:text-blue-600 rounded-md hover:bg-blue-50"
                          >
                            <FiEdit2 className="w-3.5 h-3.5" />
                          </button>

                          {/* Delete button */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(zone);
                            }}
                            title="Delete Zone"
                            className="p-1.5 text-gray-400 hover:text-rose-600 rounded-md hover:bg-rose-50"
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
          </div>
        </div>

        {/* Right Side: Map */}
        <div className="flex-1 relative overflow-hidden bg-slate-100">
          <GoogleMap
            mapContainerStyle={MAP_CONTAINER}
            center={mapCenter}
            zoom={DEFAULT_ZOOM}
            onClick={handleMapClick}
            onLoad={(map) => {
              mapRef.current = map;
            }}
            options={{
              fullscreenControl: true,
              streetViewControl: false,
              mapTypeControl: true,
              mapTypeControlOptions: { position: 3 },
              draggableCursor: isDrawing ? "crosshair" : undefined,
            }}
          >
            {/* Existing Zone Polygons (hide polygon currently being edited to avoid duplicate rendering) */}
            {(zones || [])
              .filter(
                (z) =>
                  !isFormOpen ||
                  !editingZone ||
                  (z.id || z._id) !== (editingZone.id || editingZone._id)
              )
              .map((zone, idx) => {
                const id = zone.id || zone._id;
                if (!zone.coordinates?.coordinates) return null;
                const color = ZONE_COLORS[idx % ZONE_COLORS.length];
                const isHovered = hoveredZoneId === id;

                return (
                  <Polygon
                    key={id}
                    paths={geoJsonToLatLng(zone.coordinates.coordinates)}
                    options={{
                      fillColor: color,
                      fillOpacity: isHovered ? 0.45 : 0.22,
                      strokeColor: color,
                      strokeOpacity: 0.95,
                      strokeWeight: isHovered ? 3.5 : 2,
                      clickable: !isDrawing,
                    }}
                    onMouseOver={() => !isDrawing && setHoveredZoneId(id)}
                    onMouseOut={() => !isDrawing && setHoveredZoneId(null)}
                    onClick={() => !isDrawing && handleOpenEdit(zone)}
                  />
                );
              })}

            {/* Editable Form Preview Polygon */}
            {isFormOpen && hasCoordinates && !isDrawing && (
              <Polygon
                paths={geoJsonToUniqueLatLng(form.coordinates)}
                onLoad={onEditablePolygonLoad}
                options={{
                  fillColor: "#2563EB",
                  fillOpacity: 0.35,
                  strokeColor: "#1D4ED8",
                  strokeOpacity: 1,
                  strokeWeight: 3,
                  editable: true,
                  draggable: false,
                  zIndex: 10,
                }}
              />
            )}

            {/* Live Interactive Polyline while drawing */}
            {isDrawing && drawingPoints.length >= 2 && (
              <Polyline
                paths={drawingPoints}
                options={{
                  strokeColor: "#2563EB",
                  strokeOpacity: 0.95,
                  strokeWeight: 3,
                  zIndex: 25,
                }}
              />
            )}

            {/* Live Polygon fill preview when >= 3 points are placed */}
            {isDrawing && drawingPoints.length >= 3 && (
              <Polygon
                paths={drawingPoints}
                options={{
                  fillColor: "#2563EB",
                  fillOpacity: 0.25,
                  strokeColor: "#1D4ED8",
                  strokeOpacity: 0.9,
                  strokeWeight: 2,
                  zIndex: 24,
                }}
              />
            )}

            {/* Vertex Markers while drawing */}
            {isDrawing &&
              drawingPoints.map((pt, idx) => {
                const isFirst = idx === 0;
                const canFinish = drawingPoints.length >= 3;
                return (
                  <Marker
                    key={`draw-pt-${idx}-${pt.lat}-${pt.lng}`}
                    position={pt}
                    title={isFirst && canFinish ? "Click here to close & finish zone" : `Point ${idx + 1}`}
                    label={{
                      text: String(idx + 1),
                      color: "#FFFFFF",
                      fontWeight: "bold",
                      fontSize: "11px",
                    }}
                    icon={
                      typeof window !== "undefined" && window.google?.maps?.SymbolPath?.CIRCLE !== undefined
                        ? {
                            path: window.google.maps.SymbolPath.CIRCLE,
                            scale: 13,
                            fillColor: isFirst && canFinish ? "#10B981" : "#2563EB",
                            fillOpacity: 1,
                            strokeColor: "#FFFFFF",
                            strokeWeight: 2.5,
                          }
                        : undefined
                    }
                    onClick={() => {
                      if (isFirst && canFinish) {
                        finishDrawing();
                      }
                    }}
                  />
                );
              })}

          </GoogleMap>

        </div>
      </div>

      {/* Floating Drawing Mode Toolbar (Fixed at Top, z-50, always interactive) */}
      {isDrawing && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 bg-slate-900/95 backdrop-blur-md text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-4 z-50 border border-slate-700/80 animate-in fade-in slide-in-from-top-4">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
            </span>
            <div className="text-left">
              <p className="text-xs font-bold text-white flex items-center gap-1.5">
                Drawing Zone Boundary
                <span className="text-[10px] font-semibold bg-blue-600/70 px-2 py-0.5 rounded-full text-blue-200">
                  {drawingPoints.length} {drawingPoints.length === 1 ? "point" : "points"}
                </span>
              </p>
              <p className="text-[11px] text-slate-300">
                {drawingPoints.length === 0
                  ? "Click anywhere on the map to place Point 1"
                  : drawingPoints.length === 1
                  ? "Click on map to place Point 2"
                  : drawingPoints.length === 2
                  ? "Click to place Point 3 (minimum 3 needed to form an area)"
                  : "Click 'Finish Zone' or click Point 1 (green circle) to complete"}
              </p>
            </div>
          </div>

          <div className="h-6 w-px bg-slate-700 mx-1" />

          <div className="flex items-center gap-2">
            {drawingPoints.length === 0 && (
              <button
                type="button"
                onClick={handleCreateQuickBox}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
                title="Create a quick 3km square zone around map center"
              >
                <FiZap className="w-3.5 h-3.5" />
                Quick Box
              </button>
            )}

            {drawingPoints.length >= 3 && (
              <button
                type="button"
                onClick={finishDrawing}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white rounded-lg text-xs font-bold transition-all shadow-md flex items-center gap-1.5 animate-pulse"
              >
                <FiCheck className="w-4 h-4" />
                Finish Zone
              </button>
            )}

            {drawingPoints.length > 0 && (
              <button
                type="button"
                onClick={undoLastDrawingPoint}
                className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-white rounded-lg text-xs font-semibold transition-all border border-slate-700 flex items-center gap-1"
              >
                <FiRotateCcw className="w-3.5 h-3.5" />
                Undo
              </button>
            )}

            <button
              type="button"
              onClick={cancelDrawing}
              className="px-2.5 py-1.5 bg-rose-600/80 hover:bg-rose-600 active:scale-95 text-white rounded-lg text-xs font-semibold transition-all flex items-center gap-1"
            >
              <FiX className="w-3.5 h-3.5" />
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Create / Edit Slide-over Drawer (Only shown when NOT actively drawing to avoid blocking map) */}
      {isFormOpen && !isDrawing && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <ModalLock />
          <div className="absolute inset-0 bg-black/30 backdrop-blur-[1px]" onClick={handleCloseForm} />
          <div className="relative w-full max-w-md bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
            {/* Drawer Header */}
            <div className="border-b border-gray-200 px-5 py-4 flex items-center justify-between shrink-0 bg-gray-50/50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                  <FiMap className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-gray-900">
                    {editingZone ? "Edit Zone" : "Create Operational Zone"}
                  </h2>
                  <p className="text-[11px] text-gray-500">
                    {editingZone ? `Editing "${editingZone.name}"` : "Set boundary, city and operational rules"}
                  </p>
                </div>
              </div>
              <button
                onClick={handleCloseForm}
                className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              >
                <FiX className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {/* Zone Name */}
              <div>
                <label className="block text-[11px] font-bold text-gray-700 uppercase tracking-wider mb-1">
                  Zone Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. South Delhi - Zone A"
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              {/* City Selection */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[11px] font-bold text-gray-700 uppercase tracking-wider">
                    Operating City <span className="text-red-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowAddCityModal(true)}
                    className="text-[11px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 hover:underline"
                    title="Add a new city if not listed"
                  >
                    <FiPlus className="w-3 h-3" /> Add City
                  </button>
                </div>
                <select
                  value={form.cityId}
                  onChange={(e) => handleFormCityChange(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none font-medium"
                >
                  <option value="">Select city...</option>
                  {(cities || []).map((city) => (
                    <option key={city.id || city._id} value={city.id || city._id}>
                      {city.name} ({city.state || "India"})
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[10.5px] text-gray-500 leading-normal">
                  💡 A Zone is an operational area/boundary inside this city (e.g. Vijay Nagar in Indore). Selecting a city automatically centers Google Maps on it.
                </p>
              </div>

              {/* Zone Boundary Tool */}
              <div className="p-3.5 bg-blue-50/60 border border-blue-100 rounded-xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-blue-900 uppercase tracking-wider flex items-center gap-1.5">
                    <FiMap className="w-3.5 h-3.5 text-blue-600" />
                    Geographic Boundary <span className="text-red-500">*</span>
                  </label>
                  {hasCoordinates && (
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <FiCheck className="w-3 h-3" />
                      {form.coordinates[0].length - 1} Vertices Set
                    </span>
                  )}
                </div>

                {hasCoordinates ? (
                  <div className="space-y-2">
                    <p className="text-[11px] text-gray-600">
                      Boundary defined. You can drag corner handles directly on the map to adjust, or use the actions below:
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={startDrawing}
                        className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5"
                      >
                        <FiEdit2 className="w-3.5 h-3.5" />
                        Redraw on Map
                      </button>
                      <button
                        type="button"
                        onClick={() => setForm((p) => ({ ...p, coordinates: null }))}
                        className="px-3 py-2 border border-rose-200 text-rose-600 hover:bg-rose-50 rounded-lg text-xs font-semibold transition-colors"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-[11px] text-gray-500">
                      Click below to activate interactive drawing on the map, or create a quick rectangular zone.
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={startDrawing}
                        className="py-2.5 border-2 border-dashed border-blue-400 bg-white hover:bg-blue-50/80 rounded-xl text-xs font-bold text-blue-700 flex items-center justify-center gap-1.5 transition-all shadow-sm active:scale-95"
                      >
                        <FiMap className="w-4 h-4 text-blue-600" />
                        Draw on Map
                      </button>
                      <button
                        type="button"
                        onClick={handleCreateQuickBox}
                        className="py-2.5 border border-indigo-200 bg-indigo-50/70 hover:bg-indigo-100/80 rounded-xl text-xs font-bold text-indigo-700 flex items-center justify-center gap-1.5 transition-all shadow-sm active:scale-95"
                      >
                        <FiZap className="w-4 h-4 text-indigo-600" />
                        Quick Box
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Allowed Categories */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[11px] font-bold text-gray-700 uppercase tracking-wider">
                    Allowed Services ({(form.allowedCategories || []).length} selected)
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSelectAllCategories}
                      className="text-[10px] text-blue-600 font-bold hover:underline"
                    >
                      Select All
                    </button>
                    <span className="text-gray-300">|</span>
                    <button
                      type="button"
                      onClick={handleClearCategories}
                      className="text-[10px] text-gray-500 font-bold hover:underline"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                {/* Category Search Filter */}
                <input
                  type="text"
                  placeholder="Filter categories..."
                  value={categorySearchQuery}
                  onChange={(e) => setCategorySearchQuery(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg mb-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />

                <div className="max-h-44 overflow-y-auto border border-gray-200 rounded-xl divide-y divide-gray-100 bg-gray-50/40">
                  {filteredCategories.length === 0 ? (
                    <div className="p-3 text-xs text-gray-400 text-center">No categories found</div>
                  ) : (
                    filteredCategories.map((cat) => {
                      const catId = cat.id || cat._id;
                      const isChecked = (form.allowedCategories || []).includes(catId);
                      return (
                        <label
                          key={catId}
                          className={`flex items-center gap-2.5 px-3 py-2 hover:bg-white cursor-pointer transition-colors ${
                            isChecked ? "bg-blue-50/40 font-semibold" : ""
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleCategoryToggle(catId)}
                            className="w-3.5 h-3.5 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                          />
                          <span className="text-xs text-gray-800">{cat.title}</span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Surge Pricing Card */}
              <div className="border border-amber-200 bg-amber-50/30 rounded-xl p-3.5 space-y-3">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(form.surgePricing?.enabled)}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        surgePricing: { ...(p.surgePricing || {}), enabled: e.target.checked },
                      }))
                    }
                    className="w-4 h-4 text-amber-600 rounded border-gray-300 focus:ring-amber-500 mt-0.5"
                  />
                  <div>
                    <span className="text-xs font-bold text-gray-900 flex items-center gap-1">
                      <FiZap className="w-3.5 h-3.5 text-amber-500" />
                      Dynamic Surge Pricing
                    </span>
                    <span className="text-[11px] text-gray-500 block mt-0.5">
                      Automatically apply a price multiplier for high-demand bookings in this zone
                    </span>
                  </div>
                </label>

                {form.surgePricing?.enabled && (
                  <div className="pt-2 border-t border-amber-100 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] text-gray-700 font-bold">
                        Multiplier: <span className="text-amber-700 text-xs">{form.surgePricing?.multiplier || 1}x</span>
                      </label>
                      {/* Presets */}
                      <div className="flex items-center gap-1">
                        {SURGE_PRESETS.map((val) => (
                          <button
                            key={val}
                            type="button"
                            onClick={() =>
                              setForm((p) => ({
                                ...p,
                                surgePricing: { ...(p.surgePricing || {}), multiplier: val },
                              }))
                            }
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              form.surgePricing?.multiplier === val
                                ? "bg-amber-600 text-white"
                                : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50"
                            }`}
                          >
                            {val}x
                          </button>
                        ))}
                      </div>
                    </div>

                    <input
                      type="range"
                      min="1.0"
                      max="4.0"
                      step="0.1"
                      value={form.surgePricing?.multiplier || 1}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          surgePricing: {
                            ...(p.surgePricing || {}),
                            multiplier: parseFloat(e.target.value),
                          },
                        }))
                      }
                      className="w-full accent-amber-600 cursor-pointer"
                    />
                  </div>
                )}
              </div>

              {/* Status */}
              <div>
                <label className="block text-[11px] font-bold text-gray-700 uppercase tracking-wider mb-1">
                  Status
                </label>
                <select
                  value={form.status || "active"}
                  onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none font-semibold"
                >
                  <option value="active">Active (Serving Bookings)</option>
                  <option value="inactive">Inactive (Paused)</option>
                </select>
              </div>
            </div>

            {/* Drawer Footer */}
            <div className="border-t border-gray-200 px-5 py-3.5 flex items-center gap-2.5 shrink-0 bg-gray-50/70">
              <button
                type="button"
                onClick={handleCloseForm}
                disabled={saving}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-xs font-semibold hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition-all"
              >
                <FiSave className="w-3.5 h-3.5" />
                {saving ? "Saving..." : editingZone ? "Update Zone" : "Create Zone"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Add City Modal */}
      {showAddCityModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
          <ModalLock />
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-sm overflow-hidden p-5">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                  <FiMap className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900">Add Operating City</h3>
                  <p className="text-[11px] text-gray-500">e.g. Indore, Ratlam, Ujjain, Bhopal</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddCityModal(false)}
                className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <FiX className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleQuickAddCity} className="mt-4 space-y-3.5">
              <div>
                <label className="block text-[11px] font-bold text-gray-700 uppercase tracking-wider mb-1">
                  City Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Indore, Ratlam, Ujjain"
                  value={newCityForm.name}
                  onChange={(e) => setNewCityForm((p) => ({ ...p, name: e.target.value }))}
                  required
                  autoFocus
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none font-medium"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-700 uppercase tracking-wider mb-1">
                  State
                </label>
                <input
                  type="text"
                  placeholder="e.g. Madhya Pradesh"
                  value={newCityForm.state}
                  onChange={(e) => setNewCityForm((p) => ({ ...p, state: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none font-medium"
                />
              </div>

              <div className="p-2.5 bg-blue-50/70 rounded-xl border border-blue-100 text-[11px] text-blue-900 leading-relaxed">
                📍 <strong>Tip:</strong> After adding a city, it will be automatically selected and Google Maps will center on it so you can draw your zone.
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowAddCityModal(false)}
                  disabled={addingCity}
                  className="px-3.5 py-1.5 rounded-lg border border-gray-300 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addingCity || !newCityForm.name.trim()}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
                >
                  {addingCity ? "Adding..." : "Add City"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showOutOfZoneEditor && <OutOfZonePageModal onClose={() => setShowOutOfZoneEditor(false)} />}
    </div>
  );
};

const ExportedZonesPage = () => (
  <ZonesErrorBoundary>
    <ZonesPage />
  </ZonesErrorBoundary>
);

export default ExportedZonesPage;

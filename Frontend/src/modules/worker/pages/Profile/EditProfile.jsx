import React, { useState, useEffect, useLayoutEffect } from 'react';
import SkillTreePicker from '../../components/SkillTreePicker';
import { useNavigate } from 'react-router-dom';
import { FiSave, FiUser, FiBriefcase, FiPhone, FiMail, FiMapPin, FiChevronDown, FiCamera, FiUpload, FiFileText, FiCheckCircle, FiEye, FiX, FiShield } from 'react-icons/fi';
import { workerTheme as themeColors } from '../../../../theme';
import Header from '../../components/layout/Header';
import { workerAuthService } from '../../../../services/authService';
import api from '../../../../services/api';
import AddressSelectionModal from '../../../user/pages/Checkout/components/AddressSelectionModal';
import { toast } from 'react-hot-toast';
import { z } from "zod";
import flutterBridge from '../../../../utils/flutterBridge';
import useBookingConfig from '../../../../hooks/useBookingConfig';
import { useRegistrationConfig } from '../../utils/registrationConfig';
import ModalLock from '../../../../components/common/ModalLock';

// Zod schema
const workerProfileSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  businessName: z.string().optional(),
  phone: z.string().regex(/^\+?[0-9]{10,13}$/, "Invalid phone number"),
  alternatePhone: z.string().regex(/^\+?[0-9]{10,13}$/, "Invalid alternate phone number").optional().or(z.literal('')),
  email: z.string().email("Invalid email address").optional().or(z.literal('')),
  address: z.custom((val) => {
    return (typeof val === 'string' && val.trim().length > 0) ||
      (typeof val === 'object' && val !== null && (val.fullAddress || val.addressLine1));
  }, "Address is required"),
  serviceCategories: z.any().optional(), // Relaxed validation for debugging
});

const EditProfile = () => {
  const navigate = useNavigate();
  // The admin decides whether partners may set a radius, and the smallest and largest they may choose
  const { isWorkerServiceRadiusEnabled, workerServiceRadiusMinKm, workerServiceRadiusMaxKm } = useBookingConfig();
  // Which documents the admin asks for, and what they are called
  const { core } = useRegistrationConfig();
  const requiredMark = (cfg) => (cfg.required ? <span className="text-red-500">*</span> : <span className="text-gray-400 font-normal text-xs">(optional)</span>);

  // Helper function to convert hex to rgba
  const hexToRgba = (hex, alpha) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  const [formData, setFormData] = useState({
    name: '',
    businessName: '',
    phone: '',
    alternatePhone: '',
    email: '',
    address: '',
    serviceCategories: [], // Array for multiple selection
    profilePhoto: '', // URL
    aadharDocument: '', // URL (Aadhar Front)
    aadharBackDocument: '', // URL (Aadhar Back)
    panDocument: '', // URL (PAN Card)
    otherDocuments: [], // URLs
    serviceRange: '', // optional: empty = use the platform radius
    isScrapOpted: false,
  });

  const [photoPreview, setPhotoPreview] = useState(null);
  const [photoFile, setPhotoFile] = useState(null);

  const [aadharFile, setAadharFile] = useState(null);
  const [aadharPreview, setAadharPreview] = useState(null);

  const [aadharBackFile, setAadharBackFile] = useState(null);
  const [aadharBackPreview, setAadharBackPreview] = useState(null);

  const [panFile, setPanFile] = useState(null);
  const [panPreview, setPanPreview] = useState(null);

  const [previewModalDoc, setPreviewModalDoc] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [isAddressModalOpen, setIsAddressModalOpen] = useState(false);

  // Load service categories from admin config (dynamic)
  const [errors, setErrors] = useState({});
  const [isFlutter, setIsFlutter] = useState(flutterBridge.isFlutter);

  // Sync flutter bridge state
  useEffect(() => {
    flutterBridge.waitForFlutter().then(ready => {
      setIsFlutter(ready);
    });
  }, []);

  const handleNativeCamera = async (target = 'photo') => {
    const file = await flutterBridge.openCamera();
    if (file) {
      if (target === 'photo') {
        setPhotoFile(file);
        setPhotoPreview(URL.createObjectURL(file));
      } else if (target === 'aadhar') {
        setAadharFile(file);
        setAadharPreview(URL.createObjectURL(file));
      } else if (target === 'aadharBack') {
        setAadharBackFile(file);
        setAadharBackPreview(URL.createObjectURL(file));
      } else if (target === 'pan') {
        setPanFile(file);
        setPanPreview(URL.createObjectURL(file));
      }
      flutterBridge.hapticFeedback('success');
    }
  };

  const handleImageClick = (target = 'photo') => {
    if (isFlutter) {
      handleNativeCamera(target);
    } else {
      if (target === 'photo') {
        document.getElementById('photo-upload')?.click();
      } else if (target === 'aadhar') {
        document.getElementById('aadhar-upload')?.click();
      } else if (target === 'aadharBack') {
        document.getElementById('aadhar-back-upload')?.click();
      } else if (target === 'pan') {
        document.getElementById('pan-upload')?.click();
      }
    }
  };

  const handleDocChange = (target, e) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error('File size should be less than 5MB');
        return;
      }
      const previewUrl = URL.createObjectURL(file);
      if (target === 'aadhar') {
        setAadharFile(file);
        setAadharPreview(previewUrl);
      } else if (target === 'aadharBack') {
        setAadharBackFile(file);
        setAadharBackPreview(previewUrl);
      } else if (target === 'pan') {
        setPanFile(file);
        setPanPreview(previewUrl);
      }
    }
  };


  useLayoutEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const root = document.getElementById('root');
    const bgStyle = themeColors.backgroundGradient;

    if (html) html.style.background = bgStyle;
    if (body) body.style.background = bgStyle;
    if (root) root.style.background = bgStyle;

    return () => {
      if (html) html.style.background = '';
      if (body) body.style.background = '';
      if (root) root.style.background = '';
    };
  }, []);

  useEffect(() => {
    const loadProfile = async () => {
      try {
        // Try to get fresh profile from API
        const response = await workerAuthService.getProfile();

        if (response.success && response.worker) {
          const v = response.worker;

          let addressData = v.address;
          if (typeof v.address === 'string') {
            addressData = { fullAddress: v.address };
          } else if (!v.address) {
            addressData = {};
          }

          setFormData({
            name: v.name || '',
            businessName: v.businessName || '',
            phone: v.phone || '',
            alternatePhone: v.alternatePhone || '',
            email: v.email || '',
            address: addressData,
            serviceCategories: Array.isArray(v.service) ? v.service : (v.service ? [v.service] : []),
            profilePhoto: v.profilePhoto || '',
            aadharDocument: v.aadharDocument || (v.aadhar && v.aadhar.document) || '',
            aadharBackDocument: v.aadharBackDocument || (v.aadhar && v.aadhar.backDocument) || '',
            panDocument: v.panDocument || (v.pan && v.pan.document) || '',
            otherDocuments: v.otherDocuments || [],
            serviceRange: v.settings?.serviceRange ?? '',
            isScrapOpted: Boolean(v.isScrapOpted),
          });

          // Update local storage
          localStorage.setItem('workerProfile', JSON.stringify(v));
          localStorage.setItem('workerData', JSON.stringify(v));
        } else {
          // Fallback to local storage if API fails
          const workerProfile = JSON.parse(localStorage.getItem('workerProfile') || '{}');
          const workerData = JSON.parse(localStorage.getItem('workerData') || '{}');
          const storedData = { ...workerProfile, ...workerData };

          if (Object.keys(storedData).length > 0) {
            // ... existing fallback logic ...
            let addressData = storedData.address;
            if (typeof storedData.address === 'string') {
              addressData = { fullAddress: storedData.address };
            } else if (!storedData.address) {
              addressData = {};
            }

            setFormData({
              name: storedData.name || '',
              businessName: storedData.businessName || '',
              phone: storedData.phone || '',
              alternatePhone: storedData.alternatePhone || '',
              email: storedData.email || '',
              address: addressData,
              serviceCategories: Array.isArray(storedData.service) ? storedData.service : (storedData.service ? [storedData.service] : (storedData.serviceCategory ? [storedData.serviceCategory] : [])),
              profilePhoto: storedData.profilePhoto || '',
              aadharDocument: storedData.aadharDocument || (storedData.aadhar && storedData.aadhar.document) || '',
              aadharBackDocument: storedData.aadharBackDocument || (storedData.aadhar && storedData.aadhar.backDocument) || '',
              panDocument: storedData.panDocument || (storedData.pan && storedData.pan.document) || '',
              otherDocuments: storedData.otherDocuments || [],
              serviceRange: storedData.settings?.serviceRange ?? storedData.serviceRange ?? '',
              isScrapOpted: Boolean(storedData.isScrapOpted),
            });
          }
        }
      } catch (error) {
        console.error('Error loading profile:', error);
      }
    };
    loadProfile();
  }, []);

  const handleAddressSave = (houseNumber, location) => {
    let city = '';
    let state = '';
    let pincode = '';
    let addressLine2 = '';

    // Parse Google Maps address components
    if (location.components) {
      location.components.forEach(comp => {
        if (comp.types.includes('locality')) city = comp.long_name;
        if (comp.types.includes('administrative_area_level_1')) state = comp.long_name;
        if (comp.types.includes('postal_code')) pincode = comp.long_name;
        if (comp.types.includes('sublocality')) addressLine2 = comp.long_name;
      });
    }

    // Update FormData with structured address object
    setFormData(prev => ({
      ...prev,
      address: {
        ...(typeof prev.address === 'object' ? prev.address : {}),
        fullAddress: location.address,
        addressLine1: houseNumber, // House/Flat No
        addressLine2: addressLine2, // Sublocality/Street
        city: city,
        state: state,
        pincode: pincode,
        lat: location.lat,
        lng: location.lng
      }
    }));
    setIsAddressModalOpen(false);
  };

  // Upload file helper — uses the authenticated api client so the request
  // carries the logged-in worker's token (the endpoint requires auth).
  const uploadFile = async (file) => {
    const formData = new FormData();
    formData.append('file', file);

    const { data } = await api.post('/image/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    if (!data.success) throw new Error(data.message || 'Upload failed');
    return data.imageUrl;
  };

  const handlePhotoChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        alert('File size should be less than 5MB');
        return;
      }
      setPhotoFile(file);
      setPhotoPreview(URL.createObjectURL(file));
    }
  };

  const handleAadharChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        alert('File size should be less than 5MB');
        return;
      }
      setAadharFile(file);
    }
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }));
    // Clear error for this field
    if (errors[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: null,
      }));
    }
  };

  const handleSubmit = async () => {
    // Zod Validation
    const validationResult = workerProfileSchema.safeParse({
      name: formData.name,
      businessName: formData.businessName,
      phone: formData.phone,
      alternatePhone: formData.alternatePhone,
      email: formData.email,
      address: formData.address,
      serviceCategories: formData.serviceCategories,
    });

    if (formData.alternatePhone && formData.alternatePhone.trim() && formData.alternatePhone.trim() === formData.phone.trim()) {
      toast.error('Alternate phone number should be different from primary phone number');
      return;
    }

    if (isWorkerServiceRadiusEnabled && formData.serviceRange !== '' && (Number(formData.serviceRange) < workerServiceRadiusMinKm || Number(formData.serviceRange) > workerServiceRadiusMaxKm)) {
      toast.error(`Service radius must be between ${workerServiceRadiusMinKm} and ${workerServiceRadiusMaxKm} km`);
      return;
    }

    if (!validationResult.success) {
      console.log('Validation failed:', validationResult.error);
      const errorMessage = validationResult.error?.errors?.[0]?.message || 'Validation failed';
      toast.error(errorMessage);
      return;
    }

    try {
      setUploading(true);
      let photoUrl = formData.profilePhoto;
      let aadharUrl = formData.aadharDocument;
      let aadharBackUrl = formData.aadharBackDocument;
      let panUrl = formData.panDocument;

      // Upload new photo if selected
      if (photoFile) {
        try {
          photoUrl = await uploadFile(photoFile);
        } catch (err) {
          console.error('Photo upload failed:', err);
          toast.error('Failed to upload profile photo');
          setUploading(false);
          return;
        }
      }

      // Upload Aadhar Front if selected
      if (aadharFile) {
        try {
          aadharUrl = await uploadFile(aadharFile);
        } catch (err) {
          console.error('Aadhar Front upload failed:', err);
          toast.error('Failed to upload Aadhar Front document');
          setUploading(false);
          return;
        }
      }

      // Upload Aadhar Back if selected
      if (aadharBackFile) {
        try {
          aadharBackUrl = await uploadFile(aadharBackFile);
        } catch (err) {
          console.error('Aadhar Back upload failed:', err);
          toast.error('Failed to upload Aadhar Back document');
          setUploading(false);
          return;
        }
      }

      // Upload PAN if selected
      if (panFile) {
        try {
          panUrl = await uploadFile(panFile);
        } catch (err) {
          console.error('PAN card upload failed:', err);
          toast.error('Failed to upload PAN card document');
          setUploading(false);
          return;
        }
      }

      const payload = {
        name: formData.name,
        businessName: formData.businessName,
        alternatePhone: formData.alternatePhone ? formData.alternatePhone.trim() : '',
        address: formData.address,
        serviceCategory: formData.serviceCategories,
        profilePhoto: photoUrl,
        aadharDocument: aadharUrl,
        aadharBackDocument: aadharBackUrl,
        panDocument: panUrl,
        serviceRange: formData.serviceRange === '' ? null : Number(formData.serviceRange),
        isScrapOpted: Boolean(formData.isScrapOpted)
      };

      try {
        const response = await workerAuthService.updateProfile(payload);
        if (response.success) {
          const updatedProfile = { ...response.worker, skills: formData.skills }; // Keep local skills 

          // Update Local Storage
          localStorage.setItem('workerProfile', JSON.stringify(updatedProfile));
          localStorage.setItem('workerData', JSON.stringify(updatedProfile));

          // Dispatch events
          window.dispatchEvent(new Event('workerProfileUpdated'));
          window.dispatchEvent(new Event('workerDataUpdated'));

          navigate('/worker/profile');
        } else {
          throw new Error(response.message || 'Failed to update profile');
        }
      } catch (apiError) {
        console.error('API update failed:', apiError);
        // Fallback to local storage if API is mock or fails? No, display error
        alert(apiError.message || 'Failed to save profile on server.');
      }

    } catch (error) {
      console.error('Error saving profile:', error);
      alert('Failed to save profile. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen pb-20" style={{ background: themeColors.backgroundGradient }}>
      <Header title="Edit Profile" />

      <main className="px-4 py-6">
        <div className="space-y-6">
          {/* Profile Photo - Integrated */}
          <div className="flex flex-col items-center justify-center mb-6">
            <div className="relative group">
              <div
                className="w-28 h-28 rounded-full overflow-hidden border-4 border-white shadow-xl cursor-pointer"
                style={{ background: '#f0f0f0' }}
                onClick={() => handleImageClick('photo')}
              >
                {photoPreview || formData.profilePhoto ? (
                  <img
                    src={photoPreview || formData.profilePhoto}
                    alt="Profile"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gray-100 text-gray-400">
                    <FiUser className="w-12 h-12" />
                  </div>
                )}
              </div>

              <div
                onClick={() => handleImageClick('photo')}
                className="absolute bottom-1 right-1 p-2 rounded-full cursor-pointer shadow-lg transition-transform active:scale-95 hover:scale-105"
                style={{ background: themeColors.button }}
              >
                <FiCamera className="w-5 h-5 text-white" />
                <input
                  id="photo-upload"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handlePhotoChange}
                />
              </div>
            </div>
            <p className="text-gray-500 text-xs mt-3 font-medium">Tap icon to change photo</p>
          </div>

          {/* Name */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
              <div
                className="p-2 rounded-lg"
                style={{
                  background: `linear-gradient(135deg, ${themeColors.icon}25 0%, ${themeColors.icon}15 100%)`,
                }}
              >
                <FiUser className="w-4 h-4" style={{ color: themeColors.icon }} />
              </div>
              <span>Name <span className="text-red-500">*</span></span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => handleInputChange('name', e.target.value)}
              placeholder="Enter your name"
              className={`w-full px-4 py-3 bg-white rounded-xl border focus:outline-none focus:ring-2 ${errors.name ? 'border-red-500' : 'border-gray-200'
                }`}
              style={{ focusRingColor: themeColors.button }}
            />
            {errors.name && <p className="text-red-500 text-sm mt-1">{errors.name}</p>}
          </div>

          {/* Business Name */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
              <div
                className="p-2 rounded-lg"
                style={{
                  background: `linear-gradient(135deg, ${themeColors.icon}25 0%, ${themeColors.icon}15 100%)`,
                }}
              >
                <FiBriefcase className="w-4 h-4" style={{ color: themeColors.icon }} />
              </div>
              <span>Business Name</span>
            </label>
            <input
              type="text"
              value={formData.businessName}
              onChange={(e) => handleInputChange('businessName', e.target.value)}
              placeholder="Enter business name"
              className={`w-full px-4 py-3 bg-white rounded-xl border focus:outline-none focus:ring-2 ${errors.businessName ? 'border-red-500' : 'border-gray-200'
                }`}
              style={{ focusRingColor: themeColors.button }}
            />
            {errors.businessName && <p className="text-red-500 text-sm mt-1">{errors.businessName}</p>}
          </div>

          {/* Phone */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
              <div
                className="p-2 rounded-lg"
                style={{
                  background: `linear-gradient(135deg, ${themeColors.icon}25 0%, ${themeColors.icon}15 100%)`,
                }}
              >
                <FiPhone className="w-4 h-4" style={{ color: themeColors.icon }} />
              </div>
              <span>Phone Number <span className="text-red-500">*</span></span>
            </label>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => handleInputChange('phone', e.target.value)}
              placeholder="Enter phone number"
              className={`w-full px-4 py-3 bg-white rounded-xl border focus:outline-none focus:ring-2 ${errors.phone ? 'border-red-500' : 'border-gray-200'
                }`}
              style={{ focusRingColor: themeColors.button }}
            />
            {errors.phone && <p className="text-red-500 text-sm mt-1">{errors.phone}</p>}
          </div>

          {/* Alternate Phone (Optional) */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className="p-2 rounded-lg"
                  style={{
                    background: `linear-gradient(135deg, ${themeColors.icon}25 0%, ${themeColors.icon}15 100%)`,
                  }}
                >
                  <FiPhone className="w-4 h-4" style={{ color: themeColors.icon }} />
                </div>
                <span>Alternate Number</span>
              </div>
              <span className="text-xs font-semibold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-md">Optional</span>
            </label>
            <input
              type="tel"
              inputMode="tel"
              value={formData.alternatePhone}
              onChange={(e) => handleInputChange('alternatePhone', e.target.value)}
              placeholder="Enter alternate contact number (optional)"
              className={`w-full px-4 py-3 bg-white rounded-xl border focus:outline-none focus:ring-2 ${errors.alternatePhone ? 'border-red-500' : 'border-gray-200'
                }`}
              style={{ focusRingColor: themeColors.button }}
            />
            <p className="text-[11px] text-gray-400 mt-1">
              Secondary contact number in case your primary mobile is unreachable.
            </p>
            {errors.alternatePhone && <p className="text-red-500 text-sm mt-1">{errors.alternatePhone}</p>}
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
              <div
                className="p-2 rounded-lg"
                style={{
                  background: `linear-gradient(135deg, ${themeColors.icon}25 0%, ${themeColors.icon}15 100%)`,
                }}
              >
                <FiMail className="w-4 h-4" style={{ color: themeColors.icon }} />
              </div>
              <span>Email</span>
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => handleInputChange('email', e.target.value)}
              placeholder="Enter email address"
              className={`w-full px-4 py-3 bg-white rounded-xl border focus:outline-none focus:ring-2 ${errors.email ? 'border-red-500' : 'border-gray-200'
                }`}
              style={{ focusRingColor: themeColors.button }}
            />
            {errors.email && <p className="text-red-500 text-sm mt-1">{errors.email}</p>}
          </div>

          {/* Address */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
              <div
                className="p-2 rounded-lg"
                style={{
                  background: `linear-gradient(135deg, ${themeColors.icon}25 0%, ${themeColors.icon}15 100%)`,
                }}
              >
                <FiMapPin className="w-4 h-4" style={{ color: themeColors.icon }} />
              </div>
              <span>Address <span className="text-red-500">*</span></span>
            </label>

            <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 mb-2">
              <p className="text-sm font-medium text-gray-700">
                {formData.address?.fullAddress ||
                  (typeof formData.address === 'string' ? formData.address : '') ||
                  `${formData.address?.addressLine1 || ''} ${formData.address?.city || ''}`
                }
              </p>
              {!formData.address || (typeof formData.address === 'object' && !formData.address.fullAddress && !formData.address.addressLine1) ? (
                <p className="text-xs text-gray-400 italic mt-1">No address set</p>
              ) : null}
            </div>

            <button
              onClick={() => setIsAddressModalOpen(true)}
              className="w-full py-3 bg-blue-50 text-blue-600 rounded-xl font-bold text-sm border border-blue-100 hover:bg-blue-100 transition-colors flex items-center justify-center gap-2"
            >
              <FiMapPin className="w-4 h-4" />
              Build/Change Location on Map
            </button>

            {errors.address && <p className="text-red-500 text-sm mt-1">{errors.address}</p>}
          </div>

          {/* Service Category (Multi-Select) */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <div
                className="p-2 rounded-lg"
                style={{
                  background: `linear-gradient(135deg, ${themeColors.icon}25 0%, ${themeColors.icon}15 100%)`,
                }}
              >
                <FiBriefcase className="w-4 h-4" style={{ color: themeColors.icon }} />
              </div>
              <span>Service Categories <span className="text-red-500">*</span></span>
            </label>
            <SkillTreePicker
              value={formData.serviceCategories || []}
              onChange={(titles) => {
                setFormData((prev) => ({ ...prev, serviceCategories: titles }));
                if (errors.serviceCategories) setErrors((prev) => ({ ...prev, serviceCategories: null }));
              }}
              accentColor={themeColors.button}
            />
            {errors.serviceCategories && <p className="text-red-500 text-sm mt-1">{errors.serviceCategories}</p>}
          </div>

          {/* Service Range */}
          {isWorkerServiceRadiusEnabled && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                <div
                  className="p-2 rounded-lg"
                  style={{
                    background: `linear-gradient(135deg, ${themeColors.icon}25 0%, ${themeColors.icon}15 100%)`,
                  }}
                >
                  <FiMapPin className="w-4 h-4" style={{ color: themeColors.icon }} />
                </div>
                <span>Service radius from your home address (km) <span className="text-gray-400 font-normal">(optional)</span></span>
              </label>
              <input
                type="number"
                inputMode="decimal"
                value={formData.serviceRange}
                onChange={(e) => handleInputChange('serviceRange', e.target.value)}
                placeholder="Leave empty to use the standard area"
                min={workerServiceRadiusMinKm}
                max={workerServiceRadiusMaxKm}
                step="0.5"
                className="w-full px-4 py-3 bg-white rounded-xl border border-gray-200 focus:outline-none focus:ring-2"
                style={{ focusRingColor: themeColors.button }}
              />
              <p className="text-[10px] text-gray-400 mt-1">
                How far from your saved home address you will travel for jobs, between {workerServiceRadiusMinKm} and {workerServiceRadiusMaxKm} km. Leave it empty to get jobs in the standard area. It needs your address saved with the map pin.
              </p>
              {(!formData.address?.lat || !formData.address?.lng) && (
                <p className="text-[11px] text-amber-600 mt-1">
                  ⚠️ Note: Your address doesn't have a map location saved yet. Please set your address using the map picker above so your custom radius can be activated.
                </p>
              )}
              {formData.serviceRange !== '' && (Number(formData.serviceRange) < workerServiceRadiusMinKm || Number(formData.serviceRange) > workerServiceRadiusMaxKm) && (
                <p className="text-[11px] text-red-500 mt-1">Choose between {workerServiceRadiusMinKm} and {workerServiceRadiusMaxKm} km.</p>
              )}
            </div>
          )}

          {/* Scrap Pickup Opt-in Section */}
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4 transition-all">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-100 text-xs font-bold text-emerald-700">
                    ♻️
                  </span>
                  <h4 className="text-sm font-bold text-gray-900">Opt in for Scrap Pickups</h4>
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                    Extra Earning
                  </span>
                </div>
                <p className="mt-1 text-xs text-gray-600 leading-relaxed">
                  Collect scrap from customers in your area and earn an extra payout per pickup. Requires a weighing scale and transport vehicle.
                </p>
              </div>
              <label className="relative inline-flex cursor-pointer items-center shrink-0 mt-0.5" aria-label="Toggle scrap pickup opt-in">
                <input
                  type="checkbox"
                  checked={Boolean(formData.isScrapOpted)}
                  onChange={(e) => setFormData(prev => ({ ...prev, isScrapOpted: e.target.checked }))}
                  className="peer sr-only"
                />
                <div className="h-6 w-11 rounded-full bg-gray-200 peer-focus:outline-none peer-checked:bg-emerald-600 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:after:translate-x-full peer-checked:after:border-white"></div>
              </label>
            </div>
          </div>

          {/* Verification Documents Section */}
          <div className="space-y-5 pt-2">
            <div className="flex items-center gap-2">
              <div
                className="p-2 rounded-lg"
                style={{
                  background: `linear-gradient(135deg, ${themeColors.icon}25 0%, ${themeColors.icon}15 100%)`,
                }}
              >
                <FiShield className="w-4 h-4" style={{ color: themeColors.icon }} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-800">Verification Documents</h3>
                <p className="text-[11px] text-gray-500">View or update your uploaded documents</p>
              </div>
            </div>

            {/* 1. Aadhar Front */}
            {core.aadhar_front.active && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className="p-1.5 rounded-lg"
                    style={{
                      background: `linear-gradient(135deg, ${themeColors.icon}25 0%, ${themeColors.icon}15 100%)`,
                    }}
                  >
                    <FiUpload className="w-3.5 h-3.5" style={{ color: themeColors.icon }} />
                  </div>
                  <span>{core.aadhar_front.label} {requiredMark(core.aadhar_front)}</span>
                </div>
                {(aadharPreview || formData.aadharDocument) && (
                  <button
                    type="button"
                    onClick={() => setPreviewModalDoc({ title: core.aadhar_front.label, url: aadharPreview || formData.aadharDocument })}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1"
                  >
                    <FiEye className="w-3.5 h-3.5" /> View Full
                  </button>
                )}
              </label>

              <div
                className="border-2 border-dashed border-gray-200 rounded-xl p-5 text-center transition-colors hover:border-blue-300 bg-gray-50 cursor-pointer"
                onClick={() => handleImageClick('aadhar')}
              >
                <input
                  id="aadhar-upload"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleDocChange('aadhar', e)}
                />
                <div className="cursor-pointer flex flex-col items-center">
                  {aadharFile ? (
                    <div className="flex flex-col items-center gap-2 w-full">
                      {aadharPreview && (
                        <div className="w-full h-32 rounded-lg overflow-hidden border border-gray-200 mb-1">
                          <img src={aadharPreview} alt="Aadhar Front Preview" className="w-full h-full object-cover" />
                        </div>
                      )}
                      <div className="flex items-center gap-2 text-green-600 font-medium text-sm">
                        <FiCheckCircle className="w-4 h-4" />
                        <span className="truncate max-w-[200px]">{aadharFile.name}</span>
                      </div>
                      <span className="text-xs text-blue-500 underline">Click to replace</span>
                    </div>
                  ) : formData.aadharDocument ? (
                    <div className="flex flex-col items-center gap-2 w-full">
                      <div className="w-full h-32 rounded-lg overflow-hidden border border-gray-200 mb-1 relative group-hover:opacity-75 transition-opacity">
                        <img
                          src={formData.aadharDocument}
                          alt="Aadhar Front Preview"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="flex flex-col items-center">
                        <p className="text-green-600 font-medium text-sm flex items-center gap-1">
                          <FiCheckCircle className="w-3.5 h-3.5" /> Document Uploaded
                        </p>
                        <span className="text-xs text-blue-500 underline mt-1">Click to replace</span>
                      </div>
                    </div>
                  ) : (
                    <>
                      <FiUpload className="w-8 h-8 text-gray-400 mb-2" />
                      <span className="text-sm text-gray-600 font-medium">Click to upload {core.aadhar_front.label}</span>
                      <span className="text-xs text-gray-400 mt-1">First Page / Front Side (Max 5MB)</span>
                    </>
                  )}
                </div>
              </div>
              {errors.aadharDocument && <p className="text-red-500 text-sm mt-1">{errors.aadharDocument}</p>}
            </div>
            )}

            {/* 2. Aadhar Back */}
            {core.aadhar_back.active && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className="p-1.5 rounded-lg"
                    style={{
                      background: `linear-gradient(135deg, ${themeColors.icon}25 0%, ${themeColors.icon}15 100%)`,
                    }}
                  >
                    <FiUpload className="w-3.5 h-3.5" style={{ color: themeColors.icon }} />
                  </div>
                  <span>{core.aadhar_back.label} {requiredMark(core.aadhar_back)}</span>
                </div>
                {(aadharBackPreview || formData.aadharBackDocument) && (
                  <button
                    type="button"
                    onClick={() => setPreviewModalDoc({ title: core.aadhar_back.label, url: aadharBackPreview || formData.aadharBackDocument })}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1"
                  >
                    <FiEye className="w-3.5 h-3.5" /> View Full
                  </button>
                )}
              </label>

              <div
                className="border-2 border-dashed border-gray-200 rounded-xl p-5 text-center transition-colors hover:border-blue-300 bg-gray-50 cursor-pointer"
                onClick={() => handleImageClick('aadharBack')}
              >
                <input
                  id="aadhar-back-upload"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleDocChange('aadharBack', e)}
                />
                <div className="cursor-pointer flex flex-col items-center">
                  {aadharBackFile ? (
                    <div className="flex flex-col items-center gap-2 w-full">
                      {aadharBackPreview && (
                        <div className="w-full h-32 rounded-lg overflow-hidden border border-gray-200 mb-1">
                          <img src={aadharBackPreview} alt="Aadhar Back Preview" className="w-full h-full object-cover" />
                        </div>
                      )}
                      <div className="flex items-center gap-2 text-green-600 font-medium text-sm">
                        <FiCheckCircle className="w-4 h-4" />
                        <span className="truncate max-w-[200px]">{aadharBackFile.name}</span>
                      </div>
                      <span className="text-xs text-blue-500 underline">Click to replace</span>
                    </div>
                  ) : formData.aadharBackDocument ? (
                    <div className="flex flex-col items-center gap-2 w-full">
                      <div className="w-full h-32 rounded-lg overflow-hidden border border-gray-200 mb-1 relative group-hover:opacity-75 transition-opacity">
                        <img
                          src={formData.aadharBackDocument}
                          alt="Aadhar Back Preview"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="flex flex-col items-center">
                        <p className="text-green-600 font-medium text-sm flex items-center gap-1">
                          <FiCheckCircle className="w-3.5 h-3.5" /> Document Uploaded
                        </p>
                        <span className="text-xs text-blue-500 underline mt-1">Click to replace</span>
                      </div>
                    </div>
                  ) : (
                    <>
                      <FiUpload className="w-8 h-8 text-gray-400 mb-2" />
                      <span className="text-sm text-gray-600 font-medium">Click to upload {core.aadhar_back.label}</span>
                      <span className="text-xs text-gray-400 mt-1">Back Side with Address (Max 5MB)</span>
                    </>
                  )}
                </div>
              </div>
            </div>
            )}

            {/* 3. PAN Card */}
            {core.pan_document.active && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className="p-1.5 rounded-lg"
                    style={{
                      background: `linear-gradient(135deg, ${themeColors.icon}25 0%, ${themeColors.icon}15 100%)`,
                    }}
                  >
                    <FiUpload className="w-3.5 h-3.5" style={{ color: themeColors.icon }} />
                  </div>
                  <span>{core.pan_document.label} {requiredMark(core.pan_document)}</span>
                </div>
                {(panPreview || formData.panDocument) && (
                  <button
                    type="button"
                    onClick={() => setPreviewModalDoc({ title: core.pan_document.label, url: panPreview || formData.panDocument })}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1"
                  >
                    <FiEye className="w-3.5 h-3.5" /> View Full
                  </button>
                )}
              </label>

              <div
                className="border-2 border-dashed border-gray-200 rounded-xl p-5 text-center transition-colors hover:border-blue-300 bg-gray-50 cursor-pointer"
                onClick={() => handleImageClick('pan')}
              >
                <input
                  id="pan-upload"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleDocChange('pan', e)}
                />
                <div className="cursor-pointer flex flex-col items-center">
                  {panFile ? (
                    <div className="flex flex-col items-center gap-2 w-full">
                      {panPreview && (
                        <div className="w-full h-32 rounded-lg overflow-hidden border border-gray-200 mb-1">
                          <img src={panPreview} alt="PAN Card Preview" className="w-full h-full object-cover" />
                        </div>
                      )}
                      <div className="flex items-center gap-2 text-green-600 font-medium text-sm">
                        <FiCheckCircle className="w-4 h-4" />
                        <span className="truncate max-w-[200px]">{panFile.name}</span>
                      </div>
                      <span className="text-xs text-blue-500 underline">Click to replace</span>
                    </div>
                  ) : formData.panDocument ? (
                    <div className="flex flex-col items-center gap-2 w-full">
                      <div className="w-full h-32 rounded-lg overflow-hidden border border-gray-200 mb-1 relative group-hover:opacity-75 transition-opacity">
                        <img
                          src={formData.panDocument}
                          alt="PAN Card Preview"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="flex flex-col items-center">
                        <p className="text-green-600 font-medium text-sm flex items-center gap-1">
                          <FiCheckCircle className="w-3.5 h-3.5" /> Document Uploaded
                        </p>
                        <span className="text-xs text-blue-500 underline mt-1">Click to replace</span>
                      </div>
                    </div>
                  ) : (
                    <>
                      <FiUpload className="w-8 h-8 text-gray-400 mb-2" />
                      <span className="text-sm text-gray-600 font-medium">Click to upload {core.pan_document.label}</span>
                      <span className="text-xs text-gray-400 mt-1">Clear copy of PAN Card (Max 5MB)</span>
                    </>
                  )}
                </div>
              </div>
            </div>
            )}

            {/* 4. Other Documents (if any exist) */}
            {formData.otherDocuments && formData.otherDocuments.length > 0 && (
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                  <div
                    className="p-1.5 rounded-lg"
                    style={{
                      background: `linear-gradient(135deg, ${themeColors.icon}25 0%, ${themeColors.icon}15 100%)`,
                    }}
                  >
                    <FiFileText className="w-3.5 h-3.5" style={{ color: themeColors.icon }} />
                  </div>
                  <span>Additional Documents</span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {formData.otherDocuments.map((docUrl, idx) => (
                    <div key={idx} className="relative group border border-gray-200 rounded-xl overflow-hidden bg-gray-50">
                      <div className="w-full h-28 overflow-hidden">
                        <img src={docUrl} alt={`Other Document ${idx + 1}`} className="w-full h-full object-cover" />
                      </div>
                      <div className="p-2 bg-white flex items-center justify-between">
                        <span className="text-[11px] font-medium text-gray-600 truncate">Doc {idx + 1}</span>
                        <button
                          type="button"
                          onClick={() => setPreviewModalDoc({ title: `Additional Document ${idx + 1}`, url: docUrl })}
                          className="text-xs text-blue-600 font-semibold hover:underline"
                        >
                          View
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

        </div>

        {/* Action Buttons */}
        <div className="mt-8 flex gap-3">
          <button
            onClick={() => navigate('/worker/profile')}
            className="flex-1 py-4 rounded-xl font-semibold text-gray-700 bg-white border-2 border-gray-200 transition-all active:scale-95"
            style={{
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="flex-1 py-4 rounded-xl font-semibold text-white flex items-center justify-center gap-2 transition-all active:scale-95"
            style={{
              background: themeColors.button,
              boxShadow: `0 4px 12px ${themeColors.button}40`,
            }}
          >
            {uploading ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </main>

      <AddressSelectionModal
        isOpen={isAddressModalOpen}
        onClose={() => setIsAddressModalOpen(false)}
        address={(typeof formData.address === 'object' ? formData.address?.fullAddress : formData.address) || ''}
        houseNumber={(typeof formData.address === 'object' ? formData.address?.addressLine1 : '') || ''}
        onHouseNumberChange={(val) => {
          if (typeof formData.address === 'object') {
            setFormData(prev => ({
              ...prev,
              address: { ...prev.address, addressLine1: val }
            }));
          }
        }}
        onSave={handleAddressSave}
      />

      {/* Full Document Preview Modal */}
      {previewModalDoc && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setPreviewModalDoc(null)}
        >
          <ModalLock />
          <div
            className="bg-white rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl relative animate-scale-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
              <div>
                <h3 className="font-bold text-gray-800 text-sm">{previewModalDoc.title}</h3>
                <p className="text-[11px] text-gray-400">Document Preview</p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewModalDoc(null)}
                className="w-8 h-8 rounded-full bg-gray-200 hover:bg-gray-300 text-gray-700 flex items-center justify-center transition-colors"
              >
                <FiX className="w-4 h-4" />
              </button>
            </div>
            <div className="p-3 bg-gray-950 flex items-center justify-center max-h-[70vh] overflow-auto">
              <img
                src={previewModalDoc.url}
                alt={previewModalDoc.title}
                className="max-h-[65vh] w-auto max-w-full rounded-lg object-contain shadow-md"
              />
            </div>
            <div className="p-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
              <a
                href={previewModalDoc.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 font-semibold hover:underline inline-flex items-center gap-1"
              >
                Open in new tab
              </a>
              <button
                type="button"
                onClick={() => setPreviewModalDoc(null)}
                className="px-4 py-2 bg-gray-800 text-white rounded-xl text-xs font-semibold hover:bg-gray-900 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default EditProfile;


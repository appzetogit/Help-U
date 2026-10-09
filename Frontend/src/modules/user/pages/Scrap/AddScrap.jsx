import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiArrowLeft, FiCamera, FiCheckCircle, FiImage, FiLoader, FiMapPin, FiX } from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import { AnimatePresence, motion } from 'framer-motion';
import { z } from "zod";

import api from '../../../../services/api';
import { themeColors } from '../../../../theme';
import AddressSelectionModal from '../Checkout/components/AddressSelectionModal';
import { uploadToCloudinary } from '../../../../utils/cloudinaryUpload';
import flutterBridge from '../../../../utils/flutterBridge';
import { useConfig } from '../../../../context/ConfigContext';

// Zod schema for Scrap
const scrapSchema = z.object({
  title: z.string().min(3, "Title too short"),
  description: z.string().optional(),
  address: z.object({
    addressLine1: z.string().min(5, "Address must be selected"),
    city: z.string().optional(),
    state: z.string().optional(),
    pincode: z.string().optional(),
    lat: z.any().optional(),
    lng: z.any().optional()
  }).refine((data) => data.addressLine1 && data.addressLine1.length > 0, { message: "Pickup address is required" })
});

const AddScrap = () => {
  const navigate = useNavigate();
  const { isScrapEnabled, configLoaded } = useConfig();

  const [showAddressModal, setShowAddressModal] = useState(false);
  const [houseNumber, setHouseNumber] = useState('');
  const [addressDetails, setAddressDetails] = useState(null);

  // Form State
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    images: [],
    address: {
      addressLine1: '',
      city: '',
      state: '',
      pincode: ''
    }
  });

  const [selectedFiles, setSelectedFiles] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isFlutter, setIsFlutter] = useState(flutterBridge.isFlutter);
  const [showSourceSheet, setShowSourceSheet] = useState(false);

  // Sync flutter bridge state
  useEffect(() => {
    flutterBridge.waitForFlutter().then(ready => {
      setIsFlutter(ready);
    });
  }, []);

  const handleNativeCamera = async () => {
    const file = await flutterBridge.openCamera();
    if (file) {
      const newFile = {
        id: Math.random().toString(36).substr(2, 9),
        file,
        preview: URL.createObjectURL(file),
        progress: 0,
        status: 'idle'
      };
      setSelectedFiles(prev => [...prev, newFile]);
      flutterBridge.hapticFeedback('success');
    }
  };

  const handlePhotoClick = () => {
    setShowSourceSheet(true);
  };

  const handleImageSelect = (e) => {
    const files = Array.from(e.target.files);
    if (files.length + selectedFiles.length > 5) {
      return toast.error('Maximum 5 images allowed');
    }

    const newFiles = files.map(file => ({
      id: Math.random().toString(36).substr(2, 9),
      file,
      preview: URL.createObjectURL(file),
      progress: 0,
      status: 'idle'
    }));

    setSelectedFiles(prev => [...prev, ...newFiles]);
  };

  const removeImage = (index) => {
    setSelectedFiles(prev => {
      const newFiles = [...prev];
      URL.revokeObjectURL(newFiles[index].preview);
      newFiles.splice(index, 1);
      return newFiles;
    });
  };

  const handleCreate = async (e) => {
    e.preventDefault();

    // Zod Validation
    const validationResult = scrapSchema.safeParse(formData);
    if (!validationResult.success) {
      toast.error(validationResult.error.errors[0].message);
      return;
    }

    try {
      setIsUploading(true);
      toast.loading('Uploading images and listing items...', { id: 'scrap' });

      // 1. Upload images to Cloudinary
      const imageUrls = [];
      const updatedFiles = [...selectedFiles];

      for (let i = 0; i < updatedFiles.length; i++) {
        const item = updatedFiles[i];
        try {
          // Update status to uploading
          setSelectedFiles(prev => prev.map(f => f.id === item.id ? { ...f, status: 'uploading' } : f));

          const url = await uploadToCloudinary(item.file, 'scrap_items', (pct) => {
            setSelectedFiles(prev => prev.map(f => f.id === item.id ? { ...f, progress: pct } : f));
          });

          imageUrls.push(url);
          setSelectedFiles(prev => prev.map(f => f.id === item.id ? { ...f, status: 'done', progress: 100 } : f));
        } catch (err) {
          console.error('Image upload failed', err);
          setSelectedFiles(prev => prev.map(f => f.id === item.id ? { ...f, status: 'error' } : f));
          toast.error(`Failed to upload image ${i + 1}`);
        }
      }

      // Check if we have at least one image if images were selected
      if (selectedFiles.length > 0 && imageUrls.length === 0) {
        setIsUploading(false);
        toast.dismiss('scrap');
        return toast.error('Failed to upload images. Please try again.');
      }

      // 2. Prepare final data
      const finalData = {
        ...formData,
        images: imageUrls
      };

      const res = await api.post('/scrap', finalData);
      if (res.data.success) {
        toast.success('Scrap item listed!', { id: 'scrap' });
        navigate(-1);
      }
    } catch (err) {
      toast.error('Failed to create listing', { id: 'scrap' });
    } finally {
      setIsUploading(false);
    }
  };

  const getAddressComponent = (components, type) => {
    return components?.find(c => c.types.includes(type))?.long_name || '';
  };

  const handleAddressSave = (savedHouseNumber, locationObj) => {
    setHouseNumber(savedHouseNumber);
    setAddressDetails(locationObj);

    // Update form data with detailed address components
    if (locationObj) {
      const components = locationObj.components;
      setFormData(prev => ({
        ...prev,
        address: {
          addressLine1: locationObj.address, // Full address string
          addressLine2: savedHouseNumber,
          city: getAddressComponent(components, 'locality') || getAddressComponent(components, 'administrative_area_level_2') || '',
          state: getAddressComponent(components, 'administrative_area_level_1') || '',
          pincode: getAddressComponent(components, 'postal_code') || '',
          lat: locationObj.lat,
          lng: locationObj.lng
        }
      }));
    }
    setShowAddressModal(false);
  };

  if (!configLoaded) {
    return <div className="min-h-screen bg-white" />;
  }

  if (!isScrapEnabled) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center bg-white">
        <div className="w-20 h-20 rounded-3xl bg-amber-50 flex items-center justify-center text-4xl mb-4 shadow-sm border border-amber-100">
          ♻️
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Scrap Service Unavailable</h2>
        <p className="text-sm text-gray-500 max-w-xs mb-6 font-medium">
          The scrap selling feature is currently disabled by administrator. Please check back later!
        </p>
        <button
          onClick={() => navigate('/user')}
          className="px-6 py-2.5 rounded-xl font-bold text-white text-sm shadow-md hover:opacity-90 transition-opacity"
          style={{ backgroundColor: themeColors.brand?.teal || '#347989' }}
        >
          Return to Home
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20 relative bg-white">
      {/* Refined Brand Mesh Gradient Background */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0"
          style={{
            background: `
              radial-gradient(at 0% 0%, ${themeColors?.brand?.teal || '#347989'}25 0%, transparent 70%),
              radial-gradient(at 100% 0%, ${themeColors?.brand?.yellow || '#D68F35'}20 0%, transparent 70%),
              radial-gradient(at 100% 100%, ${themeColors?.brand?.orange || '#BB5F36'}15 0%, transparent 75%),
              radial-gradient(at 0% 100%, ${themeColors?.brand?.teal || '#347989'}10 0%, transparent 70%),
              radial-gradient(at 50% 50%, ${themeColors?.brand?.teal || '#347989'}03 0%, transparent 100%),
              #FFFFFF
            `
          }}
        />
        {/* Elegant Dot Grid Pattern */}
        <div className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: `radial-gradient(${themeColors?.brand?.teal || '#347989'} 0.8px, transparent 0.8px)`,
            backgroundSize: '32px 32px'
          }}
        />
      </div>

      <div className="relative z-10">
        {/* Modern Glassmorphism Header */}
        <header className="sticky top-0 z-40 backdrop-blur-xl bg-white/40 border-b border-black/[0.03] px-4 py-4 flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm border border-black/[0.02]"
          >
            <FiArrowLeft className="w-5 h-5 text-gray-800" />
          </button>
          <h1 className="text-xl font-extrabold text-gray-900">Add Scrap Item</h1>
        </header>

        <form onSubmit={handleCreate} className="p-4 space-y-4 pb-8">
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
            <label className="block text-sm font-medium text-gray-700 mb-2">Item Title</label>
            <input
              type="text"
              className="w-full p-3 bg-gray-50 rounded-xl border-none focus:ring-1 focus:ring-primary-500"
              placeholder="e.g. Old LG Split AC, Samsung Fridge"
              value={formData.title}
              onChange={e => setFormData({ ...formData, title: e.target.value })}
              required
            />
          </div>

          <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
            <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
            <textarea
              className="w-full p-3 bg-gray-50 rounded-xl border-none focus:ring-1 focus:ring-primary-500"
              rows="3"
              placeholder="Condition, model year, etc."
              value={formData.description}
              onChange={e => setFormData({ ...formData, description: e.target.value })}
            />
          </div>

          {/* Image Upload Selection */}
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
            <label className="block text-sm font-medium text-gray-700 mb-3">Item Images (Max 5)</label>
            <div className="grid grid-cols-3 gap-3">
              {selectedFiles.map((item, index) => (
                <div key={item.id || index} className="relative aspect-square rounded-xl overflow-hidden border border-gray-100 group">
                  <img src={item.preview} alt="Preview" className="w-full h-full object-cover" />

                  {/* Upload Progress Overlay */}
                  {item.status === 'uploading' && (
                    <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center p-2">
                      <div className="w-full bg-gray-200 rounded-full h-1.5 mb-1">
                        <div
                          className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
                          style={{ width: `${item.progress}%` }}
                        ></div>
                      </div>
                      <span className="text-[8px] text-white font-black">{item.progress}%</span>
                    </div>
                  )}

                  {item.status === 'done' && (
                    <div className="absolute top-1 left-1 bg-green-500 text-white rounded-full p-0.5">
                      <FiCheckCircle size={10} />
                    </div>
                  )}

                  {item.status === 'error' && (
                    <div className="absolute inset-0 bg-red-500/20 flex items-center justify-center">
                      <FiX className="text-red-500" />
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => removeImage(index)}
                    disabled={isUploading}
                    className={`absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center transition-opacity ${isUploading ? 'opacity-0' : 'opacity-0 group-hover:opacity-100'}`}
                  >
                    <FiX size={14} />
                  </button>
                </div>
              ))}
              {selectedFiles.length < 5 && !isUploading && (
                <div
                  onClick={handlePhotoClick}
                  className="aspect-square rounded-xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-1 cursor-pointer hover:bg-gray-50 transition-colors"
                >
                  <FiCamera className="w-6 h-6 text-gray-400" />
                  <span className="text-[10px] font-bold text-gray-500 uppercase">Add Photo</span>
                  <input
                    id="add-scrap-photo-upload"
                    type="file"
                    className="hidden"
                    accept="image/*"
                    multiple
                    onChange={handleImageSelect}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Address Section */}
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                <FiMapPin className="text-primary-600" /> Pickup Location
              </h3>
              <button
                type="button"
                onClick={() => setShowAddressModal(true)}
                className="text-xs font-semibold text-primary-600 hover:text-primary-700"
                style={{ color: themeColors.button }}
              >
                {formData.address.addressLine1 ? 'Change' : 'Select'}
              </button>
            </div>

            {formData.address.addressLine1 ? (
              <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                <p className="font-medium text-gray-900 text-sm">{houseNumber ? `${houseNumber}, ` : ''}{formData.address.addressLine1.split(',')[0]}</p>
                <p className="text-xs text-gray-500 mt-0.5 truncate">{formData.address.addressLine1}</p>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowAddressModal(true)}
                className="w-full py-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-500 text-sm font-medium hover:bg-gray-100 transition-colors"
              >
                + Select Pickup Address
              </button>
            )}
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={!formData.address.addressLine1 || isUploading}
              className="w-full py-4 rounded-2xl text-white font-bold shadow-lg active:scale-95 transition-all disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-2"
              style={{ backgroundColor: themeColors.button }}
            >
              {isUploading ? (
                <>
                  <FiLoader className="animate-spin" />
                  <span>Listing Item...</span>
                </>
              ) : (
                'List Item for Pickup'
              )}
            </button>
          </div>
        </form>
      </div>

      <AddressSelectionModal
        isOpen={showAddressModal}
        onClose={() => setShowAddressModal(false)}
        address={formData.address.addressLine1 || ''}
        houseNumber={houseNumber}
        onHouseNumberChange={setHouseNumber}
        onSave={handleAddressSave}
      />

      {/* Photo Source Selection - Mobile Styled Bottom Sheet */}
      <AnimatePresence>
        {showSourceSheet && (
          <div className="fixed inset-0 z-[100] flex items-end justify-center">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSourceSheet(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="relative bg-white w-full rounded-t-[32px] p-6 pb-12 shadow-[0_-10px_40px_rgba(0,0,0,0.1)] z-10"
            >
              <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mb-6" />
              <div className="flex justify-between items-center mb-6">
                <h4 className="font-bold text-gray-900 text-lg">Select Photo Source</h4>
                <button 
                  onClick={() => setShowSourceSheet(false)}
                  className="p-2 bg-gray-100 rounded-full text-gray-500"
                >
                  <FiX />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Camera Option */}
                <button
                  type="button"
                  onClick={() => {
                    setShowSourceSheet(false);
                    if (isFlutter) {
                      handleNativeCamera();
                    } else {
                      document.getElementById('add-scrap-photo-upload')?.click();
                    }
                  }}
                  className="flex flex-col items-center gap-3 p-6 rounded-2xl border border-teal-100 active:scale-95 transition-all"
                  style={{ backgroundColor: `${themeColors.button}10` }}
                >
                  <div className="w-12 h-12 rounded-full flex items-center justify-center text-white shadow-lg"
                    style={{ backgroundColor: themeColors.button }}
                  >
                    <FiCamera className="w-6 h-6" />
                  </div>
                  <span className="font-bold text-teal-800 text-sm">Take Photo</span>
                </button>

                {/* Gallery Option */}
                <button
                  type="button"
                  onClick={() => {
                    setShowSourceSheet(false);
                    document.getElementById('add-scrap-photo-upload')?.click();
                  }}
                  className="flex flex-col items-center gap-3 p-6 bg-blue-50 rounded-2xl border border-blue-100 active:scale-95 transition-all"
                >
                  <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center text-white shadow-lg shadow-blue-200">
                    <FiImage className="w-6 h-6" />
                  </div>
                  <span className="font-bold text-blue-800 text-sm">Gallery</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AddScrap;

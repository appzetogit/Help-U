import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiArrowLeft, FiMapPin, FiSave, FiSearch, FiHome } from 'react-icons/fi';
import { Autocomplete, useJsApiLoader } from '@react-google-maps/api';
import { toast } from 'react-hot-toast';
import { workerTheme as themeColors } from '../../../../theme';
import workerService from '../../../../services/workerService';
import Header from '../../components/layout/Header';
import BottomNav from '../../components/layout/BottomNav';
import LocationPicker from '../../../user/pages/Checkout/components/LocationPicker';

const libraries = ['places', 'geometry'];

const AddressManagement = () => {
  const navigate = useNavigate();
  const [address, setAddress] = useState(''); // Display address
  const [houseNumber, setHouseNumber] = useState('');
  const [selectedLocation, setSelectedLocation] = useState(null); // { lat, lng, address, components... }
  const [autocomplete, setAutocomplete] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
    libraries
  });

  // Load saved address from backend
  useEffect(() => {
    const loadAddress = async () => {
      try {
        const response = await workerService.getProfile();
        // Check if response has worker data
        if (response.success && response.worker?.address) {
          const addr = response.worker.address;

          let displayAddress = '';
          let location = null;
          let houseNum = '';

          if (typeof addr === 'string') {
            displayAddress = addr;
          } else {
            // It's an object
            houseNum = addr.addressLine1 || '';
            displayAddress = addr.fullAddress ||
              addr.address ||
              '';

            // If we have city/pincode but no fullAddress, try to construct
            if (!displayAddress && addr.city) {
              displayAddress = [addr.city, addr.state, addr.pincode].filter(Boolean).join(', ');
            }

            if (addr.lat && addr.lng) {
              location = {
                lat: parseFloat(addr.lat),
                lng: parseFloat(addr.lng),
                address: displayAddress
              };
            }
          }

          setAddress(displayAddress);
          setSearchQuery(displayAddress);
          setHouseNumber(houseNum);
          if (location) {
            setSelectedLocation(location);
          }
        }
      } catch (error) {
        console.error('Error loading address:', error);
      }
    };
    loadAddress();
  }, []);

  const handleLocationSelect = (location) => {
    setSelectedLocation(location);
    // setAddress(location.address); 
    // Usually user selects from map -> we update search query & address field
    setSearchQuery(location.address);
    setAddress(location.address);
  };

  const onPlaceChanged = () => {
    if (autocomplete !== null) {
      const place = autocomplete.getPlace();
      if (place.geometry) {
        const location = {
          lat: place.geometry.location.lat(),
          lng: place.geometry.location.lng(),
          address: place.formatted_address,
          components: place.address_components
        };
        setSelectedLocation(location);
        setAddress(place.formatted_address);
        setSearchQuery(place.formatted_address);
      }
    }
  };

  const onAutocompleteLoad = (autocompleteInstance) => {
    setAutocomplete(autocompleteInstance);
  };

  const handleSave = async () => {
    if (!address || !selectedLocation) {
      toast.error('Please select an address');
      return;
    }

    setLoading(true);

    // Prepare full address object similar to `AddressSelectionModal`
    let city = '';
    let state = '';
    let pincode = '';
    let addressLine2 = '';

    // If we have components from Google API (either via map click or autocomplete)
    if (selectedLocation.components) {
      selectedLocation.components.forEach(comp => {
        if (comp.types.includes('locality')) city = comp.long_name;
        if (comp.types.includes('administrative_area_level_1')) state = comp.long_name;
        if (comp.types.includes('postal_code')) pincode = comp.long_name;
        if (comp.types.includes('sublocality')) addressLine2 = comp.long_name;
      });
    }

    // We can also re-use existing logic from updateProfile controller which expects an object
    // consistent with what EditProfile sends.
    const addrData = {
      fullAddress: selectedLocation.address || address,
      addressLine1: houseNumber,
      addressLine2: addressLine2,
      city: city,
      state: state,
      pincode: pincode,
      lat: selectedLocation.lat,
      lng: selectedLocation.lng
    };

    try {
      const response = await workerService.updateProfile({
        address: addrData
      });

      if (response.success) {
        toast.success('Address saved successfully!');
        setTimeout(() => {
          //   navigate('/worker/profile'); // Stay here or go back settings? User preference.
          //   Let's just show success. Or maybe go back.
        }, 500);
      } else {
        toast.error(response.message || 'Failed to save address');
      }
    } catch (error) {
      console.error('Error saving address:', error);
      toast.error(error.response?.data?.message || 'Failed to save address');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen pb-20" style={{ background: themeColors.backgroundGradient }}>
      <Header
        title="Manage Business Address"
        showBack={true}
        onBack={() => navigate('/worker/settings')}
      />

      <main className="px-4 py-6">
        {/* Info Card - Same logic as Modal */}
        <div className="rounded-xl p-3 mb-6 border" style={{ backgroundColor: `${themeColors.brand.teal}0D`, borderColor: `${themeColors.brand.teal}1A` }}>
          <div className="flex items-start gap-3">
            <FiMapPin className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: themeColors.button }} />
            <div>
              <h3 className="font-semibold mb-1 text-sm" style={{ color: themeColors.button }}>Set Business Location</h3>
              <p className="text-xs" style={{ color: `${themeColors.brand.teal}CC` }}>
                Place the pin accurately on the map to help customers locate you easily.
              </p>
            </div>
          </div>
        </div>

        {/* Map Section */}
        <div className="bg-white rounded-xl shadow-md overflow-hidden mb-6 border border-gray-100">
          <LocationPicker
            onLocationSelect={handleLocationSelect}
            initialPosition={selectedLocation}
          />
        </div>

        {/* Form Inputs Container */}
        <div className="bg-white rounded-xl p-4 shadow-md space-y-4">

          {/* Address Autocomplete */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Street Address / Area
            </label>
            {isLoaded ? (
              <Autocomplete
                onLoad={onAutocompleteLoad}
                onPlaceChanged={onPlaceChanged}
                options={{
                  componentRestrictions: { country: 'in' },
                  fields: ['formatted_address', 'geometry', 'name', 'address_components']
                }}
              >
                <div className="relative">
                  <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5 z-10" />
                  <input
                    type="text"
                    placeholder="Search for area, street name..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 border-2 rounded-lg text-sm focus:outline-none transition-colors"
                    style={{ borderColor: '#e5e7eb' }}
                    onFocus={(e) => e.target.style.borderColor = themeColors.button}
                    onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
                  />
                </div>
              </Autocomplete>
            ) : (
              <div className="relative">
                <input
                  type="text"
                  placeholder="Loading Maps..."
                  disabled
                  className="w-full pl-4 py-3 border-2 rounded-lg text-sm bg-gray-100"
                />
              </div>
            )}
          </div>

          {/* House Number */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Shop / Building Number
            </label>
            <div className="relative">
              <FiHome className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="e.g. Shop 101, Complex B"
                value={houseNumber}
                onChange={(e) => setHouseNumber(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border-2 rounded-lg text-sm focus:outline-none transition-colors"
                style={{ borderColor: '#e5e7eb' }}
                onFocus={(e) => e.target.style.borderColor = themeColors.button}
                onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
              />
            </div>
          </div>

          {/* Coordinates Display (Optional, for transparency) */}
          {selectedLocation && (
            <p className="text-xs text-gray-400">
              Lat/Lng: {selectedLocation.lat?.toFixed(5)}, {selectedLocation.lng?.toFixed(5)}
            </p>
          )}

          {/* Save Button */}
          <button
            onClick={handleSave}
            disabled={!searchQuery || !selectedLocation || loading}
            className="w-full py-4 rounded-xl font-semibold text-white flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed mt-2"
            style={{
              background: themeColors.button,
              boxShadow: `0 4px 12px ${themeColors.button}40`
            }}
          >
            <FiSave className="w-5 h-5" />
            {loading ? 'Saving...' : 'Save Business Address'}
          </button>
        </div>
      </main>

      <BottomNav />
    </div>
  );
};

export default AddressManagement;

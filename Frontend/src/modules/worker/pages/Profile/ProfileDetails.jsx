import React, { useState, useEffect, useLayoutEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiUser, FiEdit2, FiMapPin, FiPhone, FiMail, FiBriefcase, FiFileText, FiCheckCircle, FiEye, FiX } from 'react-icons/fi';
import { workerAuthService } from '../../../../services/authService';
import { workerTheme as themeColors } from '../../../../theme';
import Header from '../../components/layout/Header';
import { useRegistrationConfig } from '../../utils/registrationConfig';
import ModalLock from '../../../../components/common/ModalLock';

const ProfileDetails = () => {
  const navigate = useNavigate();
  // Which documents the admin asks for, what they are called, and the labels of the extra questions
  const { core, labelOf } = useRegistrationConfig();

  // Helper function to convert hex to rgba
  const hexToRgba = (hex, alpha) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  const [profile, setProfile] = useState({
    name: '',
    businessName: '',
    phone: '',
    alternatePhone: '',
    email: '',
    address: '',
    serviceCategory: '',
    profilePhoto: '',
    aadharDocument: '',
    aadharBackDocument: '',
    panDocument: '',
    otherDocuments: [],
    customDocuments: [],
    customFields: {},
    isScrapOpted: false,
  });

  const [previewDoc, setPreviewDoc] = useState(null);

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
        // Optimistic load from local storage
        const localWorkerData = JSON.parse(localStorage.getItem('workerData') || '{}');
        const workerProfile = JSON.parse(localStorage.getItem('workerProfile') || '{}');

        // Merge sources, preferring workerData (which might be fresher from other pages)
        const storedData = { ...workerProfile, ...localWorkerData };

        if (Object.keys(storedData).length > 0) {
          // Format address if object
          let addressString = storedData.address;
          if (typeof storedData.address === 'object' && storedData.address !== null) {
            if (storedData.address.fullAddress) {
              addressString = storedData.address.fullAddress;
            } else {
              addressString = `${storedData.address.addressLine1 || ''} ${storedData.address.addressLine2 || ''} ${storedData.address.city || ''} ${storedData.address.state || ''} ${storedData.address.pincode || ''}`.trim() || 'Not set';
            }
          }

          setProfile(prev => ({
            ...prev,
            name: storedData.name || 'Service Partner',
            businessName: storedData.businessName || null,
            phone: storedData.phone || '',
            alternatePhone: storedData.alternatePhone || '',
            email: storedData.email || '',
            address: addressString || 'Not set',
            serviceCategory: storedData.serviceCategory || storedData.service || '',
            profilePhoto: storedData.profilePhoto || '',
            aadharDocument: storedData.aadharDocument || (storedData.aadhar && storedData.aadhar.document) || '',
            aadharBackDocument: storedData.aadharBackDocument || (storedData.aadhar && storedData.aadhar.backDocument) || '',
            panDocument: storedData.panDocument || (storedData.pan && storedData.pan.document) || '',
            otherDocuments: storedData.otherDocuments || [],
            customDocuments: storedData.customDocuments || [],
            customFields: storedData.customFields || {},
            isScrapOpted: Boolean(storedData.isScrapOpted),
          }));
        }

        // Fetch fresh data from API
        const response = await workerAuthService.getProfile();
        if (response.success) {
          const apiData = response.worker;

          // Format address
          let formattedAddress = apiData.address;
          if (typeof apiData.address === 'object' && apiData.address !== null) {
            if (apiData.address.fullAddress) {
              formattedAddress = apiData.address.fullAddress;
            } else {
              formattedAddress = `${apiData.address.addressLine1 || ''} ${apiData.address.addressLine2 || ''} ${apiData.address.city || ''} ${apiData.address.state || ''} ${apiData.address.pincode || ''}`.trim() || 'Not set';
            }
          }

          const newProfile = {
            name: apiData.name,
            businessName: apiData.businessName,
            phone: apiData.phone,
            alternatePhone: apiData.alternatePhone || '',
            email: apiData.email,
            address: formattedAddress,
            serviceCategory: Array.isArray(apiData.service) ? apiData.service.join(', ') : (apiData.service || ''),
            profilePhoto: apiData.profilePhoto,
            aadharDocument: apiData.aadharDocument || (apiData.aadhar && apiData.aadhar.document) || '',
            aadharBackDocument: apiData.aadharBackDocument || (apiData.aadhar && apiData.aadhar.backDocument) || '',
            panDocument: apiData.panDocument || (apiData.pan && apiData.pan.document) || '',
            otherDocuments: apiData.otherDocuments || [],
            customDocuments: apiData.customDocuments || [],
            customFields: apiData.customFields || {},
            isScrapOpted: Boolean(apiData.isScrapOpted),
          };

          setProfile(prev => ({ ...prev, ...newProfile }));

          // Update local storage
          localStorage.setItem('workerData', JSON.stringify(apiData));
          localStorage.setItem('workerProfile', JSON.stringify({ ...storedData, ...apiData }));
        }

      } catch (error) {
        console.error('Error loading profile:', error);
      }
    };

    loadProfile();
    window.addEventListener('workerProfileUpdated', loadProfile);

    return () => {
      window.removeEventListener('workerProfileUpdated', loadProfile);
    };
  }, []);

  return (
    <div className="min-h-screen pb-20" style={{ background: themeColors.backgroundGradient }}>
      <Header title="Profile Details" />

      <main className="px-4 pt-4 pb-6">
        {/* Header with Edit Button */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gray-900 text-lg">Profile Information</h3>
          <button
            onClick={() => navigate('/worker/profile/edit')}
            className="p-2 rounded-lg hover:scale-105 transition-all flex items-center gap-1.5"
            style={{
              background: `linear-gradient(135deg, ${themeColors.button} 0%, ${themeColors.icon} 100%)`,
              color: '#FFFFFF',
              boxShadow: `0 2px 8px ${hexToRgba(themeColors.button, 0.3)}`,
            }}
          >
            <FiEdit2 className="w-4 h-4" />
            <span className="text-sm font-semibold">Edit</span>
          </button>
        </div>

        {/* Profile Info - Compact List */}
        <div className="space-y-4 mb-6">

          {/* Profile Photo Section */}
          <div className="flex justify-center mb-2">
            <div className="w-28 h-28 rounded-full p-1 bg-white shadow-lg relative">
              <div className="w-full h-full rounded-full overflow-hidden bg-gray-50 flex items-center justify-center border border-gray-100">
                {profile.profilePhoto ? (
                  <img
                    src={profile.profilePhoto}
                    alt={profile.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <FiUser className="w-10 h-10 text-gray-300" />
                )}
              </div>
              <div
                className="absolute bottom-1 right-1 w-8 h-8 rounded-full flex items-center justify-center border-2 border-white shadow-md text-white"
                style={{ background: themeColors.button }}
              >
                <FiUser className="w-4 h-4" />
              </div>
            </div>
          </div>

          {/* Personal Info Group */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-4">Personal Details</h4>
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${themeColors.icon}15` }}>
                  <FiUser className="w-5 h-5" style={{ color: themeColors.icon }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-500 font-medium mb-0.5">Full Name</p>
                  <p className="text-gray-900 font-bold text-sm truncate">{profile.name}</p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${themeColors.icon}15` }}>
                  <FiBriefcase className="w-5 h-5" style={{ color: themeColors.icon }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-500 font-medium mb-0.5">Business Name</p>
                  <p className="text-gray-900 font-bold text-sm truncate">{profile.businessName}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Contact Info Group */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-4">Contact Information</h4>
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${themeColors.icon}15` }}>
                  <FiPhone className="w-5 h-5" style={{ color: themeColors.icon }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-500 font-medium mb-0.5">Mobile Number</p>
                  <p className="text-gray-900 font-bold text-sm truncate">{profile.phone}</p>
                </div>
              </div>

              {profile.alternatePhone && (
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${themeColors.icon}15` }}>
                    <FiPhone className="w-5 h-5" style={{ color: themeColors.icon }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-xs text-gray-500 font-medium">Alternate Number</p>
                      <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded font-medium">Optional</span>
                    </div>
                    <p className="text-gray-900 font-bold text-sm truncate">{profile.alternatePhone}</p>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${themeColors.icon}15` }}>
                  <FiMail className="w-5 h-5" style={{ color: themeColors.icon }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-500 font-medium mb-0.5">Email Address</p>
                  <p className="text-gray-900 font-bold text-sm truncate">{profile.email}</p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${themeColors.icon}15` }}>
                  <FiMapPin className="w-5 h-5" style={{ color: themeColors.icon }} />
                </div>
                <div className="flex-1 min-w-0 pt-1">
                  <p className="text-xs text-gray-500 font-medium mb-0.5">Address</p>
                  <p className="text-gray-900 font-bold text-sm leading-relaxed">{profile.address}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Professional Info Group */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-4">Professional Profile</h4>
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${themeColors.button}15` }}>
                <FiBriefcase className="w-5 h-5" style={{ color: themeColors.button }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-500 font-medium mb-1.5">Service Categories</p>
                <div className="flex flex-wrap gap-1.5">
                  {profile.serviceCategory && (Array.isArray(profile.serviceCategory) ? profile.serviceCategory : profile.serviceCategory.split(', ')).filter(Boolean).length > 0 ? (
                    (Array.isArray(profile.serviceCategory) ? profile.serviceCategory : profile.serviceCategory.split(', ')).filter(Boolean).map((cat, i) => (
                      <span key={i} className="inline-flex items-center px-2.5 py-1 rounded-lg bg-teal-50 text-teal-700 text-xs font-bold border border-teal-100">
                        {cat}
                      </span>
                    ))
                  ) : (
                    <span className="text-gray-400 text-sm italic">Not set</span>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-base">♻️</span>
                <div>
                  <p className="text-xs font-bold text-gray-800">Scrap Pickup Service</p>
                  <p className="text-[11px] text-gray-500">Collect recyclable scrap in your area</p>
                </div>
              </div>
              <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${profile.isScrapOpted ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-gray-100 text-gray-500'}`}>
                {profile.isScrapOpted ? 'Opted In' : 'Not Opted In'}
              </span>
            </div>
          </div>

          {/* Verification Documents Group */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wide">Verification Documents</h4>
              <button
                onClick={() => navigate('/worker/profile/edit')}
                className="text-xs text-blue-600 font-semibold hover:underline flex items-center gap-1"
              >
                <FiEdit2 className="w-3 h-3" /> Edit Documents
              </button>
            </div>

            <div className="space-y-3">
              {[
                { key: 'aadhar_front', label: core.aadhar_front.label, url: profile.aadharDocument },
                { key: 'aadhar_back', label: core.aadhar_back.label, url: profile.aadharBackDocument },
                { key: 'pan_document', label: core.pan_document.label, url: profile.panDocument }
              ]
                // A document the admin no longer asks for is hidden, unless the partner already uploaded one
                .filter(doc => core[doc.key].active || doc.url)
                .concat(Array.isArray(profile.customDocuments) ? profile.customDocuments.map(d => ({ label: d.label || labelOf(d.fieldKey), url: d.url })) : [])
                .map((doc, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-100">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
                      <FiFileText className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-gray-800">{doc.label}</p>
                      {doc.url ? (
                        <p className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1">
                          <FiCheckCircle className="w-3 h-3" /> Uploaded & Verified
                        </p>
                      ) : (
                        <p className="text-[10px] text-gray-400">Not uploaded</p>
                      )}
                    </div>
                  </div>
                  {doc.url && (
                    <button
                      type="button"
                      onClick={() => setPreviewDoc({ title: doc.label, url: doc.url })}
                      className="text-xs font-semibold text-blue-600 hover:text-blue-700 bg-white px-2.5 py-1 rounded-lg border border-gray-200 shadow-sm flex items-center gap-1"
                    >
                      <FiEye className="w-3.5 h-3.5" /> View
                    </button>
                  )}
                </div>
              ))}

              {profile.otherDocuments && profile.otherDocuments.length > 0 && (
                <div className="pt-2">
                  <p className="text-[11px] font-semibold text-gray-500 mb-2">Additional Documents ({profile.otherDocuments.length})</p>
                  <div className="grid grid-cols-2 gap-2">
                    {profile.otherDocuments.map((docUrl, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setPreviewDoc({ title: `Document ${idx + 1}`, url: docUrl })}
                        className="p-2 rounded-lg bg-gray-50 border border-gray-100 text-left hover:bg-gray-100 transition-colors flex items-center justify-between"
                      >
                        <span className="text-xs font-medium text-gray-700 truncate">Doc {idx + 1}</span>
                        <FiEye className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Answers to the extra questions the admin asks at signup */}
          {Object.entries(profile.customFields || {}).filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== '').length > 0 && (
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-4">Additional Details</h4>
              <div className="space-y-3">
                {Object.entries(profile.customFields || {})
                  .filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== '')
                  .map(([key, value]) => (
                    <div key={key} className="p-3 rounded-xl bg-gray-50 border border-gray-100">
                      <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">{labelOf(key)}</p>
                      <p className="text-sm font-semibold text-gray-800 mt-0.5 break-words">{String(value)}</p>
                    </div>
                  ))}
              </div>
            </div>
          )}

        </div>
      </main>

      {/* Full Document Preview Modal */}
      {previewDoc && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setPreviewDoc(null)}
        >
          <ModalLock />
          <div
            className="bg-white rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
              <div>
                <h3 className="font-bold text-gray-800 text-sm">{previewDoc.title}</h3>
                <p className="text-[11px] text-gray-400">Document Preview</p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewDoc(null)}
                className="w-8 h-8 rounded-full bg-gray-200 hover:bg-gray-300 text-gray-700 flex items-center justify-center transition-colors"
              >
                <FiX className="w-4 h-4" />
              </button>
            </div>
            <div className="p-3 bg-gray-950 flex items-center justify-center max-h-[70vh] overflow-auto">
              <img
                src={previewDoc.url}
                alt={previewDoc.title}
                className="max-h-[65vh] w-auto max-w-full rounded-lg object-contain shadow-md"
              />
            </div>
            <div className="p-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
              <a
                href={previewDoc.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 font-semibold hover:underline inline-flex items-center gap-1"
              >
                Open in new tab
              </a>
              <button
                type="button"
                onClick={() => setPreviewDoc(null)}
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

export default ProfileDetails;


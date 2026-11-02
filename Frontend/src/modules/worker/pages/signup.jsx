import SkillTreePicker from '../components/SkillTreePicker';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { FiUser, FiMail, FiPhone, FiFileText, FiUpload, FiX, FiArrowRight, FiChevronLeft, FiCheckCircle, FiCamera, FiGift, FiBriefcase, FiChevronDown, FiSearch, FiCheck } from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import { themeColors } from '../../../theme';
import { register, sendOTP as sendWorkerOTP, getPartnerRegistrationFields } from '../services/authService';
import LogoLoader from '../../../components/common/LogoLoader';
import Logo from '../../../components/common/Logo';
import { compressImage } from '../../../utils/imageCompression';
import { buildCoreConfig } from '../utils/registrationConfig';

import { z } from "zod";

// Zod schema for Worker Signup. Aadhar and PAN follow the admin's visible / mandatory settings.
const buildSignupSchema = (core) => {
  const optionalFormat = (regex, message) => z.string().regex(new RegExp(`^(${regex.source})?$`), message);
  const aadharMessage = "Aadhar number must be exactly 12 digits";
  const panMessage = "Invalid PAN format (e.g. ABCDE1234F)";
  const aadharRegex = /\d{12}/;
  const panRegex = /[A-Z]{5}[0-9]{4}[A-Z]{1}/;
  const aadhar = core.aadhar_number.active
    ? (core.aadhar_number.required ? z.string().regex(new RegExp(`^${aadharRegex.source}$`), aadharMessage) : optionalFormat(aadharRegex, aadharMessage))
    : z.string().optional();
  const pan = core.pan_number.active
    ? (core.pan_number.required ? z.string().regex(new RegExp(`^${panRegex.source}$`), panMessage) : optionalFormat(panRegex, panMessage))
    : z.string().optional();
  return z.object({
    name: z.string().min(2, "Full Name must be at least 2 characters"),
    email: z.string().email("Please enter a valid email address"),
    phoneNumber: z.string().regex(/^\d{10}$/, "Please enter a valid 10-digit phone number"),
    aadhar,
    pan
  });
};

const WorkerSignup = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [step, setStep] = useState('details'); // 'details' or 'otp'
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phoneNumber: '',
    aadhar: '',
    pan: '',
    service: [],
    referralCode: '',
    documents: []
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [otpToken, setOtpToken] = useState('');
  const [verificationToken, setVerificationToken] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [documentPreview, setDocumentPreview] = useState({});
  const [uploadingDocs, setUploadingDocs] = useState({});
  const [resendTimer, setResendTimer] = useState(0);

  // Dynamic Registration Fields (configured by Admin Panel)
  const [dynamicFields, setDynamicFields] = useState([]);
  const [customFields, setCustomFields] = useState({});
  const [customDocuments, setCustomDocuments] = useState({});
  const [customDocPreview, setCustomDocPreview] = useState({});
  const [uploadingCustomDocs, setUploadingCustomDocs] = useState({});
  const [customFieldErrors, setCustomFieldErrors] = useState({});


  // Refs for auto-focus
  const nameInputRef = useRef(null);
  const otpInputRefs = useRef([]);

  // Timer countdown effect
  useEffect(() => {
    let interval;
    if (resendTimer > 0) {
      interval = setInterval(() => {
        setResendTimer((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [resendTimer]);

  // Unified Flow: Pre-fill and check URL referral param (?ref=...)
  useEffect(() => {
    if (location.state?.phone && location.state?.verificationToken) {
      setFormData(prev => ({ ...prev, phoneNumber: location.state.phone }));
      setVerificationToken(location.state.verificationToken);
    }
    const searchParams = new URLSearchParams(location.search);
    const refParam = searchParams.get('ref') || location.state?.referralCode;
    if (refParam) {
      setFormData(prev => ({ ...prev, referralCode: refParam.toUpperCase() }));
    }
  }, [location.state, location.search]);

  // Clear any existing worker tokens on page load
  useEffect(() => {
    localStorage.removeItem('workerAccessToken');
    localStorage.removeItem('workerRefreshToken');
    localStorage.removeItem('workerData');
  }, []);


  // Load dynamic registration fields configured in Admin Panel
  useEffect(() => {
    const fetchFields = async () => {
      try {
        const res = await getPartnerRegistrationFields();
        if (res && res.success && Array.isArray(res.fields)) {
          setDynamicFields(res.fields);
        }
      } catch (err) {
        console.warn('Could not load dynamic registration fields:', err);
      }
    };
    fetchFields();
  }, []);

  // Core fields (name, Aadhar, PAN, documents...) as the admin configured them
  const core = useMemo(() => buildCoreConfig(dynamicFields), [dynamicFields]);

  // Split into active text fields and active document upload fields (the admin's own, not the core ones)
  const dynamicTextFields = useMemo(() => {
    return dynamicFields
      .filter(f => f.isActive && !f.isCore && (f.section === 'profile' || f.type !== 'document'))
      .sort((a, b) => (a.order || 0) - (b.order || 0));
  }, [dynamicFields]);

  const dynamicDocFields = useMemo(() => {
    return dynamicFields
      .filter(f => f.isActive && !f.isCore && (f.section === 'documents' || f.type === 'document'))
      .sort((a, b) => (a.order || 0) - (b.order || 0));
  }, [dynamicFields]);


  // Auto-focus logic
  useEffect(() => {
    if (step === 'details' && nameInputRef.current) {
      setTimeout(() => nameInputRef.current.focus(), 100);
    } else if (step === 'otp' && otpInputRefs.current[0]) {
      setTimeout(() => otpInputRefs.current[0].focus(), 100);
    }
  }, [step]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    if (fieldErrors[name]) {
      setFieldErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const handleDocumentUpload = async (e, type) => {
    const file = e.target.files[0];
    if (!file) return;

    const validTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp', 'image/gif', 'application/pdf'];
    if (!validTypes.includes(file.type)) {
      toast.error('Please upload a valid image or PDF');
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      toast.error('File size should be less than 15MB');
      return;
    }

    setUploadingDocs(prev => ({ ...prev, [type]: true }));
    const loadingToast = toast.loading("Processing file...");

    try {
      let fileToUpload = file;
      let previewUrl = '';

      // Compress if it is an image
      if (file.type.startsWith('image/')) {
        try {
          const compressedFile = await compressImage(file, {
            maxWidth: 1280, // Reasonable max width for documents
            maxHeight: 1280,
            quality: 0.8
          });
          fileToUpload = compressedFile;
          toast.dismiss(loadingToast); // Dismiss compression loading
        } catch (compressionError) {
          console.error("Compression failed, using original file", compressionError);
          toast.error("Compression failed, using original");
          // fileToUpload remains original
        }
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        previewUrl = reader.result;
        setFormData(prev => ({
          ...prev,
          documents: [...prev.documents.filter(d => d.type !== type), { type, file: fileToUpload, url: previewUrl }]
        }));
        setDocumentPreview(prev => ({
          ...prev,
          [type]: previewUrl
        }));
        setUploadingDocs(prev => ({ ...prev, [type]: false }));
        toast.dismiss(loadingToast);
        toast.success("Image uploaded", { duration: 2000 });
      };

      reader.onerror = () => {
        console.error("FileReader failed");
        toast.dismiss(loadingToast);
        toast.error("Failed to read file");
        setUploadingDocs(prev => ({ ...prev, [type]: false }));
      };

      reader.readAsDataURL(fileToUpload);

    } catch (error) {
      console.error("Upload processing error", error);
      toast.dismiss(loadingToast);
      toast.error("Failed to process file");
      setUploadingDocs(prev => ({ ...prev, [type]: false }));
    }
  };

  const removeDocument = (type) => {
    setFormData(prev => ({
      ...prev,
      documents: prev.documents.filter(d => d.type !== type)
    }));
    setDocumentPreview(prev => {
      const newPreview = { ...prev };
      delete newPreview[type];
      return newPreview;
    });
  };

  const handleCustomFieldChange = (fieldKey, value) => {
    setCustomFields(prev => ({ ...prev, [fieldKey]: value }));
    if (customFieldErrors[fieldKey]) {
      setCustomFieldErrors(prev => ({ ...prev, [fieldKey]: '' }));
    }
  };

  const handleCustomDocUpload = async (e, field) => {
    const file = e.target.files[0];
    if (!file) return;

    const validTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp', 'image/gif', 'application/pdf'];
    if (!validTypes.includes(file.type)) {
      toast.error('Please upload a valid image or PDF');
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      toast.error('File size should be less than 15MB');
      return;
    }

    const key = field.fieldKey;
    setUploadingCustomDocs(prev => ({ ...prev, [key]: true }));
    const loadingToast = toast.loading(`Processing ${field.label}...`);

    try {
      let fileToUpload = file;
      let previewUrl = '';

      if (file.type.startsWith('image/')) {
        try {
          const compressedFile = await compressImage(file, {
            maxWidth: 1280,
            maxHeight: 1280,
            quality: 0.8
          });
          fileToUpload = compressedFile;
        } catch (compressionError) {
          console.error("Compression failed, using original file", compressionError);
        }
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        previewUrl = reader.result;
        setCustomDocuments(prev => ({
          ...prev,
          [key]: {
            fieldKey: key,
            label: field.label,
            url: previewUrl,
            file: fileToUpload,
            fileName: file.name,
            fileType: file.type
          }
        }));
        setCustomDocPreview(prev => ({
          ...prev,
          [key]: previewUrl
        }));
        setUploadingCustomDocs(prev => ({ ...prev, [key]: false }));
        toast.dismiss(loadingToast);
        toast.success(`${field.label} uploaded`, { duration: 2000 });
      };

      reader.onerror = () => {
        console.error("FileReader failed");
        toast.dismiss(loadingToast);
        toast.error("Failed to read file");
        setUploadingCustomDocs(prev => ({ ...prev, [key]: false }));
      };

      reader.readAsDataURL(fileToUpload);
    } catch (error) {
      console.error("Upload processing error", error);
      toast.dismiss(loadingToast);
      toast.error("Failed to process file");
      setUploadingCustomDocs(prev => ({ ...prev, [key]: false }));
    }
  };

  const removeCustomDocument = (fieldKey) => {
    setCustomDocuments(prev => {
      const next = { ...prev };
      delete next[fieldKey];
      return next;
    });
    setCustomDocPreview(prev => {
      const next = { ...prev };
      delete next[fieldKey];
      return next;
    });
  };

  const handleDetailsSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setFieldErrors({});

    // Zod Validation
    const validationResult = buildSignupSchema(core).safeParse({
      name: formData.name?.trim(),
      email: formData.email?.trim(),
      phoneNumber: formData.phoneNumber?.trim(),
      aadhar: formData.aadhar?.trim(),
      pan: formData.pan?.trim()
    });

    if (!validationResult.success) {
      const errMap = {};
      validationResult.error.errors.forEach(err => {
        const field = err.path[0];
        if (!errMap[field]) errMap[field] = err.message;
      });
      setFieldErrors(errMap);
      toast.error(validationResult.error.errors[0].message);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    // Manual Document Validation remains
    const hasAadharDoc = formData.documents.some(d => d.type === 'aadhar');
    const hasAadharBackDoc = formData.documents.some(d => d.type === 'aadharBack');
    const hasPanDoc = formData.documents.some(d => d.type === 'pan');
    if (core.aadhar_front.active && core.aadhar_front.required && !hasAadharDoc) { toast.error(`Please upload ${core.aadhar_front.label}`); return; }
    if (core.aadhar_back.active && core.aadhar_back.required && !hasAadharBackDoc) { toast.error(`Please upload ${core.aadhar_back.label}`); return; }
    if (core.pan_document.active && core.pan_document.required && !hasPanDoc) { toast.error(`Please upload ${core.pan_document.label}`); return; }

    // Dynamic Text Fields Validation
    for (const tf of dynamicTextFields) {
      if (tf.isRequired) {
        const val = customFields[tf.fieldKey];
        if (!val || String(val).trim() === '') {
          setCustomFieldErrors(prev => ({ ...prev, [tf.fieldKey]: `${tf.label} is required` }));
          toast.error(`Please provide ${tf.label}`);
          return;
        }
      }
    }

    // Dynamic Documents Validation
    for (const df of dynamicDocFields) {
      if (df.isRequired) {
        if (!customDocuments[df.fieldKey] || !customDocuments[df.fieldKey].url) {
          toast.error(`Please upload ${df.label}`);
          return;
        }
      }
    }

    // Service Categories Validation
    if (core.service_categories.active && core.service_categories.required && (!Array.isArray(formData.service) || formData.service.length === 0)) {
      setFieldErrors(prev => ({ ...prev, service: 'Please select at least one service category' }));
      toast.error('Please select at least one service category');
      return;
    }

    setIsLoading(true);

    if (verificationToken) {
      try {
        const aadharDoc = formData.documents.find(d => d.type === 'aadhar')?.url || null;
        const aadharBackDoc = formData.documents.find(d => d.type === 'aadharBack')?.url || null;
        const panDoc = formData.documents.find(d => d.type === 'pan')?.url || null;
        const otherDocs = formData.documents.filter(d => d.type === 'other').map(d => d.url);

        const registerData = {
          name: formData.name.trim(),
          email: formData.email.trim(),
          phone: formData.phoneNumber.trim(),
          aadhar: formData.aadhar.trim(),
          pan: formData.pan.trim(),
          service: Array.isArray(formData.service) ? formData.service : [],
          aadharDocument: aadharDoc,
          aadharBackDocument: aadharBackDoc,
          panDocument: panDoc,
          otherDocuments: otherDocs,
          customFields,
          customDocuments: Object.values(customDocuments),
          referralCode: formData.referralCode?.trim() || undefined,
          verificationToken
        };

        const response = await register(registerData);

        if (response.success) {
          toast.success(
            <div className="flex flex-col">
              <span className="font-bold">Application Submitted!</span>
              <span className="text-xs">Your worker account is pending admin approval.</span>
            </div>,
            { icon: <FiCheckCircle className="text-[#D68F35]" />, duration: 5000 }
          );
          navigate('/worker/login');
        } else {
          toast.error(response.message || 'Registration failed');
        }
      } catch (error) {
        toast.error(error.response?.data?.message || 'Registration failed');
      } finally {
        setIsLoading(false);
      }
      return;
    }

    try {
      const response = await sendWorkerOTP(formData.phoneNumber.trim());
      if (response.success) {
        setOtpToken(response.token);
        setIsLoading(false);
        setStep('otp');
        setResendTimer(120); // Start timer
        toast.success('OTP sent successfully');
      } else {
        setIsLoading(false);
        toast.error(response.message || 'Failed to send OTP');
      }
    } catch (error) {
      setIsLoading(false);
      toast.error(error.response?.data?.message || 'Failed to send OTP');
    }
  };

  const handleOtpChange = (index, value) => {
    const cleanValue = value.replace(/\D/g, '').slice(0, 1);
    const newOtp = [...otp];
    newOtp[index] = cleanValue;
    setOtp(newOtp);

    if (cleanValue && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  };

  // Auto-verify as last digit enters
  useEffect(() => {
    const otpValue = otp.join('');
    if (otpValue.length === 6 && !isLoading && otpToken) {
      handleOtpSubmit();
    }
  }, [otp]);

  const handleOtpSubmit = async (e) => {
    if (e) e.preventDefault();
    const otpValue = otp.join('');
    if (otpValue.length !== 6) {
      toast.error('Please enter complete OTP');
      return;
    }
    if (!otpToken) {
      toast.error('Please request OTP first');
      return;
    }
    setIsLoading(true);
    try {
      const aadharDoc = formData.documents.find(d => d.type === 'aadhar')?.url || null;
      const aadharBackDoc = formData.documents.find(d => d.type === 'aadharBack')?.url || null;
      const panDoc = formData.documents.find(d => d.type === 'pan')?.url || null;
      const otherDocs = formData.documents.filter(d => d.type === 'other').map(d => d.url);

      const registerData = {
        name: formData.name,
        email: formData.email,
        phone: formData.phoneNumber,
        aadhar: formData.aadhar,
        pan: formData.pan,
        service: formData.service,
        aadharDocument: aadharDoc,
        aadharBackDocument: aadharBackDoc,
        panDocument: panDoc,
        otherDocuments: otherDocs,
        customFields,
        customDocuments: Object.values(customDocuments),
        referralCode: formData.referralCode?.trim() || undefined,
        otp: otpValue,
        token: otpToken
      };

      const response = await register(registerData);

      if (response.success) {
        setIsLoading(false);
        toast.success('Registration successful! Pending admin approval.');
        navigate('/worker/login');
      } else {
        setIsLoading(false);
        toast.error(response.message || 'Registration failed');
      }
    } catch (error) {
      setIsLoading(false);
      toast.error(error.response?.data?.message || 'Registration failed');
    }
  };

  const brandColor = themeColors.brand?.teal || '#347989';

  // "(Optional)" next to the label of a core field the admin made optional
  const optionalTag = (cfg) => (cfg.required ? null : <span className="text-gray-400 text-xs font-normal"> (Optional)</span>);
  const helpNote = (cfg) => (cfg.helpText ? <p className="text-[11px] text-gray-400 mt-0.5">{cfg.helpText}</p> : null);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 relative">
      {/* Decorative Background Elements - Fixed Container to prevent scroll issues */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#347989] opacity-[0.03] rounded-full blur-3xl animate-floating" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-[#D68F35] opacity-[0.03] rounded-full blur-3xl animate-floating" style={{ animationDelay: '2s' }} />
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-2xl text-center mb-8 relative z-10 animate-fade-in">
        <Logo className="h-24 w-auto mx-auto transform hover:scale-110 transition-transform duration-500" />
        <h2 className="mt-4 text-3xl font-extrabold text-gray-900 tracking-tight">
          {step === 'details' ? 'Service Partner Registration' : 'Verify Identity'}
        </h2>
        <p className="mt-2 text-sm text-gray-600 animate-stagger-1 animate-fade-in">
          Join Help U as a Service Partner and grow your business
        </p>
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-2xl relative z-10">
        <div className="bg-white py-8 px-4 shadow-2xl shadow-gray-200/50 sm:rounded-2xl sm:px-10 border border-gray-100 relative z-20 animate-slide-in-bottom">
          {/* Top accent bar — kept as a separate element since overflow-hidden was removed to allow dropdowns to escape */}
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#347989] via-[#D68F35] to-[#BB5F36] rounded-t-2xl" />

          {step === 'details' ? (
            <form onSubmit={handleDetailsSubmit} className="space-y-8" noValidate>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Basic Details */}
                <div className="flex flex-col gap-4 animate-stagger-1 animate-fade-in">
                  <h3 className="text-lg font-bold text-gray-900 border-b pb-2" style={{ order: -1 }}>Business Profile</h3>

                  <div className="animate-fade-in" style={{ animationDelay: '0.1s', order: core.name.order }}>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{core.name.label}</label>
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none group-focus-within:text-[#347989] transition-colors">
                        <FiUser className="text-gray-400" />
                      </div>
                      <input
                        ref={nameInputRef}
                        type="text"
                        name="name"
                        required
                        value={formData.name}
                        onChange={handleInputChange}
                        className={`block w-full pl-10 pr-4 py-2.5 border rounded-xl focus:ring-2 focus:ring-offset-2 transition-all duration-300 outline-none ${
                          fieldErrors.name ? 'border-red-500 focus:ring-red-400' : 'border-gray-300 hover:border-gray-400'
                        }`}
                        style={{ '--tw-ring-color': fieldErrors.name ? '#EF4444' : brandColor }}
                        placeholder={core.name.placeholder}
                      />
                    </div>
                    {fieldErrors.name && <p className="text-xs text-red-500 mt-1 font-medium">{fieldErrors.name}</p>}
                    {helpNote(core.name)}
                  </div>

                  <div className="animate-fade-in" style={{ animationDelay: '0.2s', order: core.email.order }}>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{core.email.label}</label>
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none group-focus-within:text-[#347989] transition-colors">
                        <FiMail className="text-gray-400" />
                      </div>
                      <input
                        type="email"
                        name="email"
                        required
                        value={formData.email}
                        onChange={handleInputChange}
                        className={`block w-full pl-10 pr-4 py-2.5 border rounded-xl focus:ring-2 focus:ring-offset-2 transition-all duration-300 outline-none ${
                          fieldErrors.email ? 'border-red-500 focus:ring-red-400' : 'border-gray-300 hover:border-gray-400'
                        }`}
                        style={{ '--tw-ring-color': fieldErrors.email ? '#EF4444' : brandColor }}
                        placeholder={core.email.placeholder}
                      />
                    </div>
                    {fieldErrors.email && <p className="text-xs text-red-500 mt-1 font-medium">{fieldErrors.email}</p>}
                    {helpNote(core.email)}
                  </div>

                  {!verificationToken && (
                    <div className="animate-fade-in" style={{ animationDelay: '0.3s', order: core.phone.order }}>
                      <label className="block text-sm font-medium text-gray-700 mb-1">{core.phone.label}</label>
                      <div className="relative group">
                        <div className="absolute inset-y-0 left-0 pl-3 border-r pr-2 flex items-center pointer-events-none">
                          <span className="text-gray-500 text-sm font-bold">+91</span>
                        </div>
                        <input
                          type="tel"
                          required
                          value={formData.phoneNumber}
                          onChange={(e) => {
                            setFormData(p => ({ ...p, phoneNumber: e.target.value.replace(/\D/g, '').slice(0, 10) }));
                            if (fieldErrors.phoneNumber) setFieldErrors(p => ({ ...p, phoneNumber: '' }));
                          }}
                          className={`block w-full pl-14 pr-4 py-2.5 border rounded-xl focus:ring-2 focus:ring-offset-2 transition-all duration-300 outline-none ${
                            fieldErrors.phoneNumber ? 'border-red-500 focus:ring-red-400' : 'border-gray-300 hover:border-gray-400'
                          }`}
                          style={{ '--tw-ring-color': fieldErrors.phoneNumber ? '#EF4444' : brandColor }}
                          placeholder={core.phone.placeholder}
                        />
                      </div>
                      {fieldErrors.phoneNumber && <p className="text-xs text-red-500 mt-1 font-medium">{fieldErrors.phoneNumber}</p>}
                      {helpNote(core.phone)}
                    </div>
                  )}

                  {core.aadhar_number.active && (
                  <div className="animate-fade-in" style={{ animationDelay: '0.4s', order: core.aadhar_number.order }}>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{core.aadhar_number.label}{optionalTag(core.aadhar_number)}</label>
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none group-focus-within:text-[#347989] transition-colors">
                        <FiFileText className="text-gray-400" />
                      </div>
                      <input
                        type="text"
                        required
                        value={formData.aadhar}
                        onChange={(e) => {
                          setFormData(p => ({ ...p, aadhar: e.target.value.replace(/\D/g, '').slice(0, 12) }));
                          if (fieldErrors.aadhar) setFieldErrors(p => ({ ...p, aadhar: '' }));
                        }}
                        className={`block w-full pl-10 pr-4 py-2.5 border rounded-xl focus:ring-2 focus:ring-offset-2 transition-all duration-300 outline-none ${
                          fieldErrors.aadhar ? 'border-red-500 focus:ring-red-400' : 'border-gray-300 hover:border-gray-400'
                        }`}
                        style={{ '--tw-ring-color': fieldErrors.aadhar ? '#EF4444' : brandColor }}
                        placeholder={core.aadhar_number.placeholder}
                      />
                    </div>
                    {fieldErrors.aadhar && <p className="text-xs text-red-500 mt-1 font-medium">{fieldErrors.aadhar}</p>}
                    {helpNote(core.aadhar_number)}
                  </div>
                  )}

                  {core.pan_number.active && (
                  <div className="animate-fade-in" style={{ animationDelay: '0.5s', order: core.pan_number.order }}>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{core.pan_number.label}{optionalTag(core.pan_number)}</label>
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none group-focus-within:text-[#347989] transition-colors">
                        <FiFileText className="text-gray-400" />
                      </div>
                      <input
                        type="text"
                        required
                        value={formData.pan}
                        onChange={(e) => {
                          setFormData(p => ({ ...p, pan: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10) }));
                          if (fieldErrors.pan) setFieldErrors(p => ({ ...p, pan: '' }));
                        }}
                        className={`block w-full pl-10 pr-4 py-2.5 border rounded-xl focus:ring-2 focus:ring-offset-2 transition-all duration-300 outline-none font-medium tracking-wider uppercase ${
                          fieldErrors.pan ? 'border-red-500 focus:ring-red-400' : 'border-gray-300 hover:border-gray-400'
                        }`}
                        style={{ '--tw-ring-color': fieldErrors.pan ? '#EF4444' : brandColor }}
                        placeholder={core.pan_number.placeholder}
                      />
                    </div>
                    {fieldErrors.pan && <p className="text-xs text-red-500 mt-1 font-medium">{fieldErrors.pan}</p>}
                    {helpNote(core.pan_number)}
                  </div>
                  )}


                  {core.referral_code.active && (
                  <div className="animate-fade-in" style={{ animationDelay: '0.6s', order: core.referral_code.order }}>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {core.referral_code.label}{optionalTag(core.referral_code)}
                    </label>
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none group-focus-within:text-[#347989] transition-colors">
                        <FiGift className="text-gray-400" />
                      </div>
                      <input
                        type="text"
                        name="referralCode"
                        value={formData.referralCode}
                        onChange={(e) => setFormData(p => ({ ...p, referralCode: e.target.value.toUpperCase().trim() }))}
                        className="block w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-offset-2 transition-all duration-300 outline-none hover:border-gray-400 uppercase font-semibold text-gray-800 tracking-wider placeholder:normal-case placeholder:font-normal placeholder:tracking-normal"
                        style={{ '--tw-ring-color': brandColor }}
                        placeholder={core.referral_code.placeholder}
                      />
                    </div>
                    {helpNote(core.referral_code)}
                  </div>
                  )}

                  {/* Dynamic Text Boxes Configured in Admin Panel */}
                  {dynamicTextFields.length > 0 && (
                    <>
                      {dynamicTextFields.map((field) => {
                        const err = customFieldErrors[field.fieldKey];
                        return (
                          <div key={field._id || field.fieldKey} className="animate-fade-in" style={{ order: field.order || 0 }}>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              {field.label} {field.isRequired ? <span className="text-red-500">*</span> : <span className="text-gray-400 text-xs font-normal">(Optional)</span>}
                            </label>
                            <div className="relative group">
                              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none group-focus-within:text-[#347989] transition-colors">
                                <FiFileText className="text-gray-400" />
                              </div>
                              {field.type === 'select' ? (
                                <select
                                  value={customFields[field.fieldKey] || ''}
                                  onChange={(e) => handleCustomFieldChange(field.fieldKey, e.target.value)}
                                  className={`block w-full pl-10 pr-4 py-2.5 border rounded-xl focus:ring-2 focus:ring-offset-2 transition-all duration-300 outline-none bg-white ${
                                    err ? 'border-red-500 focus:ring-red-400' : 'border-gray-300 hover:border-gray-400'
                                  }`}
                                  style={{ '--tw-ring-color': err ? '#EF4444' : brandColor }}
                                >
                                  <option value="">{field.placeholder || `Select ${field.label}`}</option>
                                  {Array.isArray(field.options) && field.options.map((opt, i) => (
                                    <option key={i} value={opt}>{opt}</option>
                                  ))}
                                </select>
                              ) : field.type === 'textarea' ? (
                                <textarea
                                  rows={2}
                                  value={customFields[field.fieldKey] || ''}
                                  onChange={(e) => handleCustomFieldChange(field.fieldKey, e.target.value)}
                                  placeholder={field.placeholder || `Enter ${field.label}`}
                                  className={`block w-full pl-10 pr-4 py-2.5 border rounded-xl focus:ring-2 focus:ring-offset-2 transition-all duration-300 outline-none ${
                                    err ? 'border-red-500 focus:ring-red-400' : 'border-gray-300 hover:border-gray-400'
                                  }`}
                                  style={{ '--tw-ring-color': err ? '#EF4444' : brandColor }}
                                />
                              ) : (
                                <input
                                  type={field.type === 'number' ? 'number' : 'text'}
                                  value={customFields[field.fieldKey] || ''}
                                  onChange={(e) => handleCustomFieldChange(field.fieldKey, e.target.value)}
                                  placeholder={field.placeholder || `Enter ${field.label}`}
                                  className={`block w-full pl-10 pr-4 py-2.5 border rounded-xl focus:ring-2 focus:ring-offset-2 transition-all duration-300 outline-none ${
                                    err ? 'border-red-500 focus:ring-red-400' : 'border-gray-300 hover:border-gray-400'
                                  }`}
                                  style={{ '--tw-ring-color': err ? '#EF4444' : brandColor }}
                                />
                              )}
                            </div>
                            {err && <p className="text-xs text-red-500 mt-1 font-medium">{err}</p>}
                            {field.helpText && <p className="text-[11px] text-gray-400 mt-0.5">{field.helpText}</p>}
                          </div>
                        );
                      })}
                    </>
                  )}

                </div>

                {/* Documents Section */}
                <div className="space-y-4 animate-stagger-2 animate-fade-in">
                  <h3 className="text-lg font-bold text-gray-900 border-b pb-2">Verification Docs</h3>

                  <div className="grid grid-cols-2 gap-4">
                    {/* Aadhar Upload */}
                    {/* Aadhar Front Upload */}
                    {core.aadhar_front.active && (
                    <div className="space-y-2 animate-fade-in" style={{ animationDelay: '0.2s', order: core.aadhar_front.order }}>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{core.aadhar_front.label}{optionalTag(core.aadhar_front)}</p>
                      {documentPreview.aadhar ? (
                        <div className="relative group overflow-hidden rounded-xl">
                          <img src={documentPreview.aadhar} className="w-full h-28 object-cover border transform group-hover:scale-110 transition-transform duration-500" />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <button type="button" onClick={() => removeDocument('aadhar')} className="bg-red-500 text-white rounded-full p-2 shadow-xl hover:bg-red-600 transition-colors">
                              <FiX size={16} />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center w-full h-28 border-2 border-dashed border-gray-200 rounded-xl hover:bg-gray-50 transition-all duration-300 hover:border-[#347989] group bg-white relative">
                          {uploadingDocs.aadhar ? (
                            <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-10 rounded-xl">
                              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#347989]"></div>
                            </div>
                          ) : null}
                          <label className="flex flex-col items-center cursor-pointer w-full h-full justify-center">
                            <div className="p-2.5 bg-blue-50 text-blue-600 rounded-full mb-1 hover:bg-blue-100">
                              <FiUpload className="w-5 h-5" />
                            </div>
                            <span className="text-[10px] text-gray-500 font-bold">Upload Front</span>
                            <input type="file" className="hidden" accept="image/*,application/pdf" onChange={(e) => handleDocumentUpload(e, 'aadhar')} disabled={uploadingDocs.aadhar} />
                          </label>
                        </div>
                      )}
                      {core.aadhar_front.helpText && <p className="text-[10px] text-gray-400 italic">{core.aadhar_front.helpText}</p>}
                    </div>
                    )}

                    {/* Aadhar Back Upload */}
                    {core.aadhar_back.active && (
                    <div className="space-y-2 animate-fade-in" style={{ animationDelay: '0.25s', order: core.aadhar_back.order }}>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{core.aadhar_back.label}{optionalTag(core.aadhar_back)}</p>
                      {documentPreview.aadharBack ? (
                        <div className="relative group overflow-hidden rounded-xl">
                          <img src={documentPreview.aadharBack} className="w-full h-28 object-cover border transform group-hover:scale-110 transition-transform duration-500" />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <button type="button" onClick={() => removeDocument('aadharBack')} className="bg-red-500 text-white rounded-full p-2 shadow-xl hover:bg-red-600 transition-colors">
                              <FiX size={16} />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center w-full h-28 border-2 border-dashed border-gray-200 rounded-xl hover:bg-gray-50 transition-all duration-300 hover:border-[#347989] group bg-white relative">
                          {uploadingDocs.aadharBack ? (
                            <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-10 rounded-xl">
                              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#347989]"></div>
                            </div>
                          ) : null}
                          <label className="flex flex-col items-center cursor-pointer w-full h-full justify-center">
                            <div className="p-2.5 bg-blue-50 text-blue-600 rounded-full mb-1 hover:bg-blue-100">
                              <FiUpload className="w-5 h-5" />
                            </div>
                            <span className="text-[10px] text-gray-500 font-bold">Upload Back</span>
                            <input type="file" className="hidden" accept="image/*,application/pdf" onChange={(e) => handleDocumentUpload(e, 'aadharBack')} disabled={uploadingDocs.aadharBack} />
                          </label>
                        </div>
                      )}
                      {core.aadhar_back.helpText && <p className="text-[10px] text-gray-400 italic">{core.aadhar_back.helpText}</p>}
                    </div>
                    )}

                    {/* PAN Upload */}
                    {core.pan_document.active && (
                    <div className="space-y-2 animate-fade-in" style={{ animationDelay: '0.3s', order: core.pan_document.order }}>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{core.pan_document.label}{optionalTag(core.pan_document)}</p>
                      {documentPreview.pan ? (
                        <div className="relative group overflow-hidden rounded-xl">
                          <img src={documentPreview.pan} className="w-full h-28 object-cover border transform group-hover:scale-110 transition-transform duration-500" />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <button type="button" onClick={() => removeDocument('pan')} className="bg-red-500 text-white rounded-full p-2 shadow-xl hover:bg-red-600 transition-colors">
                              <FiX size={16} />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center w-full h-28 border-2 border-dashed border-gray-200 rounded-xl hover:bg-gray-50 transition-all duration-300 hover:border-[#347989] group bg-white relative">
                          {uploadingDocs.pan ? (
                            <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-10 rounded-xl">
                              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#347989]"></div>
                            </div>
                          ) : null}
                          <label className="flex flex-col items-center cursor-pointer w-full h-full justify-center">
                            <div className="p-2.5 bg-blue-50 text-blue-600 rounded-full mb-1 hover:bg-blue-100">
                              <FiUpload className="w-5 h-5" />
                            </div>
                            <span className="text-[10px] text-gray-500 font-bold">Upload Image</span>
                            <input type="file" className="hidden" accept="image/*,application/pdf" onChange={(e) => handleDocumentUpload(e, 'pan')} disabled={uploadingDocs.pan} />
                          </label>
                        </div>
                      )}
                      {core.pan_document.helpText && <p className="text-[10px] text-gray-400 italic">{core.pan_document.helpText}</p>}
                    </div>
                    )}

                    {/* Dynamic Document Uploads from Admin Panel */}
                    {dynamicDocFields.map((field, idx) => {
                      const key = field.fieldKey;
                      const preview = customDocPreview[key];
                      const isUploading = uploadingCustomDocs[key];
                      const isPdf = preview && preview.startsWith('data:application/pdf');

                      return (
                        <div key={field._id || key} className="space-y-2 animate-fade-in" style={{ animationDelay: `${0.35 + idx * 0.05}s`, order: field.order || 0 }}>
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider truncate flex items-center justify-between">
                            <span className="truncate">{field.label}</span>
                            {field.isRequired ? (
                              <span className="text-[9px] text-red-500 font-bold ml-1">*</span>
                            ) : (
                              <span className="text-[9px] text-gray-400 lowercase font-normal ml-1">opt</span>
                            )}
                          </p>

                          {preview ? (
                            <div className="relative group overflow-hidden rounded-xl border border-gray-200">
                              {isPdf ? (
                                <div className="w-full h-28 bg-red-50 flex flex-col items-center justify-center p-2 text-center">
                                  <FiFileText className="w-8 h-8 text-red-500 mb-1" />
                                  <span className="text-[10px] font-bold text-gray-700 truncate max-w-full">
                                    {customDocuments[key]?.fileName || 'PDF Document'}
                                  </span>
                                </div>
                              ) : (
                                <img
                                  src={preview}
                                  alt={field.label}
                                  className="w-full h-28 object-cover transform group-hover:scale-110 transition-transform duration-500"
                                />
                              )}
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <button
                                  type="button"
                                  onClick={() => removeCustomDocument(key)}
                                  className="bg-red-500 text-white rounded-full p-2 shadow-xl hover:bg-red-600 transition-colors cursor-pointer"
                                  title="Remove document"
                                >
                                  <FiX size={16} />
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center justify-center w-full h-28 border-2 border-dashed border-gray-200 rounded-xl hover:bg-gray-50 transition-all duration-300 hover:border-[#347989] group bg-white relative">
                              {isUploading ? (
                                <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-10 rounded-xl">
                                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#347989]"></div>
                                </div>
                              ) : null}
                              <label className="flex flex-col items-center cursor-pointer w-full h-full justify-center px-2 text-center">
                                <div className="p-2.5 bg-blue-50 text-blue-600 rounded-full mb-1 hover:bg-blue-100 transition-colors">
                                  <FiUpload className="w-5 h-5" />
                                </div>
                                <span className="text-[10px] text-gray-500 font-bold truncate max-w-full">
                                  Upload {field.label}
                                </span>
                                <input
                                  type="file"
                                  className="hidden"
                                  accept="image/*,application/pdf"
                                  onChange={(e) => handleCustomDocUpload(e, field)}
                                  disabled={isUploading}
                                />
                              </label>
                            </div>
                          )}
                          {field.helpText && (
                            <p className="text-[10px] text-gray-400 italic truncate" title={field.helpText}>
                              {field.helpText}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="p-4 bg-teal-50 border border-teal-100 rounded-xl mt-4 animate-pulse-subtle">
                    <p className="text-xs text-teal-700 leading-relaxed italic">
                      "Help U values trust. Please ensure all documents are clear and valid for faster approval."
                    </p>
                  </div>
                </div>
              </div>

              {/* ── Services & Categories: pick a category, or open it to choose sub-categories and services ── */}
              {core.service_categories.active && (
              <div className="relative z-10 animate-fade-in" style={{ animationDelay: '0.7s' }}>
                <div className="flex items-center justify-between mb-2">
                  <label className="flex text-sm font-medium text-gray-700 items-center gap-1.5">
                    <FiBriefcase className="text-gray-400 w-4 h-4" />
                    {core.service_categories.label} {core.service_categories.required ? <span className="text-red-500">*</span> : <span className="text-gray-400 text-xs font-normal">(Optional)</span>}
                  </label>
                </div>
                <SkillTreePicker
                  value={Array.isArray(formData.service) ? formData.service : []}
                  onChange={(titles) => {
                    setFormData(prev => ({ ...prev, service: titles }));
                    if (fieldErrors.service) setFieldErrors(prev => ({ ...prev, service: null }));
                  }}
                  accentColor={brandColor}
                />
                {fieldErrors.service && (
                  <p className="text-xs text-red-500 mt-1.5 font-medium">{fieldErrors.service}</p>
                )}
                {helpNote(core.service_categories)}
              </div>
              )}

              <div className="relative z-0 animate-stagger-3 animate-fade-in">
                <button
                  type="submit"
                  disabled={isLoading}
                  onClick={handleDetailsSubmit}
                  className="group relative w-full flex justify-center py-4 px-4 border border-transparent text-base font-bold rounded-xl text-white transition-all transform hover:-translate-y-1 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden active:scale-98"
                  style={{
                    backgroundColor: brandColor,
                    boxShadow: `0 10px 15px -3px ${brandColor}4D`
                  }}
                >
                  <span className="absolute inset-0 w-full h-full bg-white/10 group-hover:translate-x-full transition-transform duration-700 -translate-x-full" />
                  {isLoading ? (
                    <LogoLoader fullScreen={false} inline={true} size="w-6 h-6" />
                  ) : (
                    <span className="flex items-center relative z-10">
                      {verificationToken ? 'Finish Application' : 'Proceed to Verify'}
                      <FiArrowRight className="ml-2 group-hover:translate-x-1 transition-transform" />
                    </span>
                  )}
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-6">
              <button
                onClick={() => setStep('details')}
                className="flex items-center text-sm text-gray-500 hover:text-[#347989] transition-colors mb-4 animate-fade-in"
              >
                <FiChevronLeft className="mr-1" /> Re-check details
              </button>

              <div className="text-center animate-fade-in">
                <h3 className="text-xl font-bold text-gray-900">One Last Step</h3>
                <p className="text-sm text-gray-500">Enter the 6-digit code sent to your phone</p>
              </div>

              <form onSubmit={handleOtpSubmit} className="space-y-8">
                <div className="flex justify-between gap-3 px-4 sm:px-12 animate-stagger-1 animate-fade-in">
                  {otp.map((digit, index) => (
                    <input
                      key={index}
                      ref={(el) => (otpInputRefs.current[index] = el)}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleOtpChange(index, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(index, e)}
                      className="w-full h-14 text-center text-xl font-bold border border-gray-300 rounded-xl focus:ring-2 focus:ring-offset-2 outline-none transition-all duration-300 hover:border-gray-400"
                      style={{ '--tw-ring-color': brandColor, backgroundColor: digit ? `${brandColor}05` : 'white' }}
                    />
                  ))}
                </div>

                <div className="text-center animate-stagger-2 animate-fade-in">
                  <button
                    type="button"
                    onClick={async () => {
                      if (resendTimer > 0) return;
                      try {
                        const response = await sendWorkerOTP(formData.phoneNumber);
                        if (response.success) {
                          setOtpToken(response.token);
                          setResendTimer(120);
                          toast.success('OTP sent again');
                        }
                      } catch (e) { toast.error('Resend failed'); }
                    }}
                    disabled={resendTimer > 0}
                    className="text-sm font-semibold transition-colors duration-300 opacity-70 hover:opacity-100 disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ color: brandColor }}
                  >
                    {resendTimer > 0
                      ? `Resend in ${Math.floor(resendTimer / 60)}:${String(resendTimer % 60).padStart(2, '0')}`
                      : 'Resend Code'}
                  </button>
                </div>

                <div className="animate-stagger-3 animate-fade-in">
                  <button
                    type="submit"
                    disabled={isLoading || otp.join('').length !== 6}
                    className="group relative w-full py-4 rounded-xl text-white font-bold transition-all transform hover:-translate-y-1 shadow-lg disabled:opacity-50 overflow-hidden"
                    style={{ backgroundColor: brandColor, boxShadow: `0 10px 15px -3px ${brandColor}4D` }}
                  >
                    <span className="absolute inset-0 w-full h-full bg-white/10 group-hover:translate-x-full transition-transform duration-700 -translate-x-full" />
                    <span className="relative z-10 flex items-center justify-center">
                      {isLoading ? (
                        <LogoLoader fullScreen={false} inline={true} size="w-6 h-6" />
                      ) : (
                        'Verify & Register'
                      )}
                    </span>
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>

        <p className="mt-8 text-center text-sm text-gray-600 relative z-10 animate-fade-in animate-stagger-4">
          Already a partner?{' '}
          <Link to="/worker/login" className="font-bold hover:text-[#D68F35] transition-colors" style={{ color: brandColor }}>
            Login here
          </Link>
        </p>
      </div >
    </div >
  );
};

export default WorkerSignup;

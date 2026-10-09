import React, { useState, useEffect, useLayoutEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FiCheck, FiTool, FiPackage, FiFileText, FiPlus, FiTrash2, FiArrowLeft, FiDollarSign, FiClock, FiCreditCard, FiArrowRight, FiKey, FiCheckCircle } from 'react-icons/fi';
import { MdQrCode } from 'react-icons/md';
import { toast } from 'react-hot-toast';
import { workerTheme as themeColors } from '../../../../theme';
import workerBillService from '../../../../services/workerBillService';
import workerWalletService from '../../../../services/workerWalletService';
import { getBookingById, requestAdvancePayment } from '../../services/bookingService';
import { publicCatalogService } from '../../../../services/catalogService';
import { OtpVerificationModal, ScanAndPayModal } from '../../components/common';

const BillingPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [booking, setBooking] = useState(null);

  // --- VIEW MODE: 'timeline' | 'select-services' | 'select-parts' ---
  const [viewMode, setViewMode] = useState('timeline');
  const [currentStep, setCurrentStep] = useState(() => {
    const saved = localStorage.getItem(`billing_step_${id}`);
    return saved ? parseInt(saved) : 1;
  });
  const [maxStep, setMaxStep] = useState(() => {
    const saved = localStorage.getItem(`billing_max_step_${id}`);
    return saved ? parseInt(saved) : 1;
  });

  // Track max step reached for timeline highlighting
  useEffect(() => {
    if (id) {
      localStorage.setItem(`billing_step_${id}`, currentStep);
      if (currentStep > maxStep) {
        setMaxStep(currentStep);
        localStorage.setItem(`billing_max_step_${id}`, currentStep);
      }
    }
  }, [currentStep, id]);

  // Catalogs
  const [servicesCatalog, setServicesCatalog] = useState([]);
  const [partsCatalog, setPartsCatalog] = useState([]);
  const [serviceCategories, setServiceCategories] = useState(['All']);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [partCategories, setPartCategories] = useState(['All']);
  const [selectedPartCategory, setSelectedPartCategory] = useState('All');

  // New Data Structure
  const [selectedServices, setSelectedServices] = useState([]);
  const [selectedParts, setSelectedParts] = useState([]);
  const [customItems, setCustomItems] = useState([]);
  const [transportCharges, setTransportCharges] = useState(0);
  const [applyPartsGST, setApplyPartsGST] = useState(true);

  // Search
  const [serviceSearch, setServiceSearch] = useState('');
  const [partSearch, setPartSearch] = useState('');

  // OTP State
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);

  // Payment Options
  const [onlinePaymentData, setOnlinePaymentData] = useState(null);
  const [showQrModal, setShowQrModal] = useState(false);
  const [qrLoading, setQrLoading] = useState(false);
  const [paymentMode, setPaymentMode] = useState(null); // 'cash' | 'online'
  const [walletInfo, setWalletInfo] = useState(null);
  const [advanceForm, setAdvanceForm] = useState({
    amount: '',
    reason: '',
    partsDescription: ''
  });

  // Fetch Data
  useEffect(() => {
    fetchData();
  }, [id]);

  // Scroll to top on mount or view change or loading complete
  useLayoutEffect(() => {
    const scrollToTop = () => {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      document.documentElement.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      if (typeof document !== 'undefined' && document.body) {
        document.body.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      }
    };

    scrollToTop();
    // Small timeout as safety for dynamic content shifts
    const timer = setTimeout(scrollToTop, 50);
    return () => clearTimeout(timer);
  }, [id, viewMode, currentStep, loading]);

  // Save draft data
  useEffect(() => {
    if (id && !loading) {
      const data = { selectedServices, selectedParts, customItems, transportCharges, applyPartsGST };
      localStorage.setItem(`billing_data_${id}`, JSON.stringify(data));
    }
  }, [id, selectedServices, selectedParts, customItems, transportCharges, applyPartsGST, loading]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const bookingRes = await getBookingById(id);
      const bookingData = bookingRes.data || bookingRes;
      setBooking(bookingData);

      // Check if OTP was already sent
      if (bookingData?.customerConfirmationOTP || bookingData?.paymentOtp) {
        setIsOtpSent(true);
      }

      const [servicesRes, partsRes, catRes, walletRes] = await Promise.all([
        workerBillService.getServiceCatalog(),
        workerBillService.getPartsCatalog(),
        publicCatalogService.getCategories(),
        workerWalletService.getWallet().catch(() => ({ success: false }))
      ]);

      if (walletRes && walletRes.success) {
        setWalletInfo(walletRes.data || walletRes.wallet);
      }
      const services = servicesRes.services || [];
      const parts = partsRes.parts || [];

      setServicesCatalog(services);
      setPartsCatalog(parts);

      // Extract categories from categories API or catalog items
      if (catRes && catRes.success) {
        const apiCats = (catRes.categories || []).map(c => c.title);
        const allCats = ['All', ...apiCats];

        // Add Uncategorized if any catalog item is missing a category
        const hasUncategorizedServices = services.some(s => !s.categoryId?.title);
        const hasUncategorizedParts = parts.some(p => !p.categoryId?.title);
        if (hasUncategorizedServices || hasUncategorizedParts) {
          allCats.push('Uncategorized');
        }

        // Ensure uniqueness and filter nulls just in case
        const uniqueCats = [...new Set(allCats)].filter(Boolean);
        setServiceCategories(uniqueCats);
        setPartCategories(uniqueCats);
      } else {
        // Fallback to legacy behavior if API fails
        const cats = ['All', ...new Set(services.map(s => s.categoryId?.title || 'Uncategorized'))];
        setServiceCategories(cats.filter(Boolean));

        const pCats = ['All', ...new Set(parts.map(p => p.categoryId?.title || 'Uncategorized'))];
        setPartCategories(pCats.filter(Boolean));
      }

      // 1. Try to load from Local Storage (Draft)
      const savedDraft = localStorage.getItem(`billing_data_${id}`);
      let hasDraft = false;
      if (savedDraft) {
        try {
          const parsed = JSON.parse(savedDraft);
          setSelectedServices(parsed.selectedServices || []);
          setSelectedParts(parsed.selectedParts || []);
          setCustomItems(parsed.customItems || []);
          setTransportCharges(parsed.transportCharges || 0);
          setApplyPartsGST(parsed.applyPartsGST !== undefined ? parsed.applyPartsGST : true);
          hasDraft = true;
        } catch (e) {
          console.error('Error parsing draft:', e);
        }
      }

      // 2. Load from Backend (if no draft or to get config)
      const billRes = await workerBillService.getBill(id).catch(() => ({ success: false }));

      // If we used draft, we still might want payout settings from backend bill
      // If NO draft, we use backend bill data
      if (billRes && billRes.success && billRes.bill) {
        if (!hasDraft) {
          setSelectedServices((billRes.bill.services || []).filter(s => !s.isOriginal));
          setSelectedParts(billRes.bill.parts || []);
          setCustomItems(billRes.bill.customItems || []);
          setTransportCharges(billRes.bill.transportCharges || 0);
          setApplyPartsGST(billRes.bill.applyPartsGST !== undefined ? billRes.bill.applyPartsGST : true);
        }

        if (billRes.bill.payoutConfig) {
          const pc = billRes.bill.payoutConfig;
          setPayoutSettings({
            serviceGstPct: pc.serviceGstPercentage ?? 18,
            partsGstPct: pc.partsGstPercentage ?? 18,
            servicePayoutPct: pc.serviceSplitPercentage ?? 70,
            partsPayoutPct: pc.partsSplitPercentage ?? 10
          });
        }

        // Update max step based on data (merged)
        const currentData = hasDraft ? JSON.parse(savedDraft) : {
          selectedServices: (billRes.bill.services || []).filter(s => !s.isOriginal),
          selectedParts: billRes.bill.parts || [],
          customItems: billRes.bill.customItems || []
        };

        let reachedStep = 1;
        if (currentData.transportCharges > 0) reachedStep = 5;
        else if (currentData.customItems?.length > 0) reachedStep = 4;
        else if (currentData.selectedParts?.length > 0) reachedStep = 3;
        else if (currentData.selectedServices?.length > 0) reachedStep = 2;

        setMaxStep(prev => Math.max(prev, reachedStep));
      }

      // Fallback settings logic (safe api.get)
      if (!billRes?.success || !billRes?.bill?.payoutConfig) {
        try {
          const res = await api.get('/workers/settings').catch(() => null);
          if (res?.data?.success && res?.data?.data?.global) {
            const g = res.data.data.global;
            setPayoutSettings({
              serviceGstPct: g.serviceGstPercentage ?? 18,
              partsGstPct: g.partsGstPercentage ?? 18,
              servicePayoutPct: g.servicePayoutPercentage ?? 70,
              partsPayoutPct: g.partsPayoutPercentage ?? 10
            });
          }
        } catch (e) {
          console.error('Error fetching global settings:', e);
        }
      }

    } catch (error) {
      console.error('Error loading billing data:', error);
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  // --- FILTERING ---
  const filteredServices = useMemo(() => {
    return servicesCatalog.filter(item => {
      const matchesSearch = item.name.toLowerCase().includes(serviceSearch.toLowerCase());
      const matchesCategory = selectedCategory === 'All' || (item.categoryId?.title || 'Uncategorized') === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [servicesCatalog, serviceSearch, selectedCategory]);

  const filteredParts = useMemo(() => {
    return partsCatalog.filter(item => {
      const matchesSearch = item.name.toLowerCase().includes(partSearch.toLowerCase());
      const matchesCategory = selectedPartCategory === 'All' || (item.categoryId?.title || 'Uncategorized') === selectedPartCategory;
      return matchesSearch && matchesCategory;
    });
  }, [partsCatalog, partSearch, selectedPartCategory]);


  // --- HANDLERS (SELECTION) ---
  const toggleService = (item) => {
    setSelectedServices(prev => {
      const exists = prev.find(s => s.catalogId === item._id);
      if (exists) {
        return prev.filter(s => s.catalogId !== item._id);
      }
      return [...prev, {
        catalogId: item._id,
        name: item.name,
        price: item.price,
        quantity: 1,
        total: item.price
      }];
    });
  };

  const isServiceSelected = (id) => selectedServices.some(s => s.catalogId === id);

  const togglePart = (item) => {
    setSelectedParts(prev => {
      const exists = prev.find(p => p.catalogId === item._id);
      if (exists) {
        return prev.filter(p => p.catalogId !== item._id);
      }
      const gstPercentage = item.gstPercentage || 18;
      const gstAmount = (item.price * gstPercentage) / 100;
      return [...prev, {
        catalogId: item._id,
        name: item.name,
        price: item.price,
        gstPercentage,
        quantity: 1,
        gstAmount,
        total: item.price + gstAmount
      }];
    });
  };

  const isPartSelected = (id) => selectedParts.some(p => p.catalogId === id);

  // --- HANDLERS (QTY UPDATES ON TIMELINE) ---
  const updateServiceQty = (idx, delta) => {
    const newArr = [...selectedServices];
    const q = Math.max(1, newArr[idx].quantity + delta);
    newArr[idx] = { ...newArr[idx], quantity: q, total: newArr[idx].price * q };
    setSelectedServices(newArr);
  };

  const updatePartQty = (idx, delta) => {
    const newArr = [...selectedParts];
    const q = Math.max(1, newArr[idx].quantity + delta);
    const base = newArr[idx].price * q;
    const gstAmt = base * (newArr[idx].gstPercentage / 100);
    newArr[idx] = { ...newArr[idx], quantity: q, gstAmount: gstAmt, total: base + gstAmt };
    setSelectedParts(newArr);
  };

  // Custom Items
  const addCustomItem = () => {
    setCustomItems([...customItems, {
      name: '',
      hsnCode: '',
      price: 0,
      gstApplicable: true,
      gstPercentage: 18,
      quantity: 1,
      gstAmount: 0,
      total: 0
    }]);
  };

  const updateCustomItem = (index, field, value) => {
    setCustomItems(prev => {
      const newItems = [...prev];
      const newItem = { ...newItems[index], [field]: value };
      const baseTotal = newItem.price * newItem.quantity;
      newItem.gstAmount = newItem.gstApplicable ? baseTotal * (newItem.gstPercentage / 100) : 0;
      newItem.total = baseTotal + newItem.gstAmount;
      newItems[index] = newItem;
      return newItems;
    });
  };

  const removeCustomItem = (index) => {
    const newItems = [...customItems];
    newItems.splice(index, 1);
    setCustomItems(newItems);
  }


  // --- Settings (fetched for worker-side preview) ---
  const [payoutSettings, setPayoutSettings] = useState({
    serviceGstPct: 18,
    partsGstPct: 18,
    servicePayoutPct: 90,
    partsPayoutPct: 100
  });

  // Settings fetched in fetchData to ensure bill priority

  // --- CALCULATIONS ---
  const calculations = useMemo(() => {
    if (!booking) return null;

    const { serviceGstPct, partsGstPct, servicePayoutPct, partsPayoutPct } = payoutSettings;

    // Original booking base (service)
    const isPlanBooking = booking.paymentMethod === 'plan_benefit';
    const originalBase = isPlanBooking ? 0 : (booking.basePrice || 0);
    const originalServiceGST = isPlanBooking ? 0 : parseFloat(((originalBase * serviceGstPct) / 100).toFixed(2));

    // Extra Services: price is base, GST calculated separately
    let extraServiceBase = 0;
    let extraServiceGST = 0;
    selectedServices.forEach(s => {
      const base = s.price * s.quantity;
      const gst = parseFloat(((base * serviceGstPct) / 100).toFixed(2));
      extraServiceBase += base;
      extraServiceGST += gst;
    });

    // Parts: each part has its own gstPercentage (defaults to partsGstPct)
    let partsBase = 0;
    let partsGST = 0;
    selectedParts.forEach(p => {
      partsBase += (p.price * p.quantity);
      if (applyPartsGST) {
        partsGST += p.gstAmount;
      }
    });

    // Custom Items: use partsGstPct
    let customBase = 0;
    let customGST = 0;
    customItems.forEach(c => {
      customBase += (c.price * c.quantity);
      if (applyPartsGST) {
        customGST += c.gstAmount;
      }
    });

    // Visiting Charges
    const visitingCharges = Number(booking.visitingCharges) || 0;
    const finalTransportCharges = Number(transportCharges) || 0;

    const totalServiceBase = originalBase + extraServiceBase;
    const totalServiceGST = originalServiceGST + extraServiceGST;
    const totalPartsBase = partsBase + customBase;
    const totalPartsGST = partsGST + customGST;

    const finalBillAmount = parseFloat(((totalServiceBase + totalServiceGST) + (totalPartsBase + totalPartsGST) + visitingCharges + finalTransportCharges).toFixed(2));
    const advancePaidAmount = booking.advancePayment?.status === 'paid'
      ? Number(booking.advancePayment.paidAmount || booking.advancePayment.requestedAmount || 0)
      : 0;
    const remainingPayableAmount = parseFloat(Math.max(0, finalBillAmount - advancePaidAmount).toFixed(2));

    // Worker Earnings estimate
    const workerServiceEarnings = parseFloat(((totalServiceBase * servicePayoutPct) / 100).toFixed(2));
    const workerPartsEarnings = parseFloat(((totalPartsBase * partsPayoutPct) / 100).toFixed(2));
    const totalWorkerEarnings = parseFloat((workerServiceEarnings + workerPartsEarnings).toFixed(2));

    return {
      originalBase,
      extraServiceBase,
      partsBase: totalPartsBase,
      serviceGstPct,
      partsGstPct,
      totalServiceGST,
      totalPartsGST,
      totalGST: parseFloat((totalServiceGST + totalPartsGST).toFixed(2)),
      visitingCharges,
      transportCharges: finalTransportCharges,
      finalBillAmount,
      advancePaidAmount,
      remainingPayableAmount,
      totalWorkerEarnings,
      workerServiceEarnings,
      workerPartsEarnings,
      servicePayoutPct,
      partsPayoutPct
    };
  }, [booking, selectedServices, selectedParts, customItems, transportCharges, payoutSettings, applyPartsGST]);

  const willExceedCashLimit = useMemo(() => {
    if (!walletInfo || !calculations) return false;
    const currentDues = walletInfo.dues || 0;
    const currentEarnings = walletInfo.earnings || 0;
    const cashLimit = walletInfo.cashLimit || 10000;
    const expectedNewNetOwed = (currentDues + calculations.remainingPayableAmount) - (currentEarnings + calculations.totalWorkerEarnings);
    return expectedNewNetOwed > cashLimit;
  }, [walletInfo, calculations]);


  const handleSubmit = async () => {
    try {
      setSubmitting(true);
      const res = await workerBillService.createOrUpdateBill(id, {
        services: selectedServices,
        parts: selectedParts,
        customItems,
        transportCharges,
        applyPartsGST
      });

      if (res.success) {
        toast.success('Bill generated successfully!');
        localStorage.removeItem(`billing_step_${id}`);
        localStorage.removeItem(`billing_max_step_${id}`);
        localStorage.removeItem(`billing_data_${id}`);
        navigate(`/worker/booking/${id}`);
      } else {
        toast.error(res.message || 'Failed to generate bill');
        setSubmitting(false);
      }
    } catch (error) {
      console.error('Submit bill error:', error);
      toast.error('An error occurred');
      setSubmitting(false);
    }
  };

  const handleRequestAdvancePayment = async () => {
    const amount = Number(advanceForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Enter a valid advance amount');
      return;
    }

    try {
      setSubmitting(true);
      const res = await requestAdvancePayment(id, {
        amount,
        reason: advanceForm.reason,
        partsDescription: advanceForm.partsDescription
      });

      if (res.success) {
        toast.success(res.message || 'Advance payment request sent');
        setAdvanceForm({ amount: '', reason: '', partsDescription: '' });
        await fetchData();
      } else {
        toast.error(res.message || 'Failed to request advance payment');
      }
    } catch (error) {
      console.error('Advance payment request error:', error);
      toast.error(error.response?.data?.message || 'Failed to request advance payment');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendOTP = async () => {
    try {
      setOtpLoading(true);
      // First save the bill to ensure backend has latest amounts
      await workerBillService.createOrUpdateBill(id, {
        services: selectedServices,
        parts: selectedParts,
        customItems,
        transportCharges,
        applyPartsGST
      });

      const res = await workerWalletService.initiateCashCollection(
        id,
        calculations.remainingPayableAmount,
        [...selectedParts, ...customItems]
      );

      if (res.success) {
        setIsOtpSent(true);
        setShowOtpModal(true);
        setPaymentMode('cash');
        setOnlinePaymentData(null); // Clear QR data when switching to cash
        toast.success('OTP sent to customer!');
      } else {
        toast.error(res.message || 'Failed to send OTP');
      }
    } catch (error) {
      console.error('Send OTP error:', error);
      toast.error('Failed to send OTP');
    } finally {
      setOtpLoading(false);
    }
  };

  const handleVerifyOTP = async (code) => {
    try {
      setOtpLoading(true);

      const res = await workerWalletService.confirmCashCollection(
        id,
        calculations.remainingPayableAmount,
        code,
        [...selectedParts, ...customItems]
      );

      if (res.success) {
        setShowOtpModal(false);
        toast.success('Cash payment verified successfully!');
        localStorage.removeItem(`billing_step_${id}`);
        localStorage.removeItem(`billing_max_step_${id}`);
        localStorage.removeItem(`billing_data_${id}`);
        fetchData();
        navigate(`/worker/booking/${id}`);
      } else {
        toast.error(res.message || 'Invalid OTP');
      }
    } catch (error) {
      console.error('Verify OTP error:', error);
      toast.error('Verification failed');
    } finally {
      setOtpLoading(false);
    }
  };

  const handleOnlinePayment = async () => {
    try {
      setQrLoading(true);
      // First save the bill to ensure backend has latest amounts
      await workerBillService.createOrUpdateBill(id, {
        services: selectedServices,
        parts: selectedParts,
        customItems,
        transportCharges,
        applyPartsGST
      });

      const res = await workerWalletService.initiateOnlineCollection(id, calculations.remainingPayableAmount, [...selectedParts, ...customItems]);

      if (res.success) {
        setOnlinePaymentData(res.data);
        setShowQrModal(true);
        setIsOtpSent(true); // Generated OTP is available concurrently
        setPaymentMode('online');
        toast.success('QR Code and OTP generated!');
      } else {
        toast.error(res.message || 'Failed to initiate online payment');
      }
    } catch (error) {
      console.error('Online payment error:', error);
      toast.error('Failed to initiate online payment');
    } finally {
      setQrLoading(false);
    }
  };

  const checkPaymentStatus = async () => {
    try {
      setQrLoading(true);
      const res = await workerWalletService.verifyOnlineCollection(id);

      if (res.success) {
        setShowQrModal(false);
        toast.success('Payment verified successfully!');
        localStorage.removeItem(`billing_step_${id}`);
        localStorage.removeItem(`billing_max_step_${id}`);
        localStorage.removeItem(`billing_data_${id}`);
        fetchData();
        navigate(`/worker/booking/${id}`);
      } else {
        toast.error(res.message || 'Payment not yet confirmed');
      }
    } catch (error) {
      console.error('Verify payment error:', error);
      toast.error('Verification failed or payment pending');
    } finally {
      setQrLoading(false);
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  if (!booking) return null;

  // --- RENDER LOGIC ---

  if (viewMode === 'select-services') {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <div className="bg-white sticky top-0 z-50 shadow-sm border-b border-gray-100">
          <div className="px-4 py-3 flex items-center gap-3">
            <button onClick={() => setViewMode('timeline')}><FiArrowLeft className="w-6 h-6 text-gray-600" /></button>
            <div className="flex-1 relative">
              <input autoFocus placeholder="Search for a service..." value={serviceSearch} onChange={e => setServiceSearch(e.target.value)}
                className="w-full bg-gray-100 pl-10 pr-4 py-2.5 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500/20 transition-all text-gray-800 placeholder:text-gray-400" />
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
              </div>
            </div>
          </div>
          <div className="px-4 py-2 flex gap-2 overflow-x-auto scrollbar-hide">
            {serviceCategories.map(cat => (
              <button key={cat} onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${selectedCategory === cat ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>{cat}</button>
            ))}
          </div>
        </div>
        <div className="p-4 space-y-3 pb-48">
          {filteredServices.map(item => {
            const selected = isServiceSelected(item._id);
            return (
              <div key={item._id}
                onClick={() => !selected && toggleService(item)}
                className={`p-4 rounded-xl border shadow-sm flex justify-between items-center cursor-pointer transition-all active:scale-[0.98] ${selected ? 'bg-blue-50/50 border-blue-200 ring-1 ring-blue-100' : 'bg-white border-gray-100 hover:border-gray-200'}`}>
                <div className="flex-1">
                  <h4 className={`font-bold text-base mb-1 ${selected ? 'text-blue-900' : 'text-gray-900'}`}>{item.name}</h4>
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-bold ${selected ? 'text-blue-700' : 'text-gray-900'}`}>₹{item.price}</span>
                    {item.categoryId?.title && <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">{item.categoryId.title}</span>}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  {selected ? (
                    <div className="flex items-center gap-2 bg-blue-50 rounded-lg p-1 border border-blue-100">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const currentQty = selectedServices.find(s => s.catalogId === item._id).quantity;
                          if (currentQty > 1) {
                            const idx = selectedServices.findIndex(s => s.catalogId === item._id);
                            updateServiceQty(idx, -1);
                          } else {
                            toggleService(item);
                          }
                        }}
                        className="w-8 h-8 flex items-center justify-center bg-white rounded-md text-blue-600 shadow-sm border border-blue-100 hover:bg-blue-50 active:scale-95 transition-all">
                        <span className="font-bold text-lg leading-none mb-0.5">-</span>
                      </button>
                      <span className="font-bold text-sm min-w-[20px] text-center text-blue-900">
                        {selectedServices.find(s => s.catalogId === item._id).quantity}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const idx = selectedServices.findIndex(s => s.catalogId === item._id);
                          updateServiceQty(idx, 1);
                        }}
                        className="w-8 h-8 flex items-center justify-center bg-blue-600 rounded-md text-white shadow-md hover:bg-blue-700 active:scale-95 transition-all">
                        <FiPlus className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleService(item); }}
                      className="w-10 h-10 rounded-full flex items-center justify-center bg-gray-100 text-gray-600 hover:bg-blue-600 hover:text-white transition-all shadow-sm active:scale-90">
                      <FiPlus className="w-5 h-5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="fixed bottom-[72px] left-0 right-0 p-4 bg-white/80 backdrop-blur-md border-t border-gray-100 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] z-50 flex gap-3">
          <button onClick={() => setViewMode('timeline')} className="flex-1 py-3.5 bg-white text-gray-700 font-bold rounded-xl border border-gray-200">
            Save & Exit
          </button>
          <button onClick={() => {
            setViewMode('select-parts');
            setCurrentStep(3);
          }} className="flex-[2] py-3.5 bg-gray-900 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg">
            Next: Parts <FiArrowRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    );
  }

  if (viewMode === 'select-parts') {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <div className="bg-white sticky top-0 z-50 shadow-sm border-b border-gray-100">
          <div className="px-4 py-3 flex items-center gap-3">
            <button onClick={() => setViewMode('timeline')}><FiArrowLeft className="w-6 h-6 text-gray-600" /></button>
            <div className="flex-1 relative">
              <input autoFocus placeholder="Search for parts..." value={partSearch} onChange={e => setPartSearch(e.target.value)}
                className="w-full bg-gray-100 pl-10 pr-4 py-2.5 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-orange-500/20 transition-all text-gray-800 placeholder:text-gray-400" />
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
              </div>
            </div>
          </div>
          <div className="px-4 py-2 flex gap-2 overflow-x-auto scrollbar-hide">
            {partCategories.map(cat => (
              <button key={cat} onClick={() => setSelectedPartCategory(cat)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${selectedPartCategory === cat ? 'bg-orange-600 text-white' : 'bg-gray-100 text-gray-600'}`}>{cat}</button>
            ))}
          </div>
        </div>
        <div className="p-4 space-y-3 pb-48">
          {filteredParts.map(item => {
            const selected = isPartSelected(item._id);
            return (
              <div key={item._id}
                onClick={() => togglePart(item)}
                className={`p-4 rounded-xl border shadow-sm flex justify-between items-center cursor-pointer transition-all active:scale-[0.98] ${selected ? 'bg-orange-50/50 border-orange-200 ring-1 ring-orange-100' : 'bg-white border-gray-100 hover:border-gray-200'}`}>
                <div className="flex-1">
                  <h4 className={`font-bold text-base mb-1 ${selected ? 'text-orange-900' : 'text-gray-900'}`}>{item.name}</h4>
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-bold ${selected ? 'text-orange-700' : 'text-gray-900'}`}>₹{item.price}</span>
                    {item.categoryId?.title && <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">{item.categoryId.title}</span>}
                  </div>
                </div>
                <button
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${selected ? 'bg-red-100 text-red-600' : 'bg-orange-600 text-white shadow-lg shadow-orange-200'}`}>
                  {selected ? <FiTrash2 className="w-5 h-5" /> : <FiPlus className="w-6 h-6" />}
                </button>
              </div>
            );
          })}
        </div>
        <div className="fixed bottom-[72px] left-0 right-0 p-4 bg-white/80 backdrop-blur-md border-t border-gray-100 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] z-50 flex gap-3">
          <button onClick={() => setViewMode('timeline')} className="flex-1 py-3.5 bg-white text-gray-700 font-bold rounded-xl border border-gray-200">
            Save & Exit
          </button>
          <button onClick={() => {
            setViewMode('timeline');
            setCurrentStep(4); // Go to Extras
          }} className="flex-[2] py-3.5 bg-gray-900 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg">
            Next: Extras <FiArrowRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-0 flex flex-col">
      {/* Unified Sticky Header */}
      <div className="sticky top-0 z-50 bg-white">
        {/* Title Bar */}
        <div className="px-4 py-4 shadow-sm border-b border-gray-100 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-gray-600 hover:bg-gray-100 rounded-full">
            <FiArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-gray-800">Generate Bill</h1>
            <p className="text-xs text-gray-500">Booking #{booking.bookingNumber}</p>
          </div>
        </div>

        {/* Step Indicator */}
        <div className="px-4 py-4 border-b border-gray-50 flex justify-between relative overflow-hidden shadow-sm">
          {[
            { id: 1, label: 'Advance', icon: FiCreditCard },
            { id: 2, label: 'Services', icon: FiTool },
            { id: 3, label: 'Parts', icon: FiPackage },
            { id: 4, label: 'Extras', icon: FiPlus },
            { id: 5, label: 'Transport', icon: FiPackage },
            { id: 6, label: 'Review', icon: FiFileText }
          ].map((step) => {
            const isCompleted = step.id < currentStep;
            const isActive = step.id === currentStep;
            const isReached = step.id <= maxStep;

            return (
              <button key={step.id} onClick={() => isReached && setCurrentStep(step.id)}
                className={`flex flex-col items-center gap-1 z-10 relative transition-all ${isActive ? 'opacity-100 scale-105' : isReached ? 'opacity-80' : 'opacity-40'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${(isActive || isCompleted) ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'bg-gray-100 text-gray-400'} ${isActive ? 'ring-4 ring-blue-50' : ''}`}>
                  {isCompleted ? <FiCheck className="w-4 h-4" /> : <step.icon />}
                </div>
                <span className={`text-[10px] font-bold ${isReached ? 'text-gray-800' : 'text-gray-400'}`}>{step.label}</span>
              </button>
            );
          })}
          <div className="absolute top-8 left-0 right-0 h-0.5 bg-gray-200 -z-0 mx-8">
            <div className="h-full bg-blue-600 transition-all duration-300" style={{ width: `${((maxStep - 1) / 5) * 100}%` }}></div>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-6 pb-48">
        {currentStep === 1 && (
          <div className="animate-in fade-in slide-in-from-right-4">
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 mb-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center">
                  <FiCreditCard className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-800 text-lg">Advance Payment</h3>
                  <p className="text-[11px] text-gray-500 uppercase font-bold tracking-wide">Optional before final bill</p>
                </div>
              </div>

              {booking.advancePayment?.status === 'paid' ? (
                <div className="rounded-2xl border border-green-100 bg-green-50 p-4 space-y-2">
                  <p className="text-sm font-bold text-green-800">Advance already paid</p>
                  <p className="text-sm text-green-700">Amount: ₹{Number(booking.advancePayment.paidAmount || booking.advancePayment.requestedAmount || 0).toFixed(2)}</p>
                  {booking.advancePayment.reason && <p className="text-xs text-gray-700">{booking.advancePayment.reason}</p>}
                  {booking.advancePayment.partsDescription && <p className="text-xs text-gray-600">{booking.advancePayment.partsDescription}</p>}
                </div>
              ) : booking.advancePayment?.status === 'requested' ? (
                <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 space-y-2">
                  <p className="text-sm font-bold text-amber-800">Advance request pending</p>
                  <p className="text-sm text-amber-700">Requested: ₹{Number(booking.advancePayment.requestedAmount || 0).toFixed(2)}</p>
                  {booking.advancePayment.reason && <p className="text-xs text-gray-700">{booking.advancePayment.reason}</p>}
                  {booking.advancePayment.partsDescription && <p className="text-xs text-gray-600">{booking.advancePayment.partsDescription}</p>}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-3">
                    <input
                      type="number"
                      min="1"
                      placeholder="Advance amount"
                      value={advanceForm.amount}
                      onChange={(e) => setAdvanceForm(prev => ({ ...prev, amount: e.target.value }))}
                      className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-900 outline-none focus:border-amber-400"
                    />
                    <input
                      type="text"
                      placeholder="Reason for advance payment"
                      value={advanceForm.reason}
                      onChange={(e) => setAdvanceForm(prev => ({ ...prev, reason: e.target.value }))}
                      className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 outline-none focus:border-amber-400"
                    />
                    <textarea
                      rows={3}
                      placeholder="Parts/material details"
                      value={advanceForm.partsDescription}
                      onChange={(e) => setAdvanceForm(prev => ({ ...prev, partsDescription: e.target.value }))}
                      className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 outline-none focus:border-amber-400 resize-none"
                    />
                  </div>
                  <button
                    onClick={handleRequestAdvancePayment}
                    disabled={submitting}
                    className="w-full py-3.5 rounded-xl font-bold text-white shadow-lg active:scale-95 disabled:opacity-50"
                    style={{ background: 'linear-gradient(135deg, #F59E0B, #EA580C)' }}
                  >
                    Request Advance Payment
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {currentStep === 2 && (
          <div className="animate-in fade-in slide-in-from-right-4">
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 mb-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-gray-800">Added Services</h3>
                <button onClick={() => setViewMode('select-services')} className="text-blue-600 font-bold text-xs bg-blue-50 px-3 py-1.5 rounded-lg">+ Add Services</button>
              </div>
              {selectedServices.length === 0 ? <div className="text-center py-8 bg-gray-50 rounded-xl text-gray-400 text-sm">No extra services added</div> : (
                <div className="space-y-3">
                  {selectedServices.map((s, idx) => (
                    <div key={idx} className="flex justify-between items-center p-3 bg-blue-50/30 rounded-xl border border-blue-100">
                      <div>
                        <p className="font-bold text-sm text-gray-800">{s.name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <button onClick={() => updateServiceQty(idx, -1)} className="w-6 h-6 flex items-center justify-center bg-white border border-blue-200 rounded text-blue-600 font-bold">-</button>
                          <span className="text-xs font-bold w-4 text-center">{s.quantity}</span>
                          <button onClick={() => updateServiceQty(idx, 1)} className="w-6 h-6 flex items-center justify-center bg-white border border-blue-200 rounded text-blue-600 font-bold">+</button>
                        </div>
                      </div>
                      <p className="font-bold text-gray-800">₹{s.total.toFixed(2)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {currentStep === 3 && (
          <div className="animate-in fade-in slide-in-from-right-4">
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 mb-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-gray-800">Added Parts</h3>
                <button onClick={() => setViewMode('select-parts')} className="text-orange-600 font-bold text-xs bg-orange-50 px-3 py-1.5 rounded-lg">+ Add Parts</button>
              </div>
              {selectedParts.length === 0 ? <div className="text-center py-8 bg-gray-50 rounded-xl text-gray-400 text-sm">No parts added</div> : (
                <div className="space-y-3">
                  {selectedParts.map((p, idx) => (
                    <div key={idx} className="flex justify-between items-center p-3 bg-orange-50/30 rounded-xl border border-orange-100">
                      <div>
                        <p className="font-bold text-sm text-gray-800">{p.name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <button onClick={() => updatePartQty(idx, -1)} className="w-6 h-6 flex items-center justify-center bg-white border border-orange-200 rounded text-orange-600 font-bold">-</button>
                          <span className="text-xs font-bold w-4 text-center">{p.quantity}</span>
                          <button onClick={() => updatePartQty(idx, 1)} className="w-6 h-6 flex items-center justify-center bg-white border border-orange-200 rounded text-orange-600 font-bold">+</button>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-gray-800">₹{p.total.toFixed(2)}</p>
                        <p className="text-[10px] text-gray-400">+ GST</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {currentStep === 4 && (
          <div className="animate-in fade-in slide-in-from-right-4">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="font-bold text-lg text-gray-800">Add Extra Items</h3>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Parts & Materials</p>
              </div>
              <button onClick={addCustomItem} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold text-xs shadow-sm flex items-center gap-1.5 hover:bg-blue-700 active:scale-95 transition-all">
                <FiPlus className="w-4 h-4" /> Add Row
              </button>
            </div>

            <div className="space-y-5">
              {customItems.map((item, idx) => {
                return (
                  <div key={idx} className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm relative animate-in slide-in-from-bottom-2">
                    <button
                      onClick={() => removeCustomItem(idx)}
                      className="absolute -top-1 -right-1 w-7 h-7 bg-white text-red-500 rounded-full border border-red-100 flex items-center justify-center hover:bg-red-50 transition-all shadow-sm z-10"
                    >
                      <FiTrash2 className="w-3.5 h-3.5" />
                    </button>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Item Name</label>
                        <input
                          placeholder="e.g. Copper Pipe"
                          value={item.name}
                          onChange={e => updateCustomItem(idx, 'name', e.target.value)}
                          className="w-full bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 text-sm font-bold outline-none focus:ring-1 focus:ring-blue-500 text-gray-800"
                        />
                      </div>

                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">HSN Code</label>
                        <input
                          placeholder="Optional code"
                          value={item.hsnCode || ''}
                          onChange={e => updateCustomItem(idx, 'hsnCode', e.target.value)}
                          className="w-full bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 text-sm font-bold outline-none focus:ring-1 focus:ring-blue-500 uppercase text-gray-800"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Price (₹)</label>
                          <input
                            type="number"
                            placeholder="0"
                            value={item.price || ''}
                            onChange={e => updateCustomItem(idx, 'price', Number(e.target.value))}
                            className="w-full bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 text-sm font-bold outline-none focus:ring-1 focus:ring-blue-500 text-gray-800"
                          />
                        </div>

                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Quantity</label>
                          <input
                            type="number"
                            value={item.quantity}
                            onChange={e => updateCustomItem(idx, 'quantity', Number(e.target.value))}
                            className="w-full bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 text-sm font-bold outline-none focus:ring-1 focus:ring-blue-500 text-gray-800"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-gray-50 mt-1 md:col-span-2 md:pt-3">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id={`gst-${idx}`}
                            checked={item.gstApplicable}
                            onChange={e => updateCustomItem(idx, 'gstApplicable', e.target.checked)}
                            className="w-4 h-4 rounded text-blue-600 border-gray-300"
                          />
                          <label htmlFor={`gst-${idx}`} className="text-xs font-bold text-gray-600">Apply 18% GST</label>
                        </div>
                        <div className="text-right">
                          <span className="text-[9px] text-gray-400 font-bold uppercase tracking-tighter">Subtotal: </span>
                          <span className="text-base font-black text-gray-900">₹{item.total.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {customItems.length === 0 && (
                <div className="text-center py-10 bg-gray-50 rounded-xl border border-dashed border-gray-100">
                  <FiPackage className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-400 font-bold text-sm">No extra items added</p>
                  <button onClick={addCustomItem} className="text-blue-600 font-bold text-xs mt-1 hover:underline underline-offset-4">+ Add Item Row</button>
                </div>
              )}
            </div>
          </div>
        )}

        {currentStep === 5 && (
          <div className="animate-in fade-in slide-in-from-right-4">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mb-4">
                <FiPackage className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-gray-800 mb-2">Transport Charges</h3>
              <p className="text-sm text-gray-500 mb-6">Enter any additional transportation or travel costs for this service.</p>

              <div className="w-full max-w-xs relative text-left">
                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 mb-1 block">Amount (₹)</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-gray-400">₹</span>
                  <input
                    type="number"
                    placeholder="0"
                    value={transportCharges || ''}
                    onChange={e => setTransportCharges(Number(e.target.value))}
                    className="w-full bg-gray-50 border border-gray-100 rounded-xl pl-8 pr-4 py-4 text-xl font-black outline-none focus:ring-2 focus:ring-blue-500/20 text-gray-900"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {currentStep === 6 && calculations && (
          <div className="animate-in fade-in slide-in-from-right-4 pb-10">
            <div className="bg-white rounded-3xl overflow-hidden shadow-xl border border-gray-100 mb-6">
              <div className="bg-gray-900 px-6 py-6 text-white text-center">
                <p className="text-gray-400 text-xs font-medium uppercase tracking-widest mb-1">TOTAL INVOICE AMOUNT</p>
                <h2 className="text-4xl font-black">₹{calculations.finalBillAmount.toFixed(2)}</h2>
                {calculations.advancePaidAmount > 0 && (
                  <div className="mt-4 grid grid-cols-2 gap-3 text-left">
                    <div className="rounded-2xl bg-white/10 px-4 py-3">
                      <p className="text-[10px] uppercase tracking-widest text-gray-300 mb-1">Advance Paid</p>
                      <p className="text-lg font-black text-emerald-300">₹{calculations.advancePaidAmount.toFixed(2)}</p>
                    </div>
                    <div className="rounded-2xl bg-white/10 px-4 py-3">
                      <p className="text-[10px] uppercase tracking-widest text-gray-300 mb-1">Remaining Due</p>
                      <p className="text-lg font-black text-yellow-300">₹{calculations.remainingPayableAmount.toFixed(2)}</p>
                    </div>
                  </div>
                )}
              </div>
              <div className="p-6 space-y-6">
                {(booking.advancePayment?.requestedAmount > 0 || calculations.advancePaidAmount > 0) && (
                  <div>
                    <h4 className="font-bold text-gray-900 flex items-center gap-2 mb-3 pb-2 border-b border-gray-100">
                      <span className="w-6 h-6 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center text-xs"><FiCreditCard /></span>
                      Advance Payment
                    </h4>
                    <div className="space-y-2 text-sm pl-2">
                      <div className="flex justify-between text-gray-600">
                        <span>Status</span>
                        <span className={`font-bold uppercase ${booking.advancePayment?.status === 'paid' ? 'text-emerald-600' : 'text-amber-600'}`}>
                          {booking.advancePayment?.status === 'paid' ? 'Paid' : 'Requested'}
                        </span>
                      </div>
                      <div className="flex justify-between text-gray-600">
                        <span>Requested Amount</span>
                        <span>₹{Number(booking.advancePayment?.requestedAmount || 0).toFixed(2)}</span>
                      </div>
                      {calculations.advancePaidAmount > 0 && (
                        <div className="flex justify-between text-gray-600">
                          <span>Paid Amount</span>
                          <span>₹{calculations.advancePaidAmount.toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex justify-between font-bold text-gray-800 pt-1">
                        <span>Remaining In Bill</span>
                        <span>₹{calculations.remainingPayableAmount.toFixed(2)}</span>
                      </div>
                      {booking.advancePayment?.reason && (
                        <div className="text-xs text-gray-500 pt-1">
                          Reason: {booking.advancePayment.reason}
                        </div>
                      )}
                    </div>
                  </div>
                )}
                <div>
                  <h4 className="font-bold text-gray-900 flex items-center gap-2 mb-3 pb-2 border-b border-gray-100">
                    <span className="w-6 h-6 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-xs"><FiTool /></span>
                    Services
                  </h4>
                  <div className="space-y-2 text-sm pl-2">
                    <div className="flex justify-between text-gray-600">
                      <span>Original Booking : {booking.serviceName || 'Service'}</span>
                      {booking.paymentMethod === 'plan_benefit' ? (
                        <span className="text-green-600 font-bold">FREE (PLAN)</span>
                      ) : (
                        <span>₹{calculations.originalBase.toFixed(2)}</span>
                      )}
                    </div>
                    {selectedServices.map(s => <div key={s.catalogId} className="flex justify-between text-gray-600"><span>{s.name} x {s.quantity}</span><span>₹{(s.price * s.quantity).toFixed(2)}</span></div>)}

                    <div className="flex justify-between text-xs text-gray-500 border-t border-dashed border-gray-100 pt-1 mt-1">
                      <span>Service GST ({calculations.serviceGstPct}%)</span>
                      <span>₹{calculations.totalServiceGST.toFixed(2)}</span>
                    </div>

                    <div className="flex justify-between font-bold text-gray-800 pt-1">
                      <span>Total Service</span>
                      <span>₹{(calculations.originalBase + calculations.extraServiceBase + calculations.totalServiceGST).toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                {(selectedParts.length > 0 || customItems.length > 0) && (
                  <div>
                    <h4 className="font-bold text-gray-900 flex items-center gap-2 mb-3 pb-2 border-b border-gray-100">
                      <span className="w-6 h-6 rounded-full bg-orange-50 text-orange-600 flex items-center justify-center text-xs"><FiPackage /></span>
                      Parts
                    </h4>

                    {/* Parts GST toggle */}
                    <label className="flex items-center gap-2.5 cursor-pointer mb-3 p-2.5 rounded-xl border border-dashed border-orange-200 bg-orange-50/50 hover:bg-orange-50 transition-colors">
                      <div className="relative">
                        <input
                          type="checkbox"
                          id="partsGstToggle"
                          checked={applyPartsGST}
                          onChange={e => setApplyPartsGST(e.target.checked)}
                          className="sr-only"
                        />
                        <div className={`w-10 h-5 rounded-full transition-colors duration-200 ${applyPartsGST ? 'bg-orange-500' : 'bg-gray-300'}`}>
                          <div className={`w-4 h-4 bg-white rounded-full shadow-sm absolute top-0.5 transition-all duration-200 ${applyPartsGST ? 'left-5' : 'left-0.5'}`} />
                        </div>
                      </div>
                      <div className="text-left">
                        <p className="text-xs font-bold text-gray-800">Apply Parts GST ({calculations.partsGstPct}%)</p>
                        <p className="text-[10px] text-gray-400">{applyPartsGST ? `GST included: ₹${calculations.totalPartsGST.toFixed(2)}` : 'GST not charged on parts'}</p>
                      </div>
                    </label>

                    <div className="space-y-2 text-sm pl-2">
                      {selectedParts.map(p => <div key={p.catalogId} className="flex justify-between text-gray-600"><span>{p.name} x {p.quantity}</span><span>₹{(p.price * p.quantity).toFixed(2)}</span></div>)}
                      {customItems.map((c, i) => (
                        <div key={i} className="flex justify-between text-gray-600">
                          <div>
                            <span>{c.name || 'Custom Item'} x {c.quantity}</span>
                            {c.hsnCode && <p className="text-[9px] text-gray-400">HSN: {c.hsnCode}</p>}
                          </div>
                          <span>₹{(c.price * c.quantity).toFixed(2)}</span>
                        </div>
                      ))}

                      <div className="flex justify-between text-xs text-gray-500 border-t border-dashed border-gray-100 pt-1 mt-1">
                        <span>Parts GST ({calculations.partsGstPct}%)</span>
                        <span>₹{calculations.totalPartsGST.toFixed(2)}</span>
                      </div>

                      <div className="flex justify-between font-bold text-gray-800 pt-1">
                        <span>Total Parts</span>
                        <span>₹{(calculations.partsBase + calculations.totalPartsGST).toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                )}

                {booking.visitingCharges > 0 && (
                  <div>
                    <h4 className="font-bold text-gray-900 flex items-center gap-2 mb-2 pb-2 border-b border-gray-100">
                      <span className="w-6 h-6 rounded-full bg-gray-50 text-gray-600 flex items-center justify-center text-xs"><FiClock /></span>
                      Visiting Charges
                    </h4>
                    <div className="flex justify-between text-sm pl-2 font-bold text-gray-800">
                      <span>Visiting Price</span>
                      <span>₹{Number(booking.visitingCharges).toFixed(2)}</span>
                    </div>
                  </div>
                )}

                {transportCharges > 0 && (
                  <div>
                    <h4 className="font-bold text-gray-900 flex items-center gap-2 mb-2 pb-2 border-b border-gray-100">
                      <span className="w-6 h-6 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-xs"><FiPackage /></span>
                      Transport Charges
                    </h4>
                    <div className="flex justify-between text-sm pl-2 font-bold text-gray-800">
                      <span>Transport Price</span>
                      <span>₹{Number(transportCharges).toFixed(2)}</span>
                    </div>
                  </div>
                )}

                {(paymentMode && booking.status === 'completed') && (
                  <div>
                    <h4 className="font-bold text-gray-900 flex items-center gap-2 mb-2 pb-2 border-b border-gray-100">
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${paymentMode === 'cash' ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'}`}>
                        {paymentMode === 'cash' ? <FiDollarSign /> : <MdQrCode />}
                      </span>
                      Payment Method
                    </h4>
                    <div className="flex justify-between text-sm pl-2 font-black text-gray-900 uppercase tracking-tight">
                      <span>Status</span>
                      <span className={paymentMode === 'cash' ? 'text-emerald-600' : 'text-blue-600'}>
                        {paymentMode === 'cash' ? 'Cash Collected' : 'Qr Online'}
                      </span>
                    </div>
                  </div>
                )}

                {/* Wallet Limit Warning */}
                {willExceedCashLimit && (
                  <div className="mt-4 p-4 rounded-2xl bg-amber-50 border border-amber-200 flex gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                      <FiClock className="w-5 h-5 text-amber-600" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-amber-800">Wallet Limit Warning</p>
                      <p className="text-[10px] text-amber-600 leading-normal mt-0.5">
                        Collecting this cash bill will exceed your net limit (₹{(walletInfo?.cashLimit || 10000).toLocaleString()}). 
                        Your account will be temporarily blocked from new jobs until settled.
                      </p>
                    </div>
                  </div>
                )}
              </div>
              {/* Earnings Footer - ONLY SHOW WHEN COMPLETED */}
              {booking.status === 'completed' ? (
                <div className="bg-emerald-50 px-6 py-4 border-t border-emerald-100">
                  <div className="space-y-2 mb-3">
                    <div className="flex justify-between items-center text-emerald-700 text-sm">
                      <span>Service Earnings ({calculations.servicePayoutPct}%)</span>
                      <span className="font-bold">₹{calculations.workerServiceEarnings.toFixed(2)}</span>
                    </div>
                    {(calculations.workerPartsEarnings > 0) && (
                      <div className="flex justify-between items-center text-emerald-700 text-sm">
                        <span>Parts Earnings ({calculations.partsPayoutPct}%)</span>
                        <span className="font-bold">₹{calculations.workerPartsEarnings.toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-emerald-200/50">
                    <span className="text-emerald-800 font-bold text-xs uppercase tracking-wider">Total Net Earnings</span>
                    <span className="text-emerald-700 font-black text-xl">₹{calculations.totalWorkerEarnings.toFixed(2)}</span>
                  </div>
                </div>
              ) : (
                <div className="bg-gray-50 px-6 py-4 border-t border-gray-100/50 text-center">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center justify-center gap-2">
                    <FiClock className="w-3 h-3" />
                    Net Earnings will be revealed after completion
                  </p>
                </div>
              )}

            </div>
          </div>
        )}
      </div>

      {/* Fixed Bottom Navigation for Timeline View */}
      <div className="fixed bottom-[72px] left-0 right-0 p-4 bg-white/80 backdrop-blur-md border-t border-gray-100 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] z-50 flex gap-3">
        {currentStep === 1 && (
          <button onClick={() => setCurrentStep(2)} className="w-full py-3.5 bg-gray-900 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg">
            Next: Services <FiArrowRight />
          </button>
        )}
        {currentStep === 2 && (
          <>
            <button onClick={() => setCurrentStep(1)} className="flex-1 py-3 text-gray-600 font-bold bg-white border border-gray-200 rounded-xl">Back</button>
            <button onClick={() => setCurrentStep(3)} className="flex-[2] py-3.5 bg-gray-900 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg">
              Next: Parts <FiArrowRight />
            </button>
          </>
        )}
        {currentStep === 3 && (
          <>
            <button onClick={() => setCurrentStep(2)} className="flex-1 py-3 text-gray-600 font-bold bg-white border border-gray-200 rounded-xl">Back</button>
            <button onClick={() => setCurrentStep(4)} className="flex-[2] py-3.5 bg-gray-900 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg">
              Next: Extras <FiArrowRight />
            </button>
          </>
        )}
        {currentStep === 4 && (
          <>
            <button onClick={() => setCurrentStep(3)} className="flex-1 py-3 text-gray-600 font-bold bg-white border border-gray-200 rounded-xl">Back</button>
            <button onClick={() => setCurrentStep(5)} className="flex-[2] py-3.5 bg-gray-900 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg">
              Next: Transport <FiArrowRight />
            </button>
          </>
        )}
        {currentStep === 5 && (
          <>
            <button
              onClick={() => setCurrentStep(4)}
              disabled={submitting || otpLoading}
              className="flex-1 py-3 text-gray-600 font-bold bg-white border border-gray-200 rounded-xl disabled:opacity-50"
            >
              Back
            </button>
            <button onClick={() => setCurrentStep(6)} className="flex-[2] py-3.5 bg-gray-900 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg">
              Next: Final Review <FiArrowRight />
            </button>
          </>
        )}
        {currentStep === 6 && (
          <>
            <button
              onClick={() => setCurrentStep(5)}
              disabled={submitting || otpLoading}
              className="flex-1 py-3 text-gray-600 font-bold bg-white border border-gray-200 rounded-xl disabled:opacity-50"
            >
              Back
            </button>

            {/* Payment Options Grid for Final Review */}
            <div className="flex-[2] grid grid-cols-2 gap-2">
              {/* Cash/OTP Option - Show if either cash mode or QR generated OTP */}
              {(isOtpSent && paymentMode === 'cash') ? (
                <button
                  onClick={() => setShowOtpModal(true)}
                  disabled={otpLoading || qrLoading}
                  className="py-3 bg-gray-900 text-white font-bold rounded-xl shadow-lg flex flex-col items-center justify-center gap-1 active:scale-95 transition-all text-[10px]"
                >
                  <FiKey className="w-4 h-4" />
                  <span>Enter OTP</span>
                </button>
              ) : (
                <button
                  onClick={handleSendOTP}
                  disabled={otpLoading || qrLoading}
                  className="py-3 bg-emerald-600 text-white font-bold rounded-xl shadow-lg flex flex-col items-center justify-center gap-1 active:scale-95 transition-all disabled:opacity-50 text-[10px]"
                >
                  <FiDollarSign className="w-4 h-4" />
                  <span>Pay in Cash</span>
                </button>
              )}

              {/* Online Option */}
              <button
                onClick={handleOnlinePayment}
                disabled={otpLoading || qrLoading}
                className="py-3 bg-blue-600 text-white font-bold rounded-xl shadow-lg flex flex-col items-center justify-center gap-1 active:scale-95 transition-all disabled:opacity-50 text-[10px]"
              >
                <MdQrCode className="w-4 h-4" />
                <span>{qrLoading ? '...' : 'Online (QR)'}</span>
              </button>
            </div>
          </>
        )}
      </div>

      <OtpVerificationModal
        isOpen={showOtpModal}
        onClose={() => setShowOtpModal(false)}
        onVerify={handleVerifyOTP}
        loading={otpLoading}
      />

      <ScanAndPayModal
        isOpen={showQrModal}
        onClose={() => setShowQrModal(false)}
        qrImageUrl={onlinePaymentData?.qrImageUrl}
        amount={calculations.remainingPayableAmount}
        onCheckStatus={checkPaymentStatus}
        onSwitchToOtp={() => {
          setShowQrModal(false);
          setShowOtpModal(true);
        }}
      />
    </div>
  );
};

export default BillingPage;

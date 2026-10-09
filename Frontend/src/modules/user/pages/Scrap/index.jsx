import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiPlus, FiMapPin, FiClock, FiCheckCircle, FiBell, FiArrowLeft, FiTrash2, FiCamera, FiX, FiLoader, FiImage, FiCheck, FiDollarSign, FiTag } from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import api from '../../../../services/api';
import { AnimatePresence, motion } from 'framer-motion';
import BottomNav from '../../components/layout/BottomNav';
import AddressSelectionModal from '../Checkout/components/AddressSelectionModal';
import { themeColors } from '../../../../theme';
import { uploadToCloudinary } from '../../../../utils/cloudinaryUpload';
import flutterBridge from '../../../../utils/flutterBridge';
import { useConfig } from '../../../../context/ConfigContext';
import NotificationBell from '../../components/common/NotificationBell';


const UserScrapPage = () => {
  const navigate = useNavigate();
  const { isScrapEnabled, configLoaded } = useConfig();
  const [activeTab, setActiveTab] = useState('active'); // 'active' | 'history'
  const [scraps, setScraps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedScrap, setSelectedScrap] = useState(null);
  const [respondingToOffer, setRespondingToOffer] = useState(false);

  useEffect(() => {
    if (configLoaded && isScrapEnabled) {
      fetchMyScrap();
    }
  }, [configLoaded, isScrapEnabled]);

  const fetchMyScrap = async () => {
    try {
      setLoading(true);
      const res = await api.get('/scrap/my');
      if (res.data.success) {
        setScraps(res.data.data);
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to load scrap items');
    } finally {
      setLoading(false);
    }
  };

  const handleRespondOffer = async (e, scrapId, action, price) => {
    if (e) e.stopPropagation();

    if (action === 'reject') {
      if (!window.confirm(`Are you sure you want to reject the offer of ₹${price || ''}?`)) {
        return;
      }
    }

    try {
      setRespondingToOffer(true);
      toast.loading(action === 'accept' ? 'Accepting offer...' : 'Rejecting offer...', { id: 'offer-resp' });
      const res = await api.put(`/scrap/${scrapId}/respond`, { action });
      if (res.data.success) {
        toast.success(res.data.message || (action === 'accept' ? 'Offer accepted! Pickup will be scheduled.' : 'Offer rejected.'), { id: 'offer-resp' });
        if (selectedScrap && selectedScrap._id === scrapId) {
          setSelectedScrap(res.data.data);
        }
        fetchMyScrap();
      }
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || 'Failed to update offer', { id: 'offer-resp' });
    } finally {
      setRespondingToOffer(false);
    }
  };

  const handleDelete = async (e, id) => {
    e.stopPropagation(); // Prevent opening modal
    if (!window.confirm('Are you sure you want to delete this listing?')) return;

    try {
      toast.loading('Deleting listing...', { id: 'delete-scrap' });
      const res = await api.delete(`/scrap/${id}`);
      if (res.data.success) {
        toast.success('Listing deleted successfully', { id: 'delete-scrap' });
        setSelectedScrap(null);
        fetchMyScrap();
      }
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || 'Failed to delete listing', { id: 'delete-scrap' });
    }
  };

  const activeScraps = scraps.filter(s => s.status === 'pending' || s.status === 'offered' || s.status === 'accepted');
  const historyScraps = scraps.filter(s => s.status === 'completed' || s.status === 'cancelled' || s.status === 'rejected');

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

  // Inside return:
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
        <header className="sticky top-0 z-40 backdrop-blur-xl bg-white/40 border-b border-black/[0.03] px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm border border-black/[0.02]"
            >
              <FiArrowLeft className="w-5 h-5 text-gray-800" />
            </button>
            <div className="flex items-center gap-2">
              <FiTrash2 className="w-5 h-5" style={{ color: themeColors.button }} />
              <h1 className="text-xl font-extrabold text-gray-900">Sell Scrap</h1>
            </div>
          </div>
          <NotificationBell />
        </header>

        {/* Tabs */}
        <div className="flex bg-white border-b border-gray-200 mt-1">
          <button
            onClick={() => setActiveTab('active')}
            className={`flex-1 py-3 text-sm font-medium border-b-2 ${activeTab === 'active'
              ? `border-[${themeColors.primary}] text-[${themeColors.primary}]`
              : 'border-transparent text-gray-500'
              }`}
            style={{ borderColor: activeTab === 'active' ? themeColors.button : 'transparent', color: activeTab === 'active' ? themeColors.button : undefined }}
          >
            Active Listings
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex-1 py-3 text-sm font-medium border-b-2 ${activeTab === 'history'
              ? `border-[${themeColors.primary}] text-[${themeColors.primary}]`
              : 'border-transparent text-gray-500'
              }`}
            style={{ borderColor: activeTab === 'history' ? themeColors.button : 'transparent', color: activeTab === 'history' ? themeColors.button : undefined }}
          >
            History
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="bg-white rounded-xl shadow-sm p-4 border border-gray-100 animate-pulse">
                  <div className="flex justify-between items-start mb-3">
                    <div className="space-y-2">
                      <div className="h-4 w-20 bg-gray-200 rounded"></div>
                      <div className="h-5 w-40 bg-gray-200 rounded"></div>
                      <div className="h-3 w-32 bg-gray-200 rounded"></div>
                    </div>
                    <div className="h-6 w-16 bg-gray-200 rounded"></div>
                  </div>
                  <div className="pt-3 border-t border-gray-50 flex justify-between">
                    <div className="h-4 w-24 bg-gray-200 rounded"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : (activeTab === 'active' ? activeScraps : historyScraps).length === 0 ? (
            <div className="text-center py-20">
              <div className="bg-gray-100 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                <FiPlus className="w-8 h-8 text-gray-400" />
              </div>
              <p className="text-gray-500 font-medium">No items found</p>
              <p className="text-sm text-gray-400 mt-1">Add items to start selling</p>
            </div>
          ) : (
            (activeTab === 'active' ? activeScraps : historyScraps).map(item => (
              <div
                key={item._id}
                className="bg-white rounded-[24px] shadow-sm p-4 border border-gray-100 active:scale-[0.98] transition-all cursor-pointer overflow-hidden relative"
                onClick={() => setSelectedScrap(item)}
              >
                <div className="flex gap-4">
                  {item.images && item.images.length > 0 && (
                    <div className="w-20 h-20 rounded-2xl overflow-hidden shrink-0 border border-gray-50 bg-gray-50/50">
                      <img src={item.images[0]} alt={item.title} className="w-full h-full object-cover" />
                    </div>
                  )}
                  <div className="flex-1">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-extrabold text-gray-900 leading-tight line-clamp-1">{item.title}</h3>
                        <p className="text-xs font-medium text-gray-500 mt-1 line-clamp-1">{item.description}</p>
                      </div>
                      <div className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border
                        ${item.status === 'pending' ? 'bg-amber-50 text-amber-600 border-amber-100' : ''}
                        ${item.status === 'offered' ? 'bg-blue-50 text-blue-700 border-blue-200' : ''}
                        ${item.status === 'accepted' ? 'bg-green-50 text-green-600 border-green-100' : ''}
                        ${item.status === 'completed' ? 'bg-gray-100 text-gray-600 border-gray-200' : ''}
                        ${item.status === 'rejected' ? 'bg-red-50 text-red-600 border-red-100' : ''}
                        ${item.status === 'cancelled' ? 'bg-red-50 text-red-600 border-red-100' : ''}
                      `}>
                        {item.status === 'offered' ? 'Offer Received' : item.status}
                      </div>
                      {(item.status === 'pending' || item.status === 'cancelled' || item.status === 'rejected') && (
                        <button
                          onClick={(e) => handleDelete(e, item._id)}
                          className="p-2 ml-2 text-red-500 hover:bg-red-50 rounded-full transition-colors"
                          title="Delete Listing"
                        >
                          <FiTrash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Offer Action Banner in Card */}
                {item.status === 'offered' && (
                  <div className="mt-3 p-3 bg-amber-50/90 border border-amber-200 rounded-2xl" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-amber-900">Admin Price Offer:</span>
                      <span className="text-sm font-black text-amber-800">₹{item.offeredPrice}</span>
                    </div>
                    {item.adminNote && (
                      <p className="text-[11px] text-gray-600 mt-1 italic">"{item.adminNote}"</p>
                    )}
                    <div className="flex gap-2 mt-2.5">
                      <button
                        onClick={(e) => handleRespondOffer(e, item._id, 'accept', item.offeredPrice)}
                        disabled={respondingToOffer}
                        className="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl text-xs font-bold shadow-sm transition-all flex items-center justify-center gap-1 disabled:opacity-50"
                      >
                        <FiCheck className="w-3.5 h-3.5" /> Approve ₹{item.offeredPrice}
                      </button>
                      <button
                        onClick={(e) => handleRespondOffer(e, item._id, 'reject', item.offeredPrice)}
                        disabled={respondingToOffer}
                        className="py-2 px-3 bg-white hover:bg-red-50 active:scale-95 text-red-600 border border-red-200 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 disabled:opacity-50"
                      >
                        <FiX className="w-3.5 h-3.5" /> Reject
                      </button>
                    </div>
                  </div>
                )}

                <div className="mt-3 pt-3 border-t border-gray-50 flex items-center justify-between text-[11px] font-bold text-gray-400">
                  <div className="flex items-center gap-1.5">
                    <FiClock className="w-3.5 h-3.5" />
                    <span>Listed on {new Date(item.createdAt).toLocaleDateString()}</span>
                  </div>
                  {item.status === 'accepted' && (
                    <div className="flex items-center gap-1.5 text-green-600">
                      <FiCheckCircle className="w-3.5 h-3.5" />
                      <span>Accepted {item.finalPrice ? `(₹${item.finalPrice})` : ''}</span>
                    </div>
                  )}
                  {item.status === 'offered' && (
                    <div className="flex items-center gap-1 text-amber-700 font-bold">
                      <span>Action required</span>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* FAB */}
        <button
          onClick={() => navigate('/user/scrap/add')}
          className="fixed bottom-24 right-4 w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-white transition-transform active:scale-95"
          style={{ backgroundColor: themeColors.button }}
        >
          <FiPlus className="w-7 h-7" />
        </button>

        {/* User Scrap Details Modal */}
        <AnimatePresence>
          {selectedScrap && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setSelectedScrap(null)}
                className="fixed inset-0 bg-black/60 z-[60] backdrop-blur-md"
              />
              <motion.div
                initial={{ y: "100%", opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: "100%", opacity: 0 }}
                transition={{ type: "spring", damping: 30, stiffness: 350 }}
                className="fixed bottom-20 left-4 right-4 bg-white rounded-[32px] z-[70] max-h-[85vh] overflow-y-auto shadow-2xl border border-gray-100 flex flex-col"
                onClick={e => e.stopPropagation()}
                style={{
                  boxShadow: '0 -25px 50px -12px rgba(0,0,0,0.5)'
                }}
              >
                {/* Header */}
                <div className="p-4 border-b border-gray-100 flex justify-between items-center sticky top-0 bg-white/80 backdrop-blur-md z-10">
                  <div className="flex flex-col">
                    <h2 className="text-xl font-black text-gray-900 leading-tight">{selectedScrap.title}</h2>
                  </div>
                  <button
                    onClick={() => setSelectedScrap(null)}
                    className="w-10 h-10 bg-gray-50 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100 active:scale-90 transition-all"
                  >
                    <FiX className="w-6 h-6" />
                  </button>
                </div>

                <div className="p-6 space-y-6">
                  {/* Images */}
                  {selectedScrap.images && selectedScrap.images.length > 0 && (
                    <div className="grid grid-cols-2 gap-3">
                      {selectedScrap.images.map((img, i) => (
                        <div key={i} className={`rounded-3xl overflow-hidden border border-gray-100 ${i === 0 && selectedScrap.images.length % 2 !== 0 ? 'col-span-2 aspect-video' : 'aspect-square'}`}>
                          <img src={img} alt="Scrap" className="w-full h-full object-cover" />
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Price Offer Card inside Modal */}
                  {selectedScrap.status === 'offered' && (
                    <div className="bg-amber-50 border-2 border-amber-200 p-4 rounded-3xl space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-xs font-bold uppercase tracking-wider text-amber-800">Admin Price Offer</span>
                          <h4 className="text-2xl font-black text-amber-900">₹{selectedScrap.offeredPrice}</h4>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 text-lg">
                          <FiTag />
                        </div>
                      </div>
                      {selectedScrap.adminNote && (
                        <div className="bg-white/80 p-3 rounded-2xl border border-amber-100 text-xs text-gray-700">
                          <p className="font-semibold text-gray-500 text-[10px] uppercase">Admin Note:</p>
                          <p className="mt-0.5">{selectedScrap.adminNote}</p>
                        </div>
                      )}
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={(e) => handleRespondOffer(e, selectedScrap._id, 'accept', selectedScrap.offeredPrice)}
                          disabled={respondingToOffer}
                          className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-2xl text-xs font-black uppercase tracking-wider shadow-md transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                        >
                          <FiCheck className="w-4 h-4" /> Approve ₹{selectedScrap.offeredPrice}
                        </button>
                        <button
                          onClick={(e) => handleRespondOffer(e, selectedScrap._id, 'reject', selectedScrap.offeredPrice)}
                          disabled={respondingToOffer}
                          className="px-4 py-3 bg-white hover:bg-red-50 active:scale-95 text-red-600 border border-red-200 rounded-2xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                        >
                          <FiX className="w-4 h-4" /> Reject
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Status Badge */}
                  <div className={`p-4 rounded-3xl border text-center font-black uppercase tracking-widest text-xs
                    ${selectedScrap.status === 'pending' ? 'bg-amber-50 text-amber-600 border-amber-100' : ''}
                    ${selectedScrap.status === 'offered' ? 'bg-blue-50 text-blue-700 border-blue-200' : ''}
                    ${selectedScrap.status === 'accepted' ? 'bg-green-50 text-green-600 border-green-100' : ''}
                    ${selectedScrap.status === 'completed' ? 'bg-gray-50 text-gray-500 border-gray-200' : ''}
                    ${selectedScrap.status === 'rejected' ? 'bg-red-50 text-red-600 border-red-100' : ''}
                    ${selectedScrap.status === 'cancelled' ? 'bg-red-50 text-red-600 border-red-100' : ''}
                  `}>
                    Status: {selectedScrap.status === 'offered' ? 'Offer Received' : selectedScrap.status}
                    {selectedScrap.finalPrice ? ` (₹${selectedScrap.finalPrice})` : ''}
                  </div>

                  {/* Description */}
                  {selectedScrap.description && (
                    <div className="bg-blue-50/30 p-5 rounded-3xl border border-blue-100/30 italic">
                      <p className="text-gray-600 font-medium leading-relaxed">"{selectedScrap.description}"</p>
                    </div>
                  )}

                  {/* Location */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-black text-gray-900 flex items-center gap-2">
                      <FiMapPin className="text-red-500" /> Pickup Address
                    </h3>
                    <div className="bg-gray-50 p-4 rounded-3xl border border-gray-100">
                      <p className="font-bold text-gray-800">{selectedScrap.address?.addressLine1}</p>
                      <p className="text-xs text-gray-400 mt-1 uppercase font-bold">{selectedScrap.address?.city}, {selectedScrap.address?.state}</p>
                    </div>
                  </div>

                  {/* Timeline */}
                  <div className="pt-4 border-t border-gray-100 flex items-center justify-between text-[10px] font-black uppercase text-gray-400 tracking-wider">
                    <span className="flex items-center gap-1"><FiClock /> Posted {new Date(selectedScrap.createdAt).toLocaleDateString()}</span>
                    {selectedScrap.status === 'accepted' && <span className="text-green-600">Pickup Confirmed</span>}
                  </div>
                </div>

                <div className="p-4 bg-gray-50/50 border-t border-gray-100 flex gap-3">
                  <button
                    onClick={() => setSelectedScrap(null)}
                    className="flex-1 py-4 bg-gray-900 text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl active:scale-95 transition-all"
                  >
                    Back to Listings
                  </button>
                  {(selectedScrap.status === 'pending' || selectedScrap.status === 'cancelled' || selectedScrap.status === 'rejected') && (
                    <button
                      onClick={(e) => handleDelete(e, selectedScrap._id)}
                      className="px-6 py-4 bg-red-50 text-red-600 border border-red-100 rounded-2xl font-black uppercase tracking-widest text-xs active:scale-95 transition-all flex items-center gap-2"
                    >
                      <FiTrash2 />
                      Delete
                    </button>
                  )}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default UserScrapPage;

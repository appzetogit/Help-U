import React, { useState, useEffect } from 'react';
import { FiTrash2, FiSearch, FiFilter, FiDollarSign, FiX, FiCheck, FiClock, FiMapPin, FiPhone, FiUser, FiPower } from 'react-icons/fi';
import api from '../../../../services/api';
import { getSettings, updateSettings } from '../../services/settingsService';
import { publicCatalogService } from '../../../../services/catalogService';
import { toast } from 'react-hot-toast';

const AdminScrapPage = () => {
  const [scraps, setScraps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [isScrapEnabled, setIsScrapEnabled] = useState(true);
  const [togglingStatus, setTogglingStatus] = useState(false);

  // Modal State for Price Offer
  const [offerModalOpen, setOfferModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [offeredPrice, setOfferedPrice] = useState('');
  const [adminNote, setAdminNote] = useState('');
  const [submittingOffer, setSubmittingOffer] = useState(false);

  useEffect(() => {
    fetchScrap();
    fetchFeatureStatus();

    const handleSync = () => fetchFeatureStatus();
    window.addEventListener('systemConfigUpdated', handleSync);
    window.addEventListener('adminSettingsUpdated', handleSync);
    return () => {
      window.removeEventListener('systemConfigUpdated', handleSync);
      window.removeEventListener('adminSettingsUpdated', handleSync);
    };
  }, []);

  const fetchFeatureStatus = async () => {
    try {
      const res = await getSettings();
      if (res.success && res.settings) {
        const enabled = res.settings.isScrapEnabled !== undefined ? res.settings.isScrapEnabled : true;
        setIsScrapEnabled(enabled);
        try {
          const current = JSON.parse(localStorage.getItem('app_public_config') || '{}');
          localStorage.setItem('app_public_config', JSON.stringify({ ...current, isScrapEnabled: enabled }));
        } catch (e) {}
      }
    } catch (err) {
      console.error('Failed to fetch settings:', err);
    }
  };

  const handleToggleFeature = async () => {
    const newValue = !isScrapEnabled;
    setIsScrapEnabled(newValue);
    setTogglingStatus(true);
    try {
      await updateSettings({ isScrapEnabled: newValue });
      try {
        const currentConfig = JSON.parse(localStorage.getItem('app_public_config') || '{}');
        localStorage.setItem('app_public_config', JSON.stringify({ ...currentConfig, isScrapEnabled: newValue }));
      } catch (e) {}
      publicCatalogService.invalidateCache();
      toast.success(newValue ? 'Scrap selling feature turned ON' : 'Scrap selling feature turned OFF');
      window.dispatchEvent(new Event('systemConfigUpdated'));
      window.dispatchEvent(new Event('adminSettingsUpdated'));
    } catch (err) {
      setIsScrapEnabled(!newValue);
      toast.error('Failed to update feature status');
    } finally {
      setTogglingStatus(false);
    }
  };

  const fetchScrap = async () => {
    try {
      setLoading(true);
      const res = await api.get('/scrap/all');
      if (res.data.success) {
        setScraps(res.data.data);
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to fetch scrap items');
    } finally {
      setLoading(false);
    }
  };

  const openOfferModal = (item) => {
    setSelectedItem(item);
    setOfferedPrice(item.offeredPrice !== null && item.offeredPrice !== undefined ? String(item.offeredPrice) : (item.expectedPrice ? String(item.expectedPrice) : ''));
    setAdminNote(item.adminNote || '');
    setOfferModalOpen(true);
  };

  const closeOfferModal = () => {
    setOfferModalOpen(false);
    setSelectedItem(null);
    setOfferedPrice('');
    setAdminNote('');
  };

  const handleSendOffer = async (e) => {
    e.preventDefault();
    if (!selectedItem) return;

    const price = Number(offeredPrice);
    if (isNaN(price) || price <= 0) {
      toast.error('Please enter a valid price amount greater than 0');
      return;
    }

    try {
      setSubmittingOffer(true);
      const res = await api.put(`/scrap/${selectedItem._id}/accept`, {
        offeredPrice: price,
        adminNote: adminNote.trim()
      });

      if (res.data.success) {
        toast.success(res.data.message || `Price offer of ₹${price} sent to user!`);
        closeOfferModal();
        fetchScrap();
      }
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || 'Failed to send price offer');
    } finally {
      setSubmittingOffer(false);
    }
  };

  const handleComplete = async (id) => {
    if (!window.confirm('Mark this transaction as completed?')) return;
    try {
      const res = await api.put(`/scrap/${id}/complete`);
      if (res.data.success) {
        toast.success('Transaction marked as completed');
        fetchScrap();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to complete transaction');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this scrap item?')) return;
    try {
      const res = await api.delete(`/scrap/${id}`);
      if (res.data.success) {
        toast.success('Scrap deleted successfully');
        fetchScrap();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete scrap');
    }
  };

  const filteredScraps = scraps.filter(item => {
    if (filter === 'all') return true;
    return item.status === filter;
  });

  const getMapsUrl = (item) => {
    const lat = item?.address?.lat;
    const lng = item?.address?.lng;

    if (lat !== undefined && lat !== null && lng !== undefined && lng !== null) {
      return `https://www.google.com/maps?q=${lat},${lng}`;
    }

    const addressText = [
      item?.address?.addressLine1,
      item?.address?.addressLine2,
      item?.address?.city,
      item?.address?.state,
      item?.address?.pincode
    ].filter(Boolean).join(', ');

    if (!addressText) return null;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressText)}`;
  };

  return (
    <div className="space-y-4">
      {/* Top Feature Status Banner */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${
            isScrapEnabled ? 'bg-green-50 text-green-600 border border-green-200' : 'bg-red-50 text-red-600 border border-red-200'
          }`}>
            <FiTrash2 />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-gray-900">Scrap Selling Feature</h2>
              <span className={`px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider rounded-full border ${
                isScrapEnabled
                  ? 'bg-green-100 text-green-800 border-green-200'
                  : 'bg-red-100 text-red-800 border-red-200'
              }`}>
                {isScrapEnabled ? 'ACTIVE (ON)' : 'DISABLED (OFF)'}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              {isScrapEnabled
                ? 'Visible in User App Home banner, Bottom Navigation, and Account menu.'
                : 'Completely hidden and disabled across User App.'}
            </p>
          </div>
        </div>

        <button
          type="button"
          disabled={togglingStatus}
          onClick={handleToggleFeature}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all shadow-sm ${
            isScrapEnabled
              ? 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200'
              : 'bg-green-600 text-white hover:bg-green-700 shadow-green-100'
          }`}
        >
          <FiPower className="w-3.5 h-3.5" />
          {isScrapEnabled ? 'Turn Feature OFF' : 'Turn Feature ON'}
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {/* Filters */}
        <div className="p-3 border-b border-gray-100 flex gap-2 overflow-x-auto bg-gray-50/50">
          {[
            { key: 'all', label: 'All' },
            { key: 'pending', label: 'Pending' },
            { key: 'offered', label: 'Price Offered' },
            { key: 'accepted', label: 'Accepted' },
            { key: 'completed', label: 'Completed' },
            { key: 'rejected', label: 'Rejected' }
          ].map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${filter === f.key ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-50/50 border-b border-gray-100">
              <tr>
                <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Item</th>
                <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">User</th>
                <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Offered / Final Price</th>
                <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Location</th>
                <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Date</th>
                <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan="7" className="px-4 py-8 text-center text-xs text-gray-500 font-medium">Loading items...</td></tr>
              ) : filteredScraps.length === 0 ? (
                <tr><td colSpan="7" className="px-4 py-8 text-center text-xs text-gray-500 font-medium">No items found</td></tr>
              ) : (
                filteredScraps.map((item) => (
                  <tr key={item._id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {item.images && item.images[0] ? (
                          <img src={item.images[0]} alt="" className="w-10 h-10 rounded-lg object-cover border border-gray-100 shadow-sm" />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400 text-xs font-bold">No img</div>
                        )}
                        <div>
                          <p className="text-xs font-bold text-gray-900">{item.title}</p>
                          <p className="text-[10px] text-gray-500">
                            {item.category || 'Scrap'} {item.quantity ? `• Qty: ${item.quantity}` : ''}
                            {item.expectedPrice ? ` • Exp: ₹${item.expectedPrice}` : ''}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs font-bold text-gray-900">{item.userId?.name || 'N/A'}</p>
                      <p className="text-[10px] text-gray-500">{item.userId?.phone || item.userId?.email || 'N/A'}</p>
                    </td>
                    <td className="px-4 py-3">
                      {item.finalPrice ? (
                        <div>
                          <span className="text-xs font-black text-green-700">₹{item.finalPrice}</span>
                          <span className="text-[9px] text-gray-400 block font-medium">Agreed</span>
                        </div>
                      ) : item.offeredPrice ? (
                        <div>
                          <span className="text-xs font-black text-amber-700">₹{item.offeredPrice}</span>
                          <span className="text-[9px] text-amber-600 block font-medium">Offered</span>
                        </div>
                      ) : (
                        <span className="text-[10px] text-gray-400 italic">Not set</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 text-[9px] font-bold rounded-full uppercase tracking-wider
                        ${item.status === 'pending' ? 'bg-yellow-100 text-yellow-800 border border-yellow-200' : ''}
                        ${item.status === 'offered' ? 'bg-amber-100 text-amber-800 border border-amber-200' : ''}
                        ${item.status === 'accepted' ? 'bg-green-100 text-green-800 border border-green-200' : ''}
                        ${item.status === 'completed' ? 'bg-gray-100 text-gray-800 border border-gray-200' : ''}
                        ${item.status === 'rejected' ? 'bg-red-100 text-red-800 border border-red-200' : ''}
                        ${item.status === 'cancelled' ? 'bg-red-100 text-red-800 border border-red-200' : ''}
                      `}>
                        {item.status === 'offered' ? 'Price Offered' : item.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {getMapsUrl(item) ? (
                        <a
                          href={getMapsUrl(item)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-start gap-1.5 text-[10px] text-blue-600 font-medium max-w-[160px] hover:text-blue-700 hover:underline"
                          title="Open in Google Maps"
                        >
                          <FiMapPin className="w-3 h-3 mt-0.5 shrink-0" />
                          <span className="line-clamp-2">
                            {item.address?.addressLine1 ? `${item.address.addressLine1}, ${item.address.city || ''}` : 'Open location'}
                          </span>
                        </a>
                      ) : (
                        <p className="text-[10px] text-gray-500 font-medium max-w-[160px] line-clamp-2">
                          N/A
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[10px] text-gray-500 font-medium">
                      {new Date(item.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {item.status === 'pending' && (
                          <button
                            onClick={() => openOfferModal(item)}
                            className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold rounded-lg uppercase tracking-wider shadow-sm transition-colors flex items-center gap-1"
                          >
                            <FiDollarSign className="w-3 h-3" />
                            Set Price & Accept
                          </button>
                        )}
                        {item.status === 'offered' && (
                          <button
                            onClick={() => openOfferModal(item)}
                            className="px-2.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-bold rounded-lg uppercase tracking-wider shadow-sm transition-colors flex items-center gap-1"
                          >
                            <FiDollarSign className="w-3 h-3" />
                            Update Price
                          </button>
                        )}
                        {item.status === 'accepted' && (
                          <button
                            onClick={() => handleComplete(item._id)}
                            className="px-2.5 py-1.5 bg-green-600 hover:bg-green-700 text-white text-[10px] font-bold rounded-lg uppercase tracking-wider shadow-sm transition-colors flex items-center gap-1"
                          >
                            <FiCheck className="w-3 h-3" />
                            Complete Pickup
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(item._id)}
                          className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete Scrap"
                        >
                          <FiTrash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Price Offer Modal Popup */}
      {offerModalOpen && selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-100 relative">
            {/* Close button */}
            <button
              onClick={closeOfferModal}
              className="absolute top-4 right-4 p-1.5 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors"
            >
              <FiX className="w-5 h-5" />
            </button>

            {/* Modal Header */}
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center text-xl font-bold">
                <FiDollarSign />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">Set Price Offer</h3>
                <p className="text-xs text-gray-500">Quote price to user for this scrap item</p>
              </div>
            </div>

            {/* Scrap Item Summary Card */}
            <div className="bg-gray-50 rounded-xl p-3 mb-4 border border-gray-100 flex gap-3 items-center">
              {selectedItem.images && selectedItem.images[0] ? (
                <img src={selectedItem.images[0]} alt="" className="w-14 h-14 rounded-lg object-cover border border-gray-200" />
              ) : (
                <div className="w-14 h-14 rounded-lg bg-gray-200 flex items-center justify-center text-gray-400 text-xs font-bold">No img</div>
              )}
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-bold text-gray-900 truncate">{selectedItem.title}</h4>
                <p className="text-xs text-gray-500 truncate">{selectedItem.description || 'No description'}</p>
                <div className="flex items-center gap-2 mt-1 text-[11px] text-gray-600 font-medium">
                  <span className="flex items-center gap-1"><FiUser className="w-3 h-3 text-gray-400" /> {selectedItem.userId?.name || 'User'}</span>
                  {selectedItem.expectedPrice ? <span className="text-blue-600 font-semibold">• Exp: ₹{selectedItem.expectedPrice}</span> : null}
                </div>
              </div>
            </div>

            {/* Offer Form */}
            <form onSubmit={handleSendOffer} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                  Your Price Offer (₹) <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 font-bold text-base">₹</span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={offeredPrice}
                    onChange={(e) => setOfferedPrice(e.target.value)}
                    placeholder="e.g. 500"
                    required
                    autoFocus
                    className="w-full pl-9 pr-4 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-sm font-bold text-gray-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <p className="text-[11px] text-gray-500 mt-1">
                  This amount will be notified to the user. User can approve or reject this offer.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                  Message / Pickup Note (Optional)
                </label>
                <textarea
                  rows="2"
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  placeholder="e.g. Pickup scheduled for tomorrow between 10am-1pm."
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-xl text-xs text-gray-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeOfferModal}
                  className="flex-1 py-2.5 px-4 rounded-xl border border-gray-300 text-gray-700 text-xs font-bold uppercase tracking-wider hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingOffer}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold uppercase tracking-wider shadow-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                >
                  {submittingOffer ? 'Sending...' : 'Send Price Offer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminScrapPage;


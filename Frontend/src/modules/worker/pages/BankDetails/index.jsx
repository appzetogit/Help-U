import React, { useEffect, useLayoutEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FiCreditCard, FiHash, FiUpload } from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import Header from '../../components/layout/Header';
import BottomNav from '../../components/layout/BottomNav';
import { workerTheme as themeColors } from '../../../../theme';
import { workerAuthService } from '../../../../services/authService';

const emptyBankDetails = {
  accountHolderName: '',
  bankName: '',
  accountNumber: '',
  ifscCode: '',
  branchName: '',
  upiId: '',
  qrCodeImage: '',
};

const BankDetails = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [bankDetails, setBankDetails] = useState(emptyBankDetails);
  const [qrFile, setQrFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const redirectTo = location.state?.redirectTo || '/worker/profile';

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
        const response = await workerAuthService.getProfile();
        if (response.success && response.worker) {
          setBankDetails({
            ...emptyBankDetails,
            ...(response.worker.bankDetails || {}),
          });
          localStorage.setItem('workerProfile', JSON.stringify(response.worker));
          localStorage.setItem('workerData', JSON.stringify(response.worker));
          return;
        }
      } catch (error) {
        console.error('Error loading bank details:', error);
      }

      const storedWorkerData = JSON.parse(localStorage.getItem('workerData') || '{}');
      setBankDetails({
        ...emptyBankDetails,
        ...(storedWorkerData.bankDetails || {}),
      });
    };

    loadProfile();
  }, []);

  const uploadFile = async (file) => {
    const formData = new FormData();
    formData.append('file', file);

    let baseUrl = import.meta.env.VITE_API_BASE_URL || '';
    if (!baseUrl) {
      if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        baseUrl = 'http://localhost:5000';
      } else {
        baseUrl = window.location.origin;
      }
    }

    baseUrl = baseUrl.replace(/\/api$/, '');
    const response = await fetch(`${baseUrl}/api/image/upload`, {
      method: 'POST',
      body: formData,
    });

    const data = await response.json();
    if (!data.success) throw new Error(data.message || 'Upload failed');
    return data.imageUrl;
  };

  const handleFieldChange = (field, value) => {
    setBankDetails(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleQrChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error('File size should be less than 5MB');
      return;
    }

    setQrFile(file);
  };

  const handleSave = async () => {
    try {
      setUploading(true);
      let qrCodeImage = bankDetails.qrCodeImage || '';

      if (qrFile) {
        qrCodeImage = await uploadFile(qrFile);
      }

      const payload = {
        bankDetails: {
          ...bankDetails,
          ifscCode: bankDetails.ifscCode?.toUpperCase?.() || '',
          qrCodeImage,
        }
      };

      const response = await workerAuthService.updateProfile(payload);
      if (!response.success) {
        throw new Error(response.message || 'Failed to save bank details');
      }

      const updatedWorker = {
        ...(JSON.parse(localStorage.getItem('workerData') || '{}')),
        ...response.worker,
      };

      localStorage.setItem('workerData', JSON.stringify(updatedWorker));
      localStorage.setItem('workerProfile', JSON.stringify(updatedWorker));
      window.dispatchEvent(new Event('workerDataUpdated'));
      window.dispatchEvent(new Event('workerProfileUpdated'));
      toast.success('Bank details updated successfully');
      navigate(redirectTo);
    } catch (error) {
      console.error('Error saving bank details:', error);
      toast.error(error.message || 'Failed to save bank details');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen pb-20" style={{ background: themeColors.backgroundGradient }}>
      <Header title="Bank Details" />

      <main className="px-4 py-6">
        <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm space-y-4">
          <div className="flex items-center gap-2">
            <div
              className="p-2 rounded-lg"
              style={{
                background: `linear-gradient(135deg, ${themeColors.icon}25 0%, ${themeColors.icon}15 100%)`,
              }}
            >
              <FiCreditCard className="w-4 h-4" style={{ color: themeColors.icon }} />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-800">Worker Bank Details</p>
              <p className="text-xs text-gray-500">Save bank account, UPI and QR in one place</p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Account Holder Name</label>
            <input
              type="text"
              value={bankDetails.accountHolderName}
              onChange={(e) => handleFieldChange('accountHolderName', e.target.value)}
              placeholder="Enter account holder name"
              className="w-full px-4 py-3 bg-white rounded-xl border border-gray-200 focus:outline-none focus:ring-2"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Bank Name</label>
            <input
              type="text"
              value={bankDetails.bankName}
              onChange={(e) => handleFieldChange('bankName', e.target.value)}
              placeholder="Enter bank name"
              className="w-full px-4 py-3 bg-white rounded-xl border border-gray-200 focus:outline-none focus:ring-2"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Account Number</label>
            <input
              type="text"
              value={bankDetails.accountNumber}
              onChange={(e) => handleFieldChange('accountNumber', e.target.value)}
              placeholder="Enter account number"
              className="w-full px-4 py-3 bg-white rounded-xl border border-gray-200 focus:outline-none focus:ring-2"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">IFSC Code</label>
            <input
              type="text"
              value={bankDetails.ifscCode}
              onChange={(e) => handleFieldChange('ifscCode', e.target.value.toUpperCase())}
              placeholder="Enter IFSC code"
              className="w-full px-4 py-3 bg-white rounded-xl border border-gray-200 focus:outline-none focus:ring-2 uppercase"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Branch Name</label>
            <input
              type="text"
              value={bankDetails.branchName}
              onChange={(e) => handleFieldChange('branchName', e.target.value)}
              placeholder="Enter branch name"
              className="w-full px-4 py-3 bg-white rounded-xl border border-gray-200 focus:outline-none focus:ring-2"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">UPI ID</label>
            <input
              type="text"
              value={bankDetails.upiId}
              onChange={(e) => handleFieldChange('upiId', e.target.value)}
              placeholder="Enter UPI ID"
              className="w-full px-4 py-3 bg-white rounded-xl border border-gray-200 focus:outline-none focus:ring-2"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
              <FiHash className="w-4 h-4" />
              Payment QR Code
            </label>

            <div
              className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center transition-colors hover:border-blue-300 bg-gray-50 cursor-pointer"
              onClick={() => document.getElementById('worker-bank-qr-upload')?.click()}
            >
              <input
                id="worker-bank-qr-upload"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleQrChange}
              />
              {qrFile ? (
                <div className="flex items-center justify-center gap-2 text-green-600 font-medium">
                  <FiUpload className="w-5 h-5" />
                  <span className="truncate max-w-[220px]">{qrFile.name}</span>
                </div>
              ) : bankDetails.qrCodeImage ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-40 h-40 rounded-xl overflow-hidden border border-gray-200 bg-white">
                    <img
                      src={bankDetails.qrCodeImage}
                      alt="Worker QR"
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <span className="text-xs text-blue-500 underline">Click to replace QR code</span>
                </div>
              ) : (
                <>
                  <FiUpload className="w-8 h-8 text-gray-400 mb-2 mx-auto" />
                  <span className="text-sm text-gray-500 font-medium">Upload payment QR code</span>
                  <p className="text-xs text-gray-400 mt-1">PNG/JPG, max 5MB</p>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="mt-8 flex gap-3">
          <button
            onClick={() => navigate(redirectTo)}
            className="flex-1 py-4 rounded-xl font-semibold text-gray-700 bg-white border-2 border-gray-200 transition-all active:scale-95"
            style={{
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex-1 py-4 rounded-xl font-semibold text-white transition-all active:scale-95"
            style={{
              background: themeColors.button,
              boxShadow: `0 4px 12px ${themeColors.button}40`,
            }}
          >
            {uploading ? 'Saving...' : 'Save Bank Details'}
          </button>
        </div>
      </main>

      <BottomNav />
    </div>
  );
};

export default BankDetails;

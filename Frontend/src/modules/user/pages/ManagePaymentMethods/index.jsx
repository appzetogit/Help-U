import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { gsap } from 'gsap';
import { FiArrowLeft, FiCreditCard, FiChevronRight, FiX } from 'react-icons/fi';
import BottomNav from '../../components/layout/BottomNav';

const ManagePaymentMethods = () => {
  const navigate = useNavigate();
  const [showAddCardModal, setShowAddCardModal] = useState(false);
  const modalRef = useRef(null);
  const backdropRef = useRef(null);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (showAddCardModal) {
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
    } else {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
    };
  }, [showAddCardModal]);

  // Animate modal open/close
  useEffect(() => {
    if (showAddCardModal && modalRef.current && backdropRef.current) {
      // Open animation
      gsap.fromTo(backdropRef.current,
        { opacity: 0 },
        { opacity: 1, duration: 0.3, ease: 'power2.out' }
      );
      gsap.fromTo(modalRef.current,
        { y: '100%', opacity: 0 },
        { y: 0, opacity: 1, duration: 0.4, ease: 'power3.out' }
      );
    }
  }, [showAddCardModal]);
  const [cardNumber, setCardNumber] = useState('');
  const [expiryMMYY, setExpiryMMYY] = useState('');
  const [cvv, setCvv] = useState('');
  const [saveCard, setSaveCard] = useState(true);

  const handleAddCard = () => {
    setShowAddCardModal(true);
  };

  const handleCloseModal = () => {
    if (modalRef.current && backdropRef.current) {
      // Close animation
      gsap.to(backdropRef.current, {
        opacity: 0,
        duration: 0.2,
        ease: 'power2.in'
      });
      gsap.to(modalRef.current, {
        y: '100%',
        opacity: 0,
        duration: 0.3,
        ease: 'power3.in',
        onComplete: () => {
          setShowAddCardModal(false);
          // Reset form
          setCardNumber('');
          setExpiryMMYY('');
          setCvv('');
          setSaveCard(true);
        }
      });
    } else {
      setShowAddCardModal(false);
      // Reset form
      setCardNumber('');
      setExpiryMMYY('');
      setCvv('');
      setSaveCard(true);
    }
  };

  const handleSaveCard = () => {
    // Validate and save card
    if (cardNumber && expiryMMYY && cvv) {
      // Here you would typically save the card to backend/localStorage
      toast.success('Card added successfully!');
      handleCloseModal();
    } else {
      toast.error('Please fill all card details');
    }
  };

  const formatCardNumber = (value) => {
    // Remove all non-digits
    const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
    // Add space after every 4 digits
    const matches = v.match(/\d{4,16}/g);
    const match = matches && matches[0] || '';
    const parts = [];
    for (let i = 0, len = match.length; i < len; i += 4) {
      parts.push(match.substring(i, i + 4));
    }
    if (parts.length) {
      return parts.join(' ');
    } else {
      return v;
    }
  };

  const handleCardNumberChange = (e) => {
    const formatted = formatCardNumber(e.target.value);
    setCardNumber(formatted);
  };

  const handleExpiryMMYYChange = (e) => {
    let value = e.target.value.replace(/\D/g, '');
    // Format as MM/YY
    if (value.length >= 2) {
      value = value.substring(0, 2) + '/' + value.substring(2, 4);
    }
    if (value.length <= 5) {
      setExpiryMMYY(value);
    }
  };

  const handleCvvChange = (e) => {
    const value = e.target.value.replace(/\D/g, '');
    if (value.length <= 3) {
      setCvv(value);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-30">
        <div className="px-4 pt-4 pb-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <FiArrowLeft className="w-5 h-5 text-black" />
            </button>
            <h1 className="text-xl font-bold text-black">Manage payment methods</h1>
          </div>
        </div>
      </header>

      <main className="px-4 py-4">
        {/* Info Text */}
        <div className="mb-6">
          <p className="text-sm text-gray-700 leading-relaxed">
            We will debit ₹1 to verify a new payment method. This will be refunded after verification.
          </p>
        </div>

        {/* Cards Section */}
        <div>
          <h2 className="text-base font-bold text-black mb-4">Cards</h2>

          {/* Add Card Button */}
          <button
            onClick={handleAddCard}
            className="w-full bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between hover:bg-gray-50 active:scale-[0.98] transition-all"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'rgba(139, 92, 246, 0.1)' }}>
                <FiCreditCard className="w-6 h-6" style={{ color: '#8b5cf6' }} />
              </div>
              <span className="text-sm font-medium text-black">Add a card</span>
            </div>
            <FiChevronRight className="w-5 h-5 text-gray-400" />
          </button>
        </div>
      </main>

      {/* Add Card Modal */}
      {showAddCardModal && (
        <>
          {/* Backdrop */}
          <div
            ref={backdropRef}
            className="fixed inset-0 bg-black bg-opacity-50 z-50"
            onClick={handleCloseModal}
            style={{ opacity: 0 }}
          />

          {/* Modal Container with Close Button */}
          <div className="fixed bottom-0 left-0 right-0 z-50 pointer-events-none">
            {/* Close Button - Above Modal (Same as project-wide style) */}
            <div className="absolute -top-12 right-4 z-[60] pointer-events-auto">
              <button
                onClick={handleCloseModal}
                className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-lg hover:bg-gray-50 transition-colors"
              >
                <FiX className="w-6 h-6 text-gray-800" />
              </button>
            </div>

            {/* Modal - Slide up from bottom */}
            <div
              ref={modalRef}
              className="bg-white rounded-t-3xl w-full max-w-md shadow-2xl pointer-events-auto flex flex-col"
              style={{
                maxHeight: '90vh',
                transform: 'translateY(100%)',
                opacity: 0
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between p-6 border-b border-gray-200 shrink-0">
                <h2 className="text-xl font-bold text-black">Add new card</h2>
              </div>

              {/* Modal Content - Scrollable */}
              <div className="flex-1 overflow-y-auto px-6 py-4" style={{ minHeight: 0, WebkitOverflowScrolling: 'touch' }}>
                <div className="space-y-4">
                  {/* Card Number */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Card Number
                    </label>
                    <div className="relative">
                      <div className="absolute left-3 top-1/2 transform -translate-y-1/2">
                        <FiCreditCard className="w-5 h-5" style={{ color: '#8b5cf6' }} />
                      </div>
                      <input
                        type="text"
                        value={cardNumber}
                        onChange={handleCardNumberChange}
                        placeholder="Card Number"
                        maxLength={19}
                        className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      />
                    </div>
                  </div>

                  {/* Expiry and CVV */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        MM/YY
                      </label>
                      <input
                        type="text"
                        value={expiryMMYY}
                        onChange={handleExpiryMMYYChange}
                        placeholder="MM/YY"
                        maxLength={5}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        CVV
                      </label>
                      <input
                        type="text"
                        value={cvv}
                        onChange={handleCvvChange}
                        placeholder="CVV"
                        maxLength={3}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      />
                    </div>
                  </div>

                  {/* Save Card Option */}
                  <div className="space-y-2">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={saveCard}
                        onChange={(e) => setSaveCard(e.target.checked)}
                        className="w-5 h-5 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                        style={{ accentColor: '#8b5cf6' }}
                      />
                      <span className="text-sm text-gray-700">
                        Save the card details (except CVV) securely.
                      </span>
                    </label>
                    <button className="text-sm text-purple-600 hover:underline ml-8">
                      Know more
                    </button>
                  </div>
                </div>
              </div>

              {/* Modal Footer - Fixed at bottom */}
              <div className="p-6 border-t border-gray-200 shrink-0">
                <button
                  onClick={handleSaveCard}
                  className="w-full py-3 rounded-lg text-base font-semibold text-white transition-all active:scale-95"
                  style={{ backgroundColor: '#8b5cf6' }}
                  onMouseEnter={(e) => e.target.style.backgroundColor = '#7c3aed'}
                  onMouseLeave={(e) => e.target.style.backgroundColor = '#8b5cf6'}
                >
                  Save & proceed
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* BottomNav hidden on this page */}
    </div>
  );
};

export default ManagePaymentMethods;


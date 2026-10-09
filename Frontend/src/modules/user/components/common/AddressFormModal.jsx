import React, { useState, useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { FiX } from 'react-icons/fi';

const AddressFormModal = ({ isOpen, onClose, address, onSave }) => {
  const [isClosing, setIsClosing] = useState(false);
  const modalRef = useRef(null);
  const backdropRef = useRef(null);

  const [formData, setFormData] = useState({
    label: '',
    address: '',
    name: '',
    phone: ''
  });

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
      
      // Set form data if editing
      if (address) {
        setFormData({
          label: address.label || '',
          address: address.address || '',
          name: address.name || '',
          phone: address.phone || ''
        });
      } else {
        setFormData({
          label: '',
          address: '',
          name: '',
          phone: ''
        });
      }
    } else {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
      setIsClosing(false);
    }

    return () => {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
    };
  }, [isOpen, address]);

  // Animate modal open/close
  useEffect(() => {
    if (isOpen && modalRef.current && backdropRef.current) {
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
  }, [isOpen]);

  const handleClose = () => {
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
          onClose();
          setIsClosing(false);
        }
      });
    } else {
      onClose();
      setIsClosing(false);
    }
  };

  const handleSave = () => {
    if (!formData.label || !formData.address || !formData.name || !formData.phone) {
      return;
    }
    onSave(formData);
    handleClose();
  };

  if (!isOpen && !isClosing) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        ref={backdropRef}
        className="fixed inset-0 bg-black bg-opacity-50 z-50"
        onClick={handleClose}
        style={{ opacity: 0 }}
      />

      {/* Modal Container with Close Button */}
      <div className="fixed bottom-0 left-0 right-0 z-50 pointer-events-none">
        {/* Close Button - Above Modal */}
        <div className="absolute -top-12 right-4 z-[60] pointer-events-auto">
          <button
            onClick={handleClose}
            className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-lg hover:bg-gray-50 transition-colors"
          >
            <FiX className="w-6 h-6 text-gray-800" />
          </button>
        </div>

        {/* Modal - Slide up from bottom */}
        <div
          ref={modalRef}
          className="bg-white rounded-t-3xl w-full max-w-md shadow-2xl pointer-events-auto flex flex-col mx-auto"
          style={{ 
            maxHeight: '90vh',
            transform: 'translateY(100%)',
            opacity: 0
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Modal Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200 shrink-0">
            <h2 className="text-xl font-bold text-black">
              {address ? 'Edit Address' : 'Add new address'}
            </h2>
          </div>

          {/* Modal Content - Scrollable */}
          <div className="flex-1 overflow-y-auto px-6 py-4" style={{ minHeight: 0, WebkitOverflowScrolling: 'touch' }}>
            <div className="space-y-4">
              {/* Address Label */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Address Label
                </label>
                <input
                  type="text"
                  value={formData.label}
                  onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                  placeholder="Home, Office, etc."
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>

              {/* Full Address */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Full Address
                </label>
                <textarea
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="Enter complete address"
                  rows={4}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                />
              </div>

              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Name
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Enter name"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>

              {/* Phone */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Phone Number
                </label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="+91 1234567890"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>

          {/* Modal Footer - Fixed at bottom */}
          <div className="p-6 border-t border-gray-200 shrink-0">
            <button
              onClick={handleSave}
              disabled={!formData.label || !formData.address || !formData.name || !formData.phone}
              className="w-full py-3 rounded-lg text-base font-semibold text-white transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ 
                backgroundColor: formData.label && formData.address && formData.name && formData.phone ? '#8b5cf6' : '#9ca3af'
              }}
              onMouseEnter={(e) => {
                if (formData.label && formData.address && formData.name && formData.phone) {
                  e.target.style.backgroundColor = '#7c3aed';
                }
              }}
              onMouseLeave={(e) => {
                if (formData.label && formData.address && formData.name && formData.phone) {
                  e.target.style.backgroundColor = '#8b5cf6';
                }
              }}
            >
              {address ? 'Update Address' : 'Save Address'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default AddressFormModal;


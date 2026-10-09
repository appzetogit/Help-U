import React, { useState, useEffect } from 'react';
import { FiArrowLeft, FiX } from 'react-icons/fi';
import { themeColors } from '../../../../../theme';

const TimeSlotModal = ({
  isOpen,
  onClose,
  selectedDate,
  selectedTime,
  onDateSelect,
  onTimeSelect,
  onSave,
  getDates,
  getTimeSlots,
  formatDate,
  isDateSelected,
  isTimeSelected
}) => {
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
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
  }, [isOpen]);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      onClose();
      setIsClosing(false);
    }, 200);
  };

  if (!isOpen && !isClosing) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/50 z-50 transition-opacity ${isClosing ? 'opacity-0' : 'opacity-100'
          }`}
        onClick={handleClose}
      />

      {/* Modal Container */}
      <div className="fixed bottom-0 left-0 right-0 z-50">
        {/* Modal */}
        <div
          className={`bg-white rounded-t-3xl ${isClosing ? 'animate-slide-down' : 'animate-slide-up'
            }`}
          style={{
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 z-10 shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  onClick={handleClose}
                  className="p-1 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <FiArrowLeft className="w-5 h-5 text-black" />
                </button>
                <h1 className="text-xl font-bold text-black">Select Time Slot</h1>
              </div>
              <button
                onClick={handleClose}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <FiX className="w-5 h-5 text-black" />
              </button>
            </div>
          </div>

          {/* Content - Scrollable */}
          <div
            className="px-4 py-4 overflow-y-auto flex-1"
            style={{
              WebkitOverflowScrolling: 'touch',
              overscrollBehavior: 'contain'
            }}
          >
            <h2 className="text-xl font-bold text-black mb-1">When should the professional arrive?</h2>
            <p className="text-sm text-gray-600 mb-4">Service will take approx. 45 mins</p>

            {/* Date Selection */}
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide mb-4" style={{ WebkitOverflowScrolling: 'touch' }}>
              {getDates().map((date, index) => {
                const { day, date: dateNum } = formatDate(date);
                const isSelected = isDateSelected(date);
                return (
                  <button
                    key={index}
                    onClick={() => onDateSelect(date)}
                    className="shrink-0 px-4 py-3 rounded-lg border-2 transition-all"
                    style={isSelected ? {
                      backgroundColor: `${themeColors.brand.teal}1A`,
                      borderColor: themeColors.button,
                      color: themeColors.button
                    } : {
                      backgroundColor: 'white',
                      borderColor: '#e5e7eb',
                      color: '#374151'
                    }}
                  >
                    <div className="flex flex-col items-center">
                      <span className="text-xs font-medium mb-1">{day}</span>
                      <span className="text-base font-semibold">{dateNum}</span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Payment Information */}
            <div className="flex items-center gap-2 mb-4 px-2">
              <div className="w-4 h-4 rounded border flex items-center justify-center shrink-0" style={{ borderColor: '#9ca3af' }}>
                <div className="w-2 h-2 rounded" style={{ backgroundColor: '#6b7280' }}></div>
              </div>
              <p className="text-xs text-gray-600">Online payment only for selected date</p>
            </div>

            {/* Time Selection */}
            <div className="mb-4">
              <h3 className="text-base font-semibold text-black mb-3">Select start time of service</h3>
              {getTimeSlots().length === 0 ? (
                <div className="text-center py-8 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
                  <p className="text-gray-500 font-medium mb-1">No time slots available</p>
                  <p className="text-sm text-gray-400">Please select a different date</p>
                </div>
              ) : (
                <div
                  className="grid grid-cols-3 gap-2 pb-2"
                  style={{
                    maxHeight: '280px',
                    overflowY: 'auto',
                    WebkitOverflowScrolling: 'touch',
                    overscrollBehavior: 'contain'
                  }}
                >
                  {getTimeSlots().map((slot, index) => {
                    const isSelected = isTimeSelected(slot.value);
                    return (
                      <button
                        key={index}
                        onClick={() => onTimeSelect(slot.value)}
                        className="px-3 py-2.5 rounded-lg border-2 text-sm font-medium transition-all"
                        style={isSelected ? {
                          backgroundColor: `${themeColors.brand.teal}1A`,
                          borderColor: themeColors.button,
                          color: themeColors.button
                        } : {
                          backgroundColor: 'white',
                          borderColor: '#e5e7eb',
                          color: '#374151'
                        }}
                        onMouseEnter={(e) => {
                          if (!isSelected) {
                            e.target.style.backgroundColor = '#f9fafb';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isSelected) {
                            e.target.style.backgroundColor = 'white';
                          }
                        }}
                      >
                        {slot.display}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Proceed Button */}
            <button
              onClick={() => onSave(selectedDate, selectedTime)}
              disabled={!selectedDate || !selectedTime}
              className="w-full py-3.5 rounded-lg text-base font-semibold transition-colors mb-4"
              style={selectedDate && selectedTime ? {
                backgroundColor: themeColors.button,
                color: 'white'
              } : {
                backgroundColor: '#e5e7eb',
                color: '#9ca3af',
                cursor: 'not-allowed'
              }}
              onMouseEnter={(e) => {
                if (selectedDate && selectedTime) {
                  e.target.style.backgroundColor = themeColors.button;
                }
              }}
              onMouseLeave={(e) => {
                if (selectedDate && selectedTime) {
                  e.target.style.backgroundColor = themeColors.button;
                }
              }}
            >
              Proceed to checkout
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default TimeSlotModal;


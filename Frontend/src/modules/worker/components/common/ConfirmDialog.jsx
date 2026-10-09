import React from 'react';
import { FiAlertCircle, FiX, FiCheck, FiInfo } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import { workerTheme as themeColors } from '../../../../theme';

const ConfirmDialog = ({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirm Action',
  message = 'Are you sure you want to proceed?',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  type = 'warning', // warning, danger, info, success
}) => {
  const typeConfig = {
    warning: {
      icon: <FiAlertCircle className="w-8 h-8" />,
      color: '#F59E0B',
      bg: '#FEF3C7',
    },
    danger: {
      icon: <FiAlertCircle className="w-8 h-8" />,
      color: '#EF4444',
      bg: '#FEE2E2',
    },
    info: {
      icon: <FiInfo className="w-8 h-8" />,
      color: themeColors.button,
      bg: `${themeColors.button}15`,
    },
    success: {
      icon: <FiCheck className="w-8 h-8" />,
      color: '#10B981',
      bg: '#D1FAE5',
    },
  };

  const config = typeConfig[type] || typeConfig.warning;

  const handleConfirm = () => {
    if (onConfirm) onConfirm();
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          {/* Backdrop with Blur */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="bg-white rounded-[24px] shadow-2xl max-w-sm w-full p-8 relative z-10 overflow-hidden"
          >
            {/* Top Shine Effect */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-white/50 to-transparent opacity-30" />

            {/* Close Button */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 rounded-xl hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600"
            >
              <FiX className="w-5 h-5" />
            </button>

            {/* Icon Container */}
            <div
              className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6 rotate-3"
              style={{
                background: config.bg,
                color: config.color,
                boxShadow: `0 8px 16px ${config.color}20`
              }}
            >
              {config.icon}
            </div>

            {/* Content */}
            <div className="text-center mb-8">
              <h3 className="text-2xl font-bold text-gray-900 mb-3">{title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed font-medium">
                {message}
              </p>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-3">
              <button
                onClick={handleConfirm}
                className="w-full py-4 rounded-2xl font-bold text-white shadow-lg transition-all active:scale-[0.98]"
                style={{
                  background: type === 'danger' ? 'linear-gradient(135deg, #EF4444, #DC2626)' : `linear-gradient(135deg, ${themeColors.button}, ${themeColors.button}dd)`,
                  boxShadow: `0 10px 20px ${type === 'danger' ? '#EF444430' : themeColors.button + '30'}`
                }}
              >
                {confirmLabel}
              </button>

              <button
                onClick={onClose}
                className="w-full py-4 rounded-2xl font-bold text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-all active:scale-[0.98]"
              >
                {cancelLabel}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default ConfirmDialog;


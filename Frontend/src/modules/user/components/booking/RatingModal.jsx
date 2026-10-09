import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiStar, FiX, FiCheck, FiMessageSquare, FiArrowRight } from 'react-icons/fi';
import { themeColors } from '../../../../theme';

const RatingModal = ({ isOpen, onClose, onSubmit, bookingName, providerName }) => {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [review, setReview] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (rating === 0) return;
    setIsSubmitting(true);
    try {
      await onSubmit({ rating, review });
    } catch (error) {
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        />

        {/* Modal */}
        <motion.div
          initial={{ y: "100%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "100%", opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="relative w-full max-w-lg bg-white rounded-t-[32px] sm:rounded-3xl shadow-2xl overflow-hidden"
        >
          {/* Top Bar (Mobile Drag Handle) */}
          <div className="flex justify-center py-3 sm:hidden">
            <div className="w-12 h-1.5 bg-gray-200 rounded-full" />
          </div>

          <div className="p-6 sm:p-8">
            {/* Header */}
            <div className="flex justify-between items-start mb-6">
              <div>
                <h2 className="text-2xl font-black text-gray-900 leading-tight">Rate your experience</h2>
                <p className="text-gray-500 text-sm mt-1">How was the {bookingName} service?</p>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                disabled={isSubmitting}
              >
                <FiX className="w-6 h-6 text-gray-400" />
              </button>
            </div>

            {/* Content */}
            <div className="space-y-8">
              {/* Stars Card */}
              <div className="bg-gray-50 rounded-2xl p-6 text-center border border-gray-100 shadow-inner">
                <p className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4">Tap to rate</p>
                <div className="flex justify-center gap-3">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <motion.button
                      key={star}
                      whileHover={{ scale: 1.15 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setRating(star)}
                      onMouseEnter={() => setHover(star)}
                      onMouseLeave={() => setHover(0)}
                      className="focus:outline-none"
                    >
                      <FiStar
                        className={`w-10 h-10 transition-colors duration-200 ${star <= (hover || rating)
                            ? 'fill-yellow-400 text-yellow-400'
                            : 'text-gray-300'
                          }`}
                      />
                    </motion.button>
                  ))}
                </div>
                {rating > 0 && (
                  <motion.p
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-4 text-sm font-bold text-gray-700"
                  >
                    {rating === 5 ? 'Excellent! 🌟' :
                      rating === 4 ? 'Good! 👍' :
                        rating === 3 ? 'Average OK' :
                          rating === 2 ? 'Disappointed' : 'Needs Improvement'}
                  </motion.p>
                )}
              </div>

              {/* Review Textarea */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-gray-700 font-bold">
                  <FiMessageSquare className="w-5 h-5 text-teal-600" />
                  <span>Share your feedback</span>
                </div>
                <div className="relative group">
                  <textarea
                    value={review}
                    onChange={(e) => setReview(e.target.value)}
                    placeholder="Tell us what you liked or what could be better..."
                    className="w-full bg-white border-2 border-gray-100 focus:border-teal-500 rounded-2xl p-4 text-sm min-h-[120px] transition-all outline-none resize-none placeholder:text-gray-400"
                    disabled={isSubmitting}
                  />
                  <div className="absolute bottom-3 right-3 text-[10px] font-bold text-gray-300 uppercase letter-spacing-1">
                    {review.length} characters
                  </div>
                </div>
              </div>

              {/* Submit Button */}
              <button
                onClick={handleSubmit}
                disabled={rating === 0 || isSubmitting}
                className={`w-full py-4 rounded-2xl font-black text-white text-lg flex items-center justify-center gap-2 transition-all shadow-xl active:scale-95 disabled:opacity-50 disabled:grayscale disabled:scale-100`}
                style={{ background: rating > 0 ? themeColors.brand.gradient : '#CBD5E1' }}
              >
                {isSubmitting ? (
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Submitting...</span>
                  </div>
                ) : (
                  <>
                    <span>Submit Review</span>
                    <FiArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Decorative Background */}
          <div className="absolute -bottom-12 -right-12 w-32 h-32 bg-teal-50 rounded-full blur-2xl opacity-50 pointer-events-none" />
          <div className="absolute -top-12 -left-12 w-32 h-32 bg-yellow-50 rounded-full blur-2xl opacity-50 pointer-events-none" />
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default RatingModal;

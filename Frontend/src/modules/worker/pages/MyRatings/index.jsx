import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiStar, FiArrowLeft, FiUser, FiCalendar, FiMessageSquare, FiFilter, FiLoader } from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import { workerTheme as themeColors } from '../../../../theme';
import { getRatings } from '../../services/bookingService';
import Header from '../../components/layout/Header';

const MyRatings = () => {
  const navigate = useNavigate();
  const [ratings, setRatings] = useState([]);
  const [stats, setStats] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0 });

  const fetchRatings = async (page = 1) => {
    try {
      setIsLoading(true);
      const response = await getRatings({ page, limit: 10 });
      if (response.success) {
        setRatings(response.data);
        setStats(response.stats);
        setPagination(response.pagination);
      } else {
        toast.error(response.message || 'Failed to fetch ratings');
      }
    } catch (error) {
      console.error('Error fetching ratings:', error);
      toast.error('Failed to load ratings');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRatings();
  }, []);

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const RatingBar = ({ star, count, total }) => {
    const percentage = total > 0 ? (count / total) * 100 : 0;
    return (
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1 w-8">
          <span className="text-xs font-bold text-gray-600">{star}</span>
          <FiStar className="w-3 h-3 text-yellow-400 fill-yellow-400" />
        </div>
        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-yellow-400 rounded-full transition-all duration-500"
            style={{ width: `${percentage}%` }}
          />
        </div>
        <span className="text-xs font-medium text-gray-400 w-8 text-right">{count}</span>
      </div>
    );
  };

  if (isLoading && pagination.page === 1) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <FiLoader className="w-10 h-10 text-teal-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-500 font-medium">Loading your ratings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <Header title="My Ratings" />

      <main className="px-4 py-6 space-y-6">
        {/* Overall Rating Stats */}
        {stats && (
          <div className="bg-white rounded-[32px] p-6 shadow-xl shadow-gray-200/50 border border-white">
            <div className="grid grid-cols-5 gap-6">
              <div className="col-span-2 flex flex-col items-center justify-center border-r border-gray-100">
                <h2 className="text-5xl font-black text-gray-900 mb-2">
                  {stats.averageRating?.toFixed(1) || '0.0'}
                </h2>
                <div className="flex gap-1 mb-2">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <FiStar
                      key={s}
                      className={`w-4 h-4 ${s <= Math.round(stats.averageRating) ? 'text-yellow-400 fill-yellow-400' : 'text-gray-200'}`}
                    />
                  ))}
                </div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                  {stats.totalReviews} Reviews
                </p>
              </div>
              <div className="col-span-3 space-y-2 py-2">
                <RatingBar star={5} count={stats.star5} total={stats.totalReviews} />
                <RatingBar star={4} count={stats.star4} total={stats.totalReviews} />
                <RatingBar star={3} count={stats.star3} total={stats.totalReviews} />
                <RatingBar star={2} count={stats.star2} total={stats.totalReviews} />
                <RatingBar star={1} count={stats.star1} total={stats.totalReviews} />
              </div>
            </div>
          </div>
        )}

        {/* Reviews List */}
        <div className="space-y-4">
          <div className="flex items-center justify-between px-2">
            <h3 className="text-lg font-black text-gray-900">Recent Feedback</h3>
            <button className="p-2 bg-white rounded-xl shadow-sm border border-gray-100">
              <FiFilter className="w-4 h-4 text-gray-600" />
            </button>
          </div>

          {ratings.length > 0 ? (
            ratings.map((rating, idx) => (
              <div key={idx} className="bg-white rounded-3xl p-5 shadow-sm border border-gray-50 space-y-4">
                <div className="flex justify-between items-start">
                  <div className="flex gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-teal-50 flex items-center justify-center overflow-hidden border border-teal-100/50">
                      {rating.userId?.profilePhoto ? (
                        <img src={rating.userId.profilePhoto} alt={rating.userId.name} className="w-full h-full object-cover" />
                      ) : (
                        <FiUser className="w-6 h-6 text-teal-400" />
                      )}
                    </div>
                    <div>
                      <h4 className="font-black text-gray-900">{rating.userId?.name || 'Customer'}</h4>
                      <div className="flex items-center gap-2 mt-0.5">
                        <div className="flex">
                          {[1, 2, 3, 4, 5].map((s) => (
                            <FiStar
                              key={s}
                              className={`w-3 h-3 ${s <= rating.rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-200'}`}
                            />
                          ))}
                        </div>
                        <span className="text-[10px] font-bold text-gray-400 uppercase">{formatDate(rating.reviewedAt)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="bg-gray-50 px-3 py-1 rounded-full border border-gray-100">
                    <span className="text-[10px] font-black text-gray-500 uppercase">{rating.serviceId?.title || rating.serviceName}</span>
                  </div>
                </div>

                {rating.review && (
                  <p className="text-gray-600 text-sm leading-relaxed font-medium pl-2 border-l-4 border-teal-500/20">
                    "{rating.review}"
                  </p>
                )}

                {rating.reviewImages && rating.reviewImages.length > 0 && (
                  <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                    {rating.reviewImages.map((img, i) => (
                      <img key={i} src={img} className="w-20 h-20 rounded-2xl object-cover shrink-0 border border-gray-100" alt="Review" />
                    ))}
                  </div>
                )}

              </div>
            ))
          ) : (
            <div className="text-center py-20 bg-white rounded-[32px] border border-dashed border-gray-200">
              <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <FiMessageSquare className="w-8 h-8 text-gray-200" />
              </div>
              <p className="text-gray-400 font-bold uppercase tracking-widest text-xs">No ratings yet</p>
            </div>
          )}

          {/* Load More */}
          {pagination.total > ratings.length && (
            <button
              onClick={() => fetchRatings(pagination.page + 1)}
              className="w-full py-4 bg-white rounded-2xl border-2 border-gray-100 text-gray-600 font-black flex items-center justify-center gap-2 hover:bg-gray-50 transition-colors"
            >
              {isLoading ? <FiLoader className="animate-spin" /> : 'Load More Reviews'}
            </button>
          )}
        </div>
      </main>
    </div>
  );
};

export default MyRatings;

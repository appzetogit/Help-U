import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { FiX, FiChevronLeft, FiChevronRight, FiImage, FiPlay } from 'react-icons/fi';
import ModalLock from '../common/ModalLock';

const toAssetUrl = (url) => {
  if (!url) return '';
  if (typeof url !== 'string') return '';
  if (url.startsWith('blob:') || url.startsWith('data:')) return url;
  const clean = url.replace('/api/upload', '/upload');
  if (clean.startsWith('http://') || clean.startsWith('https://')) return clean;
  const base = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').replace(/\/api$/, '');
  return `${base}${clean.startsWith('/') ? '' : '/'}${clean}`;
};

const getVideoPoster = (url) => {
  if (!url || typeof url !== 'string') return undefined;
  if (url.includes('res.cloudinary.com')) {
    return url.replace(/\.[a-zA-Z0-9]+$/, '.jpg');
  }
  return undefined;
};

/**
 * Photos and videos the customer attached to show the problem.
 * Thumbnails in a row; tapping one opens a full-screen viewer (videos play
 * inline with controls). Renders nothing when there is no media.
 */
const IssueMediaGallery = ({ photos = [], videos = [], title = 'Problem photos & videos', size = 'md', className = '' }) => {
  const [activeIndex, setActiveIndex] = useState(null);

  const normalizeMediaItem = (item, type) => {
    if (!item) return null;
    const rawUrl = typeof item === 'string' ? item : (item.url || item.preview || '');
    if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.trim()) return null;
    return { url: toAssetUrl(rawUrl.trim()), type };
  };

  const items = [
    ...(Array.isArray(videos) ? videos.map((v) => normalizeMediaItem(v, 'video')).filter(Boolean) : []),
    ...(Array.isArray(photos) ? photos.map((p) => normalizeMediaItem(p, 'image')).filter(Boolean) : [])
  ];
  if (items.length === 0) return null;

  const thumbSize = size === 'sm' ? 'w-12 h-12' : 'w-16 h-16';

  const open = (e, index) => {
    // Cards containing the gallery are often clickable themselves.
    e.stopPropagation();
    setActiveIndex(index);
  };

  const step = (e, delta) => {
    e.stopPropagation();
    setActiveIndex((i) => (i + delta + items.length) % items.length);
  };

  const active = activeIndex !== null ? items[activeIndex] : null;

  return (
    <div className={className} onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-1.5 mb-1.5">
        <FiImage className="w-3.5 h-3.5 text-gray-400" />
        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
          {title} ({items.length})
        </span>
      </div>

      <div className="flex gap-2 overflow-x-auto scrollbar-hide">
        {items.map((item, index) => (
          <button
            key={item.url}
            type="button"
            onClick={(e) => open(e, index)}
            aria-label={item.type === 'video' ? `Play video ${index + 1}` : `View photo ${index + 1}`}
            className={`${thumbSize} relative shrink-0 rounded-lg overflow-hidden border border-gray-200 bg-gray-900 active:scale-95 transition-transform`}
          >
            {item.type === 'video' ? (
              <>
                <video
                  src={`${item.url}#t=0.5`}
                  poster={getVideoPoster(item.url)}
                  className="w-full h-full object-cover opacity-80"
                  muted
                  preload="metadata"
                  playsInline
                />
                <span className="absolute inset-0 flex items-center justify-center">
                  <span className="w-6 h-6 rounded-full bg-white/90 flex items-center justify-center">
                    <FiPlay className="w-3 h-3 text-gray-900 ml-0.5" />
                  </span>
                </span>
              </>
            ) : (
              <img src={item.url} alt={`Problem ${index + 1}`} className="w-full h-full object-cover bg-gray-100" loading="lazy" />
            )}
          </button>
        ))}
      </div>

      {active && createPortal(
        <div className="fixed inset-0 z-[10000] bg-black/95 flex items-center justify-center" onClick={() => setActiveIndex(null)}>
          <ModalLock />
          <button
            type="button"
            onClick={() => setActiveIndex(null)}
            aria-label="Close"
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white z-10"
          >
            <FiX className="w-6 h-6" />
          </button>

          {items.length > 1 && (
            <>
              <button type="button" onClick={(e) => step(e, -1)} aria-label="Previous"
                className="absolute left-2 p-2 rounded-full bg-white/10 text-white z-10">
                <FiChevronLeft className="w-6 h-6" />
              </button>
              <button type="button" onClick={(e) => step(e, 1)} aria-label="Next"
                className="absolute right-2 p-2 rounded-full bg-white/10 text-white z-10">
                <FiChevronRight className="w-6 h-6" />
              </button>
            </>
          )}

          {active.type === 'video' ? (
            <video
              key={active.url}
              src={active.url}
              poster={getVideoPoster(active.url)}
              controls
              autoPlay
              playsInline
              className="max-w-[92vw] max-h-[80vh] rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <img
              src={active.url}
              alt="Problem"
              className="max-w-[90vw] max-h-[80vh] object-contain rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
          )}

          <span className="absolute bottom-6 text-white/80 text-sm font-medium">
            {activeIndex + 1} / {items.length}
          </span>
        </div>,
        document.body
      )}
    </div>
  );
};

export default IssueMediaGallery;

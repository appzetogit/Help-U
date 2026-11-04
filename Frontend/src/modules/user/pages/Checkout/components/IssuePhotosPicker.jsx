import React, { useRef, useState } from 'react';
import { FiCamera, FiX, FiAlertCircle, FiVideo, FiImage } from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import { bookingService } from '../../../../../services/bookingService';
import bookingFeaturesService from '../../../../../services/bookingFeaturesService';
import { compressImage, fileToBase64 } from '../../../../../utils/imageCompression';
import flutterBridge from '../../../../../utils/flutterBridge';
import ModalLock from '../../../../../components/common/ModalLock';

const newId = () => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const toAssetUrl = (url) => {
  if (!url) return '';
  if (url.startsWith('blob:') || url.startsWith('data:')) return url;
  const clean = url.replace('/api/upload', '/upload');
  if (clean.startsWith('http://') || clean.startsWith('https://')) return clean;
  const base = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').replace(/\/api$/, '');
  return `${base}${clean.startsWith('/') ? '' : '/'}${clean}`;
};

// Reads a video's length in the browser so an over-long clip is refused
// before it is uploaded. Resolves null when the browser cannot tell.
const readVideoDuration = (file) => new Promise((resolve) => {
  try {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(video.duration) ? video.duration : null);
    };
    video.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    video.src = url;
  } catch {
    resolve(null);
  }
});

/**
 * Optional photos and short videos of the problem, attached at checkout so
 * the worker can see the job before accepting. Each file is uploaded as soon
 * as it is picked; the parent sends the finished URLs with the booking.
 * Limits come from the admin's booking configuration.
 *
 * photos / videos: [{ id, preview, url, status: 'uploading' | 'done' | 'error', progress? }]
 */
const IssuePhotosPicker = ({ photos, setPhotos, videos = [], setVideos, config = {} }) => {
  const inputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const videoInputRef = useRef(null);
  const [showPhotoMenu, setShowPhotoMenu] = useState(false);

  const maxPhotos = config.maxIssuePhotos ?? 5;
  const videoEnabled = !!(config.isIssueVideoEnabled && setVideos && (config.maxIssueVideos ?? 0) > 0);
  const maxVideos = videoEnabled ? config.maxIssueVideos : 0;
  const maxVideoMB = config.maxIssueVideoSizeMB ?? 25;
  const maxVideoSec = config.maxIssueVideoDurationSec ?? 60;

  if (maxPhotos <= 0 && !videoEnabled) return null;

  const updatePhoto = (id, changes) => setPhotos((prev) => prev.map((p) => (p.id === id ? { ...p, ...changes } : p)));
  const updateVideo = (id, changes) => setVideos((prev) => prev.map((v) => (v.id === id ? { ...v, ...changes } : v)));

  const uploadPhoto = async (id, file) => {
    try {
      // Phone photos are several MB; resize before sending.
      const compressed = await compressImage(file, { maxWidth: 1280, maxHeight: 1280, quality: 0.8, mimeType: 'image/jpeg' });
      const dataUrl = await fileToBase64(compressed);
      const res = await bookingService.uploadIssuePhoto(dataUrl);
      if (!res?.success || !res.url) throw new Error(res?.message || 'Upload failed');
      updatePhoto(id, { url: res.url, status: 'done' });
    } catch (error) {
      console.error('Issue photo upload failed:', error);
      updatePhoto(id, { status: 'error' });
      toast.error(error?.response?.data?.message || 'Photo upload failed. Tap it to remove and try again.');
    }
  };

  const uploadVideo = async (id, file) => {
    try {
      const res = await bookingFeaturesService.uploadIssueVideo(file, (progress) => updateVideo(id, { progress }));
      if (!res?.success || !res.url) throw new Error(res?.message || 'Upload failed');
      updateVideo(id, { url: res.url, status: 'done' });
    } catch (error) {
      console.error('Issue video upload failed:', error);
      updateVideo(id, { status: 'error' });
      toast.error(error?.response?.data?.message || 'Video upload failed. Remove it and try again.');
    }
  };

  const addFiles = (files) => {
    const images = files.filter((f) => f && f.type?.startsWith('image/'));
    if (images.length === 0) return;

    const room = maxPhotos - photos.length;
    if (images.length > room) toast.error(`You can add up to ${maxPhotos} photos`);

    const accepted = images.slice(0, Math.max(0, room));
    const entries = accepted.map((file) => ({ id: newId(), preview: URL.createObjectURL(file), url: null, status: 'uploading' }));
    setPhotos((prev) => [...prev, ...entries]);
    entries.forEach((entry, i) => uploadPhoto(entry.id, accepted[i]));
  };

  const addVideo = async (file) => {
    if (!file || !file.type?.startsWith('video/')) return;
    if (videos.length >= maxVideos) {
      toast.error(`You can add up to ${maxVideos} video${maxVideos > 1 ? 's' : ''}`);
      return;
    }
    if (file.size > maxVideoMB * 1024 * 1024) {
      toast.error(`Video is too large. Maximum size is ${maxVideoMB}MB.`);
      return;
    }
    const duration = await readVideoDuration(file);
    if (duration && duration > maxVideoSec + 1) {
      toast.error(`Video is too long. Please keep it under ${maxVideoSec} seconds.`);
      return;
    }

    const entry = { id: newId(), preview: URL.createObjectURL(file), url: null, status: 'uploading', progress: 0 };
    setVideos((prev) => [...prev, entry]);
    uploadVideo(entry.id, file);
  };

  // Open the device camera (native when inside the Flutter app).
  const handleTakePhoto = async () => {
    setShowPhotoMenu(false);
    if (flutterBridge.isFlutter) {
      const file = await flutterBridge.openCamera();
      if (file) addFiles([file]);
      return;
    }
    cameraInputRef.current?.click();
  };

  // Open the gallery / file picker. In the Flutter WebView a plain file input
  // still opens the gallery, so the same path works everywhere.
  const handleChooseGallery = () => {
    setShowPhotoMenu(false);
    inputRef.current?.click();
  };

  // On web the file picker already lets the user pick from gallery, so skip the
  // menu. Inside Flutter we offer the choice between camera and gallery.
  const handleAdd = () => {
    if (flutterBridge.isFlutter) {
      setShowPhotoMenu(true);
      return;
    }
    inputRef.current?.click();
  };

  const remove = (setter) => (id) => {
    setter((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target?.preview && String(target.preview).startsWith('blob:')) {
        URL.revokeObjectURL(target.preview);
      }
      return prev.filter((p) => p.id !== id);
    });
  };

  const total = photos.length + videos.length;
  const max = maxPhotos + maxVideos;

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
      <div className="flex items-start justify-between gap-3 mb-1">
        <h3 className="text-base font-bold text-black">
          {videoEnabled ? 'Add photos or a video' : 'Add photos'} <span className="text-sm font-medium text-gray-400">(optional)</span>
        </h3>
        <span className="text-xs font-semibold text-gray-500 shrink-0 mt-0.5">{total}/{max}</span>
      </div>
      <p className="text-xs text-gray-500 mb-3">
        Show the problem so the worker knows what to expect before arriving.
        {videoEnabled && ` Videos up to ${maxVideoSec}s, ${maxVideoMB}MB.`}
      </p>

      <div className="grid grid-cols-5 gap-2">
        {videos.map((video) => (
          <div key={video.id} className="relative aspect-square rounded-lg overflow-hidden bg-gray-900 border border-gray-200">
            <video src={toAssetUrl(video.preview || video.url)} className="w-full h-full object-cover opacity-80" muted playsInline preload="metadata" />
            <FiVideo className="absolute bottom-1 left-1 w-3.5 h-3.5 text-white" />
            {video.status === 'uploading' && (
              <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center">
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span className="text-[10px] font-bold text-white mt-1">{video.progress || 0}%</span>
              </div>
            )}
            {video.status === 'error' && (
              <div className="absolute inset-0 bg-red-500/50 flex items-center justify-center">
                <FiAlertCircle className="w-5 h-5 text-white" />
              </div>
            )}
            <button type="button" onClick={() => remove(setVideos)(video.id)} aria-label="Remove video"
              className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center">
              <FiX className="w-3 h-3" />
            </button>
          </div>
        ))}

        {photos.map((photo) => (
          <div key={photo.id} className="relative aspect-square rounded-lg overflow-hidden bg-gray-100 border border-gray-200">
            <img src={toAssetUrl(photo.preview || photo.url)} alt="Problem" className="w-full h-full object-cover" />
            {photo.status === 'uploading' && (
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            {photo.status === 'error' && (
              <div className="absolute inset-0 bg-red-500/50 flex items-center justify-center">
                <FiAlertCircle className="w-5 h-5 text-white" />
              </div>
            )}
            <button type="button" onClick={() => remove(setPhotos)(photo.id)} aria-label="Remove photo"
              className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center">
              <FiX className="w-3 h-3" />
            </button>
          </div>
        ))}

        {photos.length < maxPhotos && (
          <button type="button" onClick={handleAdd}
            className="aspect-square rounded-lg border-2 border-dashed border-gray-300 text-gray-400 flex flex-col items-center justify-center active:scale-95 transition-transform">
            <FiCamera className="w-5 h-5" />
            <span className="text-[10px] font-semibold mt-0.5">Photo</span>
          </button>
        )}

        {videoEnabled && videos.length < maxVideos && (
          <button type="button" onClick={() => videoInputRef.current?.click()}
            className="aspect-square rounded-lg border-2 border-dashed border-gray-300 text-gray-400 flex flex-col items-center justify-center active:scale-95 transition-transform">
            <FiVideo className="w-5 h-5" />
            <span className="text-[10px] font-semibold mt-0.5">Video</span>
          </button>
        )}
      </div>

      <input ref={inputRef} type="file" accept="image/*" multiple className="hidden"
        onChange={(e) => { addFiles(Array.from(e.target.files || [])); e.target.value = ''; }} />
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={(e) => { addFiles(Array.from(e.target.files || [])); e.target.value = ''; }} />
      {videoEnabled && (
        <input ref={videoInputRef} type="file" accept="video/mp4,video/quicktime,video/webm,video/3gpp,video/*" className="hidden"
          onChange={(e) => { addVideo(e.target.files?.[0]); e.target.value = ''; }} />
      )}

      {showPhotoMenu && (
        <div className="fixed inset-0 z-[10050] flex items-end justify-center" onClick={() => setShowPhotoMenu(false)}>
          <ModalLock />
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative w-full max-w-lg bg-white rounded-t-2xl p-2 pb-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="pt-2 pb-3 flex justify-center">
              <div className="w-10 h-1 rounded-full bg-gray-300" />
            </div>
            <button type="button" onClick={handleTakePhoto}
              className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl hover:bg-gray-50 active:bg-gray-100 transition-colors">
              <FiCamera className="w-5 h-5 text-gray-700" />
              <span className="text-[15px] font-semibold text-gray-800">Take Photo</span>
            </button>
            <button type="button" onClick={handleChooseGallery}
              className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl hover:bg-gray-50 active:bg-gray-100 transition-colors">
              <FiImage className="w-5 h-5 text-gray-700" />
              <span className="text-[15px] font-semibold text-gray-800">Choose from Gallery</span>
            </button>
            <button type="button" onClick={() => setShowPhotoMenu(false)}
              className="w-full mt-1 px-4 py-3 rounded-xl text-[15px] font-semibold text-gray-500 hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default IssuePhotosPicker;

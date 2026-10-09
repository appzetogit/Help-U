import React, { useState, useRef } from 'react';
import { FiUpload, FiX, FiImage, FiCamera } from 'react-icons/fi';
import { workerTheme as themeColors } from '../../../../theme';
import flutterBridge from '../../../../utils/flutterBridge';

const ImageUploader = ({ 
  onImageSelect, 
  maxImages = 5, 
  maxSizeMB = 5,
  acceptedFormats = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
}) => {
  const [images, setImages] = useState([]);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  const handleNativeCamera = async () => {
    setError('');
    const file = await flutterBridge.openCamera();
    if (file) {
      const newImage = {
        file,
        preview: URL.createObjectURL(file), // Create object URL for the File object
        id: Date.now() + Math.random(),
      };
      const updatedImages = [...images, newImage];
      setImages(updatedImages);
      if (onImageSelect) onImageSelect(updatedImages.map(img => img.file));
      flutterBridge.hapticFeedback('success');
    }
  };

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    setError('');

    // Validate number of images
    if (images.length + files.length > maxImages) {
      setError(`Maximum ${maxImages} images allowed`);
      return;
    }

    // Validate each file
    const validFiles = [];
    files.forEach((file) => {
      // Check file type
      if (!acceptedFormats.includes(file.type)) {
        setError(`Invalid file type. Accepted: ${acceptedFormats.join(', ')}`);
        return;
      }

      // Check file size
      if (file.size > maxSizeMB * 1024 * 1024) {
        setError(`File size must be less than ${maxSizeMB}MB`);
        return;
      }

      validFiles.push(file);
    });

    // Create preview URLs
    const newImages = validFiles.map((file) => ({
      file,
      preview: URL.createObjectURL(file),
      id: Date.now() + Math.random(),
    }));

    const updatedImages = [...images, ...newImages];
    setImages(updatedImages);
    
    if (onImageSelect) {
      onImageSelect(updatedImages.map(img => img.file));
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemove = (id) => {
    const updatedImages = images.filter(img => {
      if (img.id === id) {
        URL.revokeObjectURL(img.preview);
        return false;
      }
      return true;
    });
    setImages(updatedImages);
    
    if (onImageSelect) {
      onImageSelect(updatedImages.map(img => img.file));
    }
  };

  const hexToRgba = (hex, alpha) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  return (
    <div className="w-full">
      {/* Upload Button */}
      {images.length < maxImages && (
        <div className="flex flex-col gap-3">
          {flutterBridge.isFlutter && (
            <button
              type="button"
              onClick={handleNativeCamera}
              className="w-full py-4 bg-gray-900 text-white rounded-xl flex items-center justify-center gap-2 active:scale-95 shadow-lg shadow-gray-200 transition-all font-bold"
            >
              <FiCamera className="w-5 h-5" />
              Capture from Camera
            </button>
          )}

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full py-4 border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-2 transition-all hover:bg-gray-50 bg-white"
            style={{
              borderColor: hexToRgba(themeColors.button, 0.3),
            }}
          >
            <FiUpload className="w-6 h-6" style={{ color: themeColors.button }} />
            <span className="text-sm font-semibold" style={{ color: themeColors.button }}>
              {flutterBridge.isFlutter ? 'Pick from Gallery' : `Upload Images (${images.length}/${maxImages})`}
            </span>
            <span className="text-xs text-gray-500">Max {maxSizeMB}MB per image</span>
          </button>
        </div>
      )}

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={acceptedFormats.join(',')}
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Error Message */}
      {error && (
        <p className="text-red-500 text-sm mt-2">{error}</p>
      )}

      {/* Image Previews */}
      {images.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mt-4">
          {images.map((image) => (
            <div key={image.id} className="relative group">
              <img
                src={image.preview}
                alt="Preview"
                className="w-full h-24 object-cover rounded-lg border-2 border-gray-200"
              />
              <button
                type="button"
                onClick={() => handleRemove(image.id)}
                className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <FiX className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {images.length === 0 && (
        <div className="w-full py-8 border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-2 bg-gray-50">
          <FiImage className="w-12 h-12 text-gray-400" />
          <p className="text-sm text-gray-500">No images uploaded</p>
        </div>
      )}
    </div>
  );
};

export default ImageUploader;


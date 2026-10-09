/**
 * Cloudinary Image Optimization Utility
 * Transforms Cloudinary URLs to include automatic format and quality optimization
 */

/**
 * Transform a Cloudinary URL to include optimization parameters
 * @param {string} url - Original image URL
 * @param {object} options - Transformation options
 * @returns {string} - Optimized URL
 */
export const optimizeCloudinaryUrl = (url, options = {}) => {
  if (!url || typeof url !== 'string') return url;

  // Only transform Cloudinary URLs
  if (!url.includes('cloudinary.com') && !url.includes('res.cloudinary')) {
    return url;
  }

  const {
    width,
    height,
    quality = 'auto',      // 'auto', 'auto:eco', 'auto:good', 'auto:best', or number
    format = 'auto',       // 'auto' for WebP/AVIF based on browser
    crop = 'fill',         // 'fill', 'fit', 'scale', 'limit'
    gravity = 'auto',      // 'auto', 'face', 'center'
    dpr = 'auto',          // Device pixel ratio
  } = options;

  // Build transformation string
  const transforms = [];

  // Format and quality (always include for optimization)
  transforms.push(`f_${format}`);
  transforms.push(`q_${quality}`);

  // Dimensions (only if specified)
  if (width) transforms.push(`w_${width}`);
  if (height) transforms.push(`h_${height}`);

  // Crop and gravity (only if dimensions specified)
  if (width || height) {
    transforms.push(`c_${crop}`);
    transforms.push(`g_${gravity}`);
  }

  // DPR for responsive images
  if (dpr) transforms.push(`dpr_${dpr}`);

  const transformString = transforms.join(',');

  // Insert transformations into URL
  // Cloudinary URL format: .../upload/[transformations]/...
  if (url.includes('/upload/')) {
    // Check if already has transformations
    const uploadIndex = url.indexOf('/upload/');
    const afterUpload = url.substring(uploadIndex + 8);

    // If there are already transformations (contains ,), append to them
    if (afterUpload.includes('/') && !afterUpload.startsWith('v')) {
      // Has existing transformations
      const firstSlash = afterUpload.indexOf('/');
      const existingTransforms = afterUpload.substring(0, firstSlash);
      const rest = afterUpload.substring(firstSlash);

      // Avoid duplicate transforms
      if (!existingTransforms.includes('f_') && !existingTransforms.includes('q_')) {
        return url.substring(0, uploadIndex + 8) + transformString + ',' + existingTransforms + rest;
      }
      return url; // Already optimized
    } else {
      // No existing transformations
      return url.substring(0, uploadIndex + 8) + transformString + '/' + afterUpload;
    }
  }

  return url;
};

/**
 * Get responsive image srcset for Cloudinary images
 * @param {string} url - Original image URL
 * @param {number[]} widths - Array of widths for srcset
 * @returns {string} - srcset string
 */
export const getCloudinarySrcSet = (url, widths = [320, 640, 960, 1280]) => {
  if (!url || !url.includes('cloudinary.com')) return '';

  return widths
    .map(w => `${optimizeCloudinaryUrl(url, { width: w })} ${w}w`)
    .join(', ');
};

export default optimizeCloudinaryUrl;

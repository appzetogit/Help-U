/**
 * Compresses an image file using Canvas.
 * @param {File} file - The image file to compress.
 * @param {Object} options - Compression options.
 * @param {number} options.maxWidth - Maximum width of the output image.
 * @param {number} options.maxHeight - Maximum height of the output image.
 * @param {number} options.quality - Quality of the output image (0 to 1).
 * @returns {Promise<File>} - A promise that resolves with the compressed File.
 */
export const compressImage = (file, options = { maxWidth: 1920, maxHeight: 1920, quality: 0.7 }) => {
  return new Promise((resolve, reject) => {
    const { maxWidth, maxHeight, quality } = options;
    const fileName = file.name;
    const fileType = file.type;

    // Use createObjectURL for better memory efficiency than FileReader
    const src = URL.createObjectURL(file);
    const img = new Image();
    img.src = src;

    img.onload = () => {
      // Release memory
      URL.revokeObjectURL(src);

      let width = img.width;
      let height = img.height;

      // Calculate new dimensions
      if (width > height) {
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      // Convert to blob
      canvas.toBlob(
        (blob) => {
          if (blob) {
            const compressedFile = new File([blob], fileName, {
              type: fileType,
              lastModified: Date.now(),
            });
            resolve(compressedFile);
          } else {
            reject(new Error('Canvas is empty'));
          }
        },
        fileType,
        quality
      );
    };

    img.onerror = (error) => {
      URL.revokeObjectURL(src);
      reject(error);
    };
  });
};

/**
 * Converts a File to Base64 string.
 * @param {File} file 
 * @returns {Promise<string>}
 */
export const fileToBase64 = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = (error) => reject(error);
  });
};

/**
 * Phone number utilities for Indian mobile numbers (+91)
 */

/**
 * Normalizes and extracts a 10-digit Indian phone number from user typing,
 * pasting, or browser/mobile autofill.
 *
 * Handles:
 * - Direct typing: "9", "98", "9876543210"
 * - International formats: "+91 98765 43210", "+919876543210", "919876543210"
 * - Trunk prefix: "09876543210"
 * - Formatting chars: "(987) 654-3210", "98765-43210"
 *
 * @param {string} input - Raw input string
 * @returns {string} - Clean digits (up to 10 characters)
 */
export const cleanIndianPhoneNumber = (input) => {
  if (input === null || input === undefined) return '';
  const raw = String(input).trim();
  if (!raw) return '';

  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';

  // 12 digits with leading 91 (+91 country code)
  if (digits.length >= 12 && digits.startsWith('91')) {
    return digits.slice(2, 12);
  }

  // 11 digits with leading 0 (STD / domestic prefix)
  if (digits.length >= 11 && digits.startsWith('0')) {
    return digits.slice(1, 11);
  }

  // If longer than 10 digits, prefer a valid Indian mobile number [6-9]xxxxxxxxx from the end
  if (digits.length > 10) {
    const last10 = digits.slice(-10);
    if (/^[6-9]\d{9}$/.test(last10)) {
      return last10;
    }
    return digits.slice(0, 10);
  }

  return digits;
};

/**
 * Validates whether the given string is a valid 10-digit Indian mobile number.
 * @param {string} phone
 * @returns {boolean}
 */
export const isValidIndianPhone = (phone) => {
  return /^[6-9]\d{9}$/.test(String(phone || '').trim());
};


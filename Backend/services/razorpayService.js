const Razorpay = require('razorpay');

// Initialize Razorpay with validation
let razorpay;
let isTestMode = true;

try {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    console.error('⚠️  Razorpay credentials missing in .env file');
  } else {
    razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET
    });

    // Check if we are in test or live mode
    isTestMode = process.env.RAZORPAY_KEY_ID.startsWith('rzp_test');
    console.log(`✅ Razorpay initialized in ${isTestMode ? 'TEST' : 'LIVE'} mode`);

    // MERCHANT_UPI_ID check removed as requested
  }
} catch (error) {
  console.error('❌ Failed to initialize Razorpay:', error.message);
}

/**
 * Create Razorpay order
 */
const createOrder = async (amount, currency = 'INR', receipt = null, notes = {}) => {
  try {
    if (!razorpay) {
      return {
        success: false,
        error: 'Razorpay not initialized. Please check credentials in .env file.'
      };
    }

    const normalizedAmount = Number(amount);
    if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
      return {
        success: false,
        error: `Invalid payment amount: ${amount}`
      };
    }

    const sanitizedReceipt = String(receipt || `receipt_${Date.now()}`)
      .replace(/[^a-zA-Z0-9_/-]/g, '')
      .slice(0, 40);

    const options = {
      amount: Math.round(normalizedAmount * 100), // Convert to paise
      currency,
      receipt: sanitizedReceipt,
      notes
    };

    console.log('Creating Razorpay order with options:', {
      amount: options.amount,
      currency: options.currency,
      receipt: options.receipt
    });

    const order = await razorpay.orders.create(options);

    console.log('✅ Razorpay order created successfully:', order.id);

    return {
      success: true,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      receipt: order.receipt
    };
  } catch (error) {
    console.error('❌ Razorpay create order error:', {
      message: error.message,
      description: error.description,
      code: error.code,
      statusCode: error.statusCode,
      error: error.error
    });

    return {
      success: false,
      error:
        error?.error?.description ||
        error?.description ||
        error?.error?.reason ||
        error?.message ||
        'Failed to create Razorpay order'
    };
  }
};

/**
 * Verify payment signature
 */
const verifyPayment = (razorpay_order_id, razorpay_payment_id, razorpay_signature) => {
  const crypto = require('crypto');
  const secret = process.env.RAZORPAY_KEY_SECRET;

  const generated_signature = crypto
    .createHmac('sha256', secret)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');

  return generated_signature === razorpay_signature;
};

/**
 * Get payment details
 */
const getPaymentDetails = async (paymentId) => {
  try {
    const payment = await razorpay.payments.fetch(paymentId);
    return {
      success: true,
      payment
    };
  } catch (error) {
    console.error('Razorpay get payment error:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Refund payment
 */
const refundPayment = async (paymentId, amount = null, notes = {}) => {
  try {
    const refundOptions = {
      payment_id: paymentId,
      notes
    };

    if (amount) {
      refundOptions.amount = Math.round(amount * 100); // Convert to paise
    }

    const refund = await razorpay.payments.refund(paymentId, refundOptions);
    return {
      success: true,
      refund
    };
  } catch (error) {
    console.error('Razorpay refund error:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Create Razorpay QR Code
 * Tries the modern standalone QR API first, then falls back to Payment Link if needed.
 */
const createQRCode = async (amount, bookingNumber, notes = {}) => {
  try {
    // Manual UPI QR block removed as requested
    
    if (!razorpay) {
      return { success: false, error: 'Razorpay not initialized' };
    }

    const axios = require('axios');
    const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64');

    const payload = {
      type: 'upi_qr',
      name: 'Service Payment',
      usage: 'single_use',
      fixed_amount: true,
      payment_amount: Math.round(amount * 100), // Convert to paise
      description: `Order Payment for ${bookingNumber}`,
      notes
    };

    console.log('[QR Service] Attempting Razorpay QR creation for Booking:', bookingNumber);

    // Razorpay SDK QR API
    try {
      const qrCode = await razorpay.qrCode.create(payload);
      console.log('✅ QR Code created via Razorpay SDK API');
      return {
        success: true,
        qrCodeId: qrCode.id,
        imageUrl: qrCode.image_url,
        qrStatus: qrCode.status
      };
    } catch (e1) {
      console.warn('⚠️ SDK QR API failed, trying REST fallbacks...', e1.description || e1.message);

      // Fallback 1: Manual API call to /v1/payments/qr_codes
      try {
        const response = await axios.post('https://api.razorpay.com/v1/payments/qr_codes', payload, {
          headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' }
        });
        const qrCode = response.data;
        return {
          success: true,
          qrCodeId: qrCode.id,
          imageUrl: qrCode.image_url,
          qrStatus: qrCode.status
        };
      } catch (e2) {
        // Fallback 2: /v1/qr_codes
        try {
          const response = await axios.post('https://api.razorpay.com/v1/qr_codes', payload, {
            headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' }
          });
          const qrCode = response.data;
          return {
            success: true,
            qrCodeId: qrCode.id,
            imageUrl: qrCode.image_url,
            qrStatus: qrCode.status
          };
        } catch (e3) {
          // Final Fallback: Payment Link
          const linkPayload = {
            amount: Math.round(amount * 100),
            currency: 'INR',
            description: `Payment for Booking #${bookingNumber}`,
            notes,
            notify: { sms: false, email: false }
          };

          const linkResponse = await axios.post('https://api.razorpay.com/v1/payment_links', linkPayload, {
            headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' }
          });

          const link = linkResponse.data;
          return {
            success: true,
            qrCodeId: link.id,
            imageUrl: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(link.short_url)}`,
            paymentUrl: link.short_url,
          };
        }
      }
    }
  } catch (error) {
    console.error('Razorpay QR/Link Error:', error.response?.data || error.message);
    const errorMsg = error.response?.data?.error?.description || error.message;
    return { success: false, error: errorMsg };
  }
};

/**
 * Get payments for a QR Code or Payment Link
 */
const getQRCodePayments = async (id) => {
  try {
    if (!razorpay) {
      return { success: false, error: 'Razorpay not initialized' };
    }

    // Manual UPI check removed as requested
    if (id && (id.startsWith('plink_'))) {
      const axios = require('axios');
      const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64');

      try {
        const response = await axios.get(`https://api.razorpay.com/v1/payment_links/${id}`, {
          headers: { 'Authorization': `Basic ${auth}` }
        });

        const link = response.data;
        console.log(`[QR Service] Checking Payment Link ${id} status: ${link.status}`);

        // If link is paid, we returned a captured payment object
        if (link.status === 'paid' || link.status === 'partially_paid') {
          return {
            success: true,
            payments: [{
              id: link.razorpay_payment_id || `pay_${Date.now()}`,
              status: 'captured',
              amount: link.amount_paid
            }]
          };
        }
        return { success: true, payments: [] };
      } catch (linkError) {
        console.error('Payment link fetch error:', linkError.response?.data || linkError.message);
        throw linkError;
      }
    }

    // Otherwise, standard QR Code check
    const payments = await razorpay.qrCode.fetchAllPayments(id);
    return {
      success: true,
      payments: payments.items || []
    };
  } catch (error) {
    console.error('Razorpay fetch payments error:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
};

module.exports = {
  createOrder,
  verifyPayment,
  getPaymentDetails,
  refundPayment,
  createQRCode,
  getQRCodePayments,
  isTestMode: () => isTestMode
};


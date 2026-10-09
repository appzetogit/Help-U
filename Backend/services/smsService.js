const axios = require('axios');

/**
 * Send SMS via SMS India Hub
 * @param {string} phone - Phone number
 * @param {string} message - Message content
 * @returns {Promise<Object>} - Response data
 */
const sendSMS = async (phone, message) => {
  try {
    // Check for Test Mode
    if (process.env.USE_DEFAULT_OTP === 'true') {
      console.log(`[SMS MOCK] To: ${phone}, Msg: ${message}`);
      return { success: true, data: 'Mock Success' };
    }

    // Check if SMS credentials are configured
    if (!process.env.SMS_INDIA_HUB_API_KEY || !process.env.SMS_INDIA_HUB_SENDER_ID) {
      console.warn('[SMS] SMS credentials missing in .env. SMS not sent.');
      console.log(`[SMS MOCK] To: ${phone}, Msg: ${message}`);
      return { success: false, message: 'SMS configuration missing' };
    }

    // Build parameters with multiple possible auth field names
    const params = {
      // Primary fields (as per docs)
      user: process.env.SMS_INDIA_HUB_USERNAME,
      password: process.env.SMS_INDIA_HUB_API_KEY,
      // Fallback fields for compatibility
      username: process.env.SMS_INDIA_HUB_USERNAME,
      apikey: process.env.SMS_INDIA_HUB_API_KEY,
      msisdn: phone,
      sid: process.env.SMS_INDIA_HUB_SENDER_ID,
      msg: message,
      fl: 0,
      gwid: 2,
    };
    // Add DLT Template ID if available
    if (process.env.SMS_INDIA_HUB_DLT_TEMPLATE_ID) {
      params.TemplateId = process.env.SMS_INDIA_HUB_DLT_TEMPLATE_ID;
    }

    // Use HTTPS for secure transmission
    const baseUrl = process.env.SMS_BASE_URL || 'https://cloud.smsindiahub.in/vendorsms/pushsms.aspx';
    console.log('[SMS] Sending request to (HTTPS):', baseUrl);
    console.log('[SMS] Params (masked):', { ...params, password: '***', apikey: '***' });

    const response = await axios.get(baseUrl, { params });

    console.log('[SMS] Response status:', response.status);
    console.log('[SMS] Response data:', response.data);

    // Check for successful response
    // SMS India Hub can return JSON object OR string
    let isSuccess = false;
    const data = response.data;

    if (typeof data === 'object' && data !== null) {
      // Handle JSON response
      if (data.ErrorCode === '000' || data.ErrorMessage === 'Done' || data.ErrorMessage === 'Success') {
        isSuccess = true;
      }
    } else {
      // Handle String response
      const responseStr = String(data || '');
      if (responseStr.startsWith('Success')) {
        isSuccess = true;
      }
    }

    if (isSuccess) {
      console.log(`[SMS] ✅ SMS sent successfully to ${phone}`);
      return { success: true, data: response.data };
    } else {
      console.error(`[SMS] ❌ SMS Provider Error:`, JSON.stringify(response.data));
      // Parse common string errors if it is a string
      if (typeof data === 'string' && data.includes('Invalid Login')) {
        console.error('[SMS] ⚠️  Authentication failed - check SMS_INDIA_HUB_USERNAME and SMS_INDIA_HUB_API_KEY');
      }
      return { success: false, error: response.data };
    }

  } catch (error) {
    console.error('[SMS] Network Error:', error.message);
    if (error.response) {
      console.error('[SMS] Error Response:', error.response.data);
    }
    return { success: false, error: error.message };
  }
};

/**
 * Send OTP specific SMS
 * @param {string} phone - Phone number
 * @param {string} otp - OTP code
 */
const sendOTP = async (phone, otp) => {
  // DLT-compliant message format (must match registered template)
  // Template: "Welcome to the ##var## powered by Appzeto.Your OTP for registration is ##var##.BGADEC"
  const appName = 'HOMECARE';
  const message = `Welcome to the ${appName} powered by Appzeto.Your OTP for registration is ${otp}.BGADEC`;

  console.log(`[SMS] Attempting to send OTP to ${phone}`);
  console.log(`[SMS] Message: ${message}`);

  const result = await sendSMS(phone, message);

  if (!result.success) {
    console.error(`[SMS] Failed to send OTP to ${phone}:`, result.error);
  }

  return result;
};

module.exports = {
  sendSMS,
  sendOTP
};


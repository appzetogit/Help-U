const mongoose = require('mongoose');
const { mirrorBaseAddress } = require('./workerAddressController');
const Worker = require('../../models/Worker');
const { validationResult } = require('express-validator');
const cloudinaryService = require('../../services/cloudinaryService');

/**
 * Get worker profile
 */
const getProfile = async (req, res) => {
  try {
    const vendorId = req.user.id;

    const worker = await Worker.findById(vendorId).select('-password -__v');
    if (!worker) {
      return res.status(404).json({ success: false, message: 'Worker not found' });
    }

    // Use stored rating if available (and > 0), otherwise calculate
    let rating = worker.rating || 0;

    const Booking = require('../../models/Booking');

    if (rating === 0) {
      const [ratingData] = await Booking.aggregate([
        { $match: { vendorId: new mongoose.Types.ObjectId(vendorId), rating: { $ne: null } } },
        { $group: { _id: null, avgRating: { $avg: '$rating' } } }
      ]);
      rating = ratingData ? ratingData.avgRating : 0;
    }

    const totalJobs = await Booking.countDocuments({ vendorId });
    const completedJobs = await Booking.countDocuments({ vendorId, status: 'completed' });
    const completionRate = totalJobs > 0 ? (completedJobs / totalJobs) * 100 : 0;

    res.status(200).json({
      success: true,
      worker: {
        id: worker._id,
        name: worker.name,
        businessName: worker.businessName || null,
        email: worker.email,
        phone: worker.phone,
        alternatePhone: worker.alternatePhone || '',
        service: worker.service,
        skills: worker.skills || [],
        address: worker.address || null,
        location: worker.location || null,
        geoLocation: worker.geoLocation || null,
        rating: rating > 0 ? parseFloat(rating.toFixed(1)) : 0,
        totalJobs,
        completionRate,
        approvalStatus: worker.approvalStatus,
        isPhoneVerified: worker.isPhoneVerified || false,
        isEmailVerified: worker.isEmailVerified || false,
        isOnline: worker.isOnline || false,
        profilePhoto: worker.profilePhoto || null,
        bankDetails: worker.bankDetails || {},
        aadharDocument: worker.aadhar?.document || null,
        aadharBackDocument: worker.aadhar?.backDocument || null,
        panDocument: worker.pan?.document || null,
        aadharNumber: worker.aadhar?.number || null,
        panNumber: worker.pan?.number || null,
        otherDocuments: worker.otherDocuments || [],
        customFields: worker.customFields || {},
        customDocuments: worker.customDocuments || [],
        createdAt: worker.createdAt,
        updatedAt: worker.updatedAt
      }
    });
  } catch (error) {
    console.error('Get worker profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch profile. Please try again.'
    });
  }
};

/**
 * Update worker profile
 */
const updateProfile = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const vendorId = req.user.id;
    const { 
      name, 
      businessName, 
      address, 
      profilePhoto, 
      serviceCategory, 
      skills, 
      aadharNumber, 
      aadharDocument, 
      aadharBackDocument,
      panNumber, 
      panDocument, 
      otherDocuments,
      alternatePhone,
      serviceRange, 
      bankDetails 
    } = req.body;

    console.log('Update Worker Profile Body:', JSON.stringify(req.body, null, 2));

    const worker = await Worker.findById(vendorId);

    if (!worker) {
      return res.status(404).json({
        success: false,
        message: 'Worker not found'
      });
    }

    // Update fields
    if (name) worker.name = name.trim();
    if (businessName !== undefined) worker.businessName = businessName ? businessName.trim() : null;
    if (req.body.isScrapOpted !== undefined) {
      worker.isScrapOpted = req.body.isScrapOpted === true || req.body.isScrapOpted === 'true';
    }
    if (alternatePhone !== undefined) {
      worker.alternatePhone = alternatePhone ? alternatePhone.trim() : '';
    }
    if (address) {
      if (typeof address === 'string') {
        // If address is coming as string from simple form
        worker.address = {
          ...worker.address,
          fullAddress: address
        };
      } else {
        // Address is an object from advanced picker
        worker.address = {
          fullAddress: address.fullAddress || worker.address?.fullAddress || '',
          addressLine1: address.addressLine1 || worker.address?.addressLine1 || '',
          addressLine2: address.addressLine2 || worker.address?.addressLine2 || '',
          city: address.city || worker.address?.city || '',
          state: address.state || worker.address?.state || '',
          pincode: address.pincode || worker.address?.pincode || '',
          landmark: address.landmark || worker.address?.landmark || '',
          lat: address.lat !== undefined ? address.lat : worker.address?.lat,
          lng: address.lng !== undefined ? address.lng : worker.address?.lng
        };

        mirrorBaseAddress(worker);

        // Sync GeoJSON geoLocation and real-time location
        if (worker.address.lat && worker.address.lng) {
          worker.location = {
            lat: worker.address.lat,
            lng: worker.address.lng,
            updatedAt: new Date()
          };
          worker.geoLocation = {
            type: 'Point',
            coordinates: [worker.address.lng, worker.address.lat] // [lng, lat]
          };
        }
      }
    }

    // Update profile photo - upload to Cloudinary if it's a base64 string
    if (profilePhoto !== undefined) {
      if (profilePhoto && profilePhoto.startsWith('data:')) {
        const uploadRes = await cloudinaryService.uploadFile(profilePhoto, { folder: 'vendors/profiles' });
        if (uploadRes.success) {
          worker.profilePhoto = uploadRes.url;
        }
      } else {
        worker.profilePhoto = profilePhoto;
      }
    }

    // Handle multiple service categories
    if (serviceCategory !== undefined) {
      if (Array.isArray(serviceCategory)) {
        worker.service = serviceCategory;
        worker.categories = serviceCategory; // Sync categories field too
      } else if (typeof serviceCategory === 'string') {
        // If string, likely single value or comma separated
        worker.service = [serviceCategory];
        worker.categories = [serviceCategory];
      }
    }

    // Handle service range
    // Optional service radius from the partner's home address. Only while the admin has the feature switched
    // on; otherwise whatever the app sent is ignored. Empty clears it (the platform radius applies).
    if (serviceRange !== undefined) {
      const { getBookingConfig } = require('../../utils/bookingConfig');
      const { validateServiceRadius } = require('../../utils/serviceArea');
      const decision = validateServiceRadius(serviceRange, await getBookingConfig());
      if (decision.action === 'error') {
        return res.status(400).json({ success: false, message: decision.message });
      }
      if (decision.action === 'set' || decision.action === 'clear') {
        if (!worker.settings) worker.settings = {};
        worker.settings.serviceRange = decision.action === 'set' ? decision.value : null;
      }
    }

    // Handle skills
    if (skills !== undefined) {
      worker.skills = Array.isArray(skills) ? skills : [];
    }

    if (bankDetails && typeof bankDetails === 'object') {
      const existingBankDetails = worker.bankDetails?.toObject ? worker.bankDetails.toObject() : (worker.bankDetails || {});
      worker.bankDetails = {
        ...existingBankDetails,
        accountHolderName: bankDetails.accountHolderName !== undefined ? String(bankDetails.accountHolderName || '').trim() : (existingBankDetails.accountHolderName || ''),
        bankName: bankDetails.bankName !== undefined ? String(bankDetails.bankName || '').trim() : (existingBankDetails.bankName || ''),
        accountNumber: bankDetails.accountNumber !== undefined ? String(bankDetails.accountNumber || '').trim() : (existingBankDetails.accountNumber || ''),
        ifscCode: bankDetails.ifscCode !== undefined ? String(bankDetails.ifscCode || '').trim().toUpperCase() : (existingBankDetails.ifscCode || ''),
        branchName: bankDetails.branchName !== undefined ? String(bankDetails.branchName || '').trim() : (existingBankDetails.branchName || ''),
        upiId: bankDetails.upiId !== undefined ? String(bankDetails.upiId || '').trim().toLowerCase() : (existingBankDetails.upiId || ''),
        qrCodeImage: bankDetails.qrCodeImage !== undefined ? String(bankDetails.qrCodeImage || '').trim() : (existingBankDetails.qrCodeImage || '')
      };
    }
    // If aadharDocument, aadharBackDocument or aadharNumber exists, update it
    if (aadharDocument || aadharBackDocument || aadharNumber) {
      let aadharUrl = aadharDocument || worker.aadhar?.document;
      if (aadharUrl && aadharUrl.startsWith('data:')) {
        const uploadRes = await cloudinaryService.uploadFile(aadharUrl, { folder: 'vendors/documents' });
        if (uploadRes.success) aadharUrl = uploadRes.url;
      }

      let aadharBackUrl = aadharBackDocument || worker.aadhar?.backDocument;
      if (aadharBackUrl && aadharBackUrl.startsWith('data:')) {
        const uploadRes = await cloudinaryService.uploadFile(aadharBackUrl, { folder: 'vendors/documents' });
        if (uploadRes.success) aadharBackUrl = uploadRes.url;
      }

      if (worker.aadhar) {
        if (aadharNumber) worker.aadhar.number = aadharNumber;
        if (aadharDocument) worker.aadhar.document = aadharUrl;
        if (aadharBackDocument) worker.aadhar.backDocument = aadharBackUrl;
      } else {
        worker.aadhar = {
          number: aadharNumber || '',
          document: aadharUrl || '',
          backDocument: aadharBackUrl || ''
        };
      }
    }

    // If panDocument exists and is not empty, update it
    if (panDocument || panNumber) {
      let panUrl = panDocument || worker.pan?.document;
      if (panUrl && panUrl.startsWith('data:')) {
        const uploadRes = await cloudinaryService.uploadFile(panUrl, { folder: 'vendors/documents' });
        if (uploadRes.success) panUrl = uploadRes.url;
      }

      if (worker.pan) {
        if (panNumber) worker.pan.number = panNumber;
        if (panDocument) worker.pan.document = panUrl;
      } else {
        worker.pan = {
          number: panNumber || '',
          document: panUrl || ''
        };
      }
    }

    // If otherDocuments provided
    if (otherDocuments !== undefined && Array.isArray(otherDocuments)) {
      worker.otherDocuments = otherDocuments;
    }

    await worker.save();

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      worker: {
        id: worker._id,
        name: worker.name,
        businessName: worker.businessName,
        email: worker.email,
        phone: worker.phone,
        alternatePhone: worker.alternatePhone || '',
        service: worker.service,
        address: worker.address,
        approvalStatus: worker.approvalStatus,
        isPhoneVerified: worker.isPhoneVerified,
        isEmailVerified: worker.isEmailVerified,
        profilePhoto: worker.profilePhoto,
        bankDetails: worker.bankDetails || {},
        skills: worker.skills,
        settings: worker.settings,
        aadharDocument: worker.aadhar?.document || null,
        aadharBackDocument: worker.aadhar?.backDocument || null,
        panDocument: worker.pan?.document || null,
        otherDocuments: worker.otherDocuments || []
      }
    });
  } catch (error) {
    console.error('Update worker profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update profile. Please try again.'
    });
  }
};

/**
 * Update worker address
 */
const updateAddress = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const vendorId = req.user.id;
    const { fullAddress, lat, lng } = req.body;

    if (!fullAddress || !lat || !lng) {
      return res.status(400).json({
        success: false,
        message: 'Full address and coordinates are required'
      });
    }

    const worker = await Worker.findById(vendorId);

    if (!worker) {
      return res.status(404).json({
        success: false,
        message: 'Worker not found'
      });
    }

    // Update address with coordinates
    worker.address = {
      ...worker.address,
      fullAddress: fullAddress.trim(),
      lat: parseFloat(lat),
      lng: parseFloat(lng)
    };

    // Sync GeoJSON geoLocation
    worker.geoLocation = {
      type: 'Point',
      coordinates: [parseFloat(lng), parseFloat(lat)]
    };
    mirrorBaseAddress(worker);

    await worker.save();

    res.status(200).json({
      success: true,
      message: 'Address updated successfully',
      address: worker.address
    });
  } catch (error) {
    console.error('Update worker address error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update address. Please try again.'
    });
  }
};

/**
 * Update worker real-time location
 */
const updateLocation = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { lat, lng } = req.body;

    if (lat === undefined || lng === undefined) {
      return res.status(400).json({ success: false, message: 'Latitude and Longitude are required' });
    }

    const numLat = parseFloat(lat);
    const numLng = parseFloat(lng);

    // Update real-time location, coordinates in address, and 2dsphere geoLocation
    await Worker.findByIdAndUpdate(vendorId, {
      location: { lat: numLat, lng: numLng, updatedAt: new Date() },
      'address.lat': numLat,
      'address.lng': numLng,
      geoLocation: {
        type: 'Point',
        coordinates: [numLng, numLat]
      }
    });

    res.status(200).json({ success: true, message: 'Location updated' });
  } catch (error) {
    console.error('Worker location update error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * Update worker online status
 */
const updateStatus = async (req, res) => {
  try {
    const { isOnline } = req.body;
    const vendorId = req.user.id;

    if (typeof isOnline !== 'boolean') {
      return res.status(400).json({ success: false, message: 'isOnline must be a boolean' });
    }

    const worker = await Worker.findByIdAndUpdate(
      vendorId, 
      { 
        isOnline, 
        availability: isOnline ? 'AVAILABLE' : 'OFFLINE',
        lastSeenAt: new Date()
      }, 
      { new: true }
    );

    if (!worker) {
      return res.status(404).json({ success: false, message: 'Worker not found' });
    }

    res.status(200).json({
      success: true,
      message: 'Status updated successfully',
      isOnline: worker.isOnline
    });
  } catch (error) {
    console.error('Update worker status error:', error);
    res.status(500).json({ success: false, message: 'Failed to update status' });
  }
};

module.exports = {
  getProfile,
  updateProfile,
  updateAddress,
  updateLocation,
  updateStatus
};


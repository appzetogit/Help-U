const City = require('../models/City');
const escapeRegex = require('../utils/escapeRegex');
// Called through the module object (not destructured) so tests can substitute the geocoder
const locationService = require('../services/locationService');

const validPoint = (lat, lng) =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);

/**
 * Finds a city on the map from its name and state. Never throws: no map key, no match or a network error all
 * give null, so adding a city is never blocked by it (the admin can press "Locate" later).
 */
const geocodeCity = async (city) => {
  try {
    const place = await locationService.geocodeAddress(
      [city.name, city.state, city.country || 'India'].filter(Boolean).join(', ')
    );
    return place && validPoint(place.lat, place.lng) ? { lat: place.lat, lng: place.lng, source: 'geocoded' } : null;
  } catch (_) {
    return null;
  }
};

// Helper wrapper to avoid repeating try-catch
const catchAsync = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * @desc    Get all cities
 * @route   GET /api/admin/cities
 * @access  Private (Super Admin)
 */
exports.getAllCities = catchAsync(async (req, res) => {
  const cities = await City.find({}).sort({ displayOrder: 1, createdAt: -1 });

  res.status(200).json({
    success: true,
    count: cities.length,
    cities
  });
});

/**
 * @desc    Get active cities (Public)
 * @route   GET /api/public/cities
 * @access  Public
 */
exports.getActiveCities = catchAsync(async (req, res) => {
  const cities = await City.find({ isActive: true })
    .select('name slug state location serviceRadius isDefault currency timezone')
    .sort({ displayOrder: 1, name: 1 });

  res.status(200).json({
    success: true,
    count: cities.length,
    cities
  });
});

/**
 * @desc    Get single city
 * @route   GET /api/admin/cities/:id
 * @access  Private (Super Admin)
 */
exports.getCity = catchAsync(async (req, res) => {
  const city = await City.findById(req.params.id);

  if (!city) {
    return res.status(404).json({
      success: false,
      message: 'City not found'
    });
  }

  res.status(200).json({
    success: true,
    city
  });
});

/**
 * @desc    Create new city
 * @route   POST /api/admin/cities
 * @access  Private (Super Admin)
 */
exports.createCity = catchAsync(async (req, res) => {
  const name = (req.body.name || '').trim();
  const slug = req.body.slug || name.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/(^-|-$)/g, '');

  // Check if city with this slug or case-insensitive name already exists
  let existingCity = await City.findOne({
    $or: [
      { slug },
      { name: new RegExp(`^${escapeRegex(name)}$`, 'i') }
    ]
  });

  if (existingCity) {
    if (!existingCity.isActive) {
      existingCity.isActive = true;
      await existingCity.save();
    }
    return res.status(200).json({
      success: true,
      message: `City "${existingCity.name}" is already registered and ready to use`,
      city: existingCity,
      alreadyExisted: true
    });
  }

  req.body.createdBy = req.user?.id || null;
  req.body.name = name;
  req.body.slug = slug;

  try {
    const sent = req.body.location;
    delete req.body.location; // set below, never trusted blindly
    const city = await City.create(req.body);
    if (sent && validPoint(Number(sent.lat), Number(sent.lng))) {
      city.location = { lat: Number(sent.lat), lng: Number(sent.lng), source: 'manual' };
      await city.save();
    } else {
      const found = await geocodeCity(city);
      if (found) {
        city.location = found;
        await city.save();
      }
    }
    res.status(201).json({
      success: true,
      message: 'City created successfully',
      city
    });
  } catch (err) {
    if (err.code === 11000) {
      const cityAgain = await City.findOne({ slug });
      if (cityAgain) {
        return res.status(200).json({
          success: true,
          message: `City "${cityAgain.name}" is already registered and ready to use`,
          city: cityAgain,
          alreadyExisted: true
        });
      }
      return res.status(400).json({
        success: false,
        message: `City "${name}" already exists`
      });
    }
    throw err;
  }
});

/**
 * @desc    Update city
 * @route   PUT /api/admin/cities/:id
 * @access  Private (Super Admin)
 */
exports.updateCity = catchAsync(async (req, res) => {
  let city = await City.findById(req.params.id);

  if (!city) {
    return res.status(404).json({
      success: false,
      message: 'City not found'
    });
  }

  const before = { name: city.name, state: city.state, country: city.country, hadLocation: validPoint(city.location?.lat, city.location?.lng) };
  const sent = req.body.location;
  delete req.body.location;

  city = await City.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true
  });

  if (sent && validPoint(Number(sent.lat), Number(sent.lng))) {
    city.location = { lat: Number(sent.lat), lng: Number(sent.lng), source: 'manual' };
    await city.save();
  } else if (before.name !== city.name || before.state !== city.state || before.country !== city.country || !before.hadLocation) {
    // The place changed (or was never found): look it up again
    const found = await geocodeCity(city);
    if (found) {
      city.location = found;
      await city.save();
    }
  }

  res.status(200).json({
    success: true,
    message: 'City updated successfully',
    city
  });
});

/**
 * @desc    Find the city on the map again (for cities added before positions were stored, or a wrong match)
 * @route   POST /api/admin/cities/:id/locate
 * @access  Private (cities permission)
 */
exports.locateCity = catchAsync(async (req, res) => {
  const city = await City.findById(req.params.id);
  if (!city) {
    return res.status(404).json({ success: false, message: 'City not found' });
  }

  const found = await geocodeCity(city);
  if (!found) {
    return res.status(422).json({
      success: false,
      message: `Could not find "${city.name}" on the map. Check the city and state, and that a Google Maps key is set in Settings.`,
      city
    });
  }

  city.location = found;
  await city.save();
  res.status(200).json({ success: true, message: `Located ${city.name}`, city });
});

/**
 * @desc    Delete city
 * @route   DELETE /api/admin/cities/:id
 * @access  Private (Super Admin)
 */
exports.deleteCity = catchAsync(async (req, res) => {
  const city = await City.findById(req.params.id);

  if (!city) {
    return res.status(404).json({
      success: false,
      message: 'City not found'
    });
  }

  // Prevent deleting the default city
  if (city.isDefault) {
    return res.status(400).json({
      success: false,
      message: 'Cannot delete the default city. Please set another city as default first.'
    });
  }

  await city.deleteOne();

  res.status(200).json({
    success: true,
    message: 'City deleted successfully'
  });
});

/**
 * @desc    Toggle city status
 * @route   PATCH /api/admin/cities/:id/status
 * @access  Private (Super Admin)
 */
exports.toggleCityStatus = catchAsync(async (req, res) => {
  const city = await City.findById(req.params.id);

  if (!city) {
    return res.status(404).json({
      success: false,
      message: 'City not found'
    });
  }

  // Prevent deactivating the default city
  if (city.isDefault && city.isActive) {
    return res.status(400).json({
      success: false,
      message: 'Cannot deactivate the default city.'
    });
  }

  city.isActive = !city.isActive;
  await city.save();

  res.status(200).json({
    success: true,
    message: `City ${city.isActive ? 'activated' : 'deactivated'} successfully`,
    city
  });
});

/**
 * @desc    Service availability by pincode (Public)
 * @route   GET /api/public/cities/check-pincode
 * @note    Zones / areas are no longer used: any location can be booked and
 *          worker matching alone decides who serves it (distance + radius).
 *          Kept so already-installed app versions that still call it keep working.
 */
exports.checkPincodeAvailability = catchAsync(async (req, res) => {
  const pincode = String(req.query.pincode || '').trim();

  res.status(200).json({
    success: true,
    serviceable: true,
    message: 'Services are available at this location',
    pincode
  });
});

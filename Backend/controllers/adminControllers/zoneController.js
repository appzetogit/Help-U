const Zone = require('../../models/Zone');
const Settings = require('../../models/Settings');
const { getOutOfZonePage, sanitizeOutOfZonePage } = require('../../utils/outOfZonePage');
const { getDispatchMode } = require('../../utils/dispatchMode');
const { validationResult } = require('express-validator');

const Worker = require('../../models/Worker');

const toZoneResponse = (zone) => ({
  id: zone._id,
  name: zone.name,
  cityId: zone.cityId,
  coordinates: zone.coordinates,
  allowedCategories: zone.allowedCategories || [],
  surgePricing: zone.surgePricing || { enabled: false, multiplier: 1 },
  status: zone.status,
  workerCount: zone.workerCount !== undefined ? zone.workerCount : 0,
  createdBy: zone.createdBy,
  createdAt: zone.createdAt,
  updatedAt: zone.updatedAt
});

const getAllZones = async (req, res) => {
  try {
    const { cityId, status } = req.query;
    const query = {};
    if (cityId) query.cityId = cityId;
    if (status) query.status = status;

    const zones = await Zone.find(query)
      .populate('cityId', 'name slug')
      .populate('allowedCategories', 'title slug')
      .sort({ createdAt: -1 })
      .lean();

    const zonesWithWorkerCount = await Promise.all(
      zones.map(async (zone) => {
        let workerCount = 0;
        try {
          workerCount = await Worker.countDocuments({
            $or: [
              { zoneId: zone._id },
              {
                'geoLocation.coordinates': { $ne: [0, 0] },
                geoLocation: {
                  $geoWithin: {
                    $geometry: zone.coordinates
                  }
                }
              }
            ]
          });
        } catch {
          workerCount = await Worker.countDocuments({ zoneId: zone._id });
        }
        return {
          ...zone,
          workerCount
        };
      })
    );

    res.status(200).json({
      success: true,
      count: zonesWithWorkerCount.length,
      zones: zonesWithWorkerCount.map(toZoneResponse)
    });
  } catch (error) {
    console.error('Get all zones error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch zones' });
  }
};

const getZoneById = async (req, res) => {
  try {
    const zone = await Zone.findById(req.params.id)
      .populate('cityId', 'name slug')
      .populate('allowedCategories', 'title slug')
      .lean();
    if (!zone) return res.status(404).json({ success: false, message: 'Zone not found' });
    res.status(200).json({ success: true, zone: toZoneResponse(zone) });
  } catch (error) {
    console.error('Get zone by ID error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch zone' });
  }
};

const createZone = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
    }

    const { name, cityId, coordinates, allowedCategories, surgePricing, status } = req.body;

    const zone = await Zone.create({
      name,
      cityId,
      coordinates: {
        type: 'Polygon',
        coordinates: coordinates
      },
      allowedCategories: allowedCategories || [],
      surgePricing: surgePricing || { enabled: false, multiplier: 1 },
      status: status || 'active',
      createdBy: req.user.id
    });

    const populated = await Zone.findById(zone._id)
      .populate('cityId', 'name slug')
      .populate('allowedCategories', 'title slug')
      .lean();

    res.status(201).json({
      success: true,
      message: 'Zone created successfully',
      zone: toZoneResponse(populated)
    });
  } catch (error) {
    console.error('Create zone error:', error);
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({ success: false, message: messages.join(', ') });
    }
    res.status(500).json({ success: false, message: 'Failed to create zone' });
  }
};

const updateZone = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
    }

    const zone = await Zone.findById(req.params.id);
    if (!zone) return res.status(404).json({ success: false, message: 'Zone not found' });

    const { name, cityId, coordinates, allowedCategories, surgePricing, status } = req.body;

    if (name !== undefined) zone.name = name;
    if (cityId !== undefined) zone.cityId = cityId;
    if (coordinates !== undefined) {
      zone.coordinates = { type: 'Polygon', coordinates };
    }
    if (allowedCategories !== undefined) zone.allowedCategories = allowedCategories;
    if (surgePricing !== undefined) zone.surgePricing = surgePricing;
    if (status !== undefined) zone.status = status;

    await zone.save();

    const populated = await Zone.findById(zone._id)
      .populate('cityId', 'name slug')
      .populate('allowedCategories', 'title slug')
      .lean();

    res.status(200).json({
      success: true,
      message: 'Zone updated successfully',
      zone: toZoneResponse(populated)
    });
  } catch (error) {
    console.error('Update zone error:', error);
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({ success: false, message: messages.join(', ') });
    }
    res.status(500).json({ success: false, message: 'Failed to update zone' });
  }
};

const deleteZone = async (req, res) => {
  try {
    const zone = await Zone.findById(req.params.id);
    if (!zone) return res.status(404).json({ success: false, message: 'Zone not found' });

    await Zone.findByIdAndDelete(req.params.id);

    res.status(200).json({ success: true, message: 'Zone deleted successfully' });
  } catch (error) {
    console.error('Delete zone error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete zone' });
  }
};

const findZoneByPoint = async (req, res) => {
  try {
    const rawLng = req.query.lng || req.query.lon || req.query.longitude;
    const rawLat = req.query.lat || req.query.latitude;
    const cityId = req.query.cityId || null;

    if (!rawLng || !rawLat) {
      return res.status(400).json({ success: false, message: 'lat and lng query parameters are required' });
    }

    const lng = parseFloat(rawLng);
    const lat = parseFloat(rawLat);

    if (isNaN(lng) || isNaN(lat)) {
      return res.status(400).json({ success: false, message: 'Valid numerical lat and lng are required' });
    }

    // Distance mode: zones are not used, so no address is ever "out of area" (zonesConfigured false
    // tells the apps not to block anything)
    const dispatchMode = await getDispatchMode();
    if (dispatchMode === 'distance') {
      return res.status(200).json({ success: true, zone: null, zonesConfigured: false, dispatchMode, message: 'Zones are not used (distance mode)' });
    }

    const zone = await Zone.findZoneByCoordinates(lng, lat, cityId);
    if (!zone) {
      // Tell the client whether zone gating applies at all: with no active zones defined,
      // "no zone" just means zones are not set up, not that the user is out of area.
      const zonesConfigured = Boolean(await Zone.exists({ status: 'active' }));
      // The out-of-zone page rides along so the app can show it without a second request
      const outOfZonePage = zonesConfigured ? await getOutOfZonePage() : null;
      return res.status(200).json({ success: true, zone: null, zonesConfigured, outOfZonePage, message: 'No active zone found for these coordinates' });
    }

    res.status(200).json({ success: true, zone: toZoneResponse(zone), dispatchMode });
  } catch (error) {
    console.error('Find zone by point error:', error);
    res.status(500).json({ success: false, message: 'Failed to find zone' });
  }
};

const toggleZoneStatus = async (req, res) => {
  try {
    const zone = await Zone.findById(req.params.id);
    if (!zone) return res.status(404).json({ success: false, message: 'Zone not found' });

    zone.status = zone.status === 'active' ? 'inactive' : 'active';
    await zone.save();

    res.status(200).json({
      success: true,
      message: `Zone ${zone.status === 'active' ? 'activated' : 'deactivated'} successfully`,
      zone: toZoneResponse(zone)
    });
  } catch (error) {
    console.error('Toggle zone status error:', error);
    res.status(500).json({ success: false, message: 'Failed to toggle zone status' });
  }
};

/** GET /api/public/zones/out-of-zone-page - what the customer sees outside every zone */
const getPublicOutOfZonePage = async (req, res) => {
  try {
    const [outOfZonePage, settings] = await Promise.all([
      getOutOfZonePage(),
      Settings.findOne({ type: 'global' }).select('supportPhone supportEmail supportWhatsapp').lean()
    ]);
    res.status(200).json({
      success: true,
      outOfZonePage,
      support: {
        phone: settings?.supportPhone || '',
        email: settings?.supportEmail || '',
        whatsapp: settings?.supportWhatsapp || ''
      }
    });
  } catch (error) {
    console.error('Get out-of-zone page error:', error);
    res.status(500).json({ success: false, message: 'Failed to load the page' });
  }
};

/** GET /api/admin/zones/out-of-zone-page */
const getAdminOutOfZonePage = async (req, res) => {
  try {
    res.status(200).json({ success: true, outOfZonePage: await getOutOfZonePage() });
  } catch (error) {
    console.error('Get out-of-zone page (admin) error:', error);
    res.status(500).json({ success: false, message: 'Failed to load the page' });
  }
};

/** PUT /api/admin/zones/out-of-zone-page */
const updateOutOfZonePage = async (req, res) => {
  try {
    const { updates, errors } = sanitizeOutOfZonePage(req.body || {});
    if (errors.length > 0) {
      return res.status(400).json({ success: false, message: errors[0], errors });
    }

    const $set = {};
    for (const [key, value] of Object.entries(updates)) $set[`outOfZonePage.${key}`] = value;
    if (Object.keys($set).length > 0) {
      await Settings.findOneAndUpdate({ type: 'global' }, { $set }, { upsert: true, new: true, setDefaultsOnInsert: true });
    }

    res.status(200).json({ success: true, message: 'Out-of-zone page saved', outOfZonePage: await getOutOfZonePage() });
  } catch (error) {
    console.error('Update out-of-zone page error:', error);
    res.status(500).json({ success: false, message: 'Failed to save the page' });
  }
};

module.exports = {
  getPublicOutOfZonePage,
  getAdminOutOfZonePage,
  updateOutOfZonePage,
  getAllZones,
  getZoneById,
  createZone,
  updateZone,
  deleteZone,
  findZoneByPoint,
  toggleZoneStatus
};

/**
 * City scope rules for the catalog, in one place so admin, customer and worker screens agree.
 *
 * A category / brand / service whose `cityIds` is empty is available in EVERY city. One that lists
 * cities is available only in those. (The customer category list already worked this way; search,
 * arrival estimates, the admin brand list and the admin service list each did something different.)
 */
const mongoose = require('mongoose');

const isValidCityId = (cityId) => !!cityId && mongoose.Types.ObjectId.isValid(String(cityId));

/** Mongo filter for documents that have a `cityIds` array: this city's, or "all cities". */
const cityScopeQuery = (cityId) => ({
  $or: [
    { cityIds: cityId },
    { cityIds: { $size: 0 } },
    { cityIds: { $exists: false } }
  ]
});

/** In-memory version of the same rule. */
const availableInCity = (cityIds, cityId) => {
  if (!cityId) return true;
  if (!Array.isArray(cityIds) || cityIds.length === 0) return true;
  return cityIds.some((c) => String(c?._id || c) === String(cityId));
};

/**
 * Mongo filter on services for a city, matching what the customer app shows: a service is in the
 * city when its category or its brand names the city, or when both are open to every city.
 * Returns null when no (valid) city is given, i.e. no filtering.
 */
const buildServiceCityMatch = async (cityId) => {
  if (!isValidCityId(cityId)) return null;
  const Category = require('../models/Category');
  const Brand = require('../models/Brand');

  const [categories, brands] = await Promise.all([
    Category.find({}).select('cityIds').lean(),
    Brand.find({}).select('cityIds').lean()
  ]);

  // explicit: lists this city. restricted: lists any city at all (so is NOT open to everyone).
  const split = (docs) => {
    const explicit = [];
    const restricted = [];
    docs.forEach((d) => {
      if (!Array.isArray(d.cityIds) || d.cityIds.length === 0) return;
      restricted.push(d._id);
      if (d.cityIds.some((c) => String(c) === String(cityId))) explicit.push(d._id);
    });
    return { explicit, restricted };
  };

  const cats = split(categories);
  const brs = split(brands);

  return {
    $or: [
      { categoryId: { $in: cats.explicit } },
      { brandId: { $in: brs.explicit } },
      // Open to every city on both levels. A missing or deleted category / brand counts as open.
      { categoryId: { $nin: cats.restricted }, brandId: { $nin: brs.restricted } }
    ]
  };
};

module.exports = { isValidCityId, cityScopeQuery, availableInCity, buildServiceCityMatch };

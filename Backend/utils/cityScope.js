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
 * Where a category stands in a city. A sub-category with no cities of its own follows its PARENT, and
 * is never available where its parent is not (a customer reaches it through the parent, so a
 * sub-category left "open to all" under an Indore-only parent must not show up in other cities).
 *
 *   'explicit'  lists this city (itself, or inherited from its parent)
 *   'open'      no cities anywhere up the chain: every city
 *   'other'     not available in this city
 */
const categoryCityStates = async (cityId) => {
  const Category = require('../models/Category');
  const docs = await Category.find({}).select('cityIds parentId').lean();
  const byId = new Map(docs.map((d) => [String(d._id), d]));
  const memo = new Map();

  const stateOf = (id, depth = 0) => {
    const key = String(id);
    if (memo.has(key)) return memo.get(key);
    const doc = byId.get(key);
    let state;
    if (!doc || depth > 5) {
      state = 'open';
    } else {
      const own = Array.isArray(doc.cityIds) ? doc.cityIds : [];
      const parentState = doc.parentId ? stateOf(doc.parentId, depth + 1) : 'open';
      if (parentState === 'other') state = 'other';
      else if (own.length > 0) state = own.some((c) => String(c) === String(cityId)) ? 'explicit' : 'other';
      else state = parentState; // inherits: 'open', or 'explicit' from the parent
    }
    memo.set(key, state);
    return state;
  };

  const states = new Map();
  docs.forEach((d) => states.set(String(d._id), stateOf(d._id)));
  return states;
};

/** Mongo filter on Category `_id`: the categories available in this city (null = no filtering). */
const categoryCityFilter = async (cityId) => {
  if (!isValidCityId(cityId)) return null;
  const states = await categoryCityStates(cityId);
  const ids = [];
  states.forEach((state, id) => { if (state !== 'other') ids.push(new mongoose.Types.ObjectId(id)); });
  return { _id: { $in: ids } };
};

/**
 * Mongo filter on services for a city, matching what the customer app shows: a service is in the
 * city when its category or its brand names the city, or when both are open to every city.
 * Returns null when no (valid) city is given, i.e. no filtering.
 */
const buildServiceCityMatch = async (cityId) => {
  if (!isValidCityId(cityId)) return null;
  const Brand = require('../models/Brand');

  const [catStates, brands] = await Promise.all([
    categoryCityStates(cityId),
    Brand.find({}).select('cityIds').lean()
  ]);

  const toIds = (list) => list.map((id) => new mongoose.Types.ObjectId(id));
  const catExplicit = [];
  const catNotOpen = [];
  catStates.forEach((state, id) => {
    if (state === 'explicit') { catExplicit.push(id); catNotOpen.push(id); }
    else if (state === 'other') catNotOpen.push(id);
  });

  const brandExplicit = [];
  const brandRestricted = [];
  brands.forEach((d) => {
    if (!Array.isArray(d.cityIds) || d.cityIds.length === 0) return;
    brandRestricted.push(d._id);
    if (d.cityIds.some((c) => String(c) === String(cityId))) brandExplicit.push(d._id);
  });

  return {
    $or: [
      { categoryId: { $in: toIds(catExplicit) } },
      { brandId: { $in: brandExplicit } },
      // Open to every city on both levels. A missing or deleted category / brand counts as open.
      { categoryId: { $nin: toIds(catNotOpen) }, brandId: { $nin: brandRestricted } }
    ]
  };
};

module.exports = { isValidCityId, cityScopeQuery, availableInCity, categoryCityStates, categoryCityFilter, buildServiceCityMatch };

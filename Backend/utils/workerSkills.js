/**
 * Professionals list what they offer by TITLE (Worker.service / Worker.categories hold the titles of
 * the services, categories and sub-categories they picked), and booking dispatch matches on those
 * titles. So when the admin renames a category or service, the professionals who picked the old
 * title must follow, or they silently stop receiving that work.
 */
const escapeRegex = require('./escapeRegex');

/**
 * Renames `oldTitle` to `newTitle` in every professional's skill lists.
 * Does nothing when the title did not change, or when another category / service still uses the
 * old title (it is still a valid pick for that one). Returns how many professionals changed.
 */
const renameWorkerSkill = async (oldTitle, newTitle) => {
  const from = String(oldTitle || '').trim();
  const to = String(newTitle || '').trim();
  if (!from || !to || from === to) return 0;

  const Worker = require('../models/Worker');
  const Category = require('../models/Category');
  const UserService = require('../models/UserService');

  const exact = new RegExp(`^${escapeRegex(from)}$`, 'i');
  const [stillACategory, stillAService] = await Promise.all([
    Category.exists({ title: exact }),
    UserService.exists({ title: exact })
  ]);
  if (stillACategory || stillAService) return 0;

  let changed = 0;
  for (const field of ['service', 'categories']) {
    // Only list-typed fields: a legacy single-string value cannot take an array filter
    const res = await Worker.updateMany(
      { $and: [{ [field]: from }, { [field]: { $type: 'array' } }] },
      { $set: { [`${field}.$[e]`]: to } },
      { arrayFilters: [{ e: from }] }
    );
    changed += res.modifiedCount || 0;
  }
  return changed;
};

module.exports = { renameWorkerSkill };

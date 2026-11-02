/**
 * Selection rules for the partner's service picker (category -> sub-category -> service).
 *
 * What is STORED is a flat list of titles (Worker.service / Worker.categories), and booking dispatch
 * matches a booking against the service, its category and its parent category. So the list holds the
 * HIGHEST ticked level:
 *   - a whole category ticked  -> only the category title (so services added to it later still reach
 *     the partner, and nothing is copied that could go stale)
 *   - part of a category ticked -> the ticked sub-categories / services only
 * The picker shows a tick on everything under a ticked parent, and a dash on a parent with only some
 * of its children ticked. Titles that are not in the tree (retired items, old data) are kept as they
 * are so saving never silently drops them.
 *
 * Pure functions, no React.
 */

const norm = (title) => String(title || '').trim().toLowerCase();

/** Flattens the tree into nodes with parent / children links. Node id: c:<id>, s:<id>, v:<id>. */
export const buildIndex = (categories = []) => {
  const nodes = new Map();
  const add = (node) => { nodes.set(node.key, node); return node; };

  categories.forEach((cat) => {
    const catNode = add({ key: `c:${cat.id}`, kind: 'category', title: cat.title, parent: null, children: [] });

    (cat.subCategories || []).forEach((sub) => {
      const subNode = add({ key: `s:${sub.id}`, kind: 'sub', title: sub.title, parent: catNode.key, children: [] });
      catNode.children.push(subNode.key);
      (sub.services || []).forEach((svc) => {
        const svcNode = add({ key: `v:${svc.id}`, kind: 'service', title: svc.title, brandTitle: svc.brandTitle || null, parent: subNode.key, children: [] });
        subNode.children.push(svcNode.key);
      });
    });

    (cat.services || []).forEach((svc) => {
      const svcNode = add({ key: `v:${svc.id}`, kind: 'service', title: svc.title, brandTitle: svc.brandTitle || null, parent: catNode.key, children: [] });
      catNode.children.push(svcNode.key);
    });
  });

  const byTitle = new Map();
  nodes.forEach((node) => {
    const t = norm(node.title);
    if (!byTitle.has(t)) byTitle.set(t, []);
    byTitle.get(t).push(node.key);
  });

  return { nodes, byTitle, roots: categories.map((c) => `c:${c.id}`) };
};

const descendants = (index, key, out = []) => {
  index.nodes.get(key).children.forEach((childKey) => {
    out.push(childKey);
    descendants(index, childKey, out);
  });
  return out;
};

/** A parent counts as ticked exactly when every child is. (Bottom-up, so run from the leaves.) */
const settleParents = (index, checked) => {
  const order = [...index.nodes.values()].filter((n) => n.children.length > 0);
  // deepest first: services have no children, sub-categories before categories
  order.sort((a, b) => (a.kind === 'category' ? 1 : 0) - (b.kind === 'category' ? 1 : 0));
  order.forEach((node) => {
    if (node.children.every((k) => checked.has(k))) checked.add(node.key);
    else checked.delete(node.key);
  });
};

/**
 * Titles -> set of ticked node keys. A ticked parent ticks everything under it. Titles that match no
 * node come back in `extras` so they can be kept.
 */
export const decode = (index, titles = []) => {
  const checked = new Set();
  const extras = [];
  (Array.isArray(titles) ? titles : titles ? [titles] : []).forEach((title) => {
    const keys = index.byTitle.get(norm(title));
    if (!keys) { extras.push(title); return; }
    keys.forEach((key) => {
      checked.add(key);
      descendants(index, key).forEach((k) => checked.add(k));
    });
  });
  settleParents(index, checked);
  return { checked, extras };
};

/** Ticks or unticks a node (and everything under it), then re-settles its parents. */
export const toggle = (index, checked, key) => {
  const next = new Set(checked);
  const family = [key, ...descendants(index, key)];
  if (next.has(key)) family.forEach((k) => next.delete(k));
  else family.forEach((k) => next.add(k));
  settleParents(index, next);
  return next;
};

/** Ticks / unticks everything. */
export const setAll = (index, on) => {
  const next = new Set();
  if (on) index.nodes.forEach((_, k) => next.add(k));
  return next;
};

/** Ticked keys -> the titles to store (highest ticked level only), plus any titles we did not recognise. */
export const encode = (index, checked, extras = []) => {
  const titles = [];
  const walk = (key) => {
    const node = index.nodes.get(key);
    if (!checked.has(key) && !node.children.some((k) => checked.has(k) || hasTickedBelow(index, checked, k))) return;
    if (checked.has(key)) {
      titles.push(node.title);
      return;
    }
    node.children.forEach(walk);
  };
  index.roots.forEach(walk);
  const seen = new Set(titles.map(norm));
  extras.forEach((t) => { if (!seen.has(norm(t))) { titles.push(t); seen.add(norm(t)); } });
  return titles;
};

const hasTickedBelow = (index, checked, key) => {
  const node = index.nodes.get(key);
  return checked.has(key) || node.children.some((k) => hasTickedBelow(index, checked, k));
};

/** 'all' | 'some' | 'none' for a node, for the tick / dash / empty box. */
export const stateOf = (index, checked, key) => {
  if (checked.has(key)) return 'all';
  return hasTickedBelow(index, checked, key) ? 'some' : 'none';
};

/** How many services a title list covers (for "N services selected"). */
export const countServices = (index, checked) =>
  [...checked].filter((k) => index.nodes.get(k)?.kind === 'service').length;

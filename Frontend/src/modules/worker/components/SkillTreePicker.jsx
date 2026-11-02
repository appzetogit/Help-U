import React, { useEffect, useMemo, useState } from 'react';
import { FiChevronRight, FiChevronDown, FiSearch, FiCheck, FiMinus, FiX } from 'react-icons/fi';
import api from '../../../services/api';
import { buildIndex, decode, toggle, encode, stateOf, setAll, countServices } from '../utils/skillTree';

/**
 * Partner service picker: categories first; open one to choose sub-categories, open those to choose
 * services. Ticking a category ticks everything under it (and keeps covering services added later);
 * unticking something inside it leaves a partial selection. The rules live in utils/skillTree.js.
 *
 * value / onChange work on the same flat list of titles the profile has always stored.
 */
const Box = ({ state }) => (
  <span
    className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors ${
      state === 'none' ? 'border-gray-300 bg-white' : 'border-blue-500 bg-blue-500 text-white'
    }`}
  >
    {state === 'all' && <FiCheck className="w-3.5 h-3.5" />}
    {state === 'some' && <FiMinus className="w-3.5 h-3.5" />}
  </span>
);

const SkillTreePicker = ({ value, onChange, cityId = null, accentColor = '#2563eb' }) => {
  const [tree, setTree] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [open, setOpen] = useState({});
  const [query, setQuery] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await api.get('/public/worker-skill-tree', { params: cityId ? { cityId } : {} });
        if (alive && res.data?.success) setTree(res.data.categories || []);
        else if (alive) setLoadError(true);
      } catch {
        if (alive) setLoadError(true);
      }
    })();
    return () => { alive = false; };
  }, [cityId]);

  const index = useMemo(() => buildIndex(tree || []), [tree]);
  const { checked, extras } = useMemo(() => decode(index, value), [index, value]);

  const apply = (nextChecked) => onChange(encode(index, nextChecked, extras));
  const flip = (key) => apply(toggle(index, checked, key));
  const toggleOpen = (key) => setOpen((prev) => ({ ...prev, [key]: !prev[key] }));

  const q = query.trim().toLowerCase();
  // A search shows every branch that has a match, opened
  const matches = (key) => {
    const node = index.nodes.get(key);
    return node.title.toLowerCase().includes(q) || node.children.some(matches);
  };
  const visibleRoots = q ? index.roots.filter(matches) : index.roots;

  const renderNode = (key, depth) => {
    const node = index.nodes.get(key);
    if (q && !matches(key)) return null;
    const state = stateOf(index, checked, key);
    const hasChildren = node.children.length > 0;
    const isOpen = q ? true : !!open[key];
    const selectedBelow = hasChildren
      ? node.children.reduce((n, k) => n + (checked.has(k) ? 1 : 0), 0)
      : 0;

    return (
      <div key={key}>
        <div
          className={`flex items-center gap-2 py-2 pr-3 hover:bg-gray-50 ${depth === 0 ? 'border-b border-gray-100' : ''}`}
          style={{ paddingLeft: 12 + depth * 20 }}
        >
          {hasChildren ? (
            <button
              type="button"
              onClick={() => toggleOpen(key)}
              className="p-0.5 text-gray-400 hover:text-gray-700 shrink-0"
              aria-label={isOpen ? 'Collapse' : 'Expand'}
            >
              {isOpen ? <FiChevronDown className="w-4 h-4" /> : <FiChevronRight className="w-4 h-4" />}
            </button>
          ) : (
            <span className="w-5 shrink-0" />
          )}

          <button type="button" onClick={() => flip(key)} className="flex items-center gap-2.5 flex-1 min-w-0 text-left">
            <Box state={state} />
            <span className="min-w-0">
              <span className={`block truncate ${depth === 0 ? 'text-sm font-semibold text-gray-900' : 'text-sm text-gray-700'}`}>
                {node.title}
              </span>
              {node.brandTitle && <span className="block text-[11px] text-gray-400 truncate">{node.brandTitle}</span>}
            </span>
          </button>

          {hasChildren && (
            <span className="text-[11px] font-medium text-gray-400 shrink-0">
              {state === 'all' ? 'All' : state === 'some' ? `${selectedBelow}/${node.children.length}` : ''}
            </span>
          )}
        </div>

        {hasChildren && isOpen && node.children.map((childKey) => renderNode(childKey, depth + 1))}
      </div>
    );
  };

  if (loadError) {
    return <p className="text-sm text-red-500">Could not load the service list. Please refresh and try again.</p>;
  }
  if (!tree) {
    return <div className="h-24 rounded-xl bg-gray-100 animate-pulse" />;
  }

  const total = countServices(index, checked);
  const anyChecked = checked.size > 0 || extras.length > 0;

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="p-3 border-b border-gray-100 bg-gray-50/70 space-y-2.5">
        <div className="relative">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search categories or services"
            className="w-full pl-9 pr-8 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700">
              <FiX className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-500">
            {anyChecked ? (
              <>
                <span className="font-bold" style={{ color: accentColor }}>{value.length}</span> selected
                {total > 0 ? ` · covers ${total} service${total === 1 ? '' : 's'}` : ''}
              </>
            ) : (
              'Tick a category to offer everything in it, or open it to choose.'
            )}
          </span>
          <span className="flex items-center gap-3">
            <button type="button" onClick={() => apply(setAll(index, true))} className="font-semibold hover:underline" style={{ color: accentColor }}>
              Select all
            </button>
            {anyChecked && (
              <button type="button" onClick={() => onChange([])} className="font-semibold text-gray-500 hover:underline">
                Clear
              </button>
            )}
          </span>
        </div>
      </div>

      <div className="max-h-80 overflow-y-auto">
        {visibleRoots.length === 0 ? (
          <p className="px-4 py-6 text-sm text-center text-gray-400">
            {q ? 'Nothing matches your search.' : 'No services are available yet.'}
          </p>
        ) : (
          visibleRoots.map((key) => renderNode(key, 0))
        )}
      </div>

      {extras.length > 0 && (
        <div className="px-3 py-2 border-t border-gray-100 bg-amber-50/60 text-[11px] text-amber-800">
          Also on your profile (no longer in the list): {extras.join(', ')}.{' '}
          <button type="button" className="font-semibold underline" onClick={() => onChange(encode(index, checked, []))}>
            Remove
          </button>
        </div>
      )}
    </div>
  );
};

export default SkillTreePicker;

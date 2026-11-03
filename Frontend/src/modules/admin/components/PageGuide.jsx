import React, { useState } from 'react';
import { FiInfo, FiChevronDown, FiChevronUp } from 'react-icons/fi';

/**
 * A short "what is this page for" box. Open by default so a new admin sees it; the admin can fold it
 * away, and it stays folded for that page next time.
 */
const PageGuide = ({ id, title, intro, points = [] }) => {
  const storageKey = `pageGuide:${id}`;
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem(storageKey) !== 'closed'; } catch { return true; }
  });

  const toggle = () => {
    const next = !open;
    setOpen(next);
    try { localStorage.setItem(storageKey, next ? 'open' : 'closed'); } catch { /* storage unavailable */ }
  };

  return (
    <div className="rounded-xl border border-sky-100 bg-sky-50/70 p-4">
      <button type="button" onClick={toggle} className="flex w-full items-center justify-between gap-3 text-left">
        <span className="flex items-center gap-2 text-sm font-bold text-sky-900">
          <FiInfo className="h-4 w-4 shrink-0" /> {title}
        </span>
        {open ? <FiChevronUp className="h-4 w-4 text-sky-700" /> : <FiChevronDown className="h-4 w-4 text-sky-700" />}
      </button>
      {open && (
        <div className="mt-2 space-y-2 text-sm text-sky-900/90">
          <p>{intro}</p>
          <ul className="list-disc space-y-1 pl-5 text-[13px] text-sky-900/80">
            {points.map((p) => <li key={p}>{p}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
};

export default PageGuide;

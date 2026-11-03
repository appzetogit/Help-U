/**
 * Tells the page when the phone's on-screen keyboard is up, by watching which element has focus.
 *
 * The app is told to resize its layout when the keyboard opens (so the field being typed in stays visible), which
 * also lifts anything fixed to the bottom of the screen, such as the navigation bar or a "Next" button, up above the
 * keyboard where it covers the form. Setting `keyboard-open` on <html> lets the stylesheet hide those bars while the
 * person is typing (see index.css), and bring them back when they stop.
 *
 * Only on touch devices: on a computer there is no on-screen keyboard to make room for.
 */

const TEXT_INPUT_TYPES = new Set(['text', 'search', 'number', 'tel', 'email', 'password', 'url', 'date', 'time', 'datetime-local', 'month', 'week']);

export const isTextEntry = (el) => {
  if (!el || el.nodeType !== 1) return false;
  const tag = el.tagName;
  if (tag === 'TEXTAREA') return !el.readOnly && !el.disabled;
  if (tag === 'INPUT') return TEXT_INPUT_TYPES.has((el.getAttribute('type') || 'text').toLowerCase()) && !el.readOnly && !el.disabled;
  return el.isContentEditable === true;
};

const isTouchDevice = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;

let installed = false;

export const installKeyboardWatcher = () => {
  if (installed || typeof document === 'undefined') return () => {};
  installed = true;

  const root = document.documentElement;
  const sync = () => {
    const open = isTouchDevice() && isTextEntry(document.activeElement);
    root.classList.toggle('keyboard-open', open);
  };

  const onFocusIn = () => sync();
  // Focus moves between two fields through a moment with no focus at all, so look again once it has settled
  const onFocusOut = () => setTimeout(sync, 60);

  document.addEventListener('focusin', onFocusIn);
  document.addEventListener('focusout', onFocusOut);

  return () => {
    document.removeEventListener('focusin', onFocusIn);
    document.removeEventListener('focusout', onFocusOut);
    root.classList.remove('keyboard-open');
    installed = false;
  };
};

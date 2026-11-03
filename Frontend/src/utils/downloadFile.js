/**
 * Saving a file the person asked to download.
 *
 * `<a href download>` only downloads files from the same website: for a file on another domain (our documents and
 * photos live on Cloudinary) the browser ignores `download` and simply opens the file, so a "Download" link only
 * ever viewed it. Two ways round that, tried in this order:
 *   1. Cloudinary can serve a file as an attachment (the `fl_attachment` flag), which makes the browser save it.
 *   2. Any other address is fetched and saved from memory; if the other site does not allow that, it is opened in a
 *      new tab as a last resort.
 */

const safeName = (name) => String(name || 'file').replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'file';

/** The same file, served by Cloudinary as a download. Null if the address is not a Cloudinary one. */
export const cloudinaryDownloadUrl = (url, name) => {
  const m = /^(https?:\/\/res\.cloudinary\.com\/[^/]+\/(?:image|raw|video)\/upload\/)(.+)$/.exec(String(url || ''));
  if (!m) return null;
  // Cloudinary adds the extension itself, so the name goes in without one
  const base = safeName(name).replace(/\.[A-Za-z0-9]{2,5}$/, '').replace(/\./g, '_');
  return `${m[1]}fl_attachment:${base}/${m[2]}`;
};

const extensionOf = (url) => {
  const m = /\.([A-Za-z0-9]{2,5})(?:[?#]|$)/.exec(String(url || '').split('/').pop() || '');
  return m ? m[1].toLowerCase() : '';
};

const clickLink = (href, download) => {
  const a = document.createElement('a');
  a.href = href;
  if (download) a.download = download;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
};

/**
 * Downloads `url` as `filename` (without needing to know the extension).
 * Resolves to true when the browser was told to save it, false when the fallback (opening a tab) was used.
 */
export const downloadFile = async (url, filename) => {
  if (!url) return false;

  const viaCloudinary = cloudinaryDownloadUrl(url, filename);
  if (viaCloudinary) {
    clickLink(viaCloudinary);
    return true;
  }

  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const ext = extensionOf(url) || (blob.type.split('/')[1] || '').replace(/[^a-z0-9]/gi, '').slice(0, 5);
    const objectUrl = URL.createObjectURL(blob);
    clickLink(objectUrl, `${safeName(filename).replace(/\.[A-Za-z0-9]{2,5}$/, '')}${ext ? `.${ext}` : ''}`);
    setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
    return true;
  } catch {
    window.open(url, '_blank', 'noopener');
    return false;
  }
};

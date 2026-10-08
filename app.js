/* Replace these placeholders with your existing Cloudinary values. Never add the API Secret here. */
const CONFIG = {
  cloudName: 'rgtwnpin',
  uploadPreset: 'tamaravibes_iphone',
  folder: 'TamaraVibes',
  // Optional Cloudflare Worker URL. Needed to securely list existing assets.
  mediaEndpoint: 'YOUR_CLOUDFLARE_WORKER_URL'
};

const gallery = document.querySelector('#gallery');
const statusBox = document.querySelector('#status');
const mediaCount = document.querySelector('#mediaCount');
const previewDialog = document.querySelector('#previewDialog');
const previewContent = document.querySelector('#previewContent');
let assets = [];
let activeFilter = 'all';
let selectedAsset = null;

const configured = value => value && !value.startsWith('YOUR_');
const readyForUpload = () => configured(CONFIG.cloudName) && configured(CONFIG.uploadPreset);
const readyForGallery = () => configured(CONFIG.mediaEndpoint);

function setStatus(message, error = false) {
  statusBox.textContent = message;
  statusBox.classList.remove('hidden', 'error');
  if (error) statusBox.classList.add('error');
}

function secureUrl(asset) {
  if (asset.secure_url) return asset.secure_url;
  const resource = asset.resource_type === 'video' ? 'video' : 'image';
  const format = asset.format ? `.${asset.format}` : '';
  return `https://res.cloudinary.com/${encodeURIComponent(CONFIG.cloudName)}/${resource}/upload/${asset.public_id}${format}`;
}

function render() {
  const visible = assets.filter(asset => activeFilter === 'all' || asset.resource_type === activeFilter);
  mediaCount.textContent = `${assets.length} ${assets.length === 1 ? 'item' : 'items'}`;
  gallery.replaceChildren();
  if (!visible.length) {
    if (assets.length) gallery.innerHTML = '<div class="empty-state">Nothing in this collection yet.</div>';
    else if (readyForGallery()) gallery.innerHTML = '<div class="empty-state">Your collection is empty. Upload a photo or video to get started.</div>';
    return;
  }
  statusBox.classList.add('hidden');
  visible.forEach(asset => {
    const isVideo = asset.resource_type === 'video';
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'media-card';
    card.setAttribute('aria-label', `Preview ${asset.display_name || asset.public_id}`);
    const thumbUrl = isVideo ? secureUrl(asset).replace('/video/upload/', '/video/upload/so_0,f_jpg/') : secureUrl(asset).replace('/image/upload/', '/image/upload/c_fill,w_700,h_700,q_auto,f_auto/');
    const wrapper = document.createElement('div');
    if (isVideo) wrapper.className = 'video-thumb';
    const image = document.createElement('img');
    image.className = 'media-thumb'; image.loading = 'lazy'; image.alt = asset.display_name || 'Cloudinary media'; image.src = thumbUrl;
    wrapper.append(image);
    const meta = document.createElement('div'); meta.className = 'media-meta';
    const name = document.createElement('div'); name.className = 'media-name'; name.textContent = asset.display_name || asset.public_id.split('/').pop();
    const sub = document.createElement('div'); sub.className = 'media-sub'; sub.textContent = `${isVideo ? 'Video' : 'Photo'}${asset.created_at ? ` · ${new Date(asset.created_at).toLocaleDateString('en-US')}` : ''}`;
    meta.append(name, sub); card.append(wrapper, meta);
    card.addEventListener('click', () => openPreview(asset));
    gallery.append(card);
  });
}

async function loadMedia() {
  if (!readyForGallery()) {
    assets = []; mediaCount.textContent = '—'; gallery.replaceChildren();
    setStatus('To load your existing media, add the Cloudflare Worker URL in app.js. Your API Secret stays in the Worker and is never sent to this page.');
    return;
  }
  setStatus('Loading your TamaraVibes collection…');
  document.querySelector('#refreshButton').disabled = true;
  try {
    const response = await fetch(`${CONFIG.mediaEndpoint.replace(/\/$/, '')}?folder=${encodeURIComponent(CONFIG.folder)}&max_results=100`, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`The media service returned ${response.status}.`);
    const data = await response.json();
    if (!Array.isArray(data.resources)) throw new Error(data.error || 'The media service response is missing its resources list.');
    assets = data.resources;
    statusBox.classList.add('hidden');
    render();
    if (!assets.length) setStatus(`No media found in “${CONFIG.folder}” yet. Upload a photo or video to get started.`);
  } catch (error) {
    assets = []; render(); setStatus(`${error.message} Check the Worker setup and try again.`, true);
  } finally { document.querySelector('#refreshButton').disabled = false; }
}

function openUpload() {
  if (!readyForUpload()) { setStatus('Add your Cloudinary cloud name and unsigned upload preset in app.js before uploading.', true); document.querySelector('#uploadButton').focus(); return; }
  if (!window.cloudinary?.createUploadWidget) { setStatus('The Cloudinary upload window is still loading. Check your connection and try again.', true); return; }
  const widget = window.cloudinary.createUploadWidget({
    cloudName: CONFIG.cloudName,
    uploadPreset: CONFIG.uploadPreset,
    multiple: true,
    resourceType: 'auto',
    sources: ['local', 'camera'],
    folder: CONFIG.folder,
    clientAllowedFormats: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'mp4', 'mov', 'webm'],
    maxFileSize: 100000000,
    showAdvancedOptions: false,
    showCompletedButton: true,
    styles: { palette: { window: '#ffffff', windowBorder: '#e9e6df', tabIcon: '#c87559', menuIcons: '#c87559', textDark: '#292722', textLight: '#ffffff', link: '#a95d44', action: '#c87559', inactiveTabIcon: '#858177', error: '#b84e4e', inProgress: '#c87559', complete: '#638b69', sourceBg: '#f7f6f2' } }
  }, (error, result) => {
    if (error) { setStatus(error.message || 'Upload failed. Please try again.', true); return; }
    if (result?.event === 'success') { setStatus('Upload complete. Refreshing your collection…'); if (readyForGallery()) loadMedia(); }
  });
  widget.open();
}

function openPreview(asset) {
  selectedAsset = asset;
  const url = secureUrl(asset);
  previewContent.replaceChildren();
  const media = document.createElement(asset.resource_type === 'video' ? 'video' : 'img');
  media.src = url; media.controls = asset.resource_type === 'video'; media.alt = asset.display_name || 'Media preview';
  if (asset.resource_type === 'video') media.playsInline = true;
  previewContent.append(media);
  document.querySelector('#openUrl').href = url;
  previewDialog.showModal();
}

document.querySelector('#uploadButton').addEventListener('click', openUpload);
document.querySelector('#refreshButton').addEventListener('click', loadMedia);
document.querySelector('#closePreview').addEventListener('click', () => previewDialog.close());
previewDialog.addEventListener('click', event => { if (event.target === previewDialog) previewDialog.close(); });
document.querySelector('#copyUrlButton').addEventListener('click', async event => {
  if (!selectedAsset) return;
  try { await navigator.clipboard.writeText(secureUrl(selectedAsset)); event.currentTarget.textContent = 'Copied!'; setTimeout(() => { event.currentTarget.textContent = 'Copy secure URL'; }, 1500); }
  catch { event.currentTarget.textContent = 'Copy unavailable'; }
});
document.querySelectorAll('.filter').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('.filter').forEach(tab => { const selected = tab === button; tab.classList.toggle('active', selected); tab.setAttribute('aria-selected', String(selected)); });
  activeFilter = button.dataset.filter; render();
}));

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register(new URL('sw.js', document.baseURI)).catch(() => {});
loadMedia();

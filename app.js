/* Replace these placeholders with your existing Cloudinary values. Never add the API Secret here. */
const CONFIG = {
  cloudName: 'rgtwnpin',
  uploadPreset: 'tamaravibes_iphone',
  galleryFolder: 'all',
  // Optional Cloudflare Worker URL. Needed to securely list existing assets.
  mediaEndpoint: 'https://cloudinary.tamtam.workers.dev'
};

const gallery = document.querySelector('#gallery');
const statusBox = document.querySelector('#status');
const mediaCount = document.querySelector('#mediaCount');
const creditsRemaining = document.querySelector('#creditsRemaining');
const creditsDetail = document.querySelector('#creditsDetail');
const usageBar = document.querySelector('#usageBar');
const usageTrack = document.querySelector('.usage-track');
const usageUpdated = document.querySelector('#usageUpdated');
const previewDialog = document.querySelector('#previewDialog');
const previewContent = document.querySelector('#previewContent');
let assets = [];
let activeFilter = 'all';
let selectedAsset = null;
let nextCursor = null;
let hasMore = false;

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
    const card = document.createElement('article');
    card.className = 'media-card';
    const thumbUrl = isVideo ? secureUrl(asset).replace('/video/upload/', '/video/upload/so_0,f_jpg/') : secureUrl(asset).replace('/image/upload/', '/image/upload/c_fill,w_700,h_700,q_auto,f_auto/');
    const wrapper = document.createElement('div');
    if (isVideo) wrapper.className = 'video-thumb';
    const image = document.createElement('img');
    image.className = 'media-thumb'; image.loading = 'lazy'; image.alt = asset.display_name || 'Cloudinary media'; image.src = thumbUrl;
    wrapper.append(image);
    const meta = document.createElement('div'); meta.className = 'media-meta';
    const name = document.createElement('div'); name.className = 'media-name'; name.textContent = asset.display_name || asset.public_id.split('/').pop();
    const sub = document.createElement('div'); sub.className = 'media-sub'; sub.textContent = `${isVideo ? 'Video' : 'Photo'}${asset.created_at ? ` · ${new Date(asset.created_at).toLocaleDateString('en-US')}` : ''}`;
    meta.append(name, sub);
    const previewButton = document.createElement('button');
    previewButton.type = 'button';
    previewButton.className = 'media-preview-button';
    previewButton.setAttribute('aria-label', `Preview ${asset.display_name || asset.public_id}`);
    previewButton.append(wrapper, meta);
    previewButton.addEventListener('click', () => openPreview(asset));
    const actions = document.createElement('div'); actions.className = 'media-actions';
    const copyButton = document.createElement('button');
    copyButton.type = 'button'; copyButton.className = 'copy-button'; copyButton.textContent = 'Copy secure URL';
    copyButton.setAttribute('aria-label', `Copy secure URL for ${asset.display_name || asset.public_id}`);
    copyButton.addEventListener('click', () => copySecureUrl(asset, copyButton));
    actions.append(copyButton);
    card.append(previewButton, actions);
    gallery.append(card);
  });
  document.querySelector('#loadMoreButton').hidden = !hasMore;
}

async function deleteAsset(asset, button) {
  const name = asset.display_name || asset.public_id;
  if (!asset.asset_id) { setStatus('This item is missing its Cloudinary asset ID. Refresh the collection and try again.', true); return; }
  if (!window.confirm(`Permanently delete “${name}” from Cloudinary? This cannot be undone.`)) return;
  const password = window.prompt('Enter your delete password to continue:');
  if (password === null || !password) return;
  button.disabled = true;
  button.textContent = 'Deleting…';
  try {
    const response = await fetch(`${CONFIG.mediaEndpoint.replace(/\/$/, '')}/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Delete-Password': password },
      body: JSON.stringify({ asset_id: asset.asset_id })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `Delete failed (${response.status}).`);
    assets = assets.filter(item => item.asset_id !== asset.asset_id);
    previewDialog.close();
    render();
    setStatus('Media deleted from Cloudinary.');
  } catch (error) {
    button.disabled = false; button.textContent = 'Delete';
    setStatus(error.message || 'Could not delete this media. Please try again.', true);
  }
}

async function copySecureUrl(asset, button) {
  try {
    await navigator.clipboard.writeText(secureUrl(asset));
    button.textContent = 'Copied!';
    setTimeout(() => { button.textContent = 'Copy secure URL'; }, 1500);
  } catch {
    button.textContent = 'Copy unavailable';
    setTimeout(() => { button.textContent = 'Copy secure URL'; }, 1500);
  }
}

async function loadMedia(append = false) {
  if (!readyForGallery()) {
    assets = []; nextCursor = null; hasMore = false; mediaCount.textContent = '—'; gallery.replaceChildren();
    setStatus('To load your existing media, add the Cloudflare Worker URL in app.js. Your API Secret stays in the Worker and is never sent to this page.');
    return;
  }
  if (!append) { nextCursor = null; hasMore = false; setStatus('Loading your TamaraVibes collection…'); }
  const loadMoreButton = document.querySelector('#loadMoreButton');
  loadMoreButton.disabled = true;
  if (!append) document.querySelector('#refreshButton').disabled = true;
  try {
    const params = new URLSearchParams({ folder: CONFIG.galleryFolder, max_results: '500' });
    if (append && nextCursor) params.set('next_cursor', nextCursor);
    const response = await fetch(`${CONFIG.mediaEndpoint.replace(/\/$/, '')}?${params}`, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`The media service returned ${response.status}.`);
    const data = await response.json();
    if (!Array.isArray(data.resources)) throw new Error(data.error || 'The media service response is missing its resources list.');
    assets = append ? assets.concat(data.resources) : data.resources;
    nextCursor = data.next_cursor || null;
    hasMore = Boolean(nextCursor);
    statusBox.classList.add('hidden');
    render();
    if (!assets.length) setStatus('No photos or videos found yet. Upload a photo or video to get started.');
  } catch (error) {
    if (!append) { assets = []; nextCursor = null; hasMore = false; }
    render(); setStatus(`${error.message} Check the Worker setup and try again.`, true);
  } finally { document.querySelector('#refreshButton').disabled = false; loadMoreButton.disabled = false; }
}

async function loadUsage() {
  creditsRemaining.textContent = 'Loading…';
  creditsDetail.textContent = 'Checking current usage';
  usageUpdated.textContent = '';
  try {
    const response = await fetch(`${CONFIG.mediaEndpoint.replace(/\/$/, '')}/usage`, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`Usage service returned ${response.status}.`);
    const data = await response.json();
    const limit = Number(data.credits?.limit);
    const used = Number(data.credits?.used);
    if (!Number.isFinite(limit) || !Number.isFinite(used) || limit <= 0) throw new Error('Credit usage data is unavailable.');
    const remaining = Math.max(0, limit - used);
    const percentageUsed = Math.min(100, Math.max(0, used / limit * 100));
    creditsRemaining.textContent = `${remaining.toFixed(1)} / ${limit.toFixed(limit % 1 ? 1 : 0)}`;
    creditsDetail.textContent = `${used.toFixed(1)} credits used`;
    usageBar.style.width = `${percentageUsed}%`;
    usageBar.classList.toggle('warning', percentageUsed >= 70 && percentageUsed < 90);
    usageBar.classList.toggle('critical', percentageUsed >= 90);
    usageTrack.setAttribute('aria-valuemax', String(limit));
    usageTrack.setAttribute('aria-valuenow', String(used));
    if (data.last_updated) usageUpdated.textContent = `Updated ${new Date(data.last_updated).toLocaleDateString('en-US')}`;
  } catch (error) {
    creditsRemaining.textContent = 'Unavailable';
    creditsDetail.textContent = error.message;
    usageBar.style.width = '0';
  }
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
  const deleteButton = document.querySelector('#deletePreviewButton');
  deleteButton.disabled = !asset.asset_id;
  deleteButton.textContent = 'Delete';
  previewDialog.showModal();
}

document.querySelector('#uploadButton').addEventListener('click', openUpload);
document.querySelector('#refreshButton').addEventListener('click', () => { loadMedia(); loadUsage(); });
document.querySelector('#loadMoreButton').addEventListener('click', () => loadMedia(true));
document.querySelector('#closePreview').addEventListener('click', () => previewDialog.close());
previewDialog.addEventListener('click', event => { if (event.target === previewDialog) previewDialog.close(); });
document.querySelector('#deletePreviewButton').addEventListener('click', event => {
  if (selectedAsset) deleteAsset(selectedAsset, event.currentTarget);
});
document.querySelectorAll('.filter').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('.filter').forEach(tab => { const selected = tab === button; tab.classList.toggle('active', selected); tab.setAttribute('aria-selected', String(selected)); });
  activeFilter = button.dataset.filter; render();
}));

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register(new URL('sw.js', document.baseURI)).catch(() => {});
loadMedia();
loadUsage();

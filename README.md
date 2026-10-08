# TamaraVibes Cloudinary

A mobile-first PWA for uploading and browsing media in the Cloudinary `TamaraVibes` folder. The Cloudinary Upload Widget opens its own full-screen modal; it is never embedded in a page element. The API Secret is used only by the optional Cloudflare Worker, never by the browser.

## 1. Configure the app

Open `app.js` and replace only these placeholder values with values from your existing Cloudinary account:

- `cloudName`: `rgtwnpin`.
- `uploadPreset`: `tamaravibes_iphone` (it must be an **unsigned** upload preset). In Cloudinary settings, allow image and video uploads and set its folder to `TamaraVibes` if the account uses dynamic folders. The widget also requests the `TamaraVibes` folder.
- `mediaEndpoint`: leave as the placeholder until the Worker is deployed, then paste its URL.

Never put the Cloudinary API Secret in `app.js`, HTML, GitHub, or any browser setting. If you need to create a fresh unsigned preset, restrict its allowed formats and size in Cloudinary settings. The sample app accepts common image and video formats, up to 100 MB.

## 2. Deploy the secure media listing endpoint (needed for existing media)

GitHub Pages is static, so it cannot securely call Cloudinary's Admin API by itself. Deploy the included Worker to Cloudflare:

1. In Cloudflare, open **Workers & Pages → Create application → Create Worker → Deploy**. Open the new Worker, choose **Edit code**, replace the starter code with all of `worker/src/index.js`, then **Deploy**.
2. Set Worker variables/secrets:
   - `CLOUDINARY_CLOUD_NAME` — `rgtwnpin`.
   - `CLOUDINARY_API_KEY` — your Cloudinary API key (`443853227183795`); keep it in Worker settings, not in the site files.
   - `CLOUDINARY_API_SECRET` — your Cloudinary API Secret; store this as an encrypted Worker secret.
   - `ALLOWED_ORIGIN` — exactly `https://YOUR_GITHUB_USERNAME.github.io` (origin only, with no repository path).
   - `DEFAULT_FOLDER` — `TamaraVibes`.
3. Deploy the Worker. Copy its `workers.dev` URL into `CONFIG.mediaEndpoint` in `app.js`.
4. Cloudinary Admin API credentials can read account assets. Keep Worker secrets private, and limit the endpoint to your Pages origin. The endpoint searches only under the requested folder (the app requests `TamaraVibes`).

The endpoint returns up to 100 newest assets per request. If the folder has more than 100 assets, pagination can be added using Cloudinary's `next_cursor`.

## 3. Publish on GitHub Pages

1. Create/open your GitHub repository named `Cloudinary`.
2. Upload the contents of this package to the repository root. Keep the `worker/` folder too, as its source/config are part of the project.
3. Commit to the `main` branch.
4. In **Settings → Pages**, choose **Deploy from a branch**, select **main** and **/(root)**, then Save. Leave Custom domain empty.
5. Wait for GitHub Pages to publish. The project URL is `https://YOUR_GITHUB_USERNAME.github.io/Cloudinary/`.
6. Add that URL to the iPhone in Safari, tap **Share → Add to Home Screen**.

If Pages is not ready yet, replace `ALLOWED_ORIGIN` in the Worker with the exact published origin `https://YOUR_GITHUB_USERNAME.github.io` and redeploy. A GitHub project path such as `/Cloudinary/` is not part of the origin.

## Folder behavior

Uploads are directed to `TamaraVibes`; the gallery queries that folder and does not enumerate other folders. Assets that were uploaded elsewhere will not appear until moved into `TamaraVibes` in Cloudinary Media Library or the app/Worker folder setting is changed.

## PWA notes

The app shell and static files are cached for launch reliability. Media requires an internet connection. Upload and secure gallery listing also require network access. The Upload Widget and Google Fonts load from their providers when online.

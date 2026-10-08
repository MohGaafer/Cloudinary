const json = (data, status = 200, origin = '*') => new Response(JSON.stringify(data), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'Content-Type, X-Delete-Password',
    'cache-control': 'no-store',
    'vary': 'Origin'
  }
});

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = env.ALLOWED_ORIGIN || '';
    const corsOrigin = origin === allowed ? allowed : 'null';
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'access-control-allow-origin': corsOrigin, 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'Content-Type, X-Delete-Password', 'access-control-max-age': '86400', 'vary': 'Origin' } });
    if (!['GET', 'POST'].includes(request.method)) return json({ error: 'Method not allowed' }, 405, corsOrigin);
    if (!allowed || origin !== allowed) return json({ error: 'Origin is not allowed. Configure ALLOWED_ORIGIN to match the GitHub Pages origin exactly.' }, 403, corsOrigin);
    if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) return json({ error: 'Cloudinary Worker secrets are not configured.' }, 503, corsOrigin);

    const requestUrl = new URL(request.url);
    if (request.method === 'POST' && requestUrl.pathname.replace(/\/$/, '') === '/delete') {
      if (!env.APP_DELETE_PASSWORD) return json({ error: 'Delete protection is not configured. Add the APP_DELETE_PASSWORD Worker secret.' }, 503, corsOrigin);
      const suppliedPassword = request.headers.get('X-Delete-Password') || '';
      const encoder = new TextEncoder();
      const [expectedHash, suppliedHash] = await Promise.all([
        crypto.subtle.digest('SHA-256', encoder.encode(env.APP_DELETE_PASSWORD)),
        crypto.subtle.digest('SHA-256', encoder.encode(suppliedPassword))
      ]);
      const expectedBytes = new Uint8Array(expectedHash);
      const suppliedBytes = new Uint8Array(suppliedHash);
      let mismatch = 0;
      for (let index = 0; index < expectedBytes.length; index++) mismatch |= expectedBytes[index] ^ suppliedBytes[index];
      if (!suppliedPassword || mismatch !== 0) return json({ error: 'Incorrect delete password.' }, 401, corsOrigin);

      let payload;
      try { payload = await request.json(); } catch { return json({ error: 'Invalid JSON body.' }, 400, corsOrigin); }
      const assetId = typeof payload.asset_id === 'string' ? payload.asset_id : '';
      if (!assetId || assetId.length > 200) return json({ error: 'A valid asset_id is required.' }, 400, corsOrigin);
      const deleteUrl = `https://api.cloudinary.com/v1_1/${encodeURIComponent(env.CLOUDINARY_CLOUD_NAME)}/resources`;
      const auth = btoa(`${env.CLOUDINARY_API_KEY}:${env.CLOUDINARY_API_SECRET}`);
      try {
        const form = new URLSearchParams();
        form.append('asset_ids[]', assetId);
        form.append('invalidate', 'true');
        const response = await fetch(deleteUrl, { method: 'DELETE', headers: { authorization: `Basic ${auth}`, 'content-type': 'application/x-www-form-urlencoded' }, body: form });
        const data = await response.json();
        if (!response.ok) return json({ error: data.error?.message || 'Cloudinary could not delete this asset.' }, response.status, corsOrigin);
        const results = Object.values(data.deleted || {});
        if (!results.includes('deleted')) return json({ error: 'Cloudinary did not confirm deletion. Refresh and try again.' }, 409, corsOrigin);
        return json({ success: true }, 200, corsOrigin);
      } catch { return json({ error: 'Could not connect to Cloudinary to delete this asset.' }, 502, corsOrigin); }
    }
    if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405, corsOrigin);
    if (requestUrl.pathname.replace(/\/$/, '') === '/usage') {
      const usageUrl = `https://api.cloudinary.com/v1_1/${encodeURIComponent(env.CLOUDINARY_CLOUD_NAME)}/usage`;
      try {
        const response = await fetch(usageUrl, { headers: { authorization: `Basic ${btoa(`${env.CLOUDINARY_API_KEY}:${env.CLOUDINARY_API_SECRET}`)}` } });
        const data = await response.json();
        if (!response.ok) return json({ error: data.error?.message || 'Cloudinary usage lookup failed.' }, response.status, corsOrigin);
        const limit = Number(data.credits?.limit);
        const used = Number(data.credits?.usage);
        if (!Number.isFinite(limit) || !Number.isFinite(used)) return json({ error: 'Cloudinary did not return credit usage data.' }, 502, corsOrigin);
        return json({ credits: { used, limit }, last_updated: data.last_updated || data.date_requested || null }, 200, corsOrigin);
      } catch { return json({ error: 'Could not retrieve Cloudinary usage.' }, 502, corsOrigin); }
    }

    const folder = requestUrl.searchParams.get('folder') || env.DEFAULT_FOLDER || 'TamaraVibes';
    const maxResults = Math.min(Math.max(Number(requestUrl.searchParams.get('max_results')) || 500, 1), 500);
    const nextCursor = requestUrl.searchParams.get('next_cursor');
    const expression = folder === 'all' ? 'resource_type:image OR resource_type:video' : `folder:${folder}/*`;
    const endpoint = `https://api.cloudinary.com/v1_1/${encodeURIComponent(env.CLOUDINARY_CLOUD_NAME)}/resources/search`;
    const auth = btoa(`${env.CLOUDINARY_API_KEY}:${env.CLOUDINARY_API_SECRET}`);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { authorization: `Basic ${auth}`, 'content-type': 'application/json' },
        body: JSON.stringify({ expression, sort_by: [{ created_at: 'desc' }], max_results: maxResults, ...(nextCursor ? { next_cursor: nextCursor } : {}), fields: ['asset_id', 'public_id', 'resource_type', 'type', 'format', 'version', 'created_at', 'bytes', 'width', 'height', 'secure_url', 'display_name', 'folder'] })
      });
      const data = await response.json();
      if (!response.ok) return json({ error: data.error?.message || 'Cloudinary search failed.' }, response.status, corsOrigin);
      return json({ resources: data.resources || [], next_cursor: data.next_cursor || null }, 200, corsOrigin);
    } catch { return json({ error: 'Could not connect to Cloudinary.' }, 502, corsOrigin); }
  }
};

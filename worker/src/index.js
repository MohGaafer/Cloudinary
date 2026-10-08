const json = (data, status = 200, origin = '*') => new Response(JSON.stringify(data), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET, OPTIONS',
    'access-control-allow-headers': 'Content-Type',
    'cache-control': 'no-store',
    'vary': 'Origin'
  }
});

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = env.ALLOWED_ORIGIN || '';
    const corsOrigin = origin === allowed ? allowed : 'null';
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'access-control-allow-origin': corsOrigin, 'access-control-allow-methods': 'GET, OPTIONS', 'access-control-allow-headers': 'Content-Type', 'access-control-max-age': '86400', 'vary': 'Origin' } });
    if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405, corsOrigin);
    if (!allowed || origin !== allowed) return json({ error: 'Origin is not allowed. Configure ALLOWED_ORIGIN to match the GitHub Pages origin exactly.' }, 403, corsOrigin);
    if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) return json({ error: 'Cloudinary Worker secrets are not configured.' }, 503, corsOrigin);

    const requestUrl = new URL(request.url);
    const folder = requestUrl.searchParams.get('folder') || env.DEFAULT_FOLDER || 'TamaraVibes';
    const maxResults = Math.min(Math.max(Number(requestUrl.searchParams.get('max_results')) || 100, 1), 100);
    const expression = `folder:${folder}/*`;
    const endpoint = `https://api.cloudinary.com/v1_1/${encodeURIComponent(env.CLOUDINARY_CLOUD_NAME)}/resources/search`;
    const auth = btoa(`${env.CLOUDINARY_API_KEY}:${env.CLOUDINARY_API_SECRET}`);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { authorization: `Basic ${auth}`, 'content-type': 'application/json' },
        body: JSON.stringify({ expression, sort_by: [{ created_at: 'desc' }], max_results: maxResults, fields: ['public_id', 'resource_type', 'type', 'format', 'version', 'created_at', 'bytes', 'width', 'height', 'secure_url', 'display_name', 'folder'] })
      });
      const data = await response.json();
      if (!response.ok) return json({ error: data.error?.message || 'Cloudinary search failed.' }, response.status, corsOrigin);
      return json({ resources: data.resources || [], next_cursor: data.next_cursor || null }, 200, corsOrigin);
    } catch { return json({ error: 'Could not connect to Cloudinary.' }, 502, corsOrigin); }
  }
};

const BASE = 'https://staticimgly.com/@imgly/background-removal-data/1.7.0/dist';

export async function GET(req, { params }) {
  const path = (await params).path.join('/');
  const url = `${BASE}/${path}`;

  const headers = {};
  const range = req.headers.get('range');
  if (range) headers['Range'] = range;

  const response = await fetch(url, { headers });

  const resHeaders = {
    'Content-Type': response.headers.get('Content-Type') || 'application/octet-stream',
    'Cache-Control': 'public, max-age=31536000, immutable',
    'Access-Control-Allow-Origin': '*',
    'Accept-Ranges': 'bytes',
  };

  if (response.headers.has('Content-Range')) {
    resHeaders['Content-Range'] = response.headers.get('Content-Range');
  }
  if (response.headers.has('Content-Length')) {
    resHeaders['Content-Length'] = response.headers.get('Content-Length');
  }

  return new Response(response.body, {
    status: response.status,
    headers: resHeaders,
  });
}

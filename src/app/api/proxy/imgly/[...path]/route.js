const BASE = 'https://staticimgly.com/@imgly/background-removal-data/1.7.0/dist';

export async function GET(req, { params }) {
  const path = (await params).path.join('/');
  const url = `${BASE}/${path}`;
  const response = await fetch(url);
  return new Response(response.body, {
    status: response.status,
    headers: {
      'Content-Type': response.headers.get('Content-Type') || 'application/octet-stream',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

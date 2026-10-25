import { configuration, extractDonation, coordinateDonation, verifyConnection } from '../server/agent.mjs';

// Vercel keeps credentials in server-side environment variables.
export function createHandler(env = process.env) {
  return async function handler(req, res) {
    const send = (status, value) => {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.statusCode = status;
      res.end(JSON.stringify(value));
    };
    const config = () => ({ ...configuration(env), hosting: 'vercel' });
    const url = new URL(req.url, 'https://second-serving.invalid');
    const action = req.query?.action || url.searchParams.get('action') || url.pathname.split('/').pop();
    if (req.method === 'GET' && action === 'config') return send(200, config());
    if (req.method !== 'POST' || !['extract', 'coordinate', 'check'].includes(action)) return send(404, { error: 'Not found.' });
    let sameOrigin = true;
    if (req.headers.origin) {
      try { sameOrigin = new URL(req.headers.origin).host === req.headers.host; } catch { sameOrigin = false; }
    }
    if (req.headers['x-second-serving'] !== 'workspace' || !sameOrigin) return send(403, { error: 'Use the Second Serving website to run this action.' });
    try {
      let body = req.body;
      if (body === undefined) {
        let raw = '';
        for await (const chunk of req) {
          raw += chunk;
          if (Buffer.byteLength(raw) > 160000) return send(413, { error: 'This workspace is too large. Start a fresh practice.' });
        }
        body = raw || '{}';
      }
      if (Buffer.byteLength(typeof body === 'string' ? body : JSON.stringify(body)) > 160000) return send(413, { error: 'This workspace is too large. Start a fresh practice.' });
      if (typeof body === 'string') body = JSON.parse(body);
      if (!body || typeof body !== 'object' || Array.isArray(body)) return send(400, { error: 'A JSON object is required.' });
      const result = action === 'check' ? await verifyConnection(env) : action === 'extract' ? await extractDonation(env, body.message) : await coordinateDonation(env, body.state, body.donationId);
      return send(200, result);
    } catch (error) {
      return send(error.status || 400, { error: error instanceof SyntaxError ? 'The request must contain valid JSON.' : error.message || 'The agent action could not be completed.', code: error.code || null, configuration: config() });
    }
  };
}

export default createHandler();

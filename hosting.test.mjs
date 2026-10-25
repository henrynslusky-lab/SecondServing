import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from './api/agent.js';

async function request({ method = 'GET', action = 'config', headers = {}, body } = {}) {
  const req = { method, url: `/api/agent?action=${action}`, headers: { host: 'second-serving.vercel.app', ...headers }, body };
  const res = { headers: {}, setHeader(key, value) { this.headers[key] = value; }, end(value) { this.body = JSON.parse(value); } };
  await createHandler({ AI_PROVIDER: 'moonshot' })(req, res);
  return res;
}
test('hosted configuration works without credentials and cannot be cached', async () => {
  const res = await request();
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.hosting, 'vercel');
  assert.equal(res.body.configured, false);
  assert.equal(res.headers['Cache-Control'], 'no-store');
});
test('hosted AI actions reject another origin before calling a provider', async () => {
  const res = await request({ method: 'POST', action: 'extract', headers: { origin: 'https://another-site.example', 'x-second-serving': 'workspace' }, body: {} });
  assert.equal(res.statusCode, 403);
});
test('hosted API rejects oversized and malformed JSON and unsupported routes', async () => {
  const base = { method: 'POST', action: 'extract', headers: { 'x-second-serving': 'workspace' } };
  assert.equal((await request({ ...base, body: 'x'.repeat(160001) })).statusCode, 413);
  assert.equal((await request({ ...base, body: '{' })).statusCode, 400);
  assert.equal((await request({ ...base, body: [] })).statusCode, 400);
  assert.equal((await request({ action: 'missing' })).statusCode, 404);
});
test('same-origin hosted AI reports a missing server credential truthfully', async () => {
  const res = await request({ method: 'POST', action: 'check', headers: { origin: 'https://second-serving.vercel.app', 'x-second-serving': 'workspace' }, body: {} });
  assert.equal(res.statusCode, 503);
  assert.match(res.body.error, /not connected/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { execute } from '../src/server/db.js';

const env = {
  TURSO_MAIN_URL: 'libsql://demo-organization.turso.io',
  TURSO_MAIN_TOKEN: 'example-token-for-tests-only',
};
function result() {
  return Response.json({ results: [
    { type: 'ok', response: { result: { cols: [{name: 'online'}], rows: [[{type:'integer',value:'1'}]], affected_row_count: 0 } } },
    { type: 'ok', response: { type: 'close' } }
  ] });
}

test('execute connects through v3 pipeline', async () => {
  const old = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => { calls.push(url); return result(); };
  try {
    const data = await execute(env, 'main', 'SELECT 1 AS online');
    assert.equal(data.rows[0].online, 1);
    assert.equal(calls.length, 1);
    assert.ok(calls[0].endsWith('/v3/pipeline'));
  } finally { globalThis.fetch = old; }
});

test('execute falls back to v2 if v3 returns 404', async () => {
  const old = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(url);
    if (url.endsWith('/v3/pipeline')) return new Response('', {status: 404});
    return result();
  };
  try {
    const data = await execute(env, 'main', 'SELECT 1 AS online');
    assert.equal(data.rows[0].online, 1);
    assert.deepEqual(calls.map(u=>u.split('/').slice(-2).join('/')), ['v3/pipeline','v2/pipeline']);
  } finally { globalThis.fetch = old; }
});

test('execute reports 404 without leaking token', async () => {
  const old = globalThis.fetch;
  globalThis.fetch = async () => new Response('Not found', {status: 404});
  try {
    await assert.rejects(execute(env, 'main', 'SELECT 1'), (error) => {
      assert.match(error.message, /HTTP 404/);
      assert.doesNotMatch(error.message, /example-token-for-tests-only/);
      return true;
    });
  } finally { globalThis.fetch = old; }
});

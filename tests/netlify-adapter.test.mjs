import {test} from 'node:test';
import assert from 'node:assert/strict';
import fn,{config} from '../netlify/functions/api.mjs';

test('Function routing catches all API paths',()=>{
  assert.equal(config.path,'/api/*');
});
test('deprecated live channel is disabled in serverless',async()=>{
  const res=await fn(new Request('https://kennely.de/api/live'),{});
  assert.equal(res.status,410);
});
test('does not leak secret configuration when missing',async()=>{
  const res=await fn(new Request('https://kennely.de/api/me'),{geo:{country:{code:'DE'}}});
  assert.equal(res.status,503);
  const body=await res.json();
  assert.equal(typeof body.error,'string');
  assert.ok(!JSON.stringify(body).includes('TOKEN'));
});

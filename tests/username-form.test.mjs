import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {usernameReason} from '../src/server/content-policy.js';

test('registration and identity editing use the same case-insensitive input pattern', async () => {
 const script=await readFile(new URL('../public/social-app.js',import.meta.url),'utf8');
 const matcher=script.match(/const USERNAME_INPUT_PATTERN='([^']+)'/);
 assert.ok(matcher,'Shared username pattern is declared');
 assert.equal((script.match(/pattern="\$\{USERNAME_INPUT_PATTERN\}"/g)||[]).length,2);
 const valid=new RegExp(`^(?:${matcher[1]})$`);
 for (const value of ['MahBnk0071','mahbnk0071','Mahn_00712','X.foo_12345']) {
  assert.ok(valid.test(value),`${value} must be allowed in both forms`);
  assert.equal(usernameReason(value),'',`${value} must be accepted by backend`);
 }
 for (const value of ['MahBnk007','4MahBnk007','Mah Bnk 0071','Mah-Bnk0071']) {
  assert.ok(!valid.test(value),`${value} must be rejected by HTML validation`);
 }
 assert.match(script,/toLowerCase\(\)/,'Username is normalized on submit');
});

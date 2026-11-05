import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read = async path => readFile(new URL(path, import.meta.url), 'utf8');

test('Kennely 2027.11: mobile UI assets are loaded from public index', async () => {
  const html=await read('../public/index.html');
  assert.match(html,/ken11-responsive\.css\?v=2027\.11\.0/);
  assert.match(html,/social-app\.js\?v=2027\.11\.0/);
  assert.match(html,/id="mobileNav"/);
});

test('Kennely 2027.11: team users render identity separately from accessible actions', async () => {
  const js=await read('../public/social-app.js');
  const css=await read('../public/ken11-responsive.css');
  assert.match(js,/admin-user-result__identity/);
  assert.match(js,/admin-user-result__actions/);
  assert.match(js,/aria-live="polite"/);
  assert.match(css,/grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css,/max-width:\s*760px/);
});

test('Kennely 2027.11: create nav is visible without remote SVG and missing usernames are explicit', async () => {
  const js=await read('../public/social-app.js');
  assert.match(js,/create-nav-plus/);
  assert.match(js,/Benutzername nicht hinterlegt/);
  assert.doesNotMatch(js,/<small>@\$\{esc\(model\.me\?\.username\|\|''\)\}<\/small>/);
});

test('Kennely 2027.11: Netlify and Turso remain wired, without bundled real secrets', async () => {
  const config=await read('../netlify.toml');
  const adapter=await read('../netlify/functions/api.mjs');
  const ignore=await read('../.gitignore');
  assert.match(config,/publish = "public"/);
  assert.match(adapter,/TURSO_MAIN_URL/);
  assert.match(ignore,/\.dev\.vars/);
});

test('Kennely 2027.11: hidden toast never overlays mobile navigation', async () => {
  const css=await read('../public/ken11-responsive.css');
  assert.match(css,/#toast \{ pointer-events: none; visibility: hidden; opacity: 0; \}/);
  assert.match(css,/#toast\.show \{ visibility: visible; opacity: 1; \}/);
});

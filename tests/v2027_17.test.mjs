import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const get=async file=>readFile(new URL(file,import.meta.url),'utf8');
test('2027.17: gesperrter Nutzer wird direkt auf eigene Sperrseite geleitet',async()=>{
 const src=await get('../public/social-app.js');
 assert.match(src,/function mountUser\(u\)\{if\(u\?\.suspended\)\{mountSuspended\(u\);return;\}/);
 assert.match(src,/function mountSuspended\(u\)/);
 assert.match(src,/renderSuspended\(\)/);
 assert.match(src,/api\('\/account\/suspension'\)/);
 assert.match(src,/form\.id==='suspendedAppealForm'/);
 assert.match(src,/post\('\/account\/appeal',\{reason\}\)/);
 assert.match(src,/status==='open'/);
 assert.match(src,/suspendedAt/);
});
test('2027.17: Einspruch wird nicht in allgemeinen Einstellungen erzwungen',async()=>{
 const src=await get('../public/social-app.js');
 assert.match(src,/Dein Einspruch wurde eingereicht/);
 assert.match(src,/Dein Einspruch wurde abgelehnt/);
 assert.match(src,/Entscheidung überprüfen lassen/);
});
test('2027.17: Team kann Entsperrung und Einspruch mit Grund behandeln',async()=>{
 const src=await get('../public/social-app.js');
 for(const id of ['reinstateForm','suspensionReviewForm'])assert.match(src,new RegExp(id));
 assert.match(src,/post\('\/admin\/reinstate'/);
 assert.match(src,/post\('\/admin\/appeals\/review'/);
 assert.match(src,/Einspruch annehmen/);
});
test('2027.17: Entdecken ist Fotokachelansicht ohne Reel-Navigation',async()=>{
 const src=await get('../public/social-app.js');
 const css=await get('../public/ken17-ui.css');
 const html=await get('../public/index.html');
 assert.match(src,/function exploreCard\(p\)/);
 assert.match(src,/kn-discover-grid/);
 assert.match(css,/\.kn-discover-grid/);
 assert.match(html,/ken17-ui\.css\?v=2027\.18\.0/);
 assert.doesNotMatch(src,/\['reels','/);
});

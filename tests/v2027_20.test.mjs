import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=async file=>readFile(new URL(file,import.meta.url),'utf8');

test('2027.20: user profiles navigate without a full document reload',async()=>{
 const js=await source('../public/social-app.js');
 assert.match(js,/history\.pushState\(\{route:'profile',id\}/);
 assert.match(js,/kn-profile-loading/);
 assert.match(js,/model\.navRequestId/);
 assert.match(js,/window\.scrollTo\(\{top:0/);
});
test('2027.20: persistent heart and optimistic undo, follow and follower count',async()=>{
 const js=await source('../public/social-app.js');const css=await source('../public/ken20-ui.css');
 for(const part of ["b.dataset.like","b.dataset.follow","aria-pressed","Entfolgen","Angefragt","kn-private-request-notice","profile.followers"])assert.ok(js.includes(part),part);
 assert.match(css,/\[data-like\]\.active svg\.icon/);
 assert.match(css,/\[data-follow\]\.kn-unfollow/);
 assert.match(js,/oldValue\+\(liked===before\?0:liked\?1:-1\)/);
});
test('2027.20: follower list pages are bounded and privacy stays protected',async()=>{
 const src=await source('../src/server/social.js');const js=await source('../public/social-app.js');
 assert.match(src,/LIMIT 61 OFFSET \?/);
 assert.match(src,/peoplePlus\.slice\(0,60\)/);
 assert.match(src,/if\(policy\?\.visibility==='only_me'/);
 assert.match(js,/data-follow-more/);
 assert.match(js,/kn-follow-modal/);
});
test('2027.20: saved/activity are compact galleries with post-detail click',async()=>{
 const src=await source('../public/social-app.js'),css=await source('../public/ken20-ui.css');
 assert.match(src,/kn-collection-grid/);
 assert.match(src,/r\.posts\.map\(exploreCard\)/);
 assert.match(src,/res\.posts\.map\(exploreCard\)/);
 assert.match(css,/grid-template-columns:repeat\(4/);
 assert.match(css,/body\[data-view=saved\] \.right-rail/);
});
test('2027.20: story text can be moved, image zoomed, zoom metadata validated server side',async()=>{
 const src=await source('../public/social-app.js'),social=await source('../src/server/social.js');
 for(const part of ['pointerdown','pointermove','imageZoom','attachStoryDragging','storyImageZoom','setPointerCapture','textX','textY'])assert.ok(src.includes(part),part);
 assert.match(social,/style\.zoom=n\(raw\.zoom,100,200,100\)/);
 assert.ok(!src.includes('AudioContext'));
});

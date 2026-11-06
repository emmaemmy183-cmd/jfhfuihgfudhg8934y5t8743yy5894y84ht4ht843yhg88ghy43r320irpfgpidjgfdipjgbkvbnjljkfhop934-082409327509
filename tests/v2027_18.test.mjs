import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=async p=>readFile(new URL(p,import.meta.url),'utf8');
test('2027.18: comment editor is multiline, with emoji bar and answer semantics',async()=>{
 const src=await read('../public/social-app.js');
 const css=await read('../public/ken18-ui.css');
 assert.match(src,/id="knCommentText" name="body" maxlength="500" rows="2"/);
 assert.match(src,/data-comment-emoji/);
 assert.match(src,/dataset.commentReply/);
 assert.match(src,/commentForm.*kn-comment-composer/);
 assert.match(css,/\.kn-comment-composer textarea\{/);
 assert.match(css,/\.kn-comment-composer textarea:focus/);
 assert.match(css,/#modal:has\(\.comment-dialog\)/);
 assert.doesNotMatch(src, /comment-compose"><input type="hidden"/);
});
test('2027.18: desktop post viewer, mobile separate layout and full photo containment',async()=>{
 const src=await read('../public/social-app.js');
 const css=await read('../public/ken18-ui.css');
 assert.match(src,/async function openPost\(id\)/);
 assert.match(src,/kn-post-detail/);
 assert.match(src,/kn-detail-media/);
 assert.match(src,/kn-detail-scroll/);
 assert.match(css,/grid-template-columns:minmax\(0,1\.45fr\) minmax\(310px,\.9fr\)/);
 assert.match(css,/@media\(max-width:760px\)/);
 assert.match(css,/\.kn-detail-media img\{max-height:63dvh/);
});
test('2027.18: emoji outside message and optimistic toggle driven by API response',async()=>{
 const src=await read('../public/social-app.js');
 const css=await read('../public/ken18-ui.css');
 assert.match(src,/kn-bubble-stack/);
 assert.match(src,/kn-message-reactions/);
 assert.match(css,/\.kn-message-reactions\{[^}]*position:absolute/);
 assert.match(src,/message\.reactions=mine\?\.emoji===emoji\?others/);
 assert.match(src,/message\.reactions=result\.emoji\?/);
 assert.match(src,/model\.reactionPending\.has\(id\)/);
 assert.match(src,/model\.messageCache=new Map\(data\.messages/);
});
test('2027.18: profile, messages and settings use separate desktop layout',async()=>{
 const css=await read('../public/ken18-ui.css');
 const src=await read('../public/social-app.js');
 const html=await read('../public/index.html');
 assert.match(src,/document\.body\.dataset\.view=route/);
 assert.match(css,/body\[data-view=profile\] \.content/);
 assert.match(css,/body\[data-view=messages\] \.content/);
 assert.match(css,/body\[data-view=settings\] \.content/);
 assert.match(html,/ken18-ui\.css\?v=2027\.(?:19|20)\.0/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import worker from '../src/server/index.js';

function createFakeTurso() {
  const main=new DatabaseSync(':memory:');const media=new DatabaseSync(':memory:');
  return Promise.all([
    readFile(new URL('../db/main.sql',import.meta.url),'utf8'),
    readFile(new URL('../db/media.sql',import.meta.url),'utf8'),readFile(new URL('../db/social.sql',import.meta.url),'utf8'),readFile(new URL('../db/deutschland.sql',import.meta.url),'utf8'),readFile(new URL('../db/2027_9.sql',import.meta.url),'utf8'),readFile(new URL('../db/2027_10.sql',import.meta.url),'utf8'),readFile(new URL('../db/2027_19.sql',import.meta.url),'utf8')
  ]).then(([a,b,c,d,e,f,g])=>{
    main.exec(a);media.exec(b);main.exec(c);main.exec(d);main.exec(e);main.exec(f);main.exec(g);
    const env={TURSO_MAIN_URL:'libsql://main.test',TURSO_MAIN_TOKEN:'token-main',TURSO_MEDIA_URL:'libsql://media.test',TURSO_MEDIA_TOKEN:'token-media',BETA_ACCESS_CODE:'an-example-private-beta-code',REGISTRATION_MODE:'local',LEGACY_DATING_ENABLED:'false',IP_HASH_SECRET:'long-random-abuse-salt-secret',ASSETS:{fetch:()=>new Response('static')}};
    const fakeFetch=async(url, init)=>{
      const database=String(url).includes('main.test')?main:media;
      const body=JSON.parse(init.body);
      const results=[];
      for(const req of body.requests){
        if(req.type==='close'){results.push({type:'ok',response:{type:'close'}});continue;}
        try{
          const stmt=database.prepare(req.stmt.sql);
          const args=(req.stmt.args||[]).map(arg=>arg.type==='null'?null:arg.type==='integer'?Number(arg.value):arg.type==='float'?Number(arg.value):arg.type==='blob'?Buffer.from(arg.base64,'base64'):arg.value);
          const isQuery=/^(SELECT|WITH|PRAGMA)/i.test(req.stmt.sql.trim());
          const rows=isQuery?stmt.all(...args):[];
          const change=isQuery?{changes:0}:stmt.run(...args);
          const cols=rows.length?Object.keys(rows[0]).map(name=>({name,decltype:null})):[];
          const encode=v=>v===null?{type:'null'}:typeof v==='number'?{type:'integer',value:String(v)}:v instanceof Uint8Array?{type:'blob',base64:Buffer.from(v).toString('base64')}:{type:'text',value:String(v)};
          results.push({type:'ok',response:{type:'execute',result:{cols,rows:rows.map(row=>Object.values(row).map(encode)),affected_row_count:change.changes,last_insert_rowid:null}}});
        } catch(err){results.push({type:'error',error:{message:err.message}});}
      }
      return new Response(JSON.stringify({baton:null,base_url:null,results}),{status:200,headers:{'Content-Type':'application/json'}});
    };
    return {env,main,media,fakeFetch};
  });
}
function call(env, route, method='GET', data=null, cookie=null, mime='application/json'){
 const headers={'Origin':'http://127.0.0.1:8787','CF-Connecting-IP':'127.0.0.11'};
 if(data!==null)headers['Content-Type']=mime;
 if(cookie)headers.Cookie=cookie;
 const body=method==='GET'?undefined:(data===null?undefined: data instanceof Uint8Array?data:JSON.stringify(data));
 return worker.fetch(new Request('http://127.0.0.1:8787/api'+route,{method,headers,body}),env);
}
const register=(name,email,birthDate='2000-01-01')=>({name,username:email.split('@')[0].replace(/[^a-z0-9._]/g,'').padEnd(10,'x'),email,password:'Some-very-good-password-123!',birthDate,gender:'divers',city:'Köln',adult:true,terms:true,});





test('2027.19: Story layout metadata and explicit repost permission',async()=>{
 const {env,fakeFetch,main,media}=await createFakeTurso(),old=globalThis.fetch;globalThis.fetch=fakeFetch;
 try {
  const a=await call(env,'/auth/register','POST',register('Ersteller','storiesowner@local.test'));assert.equal(a.status,201);const ca=a.headers.get('set-cookie').split(';')[0];
  const b=await call(env,'/auth/register','POST',register('Freund','storiesfriend@local.test'));const cb=b.headers.get('set-cookie').split(';')[0];
  let r=await call(env,'/account/privacy/preferences','GET',null,ca);assert.equal((await r.json()).privacy.allowStoryReposts,false);
  r=await call(env,'/account/privacy/preferences','PATCH',{allowStoryReposts:true},ca);assert.equal(r.status,200);
  r=await call(env,'/account/privacy/preferences','PATCH',{allowStoryReposts:'yes'},ca);assert.equal(r.status,400);
  r=await call(env,'/social/stories','POST',{body:'Eine Story',style:{x:27,y:60,size:32,color:'#ffeeaa',align:'left'}},ca);assert.equal(r.status,201,await r.clone().text());const id=(await r.json()).id;
  let ownStories=await call(env,'/social/stories','GET',null,ca);assert.equal(ownStories.status,200);assert.equal((await ownStories.json()).stories.find(x=>x.id===id).moderationStatus,'pending');
  let strangerStories=await call(env,'/social/stories','GET',null,cb);assert.equal(strangerStories.status,200);assert.equal((await strangerStories.json()).stories.some(x=>x.id===id),false);
  const persisted=main.prepare('SELECT story_style AS style FROM social_stories WHERE id=?').get(id);assert.deepEqual(JSON.parse(persisted.style),{x:27,y:60,size:32,color:'#ffeeaa',align:'left'});
  main.prepare("UPDATE content_reviews SET status='approved' WHERE content_type='story' AND content_id=?").run(id);
  r=await call(env,'/social/stories','GET',null,cb);assert.equal(r.status,200);const story=(await r.json()).stories.find(x=>x.id===id);assert.equal(story.allowStoryReposts,1);assert.deepEqual(JSON.parse(story.storyStyle),JSON.parse(persisted.style));
  r=await call(env,'/social/stories/'+id+'/repost','POST',{body:'Tolles Bild'},cb);assert.equal(r.status,201);
  r=await call(env,'/account/privacy/preferences','PATCH',{allowStoryReposts:false},ca);assert.equal(r.status,200);
  r=await call(env,'/social/stories/'+id+'/repost','POST',{body:'Neu'},cb);assert.equal(r.status,403);
  r=await call(env,'/social/stories/'+id,'DELETE',null,ca);assert.equal(r.status,200);
  assert.equal(main.prepare('SELECT expires_at<=CURRENT_TIMESTAMP AS removed FROM social_stories WHERE id=?').get(id).removed,1);
 }finally{globalThis.fetch=old;main.close();media.close()}
});

test('2027.19: private profile requires justified, permissioned, audited temporary review',async()=>{
 const {env,fakeFetch,main,media}=await createFakeTurso(),old=globalThis.fetch;globalThis.fetch=fakeFetch;
 try{
  const a=await call(env,'/auth/register','POST',register('Privat','secrettest@local.test'));const ca=a.headers.get('set-cookie').split(';')[0];const owner=(await(await call(env,'/me','GET',null,ca)).json()).user;
  const b=await call(env,'/auth/register','POST',register('Team','reviewstaff@local.test'));const cb=b.headers.get('set-cookie').split(';')[0];const reviewer=(await(await call(env,'/me','GET',null,cb)).json()).user;
  const c=await call(env,'/auth/register','POST',register('Dritte','reviewother@local.test'));const cc=c.headers.get('set-cookie').split(';')[0];
  main.prepare("INSERT INTO team_members(user_id,role) VALUES(?,'moderator')").run(reviewer.id);
  let r=await call(env,'/account/privacy/preferences','PATCH',{isPrivate:true},ca);assert.equal(r.status,200);
  r=await call(env,'/social/posts','POST',{caption:'Nur mein Privatprofil'},ca);assert.equal(r.status,201);const postId=(await r.json()).id;
  main.prepare("UPDATE content_reviews SET status='approved' WHERE content_type='post' AND content_id=?").run(postId);
  r=await call(env,'/social/profiles/'+owner.id,'GET',null,cb);assert.equal((await r.json()).profile.posts.length,0);
  r=await call(env,'/social/admin/private-access','POST',{userId:owner.id,reason:'Prüfung einer Meldung zu privaten Beiträgen'},cc);assert.equal(r.status,403);
  r=await call(env,'/social/admin/private-access','POST',{userId:owner.id,reason:'kurz'},cb);assert.equal(r.status,400);
  r=await call(env,'/social/admin/private-access','POST',{userId:owner.id,reason:'Prüfung einer Meldung zu privaten Beiträgen'},cb);assert.equal(r.status,200,await r.text());
  assert.equal(main.prepare('SELECT COUNT(*) AS n FROM admin_audit WHERE action=? AND actor_id=?').get('private_profile_moderation_access',reviewer.id).n,1);
  r=await call(env,'/social/profiles/'+owner.id,'GET',null,cb);const profile=(await r.json()).profile;assert.equal(profile.posts.length,1);assert.equal(profile.reviewAccess,true);
  r=await call(env,'/social/posts/'+postId,'GET',null,cb);assert.equal(r.status,200);
  r=await call(env,'/social/posts/'+postId,'GET',null,cc);assert.equal(r.status,403);
  main.prepare("UPDATE staff_private_review_access SET expires_at=datetime('now','-1 minute') WHERE actor_id=?").run(reviewer.id);
  r=await call(env,'/social/profiles/'+owner.id,'GET',null,cb);assert.equal((await r.json()).profile.posts.length,0);
 }finally{globalThis.fetch=old;main.close();media.close()}
});

test('2027.19: only owner or authorized staff can remove stories, staff removal is audited',async()=>{
 const {env,fakeFetch,main,media}=await createFakeTurso(),old=globalThis.fetch;globalThis.fetch=fakeFetch;
 try{
  const a=await call(env,'/auth/register','POST',register('Ersteller','deletemystory@local.test'));const ca=a.headers.get('set-cookie').split(';')[0];
  const b=await call(env,'/auth/register','POST',register('Moderation','removestory@local.test'));const cb=b.headers.get('set-cookie').split(';')[0];const ub=(await(await call(env,'/me','GET',null,cb)).json()).user;
  const c=await call(env,'/auth/register','POST',register('Normal','notstaffstory@local.test'));const cc=c.headers.get('set-cookie').split(';')[0];
  let r=await call(env,'/social/stories','POST',{body:'Beitrag zur Prüfung'},ca);assert.equal(r.status,201);const id=(await r.json()).id;
  r=await call(env,'/social/stories/'+id,'DELETE',{reason:'test'},cc);assert.equal(r.status,403);
  main.prepare("INSERT INTO team_members(user_id,role) VALUES(?,'moderator')").run(ub.id);
  r=await call(env,'/social/stories/'+id,'DELETE',{reason:'test'},cb);assert.equal(r.status,400);
  r=await call(env,'/social/stories/'+id,'DELETE',{reason:'Verstoß nach Meldungsprüfung'},cb);assert.equal(r.status,200,await r.text());
  assert.equal(main.prepare("SELECT COUNT(*) AS n FROM admin_audit WHERE action='story_removed_by_staff'").get().n,1);
 }finally{globalThis.fetch=old;main.close();media.close()}
});

test('2027.19: responsive story composer and posts only, no reels',async()=>{
 const src=await readFile(new URL('../public/social-app.js',import.meta.url),'utf8'),css=await readFile(new URL('../public/ken19-ui.css',import.meta.url),'utf8');
 for(const text of ['kn-story-canvas','knStoryOverlay','knMentionSuggestions','allowStoryReposts','data-review-private','data-story-delete','kn-settings-layout','knSuggestedList'])assert.ok(src.includes(text),text);
 for(const text of ['.kn-story-editor','@media(max-width:760px)','.kn-settings-side','.kn-rail-profile'])assert.ok(css.includes(text));
 assert.ok(!src.includes("['reels','"));
});

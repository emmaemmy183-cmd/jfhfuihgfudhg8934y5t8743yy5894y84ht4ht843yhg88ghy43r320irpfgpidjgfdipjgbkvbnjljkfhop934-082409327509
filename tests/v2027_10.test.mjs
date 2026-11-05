import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import worker from '../src/server/index.js';

function createFakeTurso() {
  const main=new DatabaseSync(':memory:');const media=new DatabaseSync(':memory:');
  return Promise.all([
    readFile(new URL('../db/main.sql',import.meta.url),'utf8'),
    readFile(new URL('../db/media.sql',import.meta.url),'utf8'),readFile(new URL('../db/social.sql',import.meta.url),'utf8'),readFile(new URL('../db/deutschland.sql',import.meta.url),'utf8'),readFile(new URL('../db/2027_9.sql',import.meta.url),'utf8'),readFile(new URL('../db/2027_10.sql',import.meta.url),'utf8')
  ]).then(([a,b,c,d,e,f])=>{
    main.exec(a);media.exec(b);main.exec(c);main.exec(d);main.exec(e);main.exec(f);
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



import {usernameReason,evaluateText} from '../src/server/content-policy.js';

test('Profilidentität: 30 Tage Username und 7 Tage Anzeigename, auch für Team',async()=>{
 const {env,fakeFetch,main,media}=await createFakeTurso(),old=globalThis.fetch;globalThis.fetch=fakeFetch;
 try{
  const r=await call(env,'/auth/register','POST',register('','identityname@local.test'));
  const cookie=r.headers.get('set-cookie').split(';')[0];const id=(await(await call(env,'/me','GET',null,cookie)).json()).user.id;
  main.prepare("INSERT INTO team_members(user_id,role) VALUES(?,'moderator')").run(id);
  let x=await call(env,'/account/identity','PATCH',{username:'username202710'},cookie);assert.equal(x.status,200,await x.text());
  x=await call(env,'/account/identity','PATCH',{username:'username202711'},cookie);assert.equal(x.status,429);
  x=await call(env,'/account/identity','PATCH',{name:'Mein Name'},cookie);assert.equal(x.status,200);
  x=await call(env,'/account/identity','PATCH',{name:'Noch ein Name'},cookie);assert.equal(x.status,429);
  x=await call(env,'/admin/identity','POST',{userId:id,username:'username202712'},cookie);assert.equal(x.status,400);
  x=await call(env,'/admin/labels','POST',{userId:id,label:'Mitarbeiter',color:'blue',action:'add'},cookie);assert.equal(x.status,200);
  const me=await(await call(env,'/me','GET',null,cookie)).json();assert.equal(me.user.username,'username202710');
 }finally{globalThis.fetch=old;main.close();media.close();}
});
test('Privatsphäre: Chat-Anfragen und Follower-Liste sind serverseitig geschützt',async()=>{
 const {env,fakeFetch,main,media}=await createFakeTurso(),old=globalThis.fetch;globalThis.fetch=fakeFetch;
 try{
  const a=await call(env,'/auth/register','POST',register('Owner','privone@local.test'));const ca=a.headers.get('set-cookie').split(';')[0];const ua=(await(await call(env,'/me','GET',null,ca)).json()).user;
  const b=await call(env,'/auth/register','POST',register('Peer','privtwo@local.test'));const cb=b.headers.get('set-cookie').split(';')[0];const ub=(await(await call(env,'/me','GET',null,cb)).json()).user;
  let x=await call(env,'/account/privacy/preferences','PATCH',{isPrivate:true,messagePolicy:'nobody',followVisibility:'only_me'},ca);assert.equal(x.status,200);
  x=await call(env,'/social/dm/open','POST',{userId:ua.id},cb);assert.equal(x.status,403);
  x=await call(env,`/social/profiles/${ua.id}/followers`,'GET',null,cb);assert.equal(x.status,403);
  x=await call(env,`/social/profiles/${ua.id}/followers`,'GET',null,ca);assert.equal(x.status,200);
  main.prepare("INSERT INTO team_members(user_id,role) VALUES(?,'moderator')").run(ub.id);
  x=await call(env,'/social/dm/open','POST',{userId:ua.id},cb);assert.equal(x.status,200); // staff request, still not bypass blocks
  x=await call(env,'/block','POST',{targetId:ua.id},cb);assert.equal(x.status,200);
  x=await call(env,'/social/dm/open','POST',{userId:ua.id},cb);assert.equal(x.status,403);
 }finally{globalThis.fetch=old;main.close();media.close();}
});
test('Kommentar-Thread: Antworten, Like und Löschung durch Postersteller',async()=>{
 const {env,fakeFetch,main,media}=await createFakeTurso(),old=globalThis.fetch;globalThis.fetch=fakeFetch;
 try{
  const a=await call(env,'/auth/register','POST',register('Creator','commentowner@local.test'));const ca=a.headers.get('set-cookie').split(';')[0];const ua=(await(await call(env,'/me','GET',null,ca)).json()).user;
  const b=await call(env,'/auth/register','POST',register('Friend','commentother@local.test'));const cb=b.headers.get('set-cookie').split(';')[0];
  let x=await call(env,'/social/posts','POST',{caption:'Hallo Welt'},ca);assert.equal(x.status,201);const pid=(await x.json()).id;
  main.prepare("UPDATE content_reviews SET status='approved' WHERE content_type='post' AND content_id=?").run(pid);
  x=await call(env,`/social/posts/${pid}/comments`,'POST',{body:'Hallo'},cb);assert.equal(x.status,201);
  let c=main.prepare('SELECT id FROM social_comments ORDER BY created_at LIMIT 1').get().id;
  main.prepare("UPDATE content_reviews SET status='approved' WHERE content_type='comment' AND content_id=?").run(c);
  x=await call(env,`/social/posts/${pid}/comments`,'POST',{body:'Danke, hier ist meine Antwort',parentId:c},ca);assert.equal(x.status,201);
  let c2=main.prepare('SELECT id FROM social_comments WHERE parent_id=?').get(c).id;
  main.prepare("UPDATE content_reviews SET status='approved' WHERE content_type='comment' AND content_id=?").run(c2);
  x=await call(env,`/social/posts/${pid}/comments`,'GET',null,cb);const comments=(await x.json()).comments;
  assert.equal(comments.length,2);assert.equal(comments.find(x=>x.id===c2).parentId,c);
  x=await call(env,`/social/comments/${c}/like`,'POST',{},ca);assert.equal(x.status,200);assert.equal((await x.json()).liked,true);
  x=await call(env,`/social/comments/${c}`,'DELETE',null,ca);assert.equal(x.status,200);
  x=await call(env,`/social/posts/${pid}/comments`,'GET',null,cb);assert.equal((await x.json()).comments.length,1);
 }finally{globalThis.fetch=old;main.close();media.close();}
});
test('Chat: Emoji-Reaktion nur für Gesprächsteilnehmer',async()=>{
 const {env,fakeFetch,main,media}=await createFakeTurso(),old=globalThis.fetch;globalThis.fetch=fakeFetch;
 try{
  const a=await call(env,'/auth/register','POST',register('Creator','reactalpha@local.test'));const ca=a.headers.get('set-cookie').split(';')[0];const ua=(await(await call(env,'/me','GET',null,ca)).json()).user;
  const b=await call(env,'/auth/register','POST',register('Friend','reactbravo@local.test'));const cb=b.headers.get('set-cookie').split(';')[0];const ub=(await(await call(env,'/me','GET',null,cb)).json()).user;
  const c=await call(env,'/auth/register','POST',register('Other','reactcharlie@local.test'));const cc=c.headers.get('set-cookie').split(';')[0];
  let x=await call(env,'/social/dm/open','POST',{userId:ub.id},ca);assert.equal(x.status,200);const tid=(await x.json()).id;
  x=await call(env,'/social/dm/'+encodeURIComponent(tid)+'/send','POST',{body:'Hallo!'},ca);assert.equal(x.status,201);
  const mid=main.prepare('SELECT id FROM social_dms WHERE thread_id=?').get(tid).id;
  x=await call(env,'/social/dm/'+encodeURIComponent(tid)+'/messages/'+mid+'/react','POST',{emoji:'❤️'},cb);assert.equal(x.status,200);
  x=await call(env,'/social/dm/'+encodeURIComponent(tid),'GET',null,ca);assert.equal((await x.json()).messages[0].reactions[0].emoji,'❤️');
  x=await call(env,'/social/dm/'+encodeURIComponent(tid)+'/messages/'+mid+'/react','POST',{emoji:'😂'},cc);assert.equal(x.status,404);
 }finally{globalThis.fetch=old;main.close();media.close();}
});
test('Wortfilter enthält rassistische Beleidigung und prüft Aussagen, nicht automatisch löschen',async()=>{
 const {evaluateText,usernameReason} = await import('../src/server/content-policy.js');
 assert.equal(evaluateText('n1gger').review,true);
 assert.ok(usernameReason('niggerkrefeld'));
});

test('2027.12: diverse Registrierung, Kommentarschutz, Auffindbarkeit und Beitrags-Detail-API',async()=>{
 const {env,fakeFetch,main,media}=await createFakeTurso(),old=globalThis.fetch;globalThis.fetch=fakeFetch;
 try{
  const ar=await call(env,'/auth/register','POST',{...register('','newinclusion@local.test'),gender:'sonstiges'});
  assert.equal(ar.status,201,await ar.text());
  const ca=ar.headers.get('set-cookie').split(';')[0];const ua=(await(await call(env,'/me','GET',null,ca)).json()).user;
  const br=await call(env,'/auth/register','POST',register('Friend','privacyviewer@local.test'));
  const cb=br.headers.get('set-cookie').split(';')[0];
  let r=await call(env,'/social/posts','POST',{caption:'Hier ist mein öffentlicher Beitrag'},ca);
  assert.equal(r.status,201);const pid=(await r.json()).id;
  main.prepare("UPDATE content_reviews SET status='approved' WHERE content_type='post' AND content_id=?").run(pid);
  r=await call(env,`/social/posts/${pid}`,'GET',null,cb);
  assert.equal(r.status,200);assert.equal((await r.json()).post.id,pid);
  r=await call(env,'/members/search?q=newinclusion','GET',null,cb);
  assert.equal(r.status,200);assert.equal((await r.json()).profiles.some(p=>p.id===ua.id),true);
  r=await call(env,'/account/privacy/preferences','PATCH',{commentPolicy:'nobody',discoverable:false},ca);
  assert.equal(r.status,200,await r.text());
  const settings=await(await call(env,'/account/privacy/preferences','GET',null,ca)).json();
  assert.equal(settings.privacy.commentPolicy,'nobody');assert.equal(settings.privacy.discoverable,false);
  r=await call(env,'/members/search?q=newinclusion','GET',null,cb);
  assert.equal((await r.json()).profiles.some(p=>p.id===ua.id),false);
  r=await call(env,`/social/posts/${pid}/comments`,'POST',{body:'Ein Kommentar'},cb);
  assert.equal(r.status,403,await r.text());
  r=await call(env,`/social/posts/${pid}/comments`,'POST',{body:'Meine eigene Notiz'},ca);
  assert.equal(r.status,201,await r.text());
  r=await call(env,'/account/privacy/preferences','PATCH',{commentPolicy:'followers'},ca);
  assert.equal(r.status,200);
  r=await call(env,`/social/posts/${pid}/comments`,'POST',{body:'Noch ein Kommentar'},cb);
  assert.equal(r.status,403);
  r=await call(env,'/social/follow','POST',{userId:ua.id},cb);
  assert.equal(r.status,200);assert.equal((await r.json()).following,true);
  r=await call(env,`/social/posts/${pid}/comments`,'POST',{body:'Nach dem Folgen erlaubt'},cb);
  assert.equal(r.status,201,await r.text());
  r=await call(env,'/account/privacy/preferences','PATCH',{commentPolicy:'invalid'},ca);
  assert.equal(r.status,400);
 }finally{globalThis.fetch=old;main.close();media.close();}
});

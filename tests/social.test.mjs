import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import worker from '../src/server/index.js';

function createFakeTurso() {
  const main=new DatabaseSync(':memory:');const media=new DatabaseSync(':memory:');
  return Promise.all([
    readFile(new URL('../db/main.sql',import.meta.url),'utf8'),
    readFile(new URL('../db/media.sql',import.meta.url),'utf8'),readFile(new URL('../db/social.sql',import.meta.url),'utf8'),readFile(new URL('../db/deutschland.sql',import.meta.url),'utf8')
  ]).then(([a,b,c,d])=>{
    main.exec(a);media.exec(b);main.exec(c);main.exec(d);
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
          if(!isQuery)stmt.run(...args);
          const cols=rows.length?Object.keys(rows[0]).map(name=>({name,decltype:null})):[];
          const encode=v=>v===null?{type:'null'}:typeof v==='number'?{type:'integer',value:String(v)}:v instanceof Uint8Array?{type:'blob',base64:Buffer.from(v).toString('base64')}:{type:'text',value:String(v)};
          results.push({type:'ok',response:{type:'execute',result:{cols,rows:rows.map(row=>Object.values(row).map(encode)),affected_row_count:0,last_insert_rowid:null}}});
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
const register=(name,email,birthDate='2000-01-01')=>({name,username:email.split('@')[0].replace(/[^a-z0-9._]/g,'').padEnd(5,'x'),email,password:'Some-very-good-password-123!',birthDate,gender:'divers',city:'Köln',adult:true,terms:true,});


test('social feed, following, likes, comments, official flag and deletion',async()=>{
 const {env,fakeFetch,main,media}=await createFakeTurso();const before=globalThis.fetch;globalThis.fetch=fakeFetch;
 try{
  const a=await call(env,'/auth/register','POST',register('Annie','annie@test.local'));
  const ca=a.headers.get('set-cookie').split(';')[0];const aa=(await(await call(env,'/me','GET',null,ca)).json()).user;
  const b=await call(env,'/auth/register','POST',register('Bobby','bobby@test.local'));
  const cb=b.headers.get('set-cookie').split(';')[0];const bb=(await(await call(env,'/me','GET',null,cb)).json()).user;
  let r=await call(env,'/social/posts','POST',{caption:'First from Annie',visibility:'public'},ca);
  assert.equal(r.status,201);const pid=(await r.json()).id;
  r=await call(env,'/social/feed','GET',null,cb);const feed=(await r.json()).posts;
  assert.equal(feed.length,0); // Team muss Text zuerst freigeben.
  main.prepare("UPDATE content_reviews SET status='approved' WHERE content_type='post' AND content_id=?").run(pid);
  const approved=(await(await call(env,'/social/feed','GET',null,cb)).json()).posts;
  assert.equal(approved.length,1);
  feed.splice(0,0,...approved);assert.equal(feed[0].caption,'First from Annie');assert.equal(feed[0].id,pid);assert.equal(feed[0].userId,aa.id);
  r=await call(env,'/social/follow','POST',{userId:aa.id},cb);assert.equal((await r.json()).following,true);
  r=await call(env,'/social/posts/'+pid+'/like','POST',{},cb);assert.equal((await r.json()).active,true);
  r=await call(env,'/social/posts/'+pid+'/comments','POST',{body:'Amazing!'},cb);assert.equal(r.status,201);
  r=await call(env,'/social/posts/'+pid+'/comments','GET',null,ca);assert.equal((await r.json()).comments.length,0);
  main.prepare("UPDATE content_reviews SET status='approved' WHERE content_type='comment'").run();
  r=await call(env,'/social/posts/'+pid+'/comments','GET',null,ca);assert.equal((await r.json()).comments[0].body,'Amazing!');
  r=await call(env,'/social/profiles/'+aa.id,'GET',null,cb);assert.equal((await r.json()).profile.followers,1);
  main.prepare('INSERT INTO official_accounts(user_id,label) VALUES(?,?)').run(aa.id,'Official Kennely');
  r=await call(env,'/social/official','GET',null,cb);assert.equal((await r.json()).posts.length,1);
  r=await call(env,'/social/posts/'+pid,'DELETE',null,ca);assert.equal(r.status,200);
  r=await call(env,'/social/feed','GET',null,cb);assert.equal((await r.json()).posts.length,0);
 }finally{globalThis.fetch=before;main.close();media.close();}
});
test('new social photos require staff approval; nonstaff cannot inspect pending media',async()=>{
 const {env,fakeFetch,main,media}=await createFakeTurso();const before=globalThis.fetch;globalThis.fetch=fakeFetch;
 try{
  const a=await call(env,'/auth/register','POST',register('Owner','owner@test.local'));const ca=a.headers.get('set-cookie').split(';')[0];const ua=(await(await call(env,'/me','GET',null,ca)).json()).user;
  const b=await call(env,'/auth/register','POST',register('Viewer','viewer@test.local'));const cb=b.headers.get('set-cookie').split(';')[0];
  main.prepare('INSERT INTO team_members(user_id,role) VALUES(?,?)').run(ua.id,'owner');
  const file=Uint8Array.from([255,216,255,...Array(120).fill(22)]);
  let r=await call(env,'/social/media?kind=post','POST',file,ca,'image/jpeg');assert.equal(r.status,201);const mediaId=(await r.json()).id;
  r=await call(env,'/social/posts','POST',{caption:'Test photo',mediaId},ca);assert.equal(r.status,201);
  r=await call(env,'/social/feed','GET',null,cb);assert.equal((await r.json()).posts.length,0);
  r=await call(env,'/social/media/'+mediaId,'GET',null,cb);assert.equal(r.status,404);
  r=await call(env,'/social/admin/queue','GET',null,cb);assert.equal(r.status,403);
  r=await call(env,'/social/admin/queue','GET',null,ca);assert.equal((await r.json()).media.length,1);
  r=await call(env,'/social/admin/review','POST',{mediaId,status:'approved'},ca);assert.equal(r.status,200);
  r=await call(env,'/social/feed','GET',null,cb);assert.equal((await r.json()).posts.length,1);
  r=await call(env,'/social/media/'+mediaId,'GET',null,cb);assert.equal(r.status,200);
 }finally{globalThis.fetch=before;main.close();media.close();}
});
test('social message requests require acceptance and follow blocking works',async()=>{
 const {env,fakeFetch,main,media}=await createFakeTurso();const before=globalThis.fetch;globalThis.fetch=fakeFetch;
 try{
  const a=await call(env,'/auth/register','POST',register('Annie','annie@local.test'));const ca=a.headers.get('set-cookie').split(';')[0];const ua=(await(await call(env,'/me','GET',null,ca)).json()).user;
  const b=await call(env,'/auth/register','POST',register('Bobby','bobby@local.test'));const cb=b.headers.get('set-cookie').split(';')[0];const ub=(await(await call(env,'/me','GET',null,cb)).json()).user;
  let r=await call(env,'/social/dm/open','POST',{userId:ub.id},ca);assert.equal(r.status,200);const id=(await r.json()).id;
  r=await call(env,'/social/dm/'+encodeURIComponent(id)+'/send','POST',{body:'Hello!'},ca);assert.equal(r.status,201);
  r=await call(env,'/social/dm/'+encodeURIComponent(id)+'/send','POST',{body:'Second unaccepted message'},ca);assert.equal(r.status,403);
  r=await call(env,'/social/dm/'+encodeURIComponent(id)+'/accept','POST',{},cb);assert.equal(r.status,200);
  r=await call(env,'/social/dm/'+encodeURIComponent(id)+'/send','POST',{body:'Hi Annie'},cb);assert.equal(r.status,201);
  r=await call(env,'/social/dm/'+encodeURIComponent(id),'GET',null,ca);assert.equal((await r.json()).messages.length,2);
  r=await call(env,'/block','POST',{targetId:ub.id},ca);assert.equal(r.status,200);
  r=await call(env,'/social/dm/'+encodeURIComponent(id),'GET',null,ca);assert.equal(r.status,200);assert.equal((await r.json()).blocked,true);
 }finally{globalThis.fetch=before;main.close();media.close();}
});

test('Neue Texte bleiben unsichtbar bis zur nachvollziehbaren Freigabe',async()=>{
 const {env,fakeFetch,main,media}=await createFakeTurso();const original=globalThis.fetch;globalThis.fetch=fakeFetch;
 try{
  const a=await call(env,'/auth/register','POST',register('Redakteur','redakteur@local.test'));const ca=a.headers.get('set-cookie').split(';')[0];
  const b=await call(env,'/auth/register','POST',register('Leser','leser@local.test'));const cb=b.headers.get('set-cookie').split(';')[0];
  const ua=(await(await call(env,'/me','GET',null,ca)).json()).user;
  main.prepare('INSERT INTO team_members(user_id,role) VALUES(?,?)').run(ua.id,'owner');
  const posted=await call(env,'/social/posts','POST',{caption:'Ein ruhiger Moment heute'},cb);
  assert.equal(posted.status,201);const id=(await posted.json()).id;
  let feed=await call(env,'/social/feed','GET',null,ca);assert.equal((await feed.json()).posts.length,0);
  const queue=await call(env,'/social/admin/queue','GET',null,ca);assert.equal((await queue.json()).content.some(c=>c.id===id),true);
  const approved=await call(env,'/social/admin/content-review','POST',{type:'post',id,status:'approved'},ca);
  assert.equal(approved.status,200);
  feed=await call(env,'/social/feed','GET',null,ca);assert.equal((await feed.json()).posts.length,1);
 }finally{globalThis.fetch=original;main.close();media.close();}
});

test('Gemeldete Unterhaltung: nur eingereichte Belege, nur CEO, mit Audit',async()=>{
 const {env,fakeFetch,main,media}=await createFakeTurso();const original=globalThis.fetch;globalThis.fetch=fakeFetch;
 try{
  const a=await call(env,'/auth/register','POST',register('Admin','admin@local.test'));const ca=a.headers.get('set-cookie').split(';')[0];
  const b=await call(env,'/auth/register','POST',register('Nutzer','nutzer@local.test'));const cb=b.headers.get('set-cookie').split(';')[0];
  const ua=(await(await call(env,'/me','GET',null,ca)).json()).user;
  const ub=(await(await call(env,'/me','GET',null,cb)).json()).user;
  main.prepare('INSERT INTO team_members(user_id,role) VALUES(?,?)').run(ua.id,'owner');
  let r=await call(env,'/social/dm/open','POST',{userId:ua.id},cb);const id=(await r.json()).id;
  r=await call(env,'/social/dm/'+encodeURIComponent(id)+'/send','POST',{body:'Bitte aufhören'},cb);assert.equal(r.status,201);
  r=await call(env,'/social/dm/'+encodeURIComponent(id)+'/report','POST',{reason:'abuse',details:'Diese Nachricht beunruhigt mich.'},cb);assert.equal(r.status,201);const rid=(await r.json()).reportId;
  r=await call(env,'/social/admin/conversation-evidence/'+rid+'?reason=Fallnummer%20123%20pruefen','GET',null,cb);assert.equal(r.status,403);
  r=await call(env,'/social/admin/conversation-evidence/'+rid+'?reason=Fallnummer%20123%20pruefen','GET',null,ca);assert.equal(r.status,200);
  assert.equal((await r.json()).evidence[0].body,'Bitte aufhören');
  assert.equal(main.prepare("SELECT count(*) AS n FROM admin_audit WHERE action='chat_report_evidence_access'").get().n,1);
  r=await call(env,'/legal-requests','POST',{reference:'AK123',authority:'Polizei Krefeld',legalBasis:'Gesetzliche Auskunftsgrundlage ist zu prüfen',scope:'Begrenzte Daten zum konkret benannten Fall'},ca);
  assert.equal(r.status,201);assert.equal((await r.json()).automatedRelease,false);
 }finally{globalThis.fetch=original;main.close();media.close();}
});

test('Videoupload ist für das reine Fotoangebot deaktiviert',async()=>{
 const {env,fakeFetch,main,media}=await createFakeTurso();const original=globalThis.fetch;globalThis.fetch=fakeFetch;
 try{
  const a=await call(env,'/auth/register','POST',register('Video','video@local.test'));const ca=a.headers.get('set-cookie').split(';')[0];
  const bytes=Uint8Array.from([0,0,0,24,102,116,121,112,...Array(100).fill(0)]);
  const r=await call(env,'/social/media?kind=post','POST',bytes,ca,'video/mp4');assert.equal(r.status,415);
  assert.equal(main.prepare('SELECT count(*) AS n FROM social_media').get().n,0);
 }finally{globalThis.fetch=original;main.close();media.close();}
});

test('Deutschlandsperre schützt API und HTML, lokale Entwicklung bleibt möglich',async()=>{
 const {env,fakeFetch,main,media}=await createFakeTurso();const original=globalThis.fetch;globalThis.fetch=fakeFetch;
 try{
  const foreign=new Request('https://kennely.de/api/me');Object.defineProperty(foreign,'cf',{value:{country:'FR'}});
  assert.equal((await worker.fetch(foreign,env)).status,451);
  const german=new Request('https://kennely.de/api/me');Object.defineProperty(german,'cf',{value:{country:'DE'}});
  assert.equal((await worker.fetch(german,env)).status,200);
  const page=new Request('https://kennely.de/');Object.defineProperty(page,'cf',{value:{country:'FR'}});
  assert.equal((await worker.fetch(page,env)).status,451);
  assert.equal((await worker.fetch(new Request('http://127.0.0.1:8787/api/me'),env)).status,200);
 }finally{globalThis.fetch=original;main.close();media.close();}
});

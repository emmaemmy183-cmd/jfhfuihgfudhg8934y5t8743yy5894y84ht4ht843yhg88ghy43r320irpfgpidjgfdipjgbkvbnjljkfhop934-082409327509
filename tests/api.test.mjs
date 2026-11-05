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
    const env={TURSO_MAIN_URL:'libsql://main.test',TURSO_MAIN_TOKEN:'token-main',TURSO_MEDIA_URL:'libsql://media.test',TURSO_MEDIA_TOKEN:'token-media',BETA_ACCESS_CODE:'an-example-private-beta-code',REGISTRATION_MODE:'local',LEGACY_DATING_ENABLED:'true',IP_HASH_SECRET:'long-random-abuse-salt-secret',ASSETS:{fetch:()=>new Response('static')}};
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

test('end-to-end: register, login, discover, match, message, picture, report, block, delete',async()=>{
 const {env, fakeFetch, main, media}=await createFakeTurso();
 const before=globalThis.fetch;
 globalThis.fetch=fakeFetch;
 try{
  let r=await call(env,'/me');assert.equal((await r.json()).user,null);
  r=await call(env,'/auth/register','POST',register('TooYoung','young@example.test','2012-01-01'));
  assert.equal(r.status,400);
  r=await call(env,'/auth/register','POST',{...register('BadUser','bad@example.test'),username:'abc'});
  assert.equal(r.status,400);
  r=await call(env,'/auth/register','POST',register('Alex','alex@example.test'));
  assert.equal(r.status,201,await r.text().catch(()=>''));
  const alexCookie=r.headers.get('set-cookie').split(';')[0];
  r=await call(env,'/auth/login','POST',{email:'alex@example.test',password:'wrong-password'});assert.equal(r.status,401);
  r=await call(env,'/auth/login','POST',{email:'alex@example.test',password:'Some-very-good-password-123!'});assert.equal(r.status,200);
  const alex=(await call(env,'/me','GET',null,alexCookie));
  assert.equal((await alex.json()).user.name,'Alex');
  r=await call(env,'/auth/register','POST',register('Robin','robin@example.test'));
  assert.equal(r.status,201);
  const robinCookie=r.headers.get('set-cookie').split(';')[0];
  const {user:robin}=await (await call(env,'/me','GET',null,robinCookie)).json();
  const {user:alexUser}=await (await call(env,'/me','GET',null,alexCookie)).json();
  r=await call(env,'/profile','PATCH',{name:'Alex',city:'Berlin',bio:'Musik und Reisen',gender:'divers',lookingFor:'alle',intent:'beziehung',interests:['Musik','Reisen'],visible:true},alexCookie);
  assert.equal(r.status,200);
  // Public-member search is signed-in only, respects profile visibility and blocks.
  r=await call(env,'/members/search?q=ro','GET');assert.equal(r.status,401);
  r=await call(env,'/members/search?q=ro','GET',null,alexCookie);assert.equal(r.status,200);
  const searchResult=await r.json();assert.equal(searchResult.profiles.length,1);
  assert.equal(searchResult.profiles[0].username,'robin');
  assert.equal('email' in searchResult.profiles[0],false);
  r=await call(env,`/members/${robin.id}`,'GET',null,alexCookie);assert.equal(r.status,200);
  let viewed=(await r.json()).profile;assert.equal(viewed.username,'robin');
  assert.deepEqual(viewed.photos,[]);assert.equal('birthDate' in viewed,false);
  const discover=await (await call(env,'/discover','GET',null,alexCookie)).json();
  assert.equal(discover.profiles.length,1);assert.equal(discover.profiles[0].name,'Robin');
  r=await call(env,'/likes','POST',{targetId:robin.id},alexCookie);assert.deepEqual(await r.json(),{matched:false});
  r=await call(env,'/likes','POST',{targetId:alexUser.id},robinCookie);const match=await r.json();assert.equal(match.matched,true);
  r=await call(env,`/messages/${encodeURIComponent(match.matchId)}`,'POST',{body:'Hallo Robin!'},alexCookie);assert.equal(r.status,201);
  const messages=await (await call(env,`/messages/${encodeURIComponent(match.matchId)}`,'GET',null,robinCookie)).json();
  assert.equal(messages.messages[0].body,'Hallo Robin!');
  const photo=Uint8Array.from([255,216,255,...Array(128).fill(20)]);
  r=await call(env,'/photos','POST',photo,alexCookie,'image/jpeg');assert.equal(r.status,201,await r.text().catch(()=>''));
  const photoId=JSON.parse(await (await call(env,'/me','GET',null,alexCookie)).text()).user.photos[0];
  assert.ok(photoId);
  r=await call(env,`/photos/${photoId}`,'GET',null,robinCookie);assert.equal(r.status,403);
  r=await call(env,`/members/${alexUser.id}`,'GET',null,robinCookie);
  assert.deepEqual((await r.json()).profile.photos,[]); // Unapproved images never appear in profiles.
  main.prepare("UPDATE photos SET status='approved' WHERE id=?").run(photoId);
  r=await call(env,`/members/${alexUser.id}`,'GET',null,robinCookie);
  assert.deepEqual((await r.json()).profile.photos,[photoId]);
  r=await call(env,`/photos/${photoId}`,'GET',null,robinCookie);assert.equal(r.status,200);assert.equal((await r.arrayBuffer()).byteLength,131);
  r=await call(env,'/report','POST',{targetId:robin.id,reason:'spam',details:'Test'},alexCookie);assert.equal(r.status,201);
  r=await call(env,'/block','POST',{targetId:robin.id},alexCookie);assert.equal(r.status,200);
  r=await call(env,`/members/${robin.id}`,'GET',null,alexCookie);assert.equal(r.status,404);
  r=await call(env,'/members/search?q=ro','GET',null,alexCookie);assert.equal((await r.json()).profiles.length,0);
  r=await call(env,`/messages/${encodeURIComponent(match.matchId)}`,'GET',null,alexCookie);assert.equal(r.status,403);
  r=await call(env,'/account/delete','POST',{confirm:'KONTO LÖSCHEN',password:'Some-very-good-password-123!'},alexCookie);assert.equal(r.status,200);
  assert.equal((await (await call(env,'/me','GET',null,alexCookie)).json()).user,null);
  assert.equal(main.prepare('SELECT COUNT(*) AS n FROM users').get().n,1);
  assert.equal(media.prepare('SELECT COUNT(*) AS n FROM media').get().n,0);
 }finally{globalThis.fetch=before;main.close();media.close();}
});

test('RBAC, settings, support, notifications and chat hiding enforce access',async()=>{
 const {env,fakeFetch,main,media}=await createFakeTurso();
 const before=globalThis.fetch;globalThis.fetch=fakeFetch;
 try{
  const ar=await call(env,'/auth/register','POST',register('Owner','owner@local.test'));
  assert.equal(ar.status,201);const ownerCookie=ar.headers.get('set-cookie').split(';')[0];const owner=(await (await call(env,'/me','GET',null,ownerCookie)).json()).user;
  const br=await call(env,'/auth/register','POST',register('Member','member@local.test'));
  assert.equal(br.status,201);const memberCookie=br.headers.get('set-cookie').split(';')[0];const member=(await (await call(env,'/me','GET',null,memberCookie)).json()).user;
  let response=await call(env,'/admin/overview','GET',null,memberCookie);assert.equal(response.status,403);
  main.prepare('INSERT INTO team_members(user_id,role) VALUES(?,?)').run(owner.id,'owner');
  response=await call(env,'/admin/overview','GET',null,ownerCookie);assert.equal(response.status,200);
  response=await call(env,'/admin/team','POST',{userId:member.id,role:'moderator'},memberCookie);assert.equal(response.status,403);
  response=await call(env,'/admin/team','POST',{userId:member.id,role:'moderator'},ownerCookie);assert.equal(response.status,200);
  response=await call(env,'/admin/overview','GET',null,memberCookie);assert.equal(response.status,200);
  response=await call(env,'/admin/moderate','POST',{userId:owner.id,action:'warning',reason:'Testing request'},memberCookie);assert.equal(response.status,403);
  response=await call(env,'/settings','PATCH',{locale:'de',theme:'dark',chatLocale:'de',notifyMessages:false},ownerCookie);assert.equal(response.status,200);
  response=await call(env,'/settings','GET',null,ownerCookie);assert.equal((await response.json()).preferences.locale,'de');
  response=await call(env,'/support','POST',{category:'technical',subject:'Issue with dating',body:'This is an example support issue.'},ownerCookie);assert.equal(response.status,201);const ticket=(await response.json()).id;
  response=await call(env,'/support','GET',null,memberCookie);assert.equal(response.status,200);
  response=await call(env,`/support/${ticket}/reply`,'POST',{body:'We will investigate.'},memberCookie);assert.equal(response.status,200);
  response=await call(env,'/unread','GET',null,ownerCookie);assert.equal((await response.json()).count,1);
  response=await call(env,'/notifications/read','POST',{all:true},ownerCookie);assert.equal(response.status,200);
  response=await call(env,'/unread','GET',null,ownerCookie);assert.equal((await response.json()).count,0);
  response=await call(env,'/account/export','GET',null,ownerCookie);assert.equal(response.status,200);assert.equal((await response.json()).account.email,'owner@local.test');
  response=await call(env,'/account/logout-all','POST',{},ownerCookie);assert.equal(response.status,200);
  response=await call(env,'/me','GET',null,ownerCookie);assert.equal((await response.json()).user,null);
 }finally{globalThis.fetch=before;main.close();media.close();}
});

test('public registration requires working mail and existing local sessions are preserved',async()=>{
 const {env,fakeFetch,main,media}=await createFakeTurso();const before=globalThis.fetch;globalThis.fetch=fakeFetch;
 try{
  const registered=await call(env,'/auth/register','POST',register('Test','adult@local.test'));assert.equal(registered.status,201);
  const cookie=registered.headers.get('set-cookie').split(';')[0];
  const remote=new Request('https://kennely.de/api/discover',{headers:{Cookie:cookie,'CF-Connecting-IP':'127.0.0.1'}});
  let res=await worker.fetch(remote,env);assert.equal(res.status,451);env.COUNTRY_LOCK='off';res=await worker.fetch(remote,env);assert.equal(res.status,200);
  env.REGISTRATION_MODE='open';
  res=await worker.fetch(new Request('https://kennely.de/api/auth/register',{method:'POST',headers:{Origin:'https://kennely.de','Content-Type':'application/json'},body:JSON.stringify(register('Unsafe','unsafe@example.test'))}),env);
  assert.equal(res.status,503);
 }finally{globalThis.fetch=before;main.close();media.close();}
});

test('username lookup rejects taken or invalid names, registration requires 10 characters', async()=>{
 const {env,fakeFetch,main,media}=await createFakeTurso();const before=globalThis.fetch;globalThis.fetch=fakeFetch;
 try{
   let response=await call(env,'/auth/username?name=alexy');assert.equal((await response.json()).available,true);
   response=await call(env,'/auth/register','POST',{...register('Al','al@example.test'),username:'alexa',password:'123456789'});assert.equal(response.status,400);
   response=await call(env,'/auth/register','POST',{...register('Al','al@example.test'),username:'alexa',password:'1234567890'});assert.equal(response.status,201);
   response=await call(env,'/auth/username?name=ALEXA');assert.equal((await response.json()).available,false);
   response=await call(env,'/auth/register','POST',{...register('Be','be@example.test'),username:'AlExA'});assert.equal(response.status,409);
 }finally{globalThis.fetch=before;main.close();media.close();}
});

test('photo moderation: staff review and forward while ordinary members cannot review',async()=>{
 const {env,fakeFetch,main,media}=await createFakeTurso();const before=globalThis.fetch;globalThis.fetch=fakeFetch;
 try{
   const a=await call(env,'/auth/register','POST',register('Owner','owner@local.test'));const ca=a.headers.get('set-cookie').split(';')[0];const owner=(await (await call(env,'/me','GET',null,ca)).json()).user;
   const b=await call(env,'/auth/register','POST',register('Mod','moderator@local.test'));const cb=b.headers.get('set-cookie').split(';')[0];const mod=(await (await call(env,'/me','GET',null,cb)).json()).user;
   const c=await call(env,'/auth/register','POST',register('Person','person@local.test'));const cc=c.headers.get('set-cookie').split(';')[0];
   main.prepare('INSERT INTO team_members(user_id,role) VALUES(?,?)').run(owner.id,'owner');main.prepare('INSERT INTO team_members(user_id,role) VALUES(?,?)').run(mod.id,'moderator');
   const bytes=Uint8Array.from([255,216,255,...Array(128).fill(20)]);
   let r=await call(env,'/photos','POST',bytes,cc,'image/jpeg');assert.equal(r.status,201);const {id}=await r.json();
   r=await call(env,'/admin/photo-queue','GET',null,cc);assert.equal(r.status,403);
   r=await call(env,'/admin/photo-queue','GET',null,cb);assert.equal(r.status,200);assert.equal((await r.json()).photos[0].status,'pending');
   r=await call(env,`/admin/photos/${id}/forward`,'POST',{toStaffId:owner.id,note:'Please review this image together.'},cb);assert.equal(r.status,200);
   r=await call(env,'/admin/photo-queue','GET',null,ca);assert.equal((await r.json()).assigned.length,1);
   r=await call(env,`/admin/photos/${id}/review`,'POST',{decision:'approved',reason:'Appears suitable',moderation:'none',notifyEmail:false},ca);assert.equal(r.status,200);
   r=await call(env,'/admin/photo-queue','GET',null,cb);assert.equal((await r.json()).photos.some(p=>p.id===id),false);
   const rows=main.prepare('SELECT status FROM photos WHERE id=?').get(id);assert.equal(rows.status,'approved');
   r=await call(env,'/photos','POST',bytes,cc,'image/jpeg');const bad=(await r.json()).id;
   r=await call(env,`/admin/photos/${bad}/review`,'POST',{decision:'rejected',reason:'Not allowed photograph',moderation:'warning',notifyEmail:false},cb);assert.equal(r.status,200);
   assert.equal(main.prepare('SELECT COUNT(*) AS n FROM moderation_warnings').get().n,1);
 }finally{globalThis.fetch=before;main.close();media.close();}
});

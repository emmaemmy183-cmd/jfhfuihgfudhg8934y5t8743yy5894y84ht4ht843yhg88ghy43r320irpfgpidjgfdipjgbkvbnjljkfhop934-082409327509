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
const register=(name,email,birthDate='2000-01-01')=>({name,username:email.split('@')[0].replace(/[^a-z0-9._]/g,'').padEnd(10,'x'),email,password:'Some-very-good-password-123!',birthDate,gender:'divers',city:'Köln',adult:true,terms:true,});



import {usernameReason,evaluateText} from '../src/server/content-policy.js';

test('Nutzername benötigt mindestens 10 Zeichen; Anzeigename optional',async()=>{
 assert.ok(usernameReason('maria'));assert.equal(usernameReason('freundlichername'),'');
 assert.equal(evaluateText('du arschloch').review,true);assert.equal(evaluateText('freunde sammeln').review,false);
 const {env,fakeFetch,main,media}=await createFakeTurso(),old=globalThis.fetch;globalThis.fetch=fakeFetch;
 try{const data=register('','optional@local.test');data.username='optionalername';const r=await call(env,'/auth/register','POST',data);assert.equal(r.status,201);const cookie=r.headers.get('set-cookie').split(';')[0];
 const me=(await(await call(env,'/me','GET',null,cookie)).json()).user;assert.equal(me.name,'optionalername');}finally{globalThis.fetch=old;main.close();media.close();}
});
test('Privates Konto: Follow-Anfrage bis zur Annahme und Inhalte geschützt',async()=>{
 const {env,fakeFetch,main,media}=await createFakeTurso(),old=globalThis.fetch;globalThis.fetch=fakeFetch;
 try{
  const a=await call(env,'/auth/register','POST',register('Alice','aliceprivate@local.test'));const ca=a.headers.get('set-cookie').split(';')[0];const ua=(await(await call(env,'/me','GET',null,ca)).json()).user;
  const b=await call(env,'/auth/register','POST',register('Bob','bobprivatetest@local.test'));const cb=b.headers.get('set-cookie').split(';')[0];
  let r=await call(env,'/account/privacy','PATCH',{isPrivate:true},ca);assert.equal(r.status,200);
  r=await call(env,'/social/posts','POST',{caption:'Nur meine Follower'},ca);assert.equal(r.status,201);const id=(await r.json()).id;
  main.prepare("UPDATE content_reviews SET status='approved' WHERE content_type='post' AND content_id=?").run(id);
  r=await call(env,'/social/feed','GET',null,cb);assert.equal((await r.json()).posts.length,0);
  r=await call(env,'/social/follow','POST',{userId:ua.id},cb);assert.deepEqual(await r.json(),{following:false,requested:true});
  r=await call(env,'/social/feed','GET',null,cb);assert.equal((await r.json()).posts.length,0);
  const ub=(await(await call(env,'/me','GET',null,cb)).json()).user;
  r=await call(env,'/social/follow-requests','GET',null,ca);assert.equal((await r.json()).requests[0].userId,ub.id);
  r=await call(env,'/social/follow-requests','POST',{userId:ub.id,decision:'accept'},ca);assert.equal(r.status,200);
  r=await call(env,'/social/feed','GET',null,cb);assert.equal((await r.json()).posts.length,1);
 }finally{globalThis.fetch=old;main.close();media.close();}
});
test('CEO: konfigurierbares Wort, Rollenrechte und geprüftes Konto-Badge',async()=>{
 const {env,fakeFetch,main,media}=await createFakeTurso(),old=globalThis.fetch;globalThis.fetch=fakeFetch;
 try{
  const a=await call(env,'/auth/register','POST',register('Owner','ownercontrols@local.test'));const ca=a.headers.get('set-cookie').split(';')[0];const ua=(await(await call(env,'/me','GET',null,ca)).json()).user;
  const b=await call(env,'/auth/register','POST',register('User','othercontrols@local.test'));const cb=b.headers.get('set-cookie').split(';')[0];const ub=(await(await call(env,'/me','GET',null,cb)).json()).user;
  main.prepare("INSERT INTO team_members(user_id,role) VALUES(?,'owner')").run(ua.id);
  let r=await call(env,'/admin/terms','POST',{term:'fieseswort',action:'review',language:'de'},ca);assert.equal(r.status,200);
  r=await call(env,'/social/posts','POST',{caption:'Dieses fieseswort ist ein Test'},cb);assert.equal(r.status,201);assert.equal((await r.json()).pendingReview,true);
  r=await call(env,'/admin/permissions','POST',{role:'support',capability:'media.review',enabled:true},ca);assert.equal(r.status,200);
  r=await call(env,'/admin/badges','POST',{userId:ub.id,verified:true},ca);assert.equal(r.status,200);
  assert.equal(main.prepare('SELECT COUNT(*) AS n FROM official_accounts WHERE user_id=?').get(ub.id).n,1);
  r=await call(env,'/admin/labels','POST',{userId:ub.id,label:'Gründerfreund',color:'gold',action:'add'},ca);assert.equal(r.status,200);
  r=await call(env,'/social/profiles/'+ub.id,'GET',null,ca);assert.equal((await r.json()).profile.labels[0].label,'Gründerfreund');
 }finally{globalThis.fetch=old;main.close();media.close();}
});
test('Kontosperre: Begründung, Einspruch, Wiederherstellung',async()=>{
 const {env,fakeFetch,main,media}=await createFakeTurso(),old=globalThis.fetch;globalThis.fetch=fakeFetch;
 try{
  const a=await call(env,'/auth/register','POST',register('Owner','ownerreview@local.test'));const ca=a.headers.get('set-cookie').split(';')[0];const ua=(await(await call(env,'/me','GET',null,ca)).json()).user;
  const b=await call(env,'/auth/register','POST',register('User','otherreview@local.test'));const cb=b.headers.get('set-cookie').split(';')[0];const ub=(await(await call(env,'/me','GET',null,cb)).json()).user;
  main.prepare("INSERT INTO team_members(user_id,role) VALUES(?,'owner')").run(ua.id);
  let r=await call(env,'/admin/suspend','POST',{userId:ub.id,ruleId:'spam',reason:'Wiederholtes Posten identischer Werbung'},ca);assert.equal(r.status,200);
  r=await call(env,'/account/suspension','GET',null,cb);assert.equal((await r.json()).suspended,true);
  r=await call(env,'/social/feed','GET',null,cb);assert.equal(r.status,403);
  r=await call(env,'/account/appeal','POST',{reason:'Bitte erneut prüfen, es handelt sich um ein Missverständnis.'},cb);assert.equal(r.status,200);
  r=await call(env,'/admin/appeals/review','POST',{userId:ub.id,decision:'accepted',reason:'Manuelle Prüfung ergab einen Fehlalarm'},ca);assert.equal(r.status,200);
  r=await call(env,'/account/suspension','GET',null,cb);assert.equal((await r.json()).suspended,false);
 }finally{globalThis.fetch=old;main.close();media.close();}
});
test('Ungelesene DM-Benachrichtigungen werden nur beim erstmaligen Öffnen geschrieben',async()=>{
 const {env,fakeFetch,main,media}=await createFakeTurso(),old=globalThis.fetch;globalThis.fetch=fakeFetch;
 try{
  const a=await call(env,'/auth/register','POST',register('Annie','dmcount1@local.test'));const ca=a.headers.get('set-cookie').split(';')[0];const ua=(await(await call(env,'/me','GET',null,ca)).json()).user;
  const b=await call(env,'/auth/register','POST',register('Bobby','dmcount2@local.test'));const cb=b.headers.get('set-cookie').split(';')[0];const ub=(await(await call(env,'/me','GET',null,cb)).json()).user;
  let r=await call(env,'/social/dm/open','POST',{userId:ub.id},ca);assert.equal(r.status,200);const id=(await r.json()).id;
  r=await call(env,'/social/dm/'+encodeURIComponent(id)+'/send','POST',{body:'Hallo von mir'},ca);assert.equal(r.status,201);
  r=await call(env,'/social/dm/unread','GET',null,cb);assert.equal((await r.json()).count,1);
  r=await call(env,'/social/dm/'+encodeURIComponent(id),'GET',null,cb);assert.equal(r.status,200);
  r=await call(env,'/social/dm/unread','GET',null,cb);assert.equal((await r.json()).count,0);
  r=await call(env,'/social/dm/'+encodeURIComponent(id),'GET',null,cb);assert.equal(r.status,200);
 }finally{globalThis.fetch=old;main.close();media.close();}
});

/** Kennely Node.js HTTP server. No Cloudflare dependency. Single instance SSE channels. */
import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,sep,extname,dirname} from 'node:path';
import {createHash} from 'node:crypto';
const geoip=(await import('geoip-lite').catch(()=>null))?.default;
import worker from '../src/server/index.js';
import {one} from '../src/server/db.js';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../public');
// Cache only small, PUBLIC static assets. Never cache authenticated API responses.
const staticCache=new Map();
let staticCacheBytes=0;
const STATIC_CACHE_LIMIT=1_500_000;
const MIME={'.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.html':'text/html; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.ico':'image/x-icon','.webp':'image/webp'};
const env={...process.env};
const port=Number(env.PORT||8787);
const isDev=(env.NODE_ENV||'development')!=='production';
if(!isDev&&env.REGISTRATION_MODE==='local') throw new Error('REGISTRATION_MODE=local ist für öffentliche Server nicht erlaubt.');
if(!isDev&&!env.PUBLIC_ORIGIN?.startsWith('https://'))throw new Error('Produktion erfordert PUBLIC_ORIGIN=https://...');
const audience=new Map();
function emit(userId,msg){const listeners=audience.get(userId);if(!listeners)return;for(const res of listeners){try{res.write(`data: ${JSON.stringify(msg)}\n\n`)}catch{listeners.delete(res)}}}
env.LIVE_HUB={idFromName:id=>id,get:id=>({async fetch(_url,opts){try{const d=JSON.parse(opts.body);emit(id,{type:d.type,matchId:d.matchId||null,at:Date.now()});return new Response('ok')}catch{return new Response('bad',{status:400})}}})};
const assets={async fetch(req){const path=new URL(req.url).pathname;let relative;
 try{relative=decodeURIComponent(path)}catch{return new Response('Nicht gefunden',{status:404})}
 if(relative==='/'||!extname(relative))relative='/index.html';
 const filename=resolve(root,'.'+relative);
 if(!filename.startsWith(root+sep))return new Response('Nicht gefunden',{status:404});
 try{
  let file=staticCache.get(filename);
  if(!file){
    file=await readFile(filename);
    if(file.byteLength<=350_000 && staticCacheBytes+file.byteLength<=STATIC_CACHE_LIMIT){
      staticCache.set(filename,file);staticCacheBytes+=file.byteLength;
    }
  }
  const ext=extname(filename);
  const immutable=(ext==='.css'||ext==='.js')&&new URL(req.url).searchParams.has('v');
  const cacheControl=ext==='.html'?'no-store':immutable?'public, max-age=31536000, immutable':'public, max-age=3600';
  return new Response(file,{headers:{'content-type':MIME[ext]||'application/octet-stream','cache-control':cacheControl}});
 }catch{return new Response('Nicht gefunden',{status:404})}
}};
env.ASSETS=assets;
const clientIp=req=>{const raw=req.socket.remoteAddress||'';let ip=raw.replace(/^::ffff:/,'');
 // Forwarded header only when the hosting provider / reverse proxy is explicitly trusted.
 if(env.TRUST_PROXY==='true'){const from=String(req.headers['x-forwarded-for']||'').split(',')[0].trim();if(from)ip=from;}
 return ip;
};
function country(ip){if(['127.0.0.1','::1','localhost'].includes(ip))return 'DE';return geoip?.lookup(ip)?.country||'UNKNOWN'}
async function sse(req,res,url){
 const token=(String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('kn_session='))||'').slice(11);
 if(!/^[a-f\d]{64}$/.test(token)){res.writeHead(401).end();return}
 const hash=createHash('sha256').update(token).digest('hex');
 const who=await one(env,"SELECT u.id FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>CURRENT_TIMESTAMP AND u.is_banned=0",[hash]);
 if(!who){res.writeHead(401).end();return}
 res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no','X-Content-Type-Options':'nosniff'});
 res.write('retry: 2500\n\n');
 const clients=audience.get(who.id)||new Set();clients.add(res);audience.set(who.id,clients);
 const timer=setInterval(()=>{if(!res.destroyed)res.write(': ping\n\n')},20000);
 const cleanup=()=>{clearInterval(timer);clients.delete(res);if(!clients.size)audience.delete(who.id)};
 req.on('close',cleanup);res.on('close',cleanup);
}
const server=createServer(async(req,res)=>{
 try{
  const startedAt=Date.now();
  const ip=clientIp(req);
  const origin=env.PUBLIC_ORIGIN||`http://127.0.0.1:${port}`;
  const url=new URL(req.url||'/',origin);
  const local=['127.0.0.1','::1'].includes(ip);
  const c=country(ip);
  if(env.COUNTRY_LOCK==='DE'&&!local&&c!=='DE'){
   res.writeHead(451,{'content-type':'text/plain; charset=utf-8','cache-control':'no-store'}).end('Kennely ist aktuell nur in Deutschland verfügbar.');return;
  }
  if(url.pathname==='/api/live'&&req.method==='GET'){await sse(req,res,url);return}
  const headers=new Headers();for(const [key,value]of Object.entries(req.headers)){if(value!==undefined)headers.set(key,Array.isArray(value)?value.join(', '):String(value))}
  headers.set('CF-Connecting-IP',ip);
  // HTTP Request carries a body only for non-GET/HEAD methods.
  const method=req.method||'GET';
  const data=method==='GET'||method==='HEAD'?undefined:await new Promise((resolve,reject)=>{
   const chunks=[];let total=0;req.on('data',c=>{total+=c.length;if(total>1_100_000){reject(new Error('Anfrage zu groß'));req.destroy()}else chunks.push(c)});
   req.on('end',()=>resolve(Buffer.concat(chunks)));req.on('error',reject);
  });
  const webReq=new Request(url,{method,headers,body:data?.length?data:undefined,redirect:'manual'});
  webReq.cf={country:c};
  const resp=await worker.fetch(webReq,env);
  const out={};resp.headers.forEach((v,k)=>out[k]=v);
  out['X-Content-Type-Options']='nosniff';out['X-Frame-Options']='DENY';
  res.writeHead(resp.status,out);
  if(method==='HEAD'){res.end();return}
  const buf=resp.body?Buffer.from(await resp.arrayBuffer()):Buffer.alloc(0);
  res.end(buf);
  if(env.PERF_LOG==='true' && req.url?.startsWith('/api/') && Date.now()-startedAt>1000){
    const route=url.pathname.replace(/[0-9a-f-]{36}/gi,':id');
    console.warn('[Kennely slow request]',req.method,route,Date.now()-startedAt+'ms',resp.status);
  }
 }catch(err){console.error('[Kennely]',err?.message);if(!res.headersSent){res.writeHead(err?.message==='Anfrage zu groß'?413:500,{'content-type':'application/json; charset=utf-8'});res.end(JSON.stringify({error:err?.message==='Anfrage zu groß'?'Anfrage zu groß':'Es ist ein technischer Fehler aufgetreten.'}))}else res.end()}
});
server.requestTimeout=30_000;
server.listen(port,env.HOST||'127.0.0.1',()=>console.log(`Kennely läuft auf http://${env.HOST||'127.0.0.1'}:${port}`));
// Expired stories are cleaned periodically, not tied to page visits.
const pruning=setInterval(()=>worker.scheduled({},env,{waitUntil:p=>Promise.resolve(p).catch(e=>console.error(e?.message))}).catch(e=>console.error(e?.message)),60*60*1000);
pruning.unref?.();

/**
 * Kennely Netlify Functions adapter.
 * Stateless requests. Turso stores accounts, posts, conversations and moderation data.
 * No WebSocket/SSE server here. Browser uses bounded, visibility-aware polling.
 */
import application from '../../src/server/index.js';

const REQUIRED=['TURSO_MAIN_URL','TURSO_MAIN_TOKEN','TURSO_MEDIA_URL','TURSO_MEDIA_TOKEN','IP_HASH_SECRET'];

export const config={path:'/api/*'};

function environment(){
  const names=[...REQUIRED,'PUBLIC_ORIGIN','COUNTRY_LOCK','LEGACY_DATING_ENABLED','REGISTRATION_MODE','SENDPULSE_API_KEY','MAIL_FROM','MAIL_REPLY_TO','MAIL_ENABLED','EMAIL_HOURLY_CAP'];
  const vars={};
  for(const name of names){
    // Netlify Functions expose environment variables at runtime.
    const runtime=globalThis.Netlify?.env?.get?.(name);
    const fallback=typeof process!=='undefined'?process.env[name]:undefined;
    if(typeof runtime==='string') vars[name]=runtime;
    else if(typeof fallback==='string')vars[name]=fallback;
  }
  vars.LIVE_HUB=undefined;
  return vars;
}
export default async function handler(request,context={}){
  const path=new URL(request.url).pathname;
  if(path==='/api/live')return Response.json({error:'Dauerhafte Live-Verbindung auf Netlify Free nicht verfügbar. Nachrichten werden regelmäßig aktualisiert.'},{status:410,headers:{'cache-control':'no-store'}});
  const env=environment();
  // Public origin can be the temporary *.netlify.app URL while setting up custom domain.
  if(!env.PUBLIC_ORIGIN){
    return Response.json({error:'PUBLIC_ORIGIN fehlt in den Netlify-Umgebungsvariablen.'},{status:503});
  }
  if(env.REGISTRATION_MODE==='local' && !['localhost','127.0.0.1'].includes(new URL(request.url).hostname)){
    return Response.json({error:'REGISTRATION_MODE=local ist online nicht erlaubt.'},{status:503});
  }
  if(!REQUIRED.every(name=>env[name] && !/^(?:REPLACE|GENERATE|libsql:\/\/(MAIN|MEDIA)-DB)/i.test(env[name]))){
    if(path==='/api/health')return Response.json({ok:false,configuration:'missing'},{status:503});
    return Response.json({error:'Serverkonfiguration unvollständig.'},{status:503});
  }
  const req=new Request(request);
  // Do not trust visitor-supplied CF-Connecting-IP or x-forwarded-for.
  const headers=new Headers(req.headers);
  headers.delete('CF-Connecting-IP');
  headers.delete('x-forwarded-for');
  if(context.ip)headers.set('CF-Connecting-IP',String(context.ip));
  const proxied=new Request(req,{headers});
  proxied.cf={country:context.geo?.country?.code||null};
  return application.fetch(proxied,env);
}

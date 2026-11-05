/** Country gate for all Netlify static pages. API is also guarded by src/server/index.js. */
export default async function countryGate(request,context){
  const mode=globalThis.Netlify?.env?.get?.('COUNTRY_LOCK')||'DE';
  if(mode!=='DE')return context.next();
  const host=new URL(request.url).hostname;
  if(host==='localhost'||host==='127.0.0.1')return context.next();
  if(context.geo?.country?.code==='DE')return context.next();
  return new Response(`<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Kennely</title><body style="background:#171325;color:white;font-family:system-ui;margin:10vh auto;max-width:36rem;padding:2rem"><h1>Kennely ist aktuell nur in Deutschland verfügbar.</h1><p>Unsere Community startet vorerst in Deutschland.</p></body></html>`,{status:451,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
}
export const config={path:'/*',excludedPath:['/api/*']};

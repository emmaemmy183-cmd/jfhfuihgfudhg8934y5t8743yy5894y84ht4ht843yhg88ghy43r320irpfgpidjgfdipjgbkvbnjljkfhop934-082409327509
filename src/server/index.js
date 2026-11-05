import {features, checkFeature, notify, getRole} from './features.js';
import {socialRoutes,pruneSocial} from './social.js';
import {controls,usernamePolicyFor} from './controls.js';
import {sendMail, configured as mailConfigured} from './mail.js';
import {LiveHub, pushLive} from './live.js';
export {LiveHub};
import { main, media, one } from './db.js';
import { passwordHash, verifyPassword, digest, randomToken, isAdult, yearsOld, clean, cookieValue, sessionCookie, constantTimeEquals } from './security.js';

class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const error = (status, message) => { throw new ApiError(status, message); };
function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), { status, headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    ...extra,
  }});
}
function bodyLimited(req, maxBytes = 16000) {
  const length = Number(req.headers.get('content-length') || 0);
  if (length > maxBytes) error(413,'Anfrage zu groß.');
  if (!req.headers.get('content-type')?.startsWith('application/json')) error(415,'JSON benötigt.');
  return req.text().then(s => {
    if (new TextEncoder().encode(s).length > maxBytes) error(413,'Anfrage zu groß.');
    try { return JSON.parse(s); } catch { error(400,'Ungültige Eingabe.'); }
  });
}
function noCrossOriginWrite(req) {
  if (['GET','HEAD','OPTIONS'].includes(req.method)) return;
  const origin = req.headers.get('origin');
  if (origin && origin !== new URL(req.url).origin) error(403,'Ungültige Herkunft.');
  // Browser cross-site form posts have non-JSON content type, blocked by bodyLimited.
}
async function getUser(req, env) {
  const token = cookieValue(req.headers.get('cookie'), 'kn_session');
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const hashed = await digest(token);
  const record = await one(env, `SELECT u.id, u.email, u.username, u.email_verified_at, u.is_admin, u.is_banned, (SELECT role FROM team_members t WHERE t.user_id=u.id) AS role,
     p.display_name,p.birth_date,p.city,p.gender,p.looking_for,p.intent,p.bio,p.interests,p.is_private, (SELECT role FROM team_members t WHERE t.user_id=u.id) AS staff_role, (SELECT 1 FROM official_accounts o WHERE o.user_id=u.id) AS official,(SELECT ph.id FROM photos ph WHERE ph.user_id=u.id AND ph.status='approved' ORDER BY ph.created_at DESC LIMIT 1) AS photoId,p.visible
     FROM sessions s JOIN users u ON u.id=s.user_id
     JOIN profiles p ON p.user_id=u.id
     WHERE s.token_hash=? AND s.expires_at > CURRENT_TIMESTAMP`, [hashed]);
  return record || null;
}
async function requireUser(req, env) {
  const user = await getUser(req,env);
  if (!user) error(401,'Bitte melde dich an.');
  return user;
}
function safeUser(row) {
  return {
    official:!!row.official, id:row.id, email:row.email, username:row.username, emailVerified:!!row.email_verified_at, name:row.display_name||row.username, age:yearsOld(row.birth_date),
    city:row.city, gender:row.gender, lookingFor:row.looking_for, intent:row.intent,
    bio:row.bio, interests:JSON.parse(row.interests || '[]'), photoId:row.photoId||null, visible:!!row.visible, isPrivate:!!row.is_private, suspended:!!row.is_banned,
    admin:!!row.role, role:row.role||null,
  };
}
function profile(row) {
  return { id:row.id, username:row.username||null, name:row.display_name||row.username, age:yearsOld(row.birth_date), city:row.city,
    gender:row.gender, intent:row.intent, bio:row.bio,
    interests:JSON.parse(row.interests||'[]'), photoId:row.photo_id || null, staffRole:row.staff_role||null, official:!!row.official, isPrivate:!!row.is_private, labels:row.labels||[] };
}
async function loginSession(req, env, userId) {
  const token = randomToken();
  await main(env, `INSERT INTO sessions(token_hash,user_id,expires_at) VALUES (?, ?, datetime('now','+7 days'))`, [await digest(token),userId]);
  // Exactly one lightweight write per successful login/new account session.
  await main(env, 'UPDATE users SET last_login_at=CURRENT_TIMESTAMP WHERE id=?',[userId]);
  return sessionCookie(token,req);
}
function validateEmail(input) {
  const email = clean(input, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) error(400,'Bitte gültige E-Mail eingeben.');
  return email;
}
async function rateLimit(env, req, prefix, max, minutes) {
  const ip = req.headers.get('CF-Connecting-IP') || 'local';
  const key = await digest(`${prefix}:${env.IP_HASH_SECRET || 'development-only'}:${ip}`);
  const bucket = `${Math.floor(Date.now()/(minutes*60000))}`;
  await main(env, `INSERT INTO abuse_events(event_key,bucket,attempts) VALUES (?,?,1)
      ON CONFLICT(event_key,bucket) DO UPDATE SET attempts=attempts+1`,[key,bucket]);
  const row = await one(env,'SELECT attempts FROM abuse_events WHERE event_key=? AND bucket=?',[key,bucket]);
  if (Number(row?.attempts)>max) error(429,'Zu viele Versuche. Bitte später erneut versuchen.');
}
async function blockedBetween(env,a,b) {
  const row = await one(env, `SELECT 1 AS blocked FROM blocks
    WHERE (blocker_id=? AND blocked_id=?) OR (blocker_id=? AND blocked_id=?) LIMIT 1`,[a,b,b,a]);
  return !!row;
}
async function ensureTarget(env, userId, targetId) {
  if (!/^[\da-f-]{36}$/i.test(String(targetId)) || userId===targetId) error(400,'Ungültiges Profil.');
  const row = await one(env, `SELECT u.id FROM users u JOIN profiles p ON p.user_id=u.id
    WHERE u.id=? AND u.is_banned=0 AND p.visible=1 AND date(p.birth_date)<=date('now','-16 years')`, [targetId]);
  if (!row || await blockedBetween(env,userId,targetId)) error(404,'Profil nicht verfügbar.');
}
async function matchForUser(env, matchId, userId) {
  const match = await one(env,'SELECT * FROM matches WHERE id=? AND (user_a=? OR user_b=?)',[matchId,userId,userId]);
  if (!match) error(404,'Match nicht gefunden.');
  const otherId = match.user_a===userId ? match.user_b : match.user_a;
  if (await blockedBetween(env,userId,otherId)) error(403,'Dieser Chat ist nicht verfügbar.');
  return { ...match, otherId };
}
function validateImage(bytes,mime) {
  if (!['image/jpeg','image/png','image/webp'].includes(mime)) error(415,'Nur JPG, PNG oder WebP erlaubt.');
  if (bytes.byteLength<32 || bytes.byteLength>350000) error(413,'Foto muss unter 350 KB groß sein.');
  const s = bytes;
  const jpeg = s[0]===255&&s[1]===216&&s[2]===255;
  const png = s[0]===137&&s[1]===80&&s[2]===78&&s[3]===71&&s[4]===13;
  const webp = new TextDecoder().decode(s.subarray(0,4))==='RIFF' && new TextDecoder().decode(s.subarray(8,12))==='WEBP';
  if (!(mime==='image/jpeg'&&jpeg || mime==='image/png'&&png || mime==='image/webp'&&webp)) error(415,'Ungültige Bilddatei.');
}
function pathId(path, prefix) { return decodeURIComponent(path.slice(prefix.length)); }

async function api(req, env) {
  noCrossOriginWrite(req);
  const url = new URL(req.url), path=url.pathname, method=req.method;
  if (method==='GET' && path==='/api/health') return json({ ok:true, project:'Kennely', version:'2027.social.3', mailReady: mailConfigured(env), publicReady: String(env.REGISTRATION_MODE||'')==='public' && mailConfigured(env) && Boolean(env.PUBLIC_ORIGIN) });
  if (method==='GET' && path==='/api/auth/username') {
    const username=String(url.searchParams.get('name')||'').trim().toLowerCase();
    const reason=await usernamePolicyFor(env,username);
    if(reason)return json({available:false,valid:false,reason});
    const existing=await one(env,'SELECT 1 AS used FROM users WHERE username=? COLLATE NOCASE',[username]);
    return json({available:!existing,valid:true,reason:existing?'Nutzername existiert schon.':''});
  }
  if(method==='GET'&&path==='/api/auth/verify'){
    const value=String(url.searchParams.get('token')||'');
    if(!/^[a-f0-9]{64}$/.test(value))error(400,'Bestätigungslink ungültig.');
    const hashed=await digest(value);
    const record=await one(env,"SELECT user_id FROM email_tokens WHERE token_hash=? AND kind='verify' AND used_at IS NULL AND expires_at>CURRENT_TIMESTAMP",[hashed]);
    if(!record)error(410,'Der Bestätigungslink ist abgelaufen oder bereits benutzt.');
    await main(env,'UPDATE users SET email_verified_at=CURRENT_TIMESTAMP WHERE id=?',[record.user_id]);
    await main(env,'UPDATE email_tokens SET used_at=CURRENT_TIMESTAMP WHERE token_hash=?',[hashed]);
    return Response.redirect(`${(env.PUBLIC_ORIGIN||url.origin).replace(/\/$/,'')}/?verified=1`,303);
  }
  if(method==='POST'&&path==='/api/auth/request-reset'){
    await rateLimit(env,req,'password-reset',6,60);
    const d=await bodyLimited(req), email=validateEmail(d.email);
    const row=await one(env,'SELECT id FROM users WHERE email=?',[email]);
    if(row&&mailConfigured(env)){
      const secret=randomToken();await main(env,"INSERT INTO email_tokens(token_hash,user_id,kind,expires_at) VALUES(?,?,'reset',datetime('now','+30 minutes'))",[await digest(secret),row.id]);
      await sendMail(env,{to:email,subject:'Kennely · Passwort zurücksetzen',text:`Du möchtest dein Passwort zurücksetzen?\n\n${env.PUBLIC_ORIGIN}/?reset=${secret}\n\nDer Link ist 30 Minuten gültig. Wenn du das nicht warst, ignoriere diese Nachricht.`});
    }
    return json({ok:true,message:'Falls dieses Konto existiert, erhältst du eine E-Mail.'});
  }
  if(method==='POST'&&path==='/api/auth/reset'){
    const d=await bodyLimited(req), token=String(d.token||''), password=String(d.password||'');
    if(!/^[a-f0-9]{64}$/.test(token)||password.length<10||password.length>128)error(400,'Ungültiger Link oder Passwort zu kurz.');
    const hash=await digest(token);
    const row=await one(env,"SELECT user_id FROM email_tokens WHERE token_hash=? AND kind='reset' AND used_at IS NULL AND expires_at>CURRENT_TIMESTAMP",[hash]);
    if(!row)error(410,'Dieser Link ist abgelaufen oder ungültig.');
    const pw=await passwordHash(password);
    await main(env,'UPDATE users SET password_hash=?,password_salt=?,password_iterations=? WHERE id=?',[pw.hash,pw.salt,pw.iterations,row.user_id]);
    await main(env,'DELETE FROM sessions WHERE user_id=?',[row.user_id]);
    await main(env,'UPDATE email_tokens SET used_at=CURRENT_TIMESTAMP WHERE token_hash=?',[hash]);
    return json({ok:true});
  }
  if (method==='GET' && path==='/api/me') {
    const me=await getUser(req,env);
    if (!me) return json({user:null});
    const photoStates=(await main(env,'SELECT id,status,rejection_reason AS reason FROM photos WHERE user_id=? ORDER BY created_at ASC',[me.id])).rows;
    return json({user:{...safeUser(me),photos:photoStates.map(x=>x.id),photoStates}});
  }
  if(method==='POST'&&path==='/api/auth/register'){
    const d=await bodyLimited(req);await rateLimit(env,req,'register',8,60);
    const local=['localhost','127.0.0.1'].includes(url.hostname);
    const mode=env.REGISTRATION_MODE||'closed';
    if(mode==='closed'||(mode==='local'&&!local))error(503,'Registrierung derzeit nicht verfügbar.');
    if(mode==='public'&&!mailConfigured(env))error(503,'E-Mail-Bestätigung ist noch nicht eingerichtet.');
    if(!['local','public'].includes(mode))error(503,'Registrierung ist noch nicht freigegeben.');
    const email=validateEmail(d.email),password=String(d.password||''),name=clean(d.name,32);
    const username=String(d.username||'').trim().toLowerCase();
    const usernameError=await usernamePolicyFor(env,username);if(usernameError)error(400,usernameError);
    if(password.length<10||password.length>128)error(400,'Passwort muss mindestens 10 Zeichen enthalten.');
    // Der Anzeigename ist optional; ein fehlender Anzeigename wird als Nutzername angezeigt.
    if(!isAdult(d.birthDate)||d.adult!==true||d.terms!==true)error(400,'Kennely ist ab 16 Jahren.');
    if(!['frau','mann','divers','nichtbinaer','sonstiges','keine_angabe'].includes(d.gender))error(400,'Bitte Geschlecht auswählen.');
    if(await one(env,'SELECT 1 AS e FROM users WHERE email=?',[email]))error(409,'Ein Konto mit dieser E-Mail besteht bereits.');
    if(await one(env,'SELECT 1 AS e FROM users WHERE username=? COLLATE NOCASE',[username]))error(409,'Nutzername existiert schon.');
    const id=crypto.randomUUID(),pw=await passwordHash(password);
    try{
      await main(env,'INSERT INTO users(id,email,username,password_hash,password_salt,password_iterations,email_verified_at) VALUES(?,?,?,?,?,?,?)',
        [id,email,username,pw.hash,pw.salt,pw.iterations,local&&mode==='local'?new Date().toISOString():null]);
      await main(env,'INSERT INTO profiles(user_id,display_name,birth_date,city,gender) VALUES(?,?,?,?,?)',
        [id,name,d.birthDate,clean(d.city,64),d.gender]);
    }catch(e){await main(env,'DELETE FROM users WHERE id=?',[id]).catch(()=>{});throw e;}
    if(mode==='public'){
      const secret=randomToken();
      try{
        await main(env,"INSERT INTO email_tokens(token_hash,user_id,kind,expires_at) VALUES(?,?,'verify',datetime('now','+24 hours'))",[await digest(secret),id]);
        await sendMail(env,{to:email,subject:'Kennely · E-Mail bestätigen',text:`Hallo ${name}!\n\nBestätige deine E-Mail-Adresse, um dein Kennely-Konto zu verwenden:\n${env.PUBLIC_ORIGIN}/api/auth/verify?token=${secret}\n\nDer Link ist 24 Stunden gültig.\n\nKontakt: mahmoudbankousli@gmail.com`});
      }catch(e){
        await main(env,'DELETE FROM email_tokens WHERE user_id=?',[id]).catch(()=>{});
        await main(env,'DELETE FROM profiles WHERE user_id=?',[id]).catch(()=>{});
        await main(env,'DELETE FROM users WHERE id=?',[id]).catch(()=>{});
        error(503,'Bestätigungsmail konnte nicht versendet werden. Bitte später erneut versuchen.');
      }
    }
    const cookie=await loginSession(req,env,id);
    const user=await getUser(new Request(req.url,{headers:{Cookie:cookie}}),env);
    return json({user:{...safeUser(user),photos:[],photoStates:[]},verificationRequired:mode==='public'},201,{'Set-Cookie':cookie});
  }
  if (method==='POST' && path==='/api/auth/login') {
    const d=await bodyLimited(req); await rateLimit(env,req,'login',24,60);
    const email=validateEmail(d.email), password=String(d.password||'');
    if (password.length<1 || password.length>128) error(401,'E-Mail oder Passwort ist nicht korrekt.');
    const row=await one(env,'SELECT * FROM users WHERE email=?',[email]);
    if (!row || !await verifyPassword(password,row.password_hash,row.password_salt,row.password_iterations)) error(401,'E-Mail oder Passwort ist nicht korrekt.');
    const cookie=await loginSession(req,env,row.id);
    const user=await getUser(new Request(req.url,{headers:{Cookie:cookie}}),env);
    return json({user:{...safeUser(user),photos:(await main(env,'SELECT id FROM photos WHERE user_id=?',[row.id])).rows.map(p=>p.id)}},200,{'Set-Cookie':cookie});
  }
  if(method==='POST'&&path==='/api/auth/resend-verification'){
    const me=await requireUser(req,env);
    if(me.email_verified_at)return json({ok:true});
    if(!mailConfigured(env))error(503,'E-Mail-Dienst nicht verfügbar.');
    await rateLimit(env,req,'resend-verification',4,60);
    const secret=randomToken();
    await main(env,"INSERT INTO email_tokens(token_hash,user_id,kind,expires_at) VALUES(?,?,'verify',datetime('now','+24 hours'))",[await digest(secret),me.id]);
    await sendMail(env,{to:me.email,subject:'Kennely · Bestätigung erneut senden',text:`Bestätige deine E-Mail-Adresse: ${env.PUBLIC_ORIGIN}/api/auth/verify?token=${secret}\n\nGültig für 24 Stunden.`});
    return json({ok:true});
  }
  if (method==='POST' && path==='/api/auth/logout') {
    const token=cookieValue(req.headers.get('cookie'),'kn_session');
    if (token) await main(env,'DELETE FROM sessions WHERE token_hash=?',[await digest(token)]);
    return json({ok:true},200,{'Set-Cookie':sessionCookie('',req,true)});
  }
  const user=await requireUser(req,env);
  const isLocal=['localhost','127.0.0.1'].includes(url.hostname);
  if(user.is_banned){
    const control=await controls(req,env,user);if(control)return control;
    error(403,'Dein Konto ist deaktiviert. Du kannst Einspruch einlegen.');
  }
  if(!user.email_verified_at&&!isLocal) error(403,'Bitte bestätige zuerst deine E-Mail-Adresse.');
  const control=await controls(req,env,user);if(control)return control;
  if(method==='GET' && path==='/api/live') {
    if(req.headers.get('Upgrade')?.toLowerCase()!=='websocket') error(426,'WebSocket required.');
    if(req.headers.get('Origin')!==url.origin) error(403,'Invalid WebSocket origin.');
    if(!env.LIVE_HUB) error(503,'Live channel is not configured.');
    const room=env.LIVE_HUB.get(env.LIVE_HUB.idFromName(user.id));
    return room.fetch(new Request('https://internal.kennely/ws',{headers:{Upgrade:'websocket','X-KN-User':user.id}}));
  }
  // Behördenanfragen dürfen nicht automatisch Daten an beliebige Dritte herausgeben.
  if(path==='/api/legal-requests' && method==='GET'){
    if(user.role!=='owner')error(403,'Nur CEO');
    const rows=(await main(env,'SELECT id,reference,authority,legal_basis AS legalBasis,requested_scope AS requestedScope,status,created_at AS createdAt FROM disclosure_requests ORDER BY created_at DESC LIMIT 75')).rows;
    return json({requests:rows});
  }
  if(path==='/api/legal-requests' && method==='POST'){
    if(user.role!=='owner')error(403,'Nur CEO');
    const d=await bodyLimited(req),reference=clean(d.reference,80),authority=clean(d.authority,150),legalBasis=clean(d.legalBasis,700),scope=clean(d.scope,700);
    if(reference.length<4||authority.length<4||legalBasis.length<15||scope.length<10)error(400,'Bitte Aktenzeichen, Behörde, Rechtsgrundlage und Umfang vollständig angeben.');
    const id=crypto.randomUUID();
    await main(env,'INSERT INTO disclosure_requests(id,reference,authority,legal_basis,requested_scope,opened_by) VALUES(?,?,?,?,?,?)',[id,reference,authority,legalBasis,scope,user.id]);
    await main(env,'INSERT INTO admin_audit(id,actor_id,action,target_id,details) VALUES(?,?,?,?,?)',[crypto.randomUUID(),user.id,'legal_request_logged',id,`${authority} · ${reference}`]);
    return json({ok:true,id,automatedRelease:false},201);
  }
  const social=await socialRoutes(req,env,user);
  if(social) return social;
  // Previous dating APIs remain only for migration regression tests; normal social users cannot invoke them.
  const legacy = /^\/api\/(discover(?:\/|$)|likes(?:\/|$)|skips(?:\/|$)|matches(?:\/|$)|messages(?:\/|$)|typing(?:\/|$)|chats(?:\/|$))/.test(path);
  if(legacy && env.LEGACY_DATING_ENABLED !== 'true') error(410,'This previous feature is no longer available.');
  const extra=await features(req,env,user);
  if(extra) return extra;
  // Adult-only DOB is enforced at registration and for discovery. No document provider is integrated.
  // This self-declaration does not constitute legally reliable age verification.

  // Username search is authenticated. Never expose email, birth date or unapproved photos.
  if (method === 'GET' && path === '/api/members/search') {
    const query = String(url.searchParams.get('q') || '').trim().replace(/^@/, '').toLowerCase();
    if (query.length < 2 || query.length > 24 || !/^[a-z0-9._]+$/.test(query))
      return json({profiles: [], query, error: 'Bitte mindestens zwei gültige Zeichen eingeben.'});
    await rateLimit(env,req,'member-search',90,10);
    const escaped = query.replace(/[\\%_]/g, ch=>'\\'+ch);
    const rows = (await main(env, `SELECT u.id,u.username,p.display_name,p.birth_date,p.city,p.gender,p.intent,p.bio,p.interests,
      (SELECT role FROM team_members t WHERE t.user_id=u.id) AS staff_role,
      (SELECT 1 FROM official_accounts o WHERE o.user_id=u.id) AS official,
      (SELECT ph.id FROM photos ph WHERE ph.user_id=u.id AND ph.status='approved' ORDER BY ph.created_at DESC LIMIT 1) AS photo_id
      FROM users u JOIN profiles p ON p.user_id=u.id
      WHERE u.id<>? AND u.is_banned=0 AND p.visible=1 AND date(p.birth_date)<=date('now','-16 years')
      AND p.discoverable=1 AND u.username LIKE ? ESCAPE '\\'
      AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=? AND b.blocked_id=u.id) OR (b.blocked_id=? AND b.blocker_id=u.id))
      ORDER BY CASE WHEN lower(u.username)=? THEN 0 ELSE 1 END, lower(u.username) ASC LIMIT 25`,
      [user.id, escaped+'%',user.id,user.id,query])).rows;
    return json({profiles: rows.map(profile), query});
  }
  if (method === 'GET' && path.startsWith('/api/members/')) {
    const id = pathId(path, '/api/members/');
    await ensureTarget(env,user.id,id);
    const row = await one(env,`SELECT u.id,u.username,p.display_name,p.birth_date,p.city,p.gender,p.intent,p.bio,p.interests,
      (SELECT role FROM team_members t WHERE t.user_id=u.id) AS staff_role,
      (SELECT 1 FROM official_accounts o WHERE o.user_id=u.id) AS official,
      (SELECT ph.id FROM photos ph WHERE ph.user_id=u.id AND ph.status='approved' ORDER BY ph.created_at DESC LIMIT 1) AS photo_id
      FROM users u JOIN profiles p ON p.user_id=u.id WHERE u.id=?`,[id]);
    if(!row) error(404,'Profil nicht verfügbar.');
    const photos=(await main(env, `SELECT id FROM photos WHERE user_id=? AND status='approved' ORDER BY created_at DESC LIMIT 6`,[id])).rows.map(p=>p.id);
    return json({profile:{...profile(row), photos}});
  }
  if (method==='PATCH' && path==='/api/profile') {
    const d=await bodyLimited(req);
    const bio=clean(d.bio,650), city=clean(d.city,64);
    const gender=clean(d.gender,16), looking=clean(d.lookingFor,16),intent=clean(d.intent,32);
    const interests=[...new Set(Array.isArray(d.interests)?d.interests.map(x=>clean(x,24)).filter(Boolean):[])].slice(0,8);
    if (!['frau','mann','divers','nichtbinaer','sonstiges','keine_angabe'].includes(gender) || !['alle','frauen','maenner','divers'].includes(looking) || !['offen','beziehung','dating','freundschaft'].includes(intent)) error(400,'Profilangaben überprüfen.');
    await main(env,`UPDATE profiles SET bio=?,city=?,gender=?,looking_for=?,intent=?,interests=?,visible=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=?`,
      [bio,city,gender,looking,intent,JSON.stringify(interests),d.visible===false?0:1,user.id]);
    return json({ok:true});
  }
  if (method==='GET' && path==='/api/discover') {
    const limit=Math.min(24,Math.max(1,Number(url.searchParams.get('limit'))||12));
    const offset=Math.min(1000000,Math.max(0,Number(url.searchParams.get('offset'))||0));
    const rows=(await main(env,`SELECT u.id,u.username,p.display_name,p.birth_date,p.city,p.gender,p.intent,p.bio,p.interests, (SELECT role FROM team_members t WHERE t.user_id=u.id) AS staff_role, (SELECT 1 FROM official_accounts o WHERE o.user_id=u.id) AS official,
      (SELECT ph.id FROM photos ph WHERE ph.user_id=u.id AND ph.status='approved' ORDER BY ph.created_at DESC LIMIT 1) AS photo_id
      FROM users u JOIN profiles p ON p.user_id=u.id
      WHERE u.id<>? AND u.is_banned=0 AND p.visible=1 AND date(p.birth_date)<=date('now','-16 years')
        AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id=? AND b.blocked_id=u.id) OR (b.blocked_id=? AND b.blocker_id=u.id))
        AND NOT EXISTS (SELECT 1 FROM likes l WHERE l.from_user=? AND l.to_user=u.id)
        AND NOT EXISTS (SELECT 1 FROM skips sk WHERE sk.from_user=? AND sk.to_user=u.id AND sk.created_at>datetime('now','-30 days'))
        AND (?='alle' OR (?='frauen' AND p.gender='frau') OR (?='maenner' AND p.gender='mann') OR (?='divers' AND p.gender IN ('divers','nichtbinaer','sonstiges')))
        AND (p.looking_for='alle' OR (p.looking_for='frauen' AND ?='frau') OR (p.looking_for='maenner' AND ?='mann') OR (p.looking_for='divers' AND ?='divers'))
      ORDER BY (CASE WHEN lower(p.city)=lower(?) AND p.city<>'' THEN 4 ELSE 0 END + CASE WHEN p.intent=? THEN 2 ELSE 0 END) DESC,p.updated_at DESC LIMIT ? OFFSET ?`,[user.id,user.id,user.id,user.id,user.id,user.looking_for,user.looking_for,user.looking_for,user.looking_for,user.gender,user.gender,user.gender,user.city,user.intent,limit,offset])).rows;
    return json({profiles:rows.map(profile),hasMore:rows.length===limit});
  }
  if (method==='GET' && path==='/api/likes/incoming') {
    const offset=Math.min(1000000,Math.max(0,Number(url.searchParams.get('offset'))||0));
    const rows=(await main(env,`SELECT u.id,u.username,p.display_name,p.birth_date,p.city,p.gender,p.intent,p.bio,p.interests, (SELECT role FROM team_members t WHERE t.user_id=u.id) AS staff_role, (SELECT 1 FROM official_accounts o WHERE o.user_id=u.id) AS official,
      (SELECT ph.id FROM photos ph WHERE ph.user_id=u.id AND ph.status='approved' ORDER BY ph.created_at DESC LIMIT 1) AS photo_id
      FROM likes l JOIN users u ON u.id=l.from_user JOIN profiles p ON p.user_id=u.id
      WHERE l.to_user=? AND u.is_banned=0 AND p.visible=1
      AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id=? AND b.blocked_id=u.id) OR (b.blocked_id=? AND b.blocker_id=u.id))
      ORDER BY l.created_at DESC LIMIT 31 OFFSET ?`,[user.id,user.id,user.id,offset])).rows;
    return json({profiles:rows.slice(0,30).map(profile),hasMore:rows.length>30});
  }
  if (method==='POST' && path==='/api/skips') {
    const d=await bodyLimited(req),target=String(d.targetId||'');
    await ensureTarget(env,user.id,target);
    await main(env,'INSERT OR REPLACE INTO skips(from_user,to_user) VALUES(?,?)',[user.id,target]);
    return json({ok:true});
  }
  if (method==='POST' && path==='/api/likes') {
    await checkFeature(env,user.id,'likes'); await checkFeature(env,user.id,'matching');
    const d=await bodyLimited(req),target=String(d.targetId||'');
    await ensureTarget(env,user.id,target);
    await main(env,'INSERT OR IGNORE INTO likes(from_user,to_user) VALUES(?,?)',[user.id,target]);
    const reciprocal=await one(env,'SELECT 1 AS found FROM likes WHERE from_user=? AND to_user=?',[target,user.id]);
    if (!reciprocal) return json({matched:false});
    const [a,b]=[user.id,target].sort(), matchId=`${a}:${b}`;
    await main(env,'INSERT OR IGNORE INTO matches(id,user_a,user_b) VALUES(?,?,?)',[matchId,a,b]);
    await notify(env,target,'match','New match','You have a new match.',user.id);
    await notify(env,user.id,'match','New match','You have a new match.',target);
    await pushLive(env,[user.id,target],'match',matchId);
    return json({matched:true,matchId});
  }
  if (method==='GET' && path==='/api/matches') {
    const offset=Math.min(1000000,Math.max(0,Number(url.searchParams.get('offset'))||0));
    const forChats=url.searchParams.get('for')==='chats';
    const rows=(await main(env,`SELECT m.id,m.created_at,u.id AS other_id,p.display_name,p.birth_date,p.city,p.gender,p.intent,p.bio,p.interests, (SELECT role FROM team_members t WHERE t.user_id=u.id) AS staff_role, (SELECT 1 FROM official_accounts o WHERE o.user_id=u.id) AS official,
      (SELECT ph.id FROM photos ph WHERE ph.user_id=u.id AND ph.status='approved' ORDER BY ph.created_at DESC LIMIT 1) AS photo_id,
      (SELECT msg.body FROM messages msg WHERE msg.match_id=m.id ORDER BY msg.created_at DESC LIMIT 1) AS last_message
      FROM matches m JOIN users u ON u.id=(CASE WHEN m.user_a=? THEN m.user_b ELSE m.user_a END)
      JOIN profiles p ON p.user_id=u.id
      WHERE (m.user_a=? OR m.user_b=?) AND u.is_banned=0
        AND (?=0 OR NOT EXISTS(SELECT 1 FROM hidden_chats h WHERE h.user_id=? AND h.match_id=m.id))
      AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id=? AND b.blocked_id=u.id) OR (b.blocked_id=? AND b.blocker_id=u.id))
      ORDER BY m.created_at DESC LIMIT 41 OFFSET ?`,[user.id,user.id,user.id,forChats?1:0,user.id,user.id,user.id,offset])).rows;
    return json({matches:rows.slice(0,40).map(r=>({id:r.id,createdAt:r.created_at,lastMessage:r.last_message,person:profile({...r,id:r.other_id})})),hasMore:rows.length>40});
  }
  if (path.startsWith('/api/messages/') && method==='GET') {
    const matchId=pathId(path,'/api/messages/'); await matchForUser(env,matchId,user.id);
    const beforeAt=url.searchParams.get('beforeAt')||'';const beforeId=url.searchParams.get('beforeId')||'';
    if((beforeAt||beforeId)&&(!/^\d{4}-\d{2}-\d{2} /.test(beforeAt)||!/^[\da-f-]{36}$/i.test(beforeId))) error(400,'Ungültige Seitenmarkierung.');
    const rows=(await main(env,`SELECT id,sender_id AS senderId,body,created_at AS createdAt FROM messages
      WHERE match_id=? AND (?='' OR created_at<? OR (created_at=? AND id<?))
      ORDER BY created_at DESC,id DESC LIMIT 81`,[matchId,beforeAt,beforeAt,beforeAt,beforeId])).rows;
    return json({messages:rows.slice(0,80).reverse(),hasMore:rows.length>80});
  }
  if (path.startsWith('/api/messages/') && method==='POST') {
    await checkFeature(env,user.id,'chat');
    const matchId=pathId(path,'/api/messages/');await matchForUser(env,matchId,user.id);
    const d=await bodyLimited(req), message=clean(d.body,2000);
    if (message.length<1) error(400,'Nachricht darf nicht leer sein.');
    const last=await one(env,`SELECT created_at FROM messages WHERE sender_id=? ORDER BY created_at DESC LIMIT 1`,[user.id]);
    if (last && Date.now()-Date.parse(last.created_at.replace(' ','T')+'Z') < 1200) error(429,'Bitte nicht so schnell schreiben.');
    const id=crypto.randomUUID();
    await main(env,'INSERT INTO messages(id,match_id,sender_id,body) VALUES(?,?,?,?)',[id,matchId,user.id,message]);
    const recipient=await one(env,'SELECT user_a,user_b FROM matches WHERE id=?',[matchId]);
    const other=recipient.user_a===user.id?recipient.user_b:recipient.user_a;
    await main(env,'DELETE FROM hidden_chats WHERE user_id IN (?,?) AND match_id=?',[user.id,other,matchId]);
    await notify(env,other,'message','New message','You received a message.',user.id);
    await pushLive(env,[user.id,other],'message',matchId);
    return json({message:{id,senderId:user.id,body:message,createdAt:new Date().toISOString()}},201);
  }
  if (method==='POST' && path==='/api/block') {
    const d=await bodyLimited(req), target=String(d.targetId||'');
    if (user.id===target || !/^[\da-f-]{36}$/i.test(target)) error(400,'Ungültige Auswahl.');
    await main(env,'INSERT OR IGNORE INTO blocks(blocker_id,blocked_id) VALUES (?,?)',[user.id,target]);
    return json({ok:true});
  }
  if (method==='GET' && path==='/api/blocks') {
    const blocks=(await main(env,`SELECT b.blocked_id AS id,u.username,p.display_name AS name
       FROM blocks b JOIN users u ON u.id=b.blocked_id JOIN profiles p ON p.user_id=u.id
       WHERE b.blocker_id=? ORDER BY b.created_at DESC LIMIT 100`,[user.id])).rows;
    return json({blocks});
  }
  if (method==='POST' && path==='/api/unblock') {
    const d=await bodyLimited(req),target=String(d.targetId||'');
    if(!/^[\da-f-]{36}$/i.test(target))error(400,'Ungültige Auswahl.');
    await main(env,'DELETE FROM blocks WHERE blocker_id=? AND blocked_id=?',[user.id,target]);
    return json({ok:true});
  }
  if (method==='POST' && path==='/api/report') {
    await rateLimit(env,req,'report',12,60);
    const d=await bodyLimited(req), target=String(d.targetId||'');
    const reason=clean(d.reason,40), details=clean(d.details,500);
    if (target===user.id || !/^[\da-f-]{36}$/i.test(target) || !['fake','belästigung','spam','minderjährig','under18','andere'].includes(reason)) error(400,'Bitte einen Meldegrund wählen.');
    if (!await one(env,'SELECT 1 AS found FROM users WHERE id=?',[target])) error(404,'Profil nicht gefunden.');
    const reportId=crypto.randomUUID();
    await main(env,'INSERT INTO reports(id,reporter_id,reported_id,reason,details) VALUES(?,?,?,?,?)',[reportId,user.id,target,reason,details]);
    if(d.messageId){
      const msg=await one(env,`SELECT msg.id FROM messages msg JOIN matches m ON m.id=msg.match_id WHERE msg.id=? AND ((m.user_a=? AND m.user_b=?) OR (m.user_a=? AND m.user_b=?))`,[String(d.messageId),user.id,target,target,user.id]);
      if(msg)await main(env,'INSERT OR IGNORE INTO report_evidence(report_id,message_id) VALUES(?,?)',[reportId,msg.id]);
    }
    return json({ok:true},201);
  }
  if(method==='POST'&&path==='/api/admin/email/test'){
    if(user.role!=='owner')error(403,'Nur der Owner kann den E-Mail-Versand testen.');
    await rateLimit(env,req,'mail-test',2,60);
    try{await sendMail(env,{to:user.email,subject:'Kennely · E-Mail-Test erfolgreich',text:'Hallo! Dein Kennely-E-Mail-Versand über SendPulse funktioniert.\n\nKennely Team'});
      return json({ok:true});
    }catch(e){error(503,'E-Mail konnte nicht gesendet werden. Prüfe SendPulse, Domainfreigabe und Secret-Konfiguration.');}
  }
  if (method==='GET' && path==='/api/admin/reports') {
    if (!['owner','admin','manager','moderator'].includes(user.role)) error(403,'Kein Zugriff.');
    const rows=(await main(env,`SELECT r.id,r.reason,r.details,r.created_at,r.status,r.reported_id,
        u.email AS reported_email,p.display_name AS reported_name
        FROM reports r LEFT JOIN users u ON r.reported_id=u.id LEFT JOIN profiles p ON r.reported_id=p.user_id
        ORDER BY CASE WHEN r.status='open' AND r.reason IN ('under18','minderjährig') THEN 0 WHEN r.status='open' THEN 1 ELSE 2 END, r.created_at DESC LIMIT 100`)).rows;
    return json({reports:rows});
  }
  if (method==='GET' && path.startsWith('/api/admin/evidence/')) {
    if (!['owner','admin','manager','moderator'].includes(user.role)) error(403,'Not permitted.');
    const reportId=pathId(path,'/api/admin/evidence/');
    const report=await one(env,'SELECT id FROM reports WHERE id=?',[reportId]);
    if(!report)error(404,'Report not found.');
    const messages=(await main(env,`SELECT m.id,m.body,m.created_at AS createdAt FROM report_evidence e JOIN messages m ON m.id=e.message_id WHERE e.report_id=? LIMIT 10`,[reportId])).rows;
    await main(env,'INSERT INTO admin_audit(id,actor_id,action,target_id,details) VALUES(?,?,?,?,?)',[crypto.randomUUID(),user.id,'view_report_evidence',reportId,'Report-scoped evidence only']);
    return json({messages});
  }
  if (method==='PATCH' && path.startsWith('/api/admin/reports/')) {
    if (!['owner','admin','manager','moderator'].includes(user.role)) error(403,'Kein Zugriff.');
    const id=pathId(path,'/api/admin/reports/'),d=await bodyLimited(req);
    if (!['reviewed','dismissed'].includes(d.status)) error(400,'Ungültiger Status.');
    await main(env,'UPDATE reports SET status=? WHERE id=?',[d.status,id]);
    return json({ok:true});
  }
  if (method==='POST' && path==='/api/photos') {
    const mime=(req.headers.get('content-type')||'').split(';')[0].trim();
    const length=Number(req.headers.get('content-length')||0);
    if (length>350000) error(413,'Bild zu groß.');
    const count=await one(env,'SELECT COUNT(*) AS n FROM photos WHERE user_id=?',[user.id]);
    if (count.n>=6) error(400,'Maximal sechs Profilfotos möglich.');
    const bytes=new Uint8Array(await req.arrayBuffer()); validateImage(bytes,mime);
    const id=crypto.randomUUID(), trusted=['owner','admin','manager','moderator'].includes(user.role),status=trusted?'approved':'pending';
    await media(env,'INSERT INTO media(id,owner_id,mime,content) VALUES(?,?,?,?)',[id,user.id,mime,bytes]);
    try { await main(env,'INSERT INTO photos(id,user_id,mime,status) VALUES(?,?,?,?)',[id,user.id,mime,status]);
      if(!trusted){const mods=(await main(env,"SELECT user_id FROM team_members WHERE role IN ('owner','admin','manager','moderator') LIMIT 12")).rows;
        for(const mod of mods)await notify(env,mod.user_id,'photo_review','Neues Profilfoto','Ein Bild wartet auf Freigabe.',user.id);
      }
    } catch(e) { await media(env,'DELETE FROM media WHERE id=?',[id]); throw e; }
    return json({id,status,message:trusted?'Profilfoto veröffentlicht.':'Dein Foto wird vor der Veröffentlichung vom Team geprüft.'},201);
  }
  if (path.startsWith('/api/photos/') && method==='GET') {
    const id=pathId(path,'/api/photos/');
    const pic=await one(env,`SELECT ph.user_id,ph.status,p.visible FROM photos ph JOIN profiles p ON p.user_id=ph.user_id WHERE ph.id=?`,[id]);
    if (!pic) error(404,'Bild nicht gefunden.');
    if(pic.user_id!==user.id){
      const canReview=['moderator','manager','admin','owner'].includes(user.role);
      if(pic.status!=='approved'){
        if(!canReview)error(403,'Bild nicht freigegeben.');
        await main(env,'INSERT INTO admin_audit(id,actor_id,action,target_id,details) VALUES(?,?,?,?,?)',
          [crypto.randomUUID(),user.id,'view_photo_for_moderation',id,`Status: ${pic.status}`]);
      } else if(!pic.visible || await blockedBetween(env,user.id,pic.user_id)) error(403,'Bild nicht verfügbar.');
    }
    const rec=(await media(env,'SELECT mime,content FROM media WHERE id=?',[id])).rows[0];
    if (!rec) error(404,'Bild nicht gefunden.');
    return new Response(rec.content, {headers:{'Content-Type':rec.mime,'Cache-Control':'private, max-age=1800','X-Content-Type-Options':'nosniff'}});
  }
  if (path.startsWith('/api/photos/') && method==='DELETE') {
    const id=pathId(path,'/api/photos/');
    const photo=await one(env,'SELECT id FROM photos WHERE id=? AND user_id=?',[id,user.id]);
    if (!photo) error(404,'Bild nicht gefunden.');
    await main(env,'DELETE FROM photos WHERE id=? AND user_id=?',[id,user.id]);
    await media(env,'DELETE FROM media WHERE id=? AND owner_id=?',[id,user.id]);
    return json({ok:true});
  }
  if(method==='POST'&&path==='/api/account/change-password'){
    await rateLimit(env,req,'change-password',5,60);
    const d=await bodyLimited(req),current=String(d.current||''),next=String(d.next||'');
    if(next.length<10||next.length>128)error(400,'Das neue Passwort muss mindestens 10 Zeichen haben.');
    const old=await one(env,'SELECT password_hash,password_salt,password_iterations FROM users WHERE id=?',[user.id]);
    if(!old||!await verifyPassword(current,old.password_hash,old.password_salt,old.password_iterations))error(403,'Das bisherige Passwort ist nicht korrekt.');
    const encoded=await passwordHash(next);
    await main(env,'UPDATE users SET password_hash=?,password_salt=?,password_iterations=? WHERE id=?',[encoded.hash,encoded.salt,encoded.iterations,user.id]);
    await main(env,'DELETE FROM sessions WHERE user_id=? AND token_hash<>?',[user.id,await digest(cookieValue(req.headers.get('cookie'),'kn_session'))]);
    return json({ok:true});
  }
  if (method==='POST' && path==='/api/account/delete') {
    const d=await bodyLimited(req);
    if (String(d.confirm||'')!=='KONTO LÖSCHEN') error(400,'Bestätigung fehlt.');
    const stored=await one(env,'SELECT password_hash,password_salt,password_iterations FROM users WHERE id=?',[user.id]);
    if(!stored||!await verifyPassword(String(d.password||''),stored.password_hash,stored.password_salt,stored.password_iterations)) error(403,'Passwort zur Kontolöschung ist nicht korrekt.');
    const photos=(await main(env,'SELECT id FROM photos WHERE user_id=?',[user.id])).rows;
    for(const photo of photos) await media(env,'DELETE FROM media WHERE id=?',[photo.id]);
    const socialPhotos=(await main(env,'SELECT id FROM social_media WHERE user_id=?',[user.id])).rows;
    for(const photo of socialPhotos) await media(env,'DELETE FROM media WHERE id=?',[photo.id]);
    // Remove social data before deleting the account; respect any moderation retention requirements.
    await main(env,'DELETE FROM dm_report_evidence WHERE report_id IN (SELECT id FROM social_reports WHERE reporter_id=? OR target_user_id=?)',[user.id,user.id]);
    await main(env,'DELETE FROM dm_report_evidence WHERE message_id IN (SELECT id FROM social_dms WHERE sender_id=?)',[user.id]);
    await main(env,'DELETE FROM content_reviews WHERE user_id=?',[user.id]);
    await main(env,'DELETE FROM social_hidden_threads WHERE user_id=? OR thread_id IN (SELECT id FROM social_threads WHERE user_a=? OR user_b=?)',[user.id,user.id,user.id]);
    await main(env,'DELETE FROM social_media_forwards WHERE from_staff_id=? OR to_staff_id=? OR media_id IN (SELECT id FROM social_media WHERE user_id=?)',[user.id,user.id,user.id]);
    // Videoobjekte getrennt vom SQL-Speicher löschen.
    for(const item of await main(env,"SELECT id FROM social_media WHERE user_id=? AND mime LIKE 'video/%'",[user.id]).then(r=>r.rows))await env.MEDIA_BUCKET?.delete(item.id).catch(()=>{});
    const socialCleanup=[
      ['DELETE FROM social_dm_reactions WHERE user_id=? OR message_id IN (SELECT id FROM social_dms WHERE sender_id=? OR thread_id IN (SELECT id FROM social_threads WHERE user_a=? OR user_b=?))',[user.id,user.id,user.id,user.id]],
      ['DELETE FROM social_dms WHERE thread_id IN (SELECT id FROM social_threads WHERE user_a=? OR user_b=?)',[user.id,user.id]],
      ['DELETE FROM social_dms WHERE sender_id=?',[user.id]],
      ['DELETE FROM social_threads WHERE user_a=? OR user_b=?',[user.id,user.id]],
      ['DELETE FROM social_post_likes WHERE user_id=? OR post_id IN (SELECT id FROM social_posts WHERE user_id=?)',[user.id,user.id]],
      ['DELETE FROM social_post_saves WHERE user_id=? OR post_id IN (SELECT id FROM social_posts WHERE user_id=?)',[user.id,user.id]],
      ['DELETE FROM social_comment_likes WHERE user_id=? OR comment_id IN (SELECT id FROM social_comments WHERE user_id=? OR post_id IN (SELECT id FROM social_posts WHERE user_id=?))',[user.id,user.id,user.id]],

      ['DELETE FROM social_follow_requests WHERE follower_id=? OR following_id=?',[user.id,user.id]],
      ['DELETE FROM social_story_likes WHERE user_id=? OR story_id IN (SELECT id FROM social_stories WHERE user_id=?)',[user.id,user.id]],
      ['DELETE FROM profile_labels WHERE user_id=?',[user.id]],
      ['DELETE FROM staff_permissions WHERE user_id=?',[user.id]],
      ['DELETE FROM account_states WHERE user_id=?',[user.id]],
      ['DELETE FROM social_follows WHERE follower_id=? OR following_id=?',[user.id,user.id]],
      ['DELETE FROM social_posts WHERE user_id=?',[user.id]],
      ['DELETE FROM social_stories WHERE user_id=?',[user.id]],
      ['DELETE FROM social_media WHERE user_id=?',[user.id]],
      ['DELETE FROM social_reports WHERE reporter_id=? OR target_user_id=?',[user.id,user.id]],
      ['DELETE FROM social_appeals WHERE user_id=?',[user.id]]
    ];
    for(const [sql,args] of socialCleanup) await main(env,sql,args);
    const id=user.id;
    // Explicit deletion keeps behavior predictable even when database connections differ.
    const clauses=[
      ['DELETE FROM report_evidence WHERE report_id IN (SELECT id FROM reports WHERE reporter_id=? OR reported_id=?)',[id,id]],
      ['DELETE FROM report_evidence WHERE message_id IN (SELECT id FROM messages WHERE sender_id=?)',[id]],
      ['DELETE FROM skips WHERE from_user=? OR to_user=?',[id,id]],
      ['DELETE FROM user_preferences WHERE user_id=?',[id]],
      ['DELETE FROM email_tokens WHERE user_id=?',[id]],
      ['DELETE FROM photo_review_notes WHERE from_staff_id=? OR to_staff_id=?',[id,id]],
      ['DELETE FROM photo_review_notes WHERE photo_id IN (SELECT id FROM photos WHERE user_id=?)',[id]],
      ['DELETE FROM photo_review_actions WHERE photo_id IN (SELECT id FROM photos WHERE user_id=?)',[id]],
      ['DELETE FROM age_checks WHERE user_id=?',[id]],
      ['DELETE FROM official_accounts WHERE user_id=?',[id]],
      ['DELETE FROM notifications WHERE user_id=? OR actor_id=?',[id,id]],
      ['DELETE FROM support_replies WHERE ticket_id IN (SELECT id FROM support_tickets WHERE user_id=?)',[id]],
      ['DELETE FROM support_tickets WHERE user_id=?',[id]],
      ['DELETE FROM support_replies WHERE author_id=?',[id]],
      ['DELETE FROM moderation_warnings WHERE target_id=? OR actor_id=?',[id,id]],
      ['DELETE FROM user_restrictions WHERE user_id=? OR imposed_by=?',[id,id]],
      ['DELETE FROM hidden_chats WHERE user_id=? OR match_id IN (SELECT id FROM matches WHERE user_a=? OR user_b=?)',[id,id,id]],
      ['DELETE FROM team_members WHERE user_id=?',[id]],
      ['DELETE FROM onboarding WHERE user_id=?',[id]],
      ['DELETE FROM photos WHERE user_id=?',[id]],
      ['DELETE FROM messages WHERE match_id IN (SELECT id FROM matches WHERE user_a=? OR user_b=?)',[id,id]],
      ['DELETE FROM matches WHERE user_a=? OR user_b=?',[id,id]],
      ['DELETE FROM likes WHERE from_user=? OR to_user=?',[id,id]],
      ['DELETE FROM blocks WHERE blocker_id=? OR blocked_id=?',[id,id]],
      ['DELETE FROM reports WHERE reporter_id=? OR reported_id=?',[id,id]],
      ['DELETE FROM sessions WHERE user_id=?',[id]],
      ['DELETE FROM profiles WHERE user_id=?',[id]],
      ['DELETE FROM users WHERE id=?',[id]],
    ];
    for (const [sql,args] of clauses) await main(env,sql,args);
    return json({ok:true},200,{'Set-Cookie':sessionCookie('',req,true)});
  }
  error(404,'Endpunkt nicht gefunden.');
}

export default {
  async scheduled(controller,env,ctx){ctx.waitUntil(pruneSocial(env));},
  async fetch(request, env) {
    try {
      const url=new URL(request.url);
      const isLocal=['127.0.0.1','localhost'].includes(url.hostname);
      const country=request.cf?.country;
      // Diese Kontrolle gilt nur als Geo-IP-Beschränkung. VPNs und ungenaue IP-Ortung sind möglich.
      if((env.COUNTRY_LOCK||'DE')==='DE'&&!isLocal&&country!=='DE'){
        return url.pathname.startsWith('/api/')
          ? json({error:'Kennely ist momentan nur in Deutschland erreichbar.'},451)
          : new Response('<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Kennely</title><body style="background:#101019;color:white;font:18px system-ui;max-width:38rem;margin:12vh auto;padding:2rem"><h1>Kennely ist momentan nur in Deutschland verfügbar.</h1><p>Wir arbeiten daran, Kennely später in weiteren Ländern anzubieten.</p></body></html>',{status:451,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}});
      }
      if (url.pathname.startsWith('/api/')) {
        return await api(request,env);
      }
      const pretty={'/legal/impressum':'/legal/imprint.html','/legal/datenschutz':'/legal/privacy.html','/legal/nutzungsbedingungen':'/legal/terms.html'};
      const asset=await env.ASSETS.fetch(pretty[url.pathname]?new Request(new URL(pretty[url.pathname],url),request):request);
      const headers=new Headers(asset.headers);
      headers.set('X-Content-Type-Options','nosniff');headers.set('Referrer-Policy','strict-origin-when-cross-origin');
      headers.set('X-Frame-Options','DENY');
      headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' wss: ws:; form-action 'self'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'");
      return new Response(asset.body,{status:asset.status,headers});
    } catch(e) {
      if (e instanceof ApiError || (Number.isInteger(e?.status)&&e.status>=400&&e.status<=503)) return json({error:e.message},e.status);
      console.error('Kennenly API exception',e?.message);
      return json({error:'Ein technischer Fehler ist aufgetreten. Bitte versuche es erneut.'},500);
    }
  }
};

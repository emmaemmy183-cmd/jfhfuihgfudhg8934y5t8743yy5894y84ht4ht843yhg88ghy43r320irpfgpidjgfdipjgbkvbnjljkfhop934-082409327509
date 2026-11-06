import {photoReviewRoutes} from './photo-review.js';
import {sendMail,configured as mailConfigured} from './mail.js';
import { main, one } from './db.js';
import {clean, digest, cookieValue,sessionCookie} from './security.js';
import {pushLive} from './live.js';
import {allowed,suspendWithReason,reinstate} from './controls.js';
export class FeatureError extends Error { constructor(status, message){super(message); this.status=status;} }
const fail=(n,m)=>{throw new FeatureError(n,m);};
const uid=()=>crypto.randomUUID();
const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers}});
const routeId=(path,prefix)=>decodeURIComponent(path.slice(prefix.length));
function guardId(id){if (!/^[a-f0-9-]{36}$/i.test(String(id||'')))fail(400,'Invalid user ID.'); return id;}
async function data(req,max=12000){const raw=await req.text();if(new TextEncoder().encode(raw).length>max)fail(413,'Request too large.');try{return JSON.parse(raw);}catch{fail(400,'Invalid JSON.');}}
const roles={support:1,moderator:2,manager:3,admin:4,owner:5};
export const roleLevel=(role)=>roles[role]||0;
export async function getRole(env,userId){return (await one(env,'SELECT role FROM team_members WHERE user_id=?',[userId]))?.role||null;}
const requireStaff=(u,min)=>{if(roleLevel(u.role)<roleLevel(min))fail(403,'Not permitted.');};
export async function checkFeature(env,id,feature){const r=await one(env,`SELECT id FROM user_restrictions WHERE user_id=? AND feature=? AND revoked_at IS NULL AND until_at>CURRENT_TIMESTAMP LIMIT 1`,[id,feature]);if(r)fail(403,`This feature is temporarily restricted. Contact support if you think this is a mistake.`);}
export async function notify(env,target,kind,title,body='',actor=null){await main(env,'INSERT INTO notifications(id,user_id,kind,actor_id,title,body) VALUES(?,?,?,?,?,?)',[uid(),target,kind,actor,title,body]);await pushLive(env,[target],'notification');}
async function audit(env,actor,action,target='',details=''){await main(env,'INSERT INTO admin_audit(id,actor_id,action,target_id,details) VALUES(?,?,?,?,?)',[uid(),actor,action,target,details]);}
async function userExists(env,id){guardId(id);if(!await one(env,'SELECT id FROM users WHERE id=?',[id]))fail(404,'Account not found.');}
export async function features(req,env,user){const url=new URL(req.url),p=url.pathname,m=req.method;
 const photoRoute=await photoReviewRoutes(req,env,user);if(photoRoute)return photoRoute;
 if(m==='GET'&&p==='/api/onboarding'){ const row=await one(env,'SELECT step,finished_at AS finishedAt FROM onboarding WHERE user_id=?',[user.id]);return json({step:row?.step||0,finished:!!row?.finishedAt}); }
 if(m==='PATCH'&&p==='/api/onboarding'){const d=await data(req);const step=Math.min(5,Math.max(0,Number(d.step)||0));await main(env,`INSERT INTO onboarding(user_id,step,finished_at) VALUES(?,?,CASE WHEN ?=5 THEN CURRENT_TIMESTAMP ELSE NULL END) ON CONFLICT(user_id) DO UPDATE SET step=excluded.step,finished_at=excluded.finished_at`,[user.id,step,step]);return json({ok:true});}
 if(m==='GET'&&p==='/api/settings'){
  const pref=await one(env,'SELECT locale,theme,chat_locale AS chatLocale,notify_messages AS notifyMessages FROM user_preferences WHERE user_id=?',[user.id]);
  const age=await one(env,'SELECT status FROM age_checks WHERE user_id=?',[user.id]);
  return json({preferences:pref||null,ageStatus:age?.status||'pending',role:user.role||null});
 }
 if(m==='PATCH'&&p==='/api/settings'){
  const d=await data(req);const locales=['de'];
  const locale=locales.includes(d.locale)?d.locale:'de';const chatLocale=locales.includes(d.chatLocale)?d.chatLocale:locale;
  const theme=['system','dark','light'].includes(d.theme)?d.theme:'system';const alerts=d.notifyMessages===false?0:1;
  await main(env,`INSERT INTO user_preferences(user_id,locale,chat_locale,theme,notify_messages) VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET locale=excluded.locale,chat_locale=excluded.chat_locale,theme=excluded.theme,notify_messages=excluded.notify_messages,updated_at=CURRENT_TIMESTAMP`,[user.id,locale,chatLocale,theme,alerts]);return json({ok:true});
 }
 if(m==='GET'&&p==='/api/notifications'){
  const rows=(await main(env,'SELECT id,kind,title,body,read_at AS readAt,created_at AS createdAt FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 70',[user.id])).rows;return json({notifications:rows});
 }
 if(m==='GET'&&p==='/api/unread'){
  const row=await one(env,'SELECT COUNT(*) AS n FROM notifications WHERE user_id=? AND read_at IS NULL',[user.id]);return json({count:row?.n||0});
 }
 if(m==='POST'&&p==='/api/notifications/read'){
  const d=await data(req);if(d.all===true)await main(env,'UPDATE notifications SET read_at=CURRENT_TIMESTAMP WHERE user_id=? AND read_at IS NULL',[user.id]);
  else {const id=guardId(d.id);await main(env,'UPDATE notifications SET read_at=CURRENT_TIMESTAMP WHERE user_id=? AND id=?',[user.id,id]);}return json({ok:true});
 }
 if(m==='POST'&&p==='/api/chats/hide'){
  const d=await data(req);const id=String(d.matchId||'');
  const match=await one(env,'SELECT id FROM matches WHERE id=? AND (user_a=? OR user_b=?)',[id,user.id,user.id]);if(!match)fail(404,'Chat not found.');
  await main(env,'INSERT OR REPLACE INTO hidden_chats(user_id,match_id) VALUES(?,?)',[user.id,id]);return json({ok:true});
 }
 if(m==='POST'&&p==='/api/chats/unhide'){
  const d=await data(req);await main(env,'DELETE FROM hidden_chats WHERE user_id=? AND match_id=?',[user.id,String(d.matchId||'')]);return json({ok:true});
 }
 if(m==='POST'&&p==='/api/typing'){
  const d=await data(req);const match=await one(env,'SELECT user_a,user_b FROM matches WHERE id=? AND (user_a=? OR user_b=?)',[String(d.matchId||''),user.id,user.id]);if(!match)fail(404,'Match not found.');
  await checkFeature(env,user.id,'chat');const other=match.user_a===user.id?match.user_b:match.user_a;
  if(await one(env,'SELECT 1 AS b FROM blocks WHERE (blocker_id=? AND blocked_id=?) OR (blocker_id=? AND blocked_id=?)',[user.id,other,other,user.id]))fail(403,'Blocked.');
  await pushLive(env,[other],'typing',String(d.matchId));return json({ok:true});
 }
 if(m==='GET'&&p==='/api/support'){
  const staff=roleLevel(user.role)>=1;
  const rows=(await main(env,`SELECT t.id,t.category,t.subject,t.status,t.created_at AS createdAt,t.updated_at AS updatedAt,p.display_name AS name
  FROM support_tickets t JOIN profiles p ON p.user_id=t.user_id WHERE ${staff?'1=1':'t.user_id=?'} ORDER BY t.updated_at DESC LIMIT 100`,staff?[]:[user.id])).rows;
  return json({tickets:rows});
 }
 if(m==='POST'&&p==='/api/support'){
  const recent=await one(env,"SELECT COUNT(*) AS n FROM support_tickets WHERE user_id=? AND created_at>datetime('now','-1 hour')",[user.id]);if(Number(recent?.n)>=6)fail(429,'Please try again later.');
  const d=await data(req),category=clean(d.category,32),subject=clean(d.subject,110),body=clean(d.body,3000);
  if(!['account','safety','verification','technical','privacy','other'].includes(category)||subject.length<5||body.length<10)fail(400,'Please complete the request.');
  const id=uid();await main(env,'INSERT INTO support_tickets(id,user_id,category,subject) VALUES(?,?,?,?)',[id,user.id,category,subject]);
  await main(env,'INSERT INTO support_replies(id,ticket_id,author_id,body) VALUES(?,?,?,?)',[uid(),id,user.id,body]);return json({ok:true,id},201);
 }
 if(p.startsWith('/api/support/')&&!p.endsWith('/reply')&&m==='GET'){
  const id=routeId(p,'/api/support/');const t=await one(env,'SELECT * FROM support_tickets WHERE id=?',[id]);if(!t)fail(404,'Request not found.');
  if(t.user_id!==user.id&&roleLevel(user.role)<1)fail(403,'Not permitted.');
  const replies=(await main(env,'SELECT r.id,r.body,r.created_at AS createdAt,p.display_name AS author FROM support_replies r JOIN profiles p ON p.user_id=r.author_id WHERE r.ticket_id=? ORDER BY r.created_at ASC LIMIT 200',[id])).rows;return json({ticket:t,replies});
 }
 if(p.startsWith('/api/support/')&&p.endsWith('/reply')&&m==='POST'){
  const id=p.split('/')[3],t=await one(env,'SELECT * FROM support_tickets WHERE id=?',[id]);if(!t)fail(404,'Request not found.');
  const staff=roleLevel(user.role)>=1;if(t.user_id!==user.id&&!staff)fail(403,'Not permitted.');
  const d=await data(req),body=clean(d.body,3000);if(body.length<2)fail(400,'Reply too short.');
  await main(env,'INSERT INTO support_replies(id,ticket_id,author_id,body) VALUES(?,?,?,?)',[uid(),id,user.id,body]);
  await main(env,'UPDATE support_tickets SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',[staff?'waiting':'open',id]);
  if(staff&&t.user_id!==user.id)await notify(env,t.user_id,'support','Support replied',t.subject,user.id);
  return json({ok:true});
 }
 if(m==='PATCH'&&p.startsWith('/api/support/')){
  requireStaff(user,'support');const id=routeId(p,'/api/support/'),d=await data(req);
  if(!['open','waiting','resolved','closed'].includes(d.status))fail(400,'Invalid status.');
  await main(env,'UPDATE support_tickets SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',[d.status,id]);await audit(env,user.id,'support_status',id,d.status);return json({ok:true});
 }
 if(m==='GET'&&p==='/api/account/export'){
  const profile=await one(env,'SELECT * FROM profiles WHERE user_id=?',[user.id]);const settings=await one(env,'SELECT * FROM user_preferences WHERE user_id=?',[user.id]);
  const matches=(await main(env,'SELECT * FROM matches WHERE user_a=? OR user_b=?',[user.id,user.id])).rows;
  const messages=(await main(env,'SELECT id,match_id,sender_id,body,created_at FROM messages WHERE sender_id=? ORDER BY created_at DESC LIMIT 10000',[user.id])).rows;
  const likes=(await main(env,'SELECT * FROM likes WHERE from_user=?',[user.id])).rows;
  const reports=(await main(env,'SELECT * FROM reports WHERE reporter_id=?',[user.id])).rows;
  const social={
   posts:(await main(env,'SELECT id,caption,media_id,visibility,status,created_at FROM social_posts WHERE user_id=? ORDER BY created_at DESC LIMIT 10000',[user.id])).rows,
   stories:(await main(env,'SELECT id,body,media_id,created_at,expires_at FROM social_stories WHERE user_id=? LIMIT 10000',[user.id])).rows,
   comments:(await main(env,'SELECT id,post_id,body,created_at FROM social_comments WHERE user_id=? LIMIT 10000',[user.id])).rows,
   follows:(await main(env,'SELECT * FROM social_follows WHERE follower_id=? OR following_id=? LIMIT 10000',[user.id,user.id])).rows,
   directMessages:(await main(env,'SELECT id,thread_id,body,created_at FROM social_dms WHERE sender_id=? LIMIT 10000',[user.id])).rows,
   reports:(await main(env,'SELECT * FROM social_reports WHERE reporter_id=? LIMIT 10000',[user.id])).rows
  };
  const out={exportedAt:new Date().toISOString(),account:{id:user.id,email:user.email},profile,settings,matches,messages,likes,reports,social,note:'Partial export with per-table limits. Image bytes and some retained records require a separate access request to privacy support.'};
  return json(out,200,{'content-disposition':'attachment; filename="kennely-data.json"'});
 }
 if(m==='POST'&&p==='/api/account/logout-all'){
  await main(env,'DELETE FROM sessions WHERE user_id=?',[user.id]);return json({ok:true},200,{'Set-Cookie':sessionCookie('',req,true)});
 }
 if(m==='GET'&&p==='/api/admin/overview'){
  requireStaff(user,'support');
  const counts=await one(env,`SELECT
    (SELECT COUNT(*) FROM reports WHERE status='open') AS reports,
    (SELECT COUNT(*) FROM support_tickets WHERE status IN ('open','waiting')) AS tickets,
    (SELECT COUNT(*) FROM photos WHERE status='pending') AS profilePhotos,
    (SELECT COUNT(*) FROM social_media WHERE status='pending') AS mediaPending,
    (SELECT COUNT(*) FROM content_reviews WHERE status='pending') AS textsPending`);
  const {reports=0,tickets=0,profilePhotos=0,mediaPending=0,textsPending=0}=counts||{};
  const team=(await main(env,`SELECT t.user_id AS id,t.role,p.display_name AS name FROM team_members t JOIN profiles p ON p.user_id=t.user_id ORDER BY CASE t.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'manager' THEN 2 WHEN 'moderator' THEN 3 ELSE 4 END LIMIT 100`)).rows;
  return json({reports,tickets,team,role:user.role,profilePhotos,mediaPending,textsPending});
 }
 if(m==='GET'&&p==='/api/admin/users'){
  if(!await allowed(env,user,'user.inspect') && roleLevel(user.role)<2)fail(403,'Kein Zugriff.');const query=clean(url.searchParams.get('q'),75);if(query.length<2)return json({users:[]});
  // Prefix matching avoids expensive full substring searches; only operational metadata is returned.
  const prefix=query.replace(/[/%_]/g,c=>'/'+c)+'%';
  const rows=(await main(env,`SELECT u.id,u.username,p.display_name AS name,u.is_banned AS banned,t.role,
     u.created_at AS createdAt,u.email_verified_at AS emailVerifiedAt,
      (SELECT 1 FROM official_accounts oa WHERE oa.user_id=u.id) AS official,
      (SELECT ph.id FROM photos ph WHERE ph.user_id=u.id AND ph.status='approved' ORDER BY ph.created_at DESC LIMIT 1) AS photoId
     FROM users u JOIN profiles p ON u.id=p.user_id LEFT JOIN team_members t ON t.user_id=u.id
     WHERE u.username LIKE ? ESCAPE '/' OR u.email LIKE ? ESCAPE '/' OR p.display_name LIKE ? ESCAPE '/'
     ORDER BY u.created_at DESC LIMIT 25`,[prefix,prefix,prefix])).rows;
  // Only the CEO may obtain email in a directory search to assign staff roles.
  if(user.role==='owner'){for(const item of rows){const account=await one(env,'SELECT email FROM users WHERE id=?',[item.id]);item.email=account?.email||null;}}
  return json({users:rows});
 }
 if(m==='GET'&&/^\/api\/admin\/users\/[a-f\d-]{36}$/i.test(p)){
  if(!await allowed(env,user,'user.inspect'))fail(403,'Kein Zugriff.');
  const id=guardId(p.split('/').pop()),reason=clean(url.searchParams.get('reason'),200);
  if(reason.length<10)fail(400,'Bitte einen konkreten dienstlichen Grund angeben (mindestens 10 Zeichen).');
  const detail=await one(env,`SELECT u.id,u.username,u.created_at AS createdAt,u.last_login_at AS lastLoginAt,
    u.email_verified_at AS emailVerifiedAt,u.is_banned AS banned,t.role,p.display_name AS name,
    p.city,p.visible FROM users u JOIN profiles p ON p.user_id=u.id
    LEFT JOIN team_members t ON t.user_id=u.id WHERE u.id=?`,[id]);
  if(!detail)fail(404,'Konto nicht gefunden.');
  // Email visibility is restricted to admins and owner. No passwords, private chat or IP history.
  if(roleLevel(user.role)>=4){const account=await one(env,'SELECT email FROM users WHERE id=?',[id]);detail.email=account?.email||null;}
  await audit(env,user.id,'account_detail_view',id,reason);
  return json({user:detail});
 }
 if(m==='POST'&&p==='/api/admin/team'){
  if(!await allowed(env,user,'team.manage'))fail(403,'Nur der CEO kann Rollen verwalten.');const d=await data(req),target=guardId(d.userId);
  if(!['admin','manager','moderator','support','remove'].includes(d.role))fail(400,'Invalid role.');if(target===user.id)fail(400,'Cannot modify your own role.');
  await userExists(env,target);const existing=await getRole(env,target);if(existing==='owner')fail(403,'Owner roles can only be changed offline.');
  if(d.role==='remove') await main(env,'DELETE FROM team_members WHERE user_id=?',[target]);
  else await main(env,'INSERT INTO team_members(user_id,role,added_by) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET role=excluded.role,added_by=excluded.added_by',[target,d.role,user.id]);
  await audit(env,user.id,'team_change',target,String(d.role));return json({ok:true});
 }
 if(m==='GET'&&p==='/api/admin/audit'){
  if(!await allowed(env,user,'audit.view'))fail(403,'Keine Berechtigung.');const rows=(await main(env,`SELECT a.id,a.action,a.target_id AS targetId,a.details,a.created_at AS createdAt,
    u.username AS actorUsername,p.display_name AS actorName,
    (SELECT 1 FROM official_accounts o WHERE o.user_id=a.actor_id) AS official,
    (SELECT ph.id FROM photos ph WHERE ph.user_id=a.actor_id AND ph.status='approved' ORDER BY ph.created_at DESC LIMIT 1) AS photoId
    FROM admin_audit a LEFT JOIN users u ON u.id=a.actor_id LEFT JOIN profiles p ON p.user_id=a.actor_id
    ORDER BY a.created_at DESC LIMIT 75`)).rows;return json({audit:rows});
 }
 if(m==='POST'&&p==='/api/admin/moderate'){
  requireStaff(user,'moderator');const d=await data(req),target=guardId(d.userId),action=String(d.action||''),reason=clean(d.reason,500);
  if(reason.length<8)fail(400,'Bitte gib eine Begründung mit mindestens 8 Zeichen ein.');await userExists(env,target);
  const role=await getRole(env,target);if(roleLevel(role)>=roleLevel(user.role))fail(403,'Cannot moderate equal or higher team roles.');
  if(action==='warning'){
   await main(env,'INSERT INTO moderation_warnings(id,target_id,actor_id,reason) VALUES(?,?,?,?)',[uid(),target,user.id,reason]);
   await notify(env,target,'warning','Community warning',reason,user.id);
  } else if(action==='restrict'){
   requireStaff(user,'manager');const feature=String(d.feature||'');if(!['chat','likes','matching'].includes(feature))fail(400,'Invalid feature.');
   const days=Math.max(1,Math.min(365,Math.floor(Number(d.days)||1)));
   await main(env,`INSERT INTO user_restrictions(id,user_id,feature,reason,until_at,imposed_by) VALUES(?,?,?,?,datetime('now',?),?)`,[uid(),target,feature,reason,`+${days} days`,user.id]);
   await notify(env,target,'restriction','Feature restricted',`${feature}: ${reason}`,user.id);
  } else if(action==='ban' || action==='unban'){
   if(!await allowed(env,user,'account.suspend'))fail(403,'Keine Berechtigung.');
   if(action==='ban')await suspendWithReason(env,user,target,reason,String(d.ruleId||'community'));
   else await reinstate(env,user,target,reason);
  } else fail(400,'Unknown action.');
  let emailSent=false,emailError=null;
  if(d.notifyEmail===true && ['warning','restrict','ban'].includes(action)){
    try{
      if(!mailConfigured(env))throw new Error('Mail service not configured');
      const targetUser=await one(env,'SELECT email FROM users WHERE id=?',[target]);
      await sendMail(env,{to:targetUser.email,subject:'Kennely · Mitteilung zu deinem Konto',
        text:`Hallo,\n\nEs wurde eine Moderationsmaßnahme zu deinem Konto durchgeführt.\nMaßnahme: ${action}\nGrund: ${reason}\n\nBei Fragen: support@kennely.de`});
      emailSent=true;
    }catch(e){emailError=e.message;}
  }
  await audit(env,user.id,action,target,reason);await pushLive(env,[target],'moderation');return json({ok:true,emailSent,emailError});
 }
 return null;
}

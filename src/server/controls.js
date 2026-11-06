/** Role-aware privacy, policy, identity, moderation and appeals. Server-side authority only. */
import {main,one} from './db.js';
import {clean} from './security.js';
import {DEFAULT_TERMS,normalizeWord,usernameReason,evaluateText} from './content-policy.js';
const uid=()=>crypto.randomUUID();
const levels={support:1,moderator:2,manager:3,admin:4,owner:5};
const level=u=>levels[u?.role]||0;
const idOk=v=>/^[0-9a-f-]{36}$/i.test(String(v||''));
const throwHttp=(status,message)=>{const err=new Error(message);err.status=status;throw err;};
const out=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
async function parse(req){if(!req.headers.get('content-type')?.startsWith('application/json'))throwHttp(415,'JSON benötigt.');const text=await req.text();if(text.length>15000)throwHttp(413,'Anfrage zu groß.');try{return JSON.parse(text)}catch{throwHttp(400,'Ungültige Angaben.')}}
async function log(env,actor,action,target,details=''){await main(env,'INSERT INTO admin_audit(id,actor_id,action,target_id,details) VALUES(?,?,?,?,?)',[uid(),actor,action,target,details]);}
const CAPS={
 'private.profile.review':2,'user.inspect':3,'identity.edit':3,'badge.manage':3,'account.suspend':4,'account.delete':5,
 'team.manage':5,'permissions.manage':5,'terms.manage':4,'labels.manage':5,'labels.self':1,'audit.view':4,'media.review':2,'reports.review':2,
 'account.warn':2,'account.restrict':3,'support.reply':1
};
export const CAPABILITIES=Object.freeze(Object.keys(CAPS));
export async function allowed(env,user,cap){
 if(!CAPABILITIES.includes(cap)||!user?.role)return false;
 if(user.role==='owner')return true;
 const personal=await one(env,'SELECT enabled FROM staff_permissions WHERE user_id=? AND capability=?',[user.id,cap]);
 if(personal)return Boolean(personal.enabled);
 const group=await one(env,'SELECT enabled FROM role_permissions WHERE role=? AND capability=?',[user.role,cap]);
 if(group)return Boolean(group.enabled);
 return level(user)>=CAPS[cap];
}
async function need(env,u,cap){if(!await allowed(env,u,cap))throwHttp(403,'Du hast keine Berechtigung für diese Aktion.');}
function idGuard(id){if(!idOk(id))throwHttp(400,'Ungültiges Konto.');return id;}
export async function policyFor(env,text){
 if(env.REGISTRATION_MODE==='public'&&DEFAULT_TERMS.length<3000)throwHttp(503,'Der mehrsprachige Wortfilter ist noch nicht vollständig eingerichtet.');
 const records=(await main(env,'SELECT term,action FROM moderation_terms ORDER BY term LIMIT 750')).rows;
 return evaluateText(text,records.filter(r=>r.action==='review').map(r=>r.term),records.filter(r=>r.action==='allow').map(r=>r.term));
}
export async function usernamePolicyFor(env,value){
 if(env.REGISTRATION_MODE==='public'&&DEFAULT_TERMS.length<3000)throwHttp(503,'Der mehrsprachige Wortfilter ist noch nicht vollständig eingerichtet.');
 const records=(await main(env,'SELECT term,action FROM moderation_terms ORDER BY term LIMIT 750')).rows;
 return usernameReason(value,records.filter(r=>r.action==='review').map(r=>r.term),records.filter(r=>r.action==='allow').map(r=>r.term));
}
export async function suspendWithReason(env,operator,target,reason,ruleId='community'){
 idGuard(target);if(target===operator.id)throwHttp(403,'Eigene Sperre nicht möglich.');
 const role=(await one(env,'SELECT role FROM team_members WHERE user_id=?',[target]))?.role;
 if(level({role})>=level(operator))throwHttp(403,'Gleichrangige oder höhere Teammitglieder sind geschützt.');
 await main(env,`INSERT INTO account_states(user_id,reason,rule_id,suspended_by) VALUES(?,?,?,?)
 ON CONFLICT(user_id) DO UPDATE SET reason=excluded.reason,rule_id=excluded.rule_id,suspended_by=excluded.suspended_by,
 suspended_at=CURRENT_TIMESTAMP,grace_until=datetime('now','+30 days'),appealed_at=NULL,appeal_reason=NULL,appeal_status='none',resolved_by=NULL,reviewed_at=NULL`,[target,reason,ruleId,operator.id]);
 await main(env,'UPDATE users SET is_banned=1 WHERE id=?',[target]);
 await log(env,operator.id,'account_suspended',target,`${ruleId}: ${reason}`);
 // Do not silently delete content; evidence and decisions may be required for complaints or statutory holds.
 return true;
}
export async function reinstate(env,operator,target,reason){
 await main(env,'UPDATE users SET is_banned=0 WHERE id=?',[target]);
 await main(env,"UPDATE account_states SET appeal_status='accepted',reviewed_at=CURRENT_TIMESTAMP,resolved_by=? WHERE user_id=?",[operator.id,target]);
 await log(env,operator.id,'account_reinstated',target,reason);
}
export async function controls(req,env,user){
 const url=new URL(req.url),path=url.pathname,method=req.method;
 if(method==='GET'&&path==='/api/account/suspension'){
   const record=await one(env,'SELECT reason,rule_id AS ruleId,suspended_at AS suspendedAt,grace_until AS graceUntil,appealed_at AS appealedAt,appeal_status AS appealStatus FROM account_states WHERE user_id=?',[user.id]);
   return out({suspended:!!user.is_banned,state:record||null,policyUrl:'/legal/regeln',appealInfo:'/legal/beschwerden'});
 }
 if(method==='POST'&&path==='/api/account/appeal'){
   if(!user.is_banned)throwHttp(400,'Dieses Konto ist nicht gesperrt.');
   const d=await parse(req),reason=clean(d.reason,1800);
   if(reason.length<15)throwHttp(400,'Bitte begründe deinen Einspruch.');
   const state=await one(env,'SELECT appeal_status FROM account_states WHERE user_id=?',[user.id]);
   if(!state)throwHttp(404,'Keine Sperrentscheidung vorhanden.');
   if(state.appeal_status==='open')throwHttp(409,'Dein Einspruch liegt bereits zur Prüfung vor.');
   await main(env,"UPDATE account_states SET appealed_at=CURRENT_TIMESTAMP,appeal_reason=?,appeal_status='open' WHERE user_id=?",[reason,user.id]);
   await log(env,user.id,'suspension_appeal',user.id,'Einspruch eingereicht');return out({ok:true});
 }
 if(method==='GET'&&path==='/api/account/privacy'){
  const r=await one(env,'SELECT is_private AS isPrivate FROM profiles WHERE user_id=?',[user.id]);return out({isPrivate:!!r?.isPrivate});
 }
 if(method==='PATCH'&&path==='/api/account/privacy'){
  const d=await parse(req);if(typeof d.isPrivate!=='boolean')throwHttp(400,'Ungültige Privatsphäre-Einstellung.');
  await main(env,'UPDATE profiles SET is_private=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=?',[d.isPrivate?1:0,user.id]);
  if(d.isPrivate){await main(env,`DELETE FROM social_post_likes WHERE post_id IN
     (SELECT id FROM social_posts WHERE user_id=?) AND user_id<>? AND user_id NOT IN
     (SELECT follower_id FROM social_follows WHERE following_id=?)`,[user.id,user.id,user.id]);}
  if(!d.isPrivate) {
    // Do not silently approve pending follower requests. User must accept individually.
  }
  return out({ok:true,isPrivate:d.isPrivate});
 }
 if(method==='GET'&&path==='/api/account/identity'){
  const record=await one(env,`SELECT u.username,u.username_changed_at AS usernameChangedAt,
    p.display_name AS name,p.display_name_changed_at AS nameChangedAt
    FROM users u JOIN profiles p ON p.user_id=u.id WHERE u.id=?`,[user.id]);
  return out({identity:record});
 }
 if(method==='PATCH'&&path==='/api/account/identity'){
  const d=await parse(req);
  if(d.username===undefined&&d.name===undefined)throwHttp(400,'Keine Änderungen angegeben.');
  // Preflight both cooldowns before writing either field. Prevent a partial update
  // (username changed but display-name rejected) in the common two-field form.
  const currentIdentity=await one(env,`SELECT u.username,u.username_changed_at AS usernameChangedAt,
    p.display_name AS name,p.display_name_changed_at AS nameChangedAt
    FROM users u JOIN profiles p ON p.user_id=u.id WHERE u.id=?`,[user.id]);
  if(!currentIdentity)throwHttp(404,'Profil nicht gefunden.');
  if(d.username!==undefined){
   const value=String(d.username||'').trim().toLowerCase();
   if(value!==currentIdentity.username && currentIdentity.usernameChangedAt &&
      Date.parse(String(currentIdentity.usernameChangedAt).replace(' ','T')+(String(currentIdentity.usernameChangedAt).includes('T')?'':'Z'))+30*86400000>Date.now())
     throwHttp(429,'Nutzername kann nur alle 30 Tage geändert werden.');
  }
  if(d.name!==undefined){
   const value=clean(d.name,32);
   if(value!==String(currentIdentity.name||'') && currentIdentity.nameChangedAt &&
      Date.parse(String(currentIdentity.nameChangedAt).replace(' ','T')+(String(currentIdentity.nameChangedAt).includes('T')?'':'Z'))+7*86400000>Date.now())
     throwHttp(429,'Anzeigename kann nur alle 7 Tage geändert werden.');
  }
  if(d.username!==undefined){
   const username=String(d.username||'').trim().toLowerCase();
   const reason=await usernamePolicyFor(env,username);if(reason)throwHttp(400,reason);
   const current=await one(env,'SELECT username FROM users WHERE id=?',[user.id]);
   if(username!==current.username){
    const found=await one(env,'SELECT id FROM users WHERE username=? COLLATE NOCASE AND id<>?',[username,user.id]);if(found)throwHttp(409,'Nutzername bereits vergeben.');
    const result=await main(env,`UPDATE users SET username=?,username_changed_at=CURRENT_TIMESTAMP WHERE id=?
       AND (username_changed_at IS NULL OR username_changed_at<=datetime('now','-30 days'))`,[username,user.id]);
    if(result.count===0)throwHttp(429,'Nutzername kann nur alle 30 Tage geändert werden.');
   }
  }
  if(d.name!==undefined){
   const name=clean(d.name,32);
   const current=await one(env,'SELECT display_name FROM profiles WHERE user_id=?',[user.id]);
   // Keep the visible fallback to username, but allow an empty optional display name.
   if(name!==String(current?.display_name||'')){
    const result=await main(env,`UPDATE profiles SET display_name=?,display_name_changed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
      WHERE user_id=? AND (display_name_changed_at IS NULL OR display_name_changed_at<=datetime('now','-7 days'))`,[name,user.id]);
    if(result.count===0)throwHttp(429,'Anzeigename kann nur alle 7 Tage geändert werden.');
   }
  }
  return out({ok:true});
 }
 if(method==='GET'&&path==='/api/account/privacy/preferences'){
  const p=await one(env,'SELECT is_private AS isPrivate,message_policy AS messagePolicy,follow_visibility AS followVisibility, comment_policy AS commentPolicy, discoverable, allow_story_reposts AS allowStoryReposts FROM profiles WHERE user_id=?',[user.id]);
  return out({privacy:{isPrivate:!!p?.isPrivate,messagePolicy:p?.messagePolicy||'everyone',followVisibility:p?.followVisibility||'everyone',commentPolicy:p?.commentPolicy||'everyone',discoverable:p?.discoverable!==0,allowStoryReposts:!!p?.allowStoryReposts}});
 }
 if(method==='PATCH'&&path==='/api/account/privacy/preferences'){
  const d=await parse(req),updates=[],args=[];
  if(d.isPrivate!==undefined){if(typeof d.isPrivate!=='boolean')throwHttp(400,'Ungültige Einstellung.');updates.push('is_private=?');args.push(d.isPrivate?1:0);}
  if(d.messagePolicy!==undefined){if(!['everyone','followers','nobody'].includes(d.messagePolicy))throwHttp(400,'Ungültige Chat-Einstellung.');updates.push('message_policy=?');args.push(d.messagePolicy);}
  if(d.followVisibility!==undefined){if(!['everyone','followers','only_me'].includes(d.followVisibility))throwHttp(400,'Ungültige Follower-Einstellung.');updates.push('follow_visibility=?');args.push(d.followVisibility);}
  if(d.commentPolicy!==undefined){if(!['everyone','followers','nobody'].includes(d.commentPolicy))throwHttp(400,'Ungültige Kommentar-Einstellung.');updates.push('comment_policy=?');args.push(d.commentPolicy);}
  if(d.allowStoryReposts!==undefined){if(typeof d.allowStoryReposts!=='boolean')throwHttp(400,'Ungültige Story-Einstellung.');updates.push('allow_story_reposts=?');args.push(d.allowStoryReposts?1:0);}
  if(d.discoverable!==undefined){if(typeof d.discoverable!=='boolean')throwHttp(400,'Ungültige Sichtbarkeit.');updates.push('discoverable=?');args.push(d.discoverable?1:0);}
  if(!updates.length)throwHttp(400,'Keine Änderungen.');
  await main(env,`UPDATE profiles SET ${updates.join(',')},updated_at=CURRENT_TIMESTAMP WHERE user_id=?`,[...args,user.id]);return out({ok:true});
 }
 if(!path.startsWith('/api/admin/'))return null;
 if(method==='GET'&&path==='/api/admin/permissions'){
  await need(env,user,'permissions.manage');
  const roleRules=(await main(env,'SELECT role,capability,enabled FROM role_permissions ORDER BY role,capability LIMIT 300')).rows;
  const individual=(await main(env,`SELECT s.user_id AS userId,u.username,s.capability,s.enabled FROM staff_permissions s JOIN users u ON u.id=s.user_id ORDER BY u.username,s.capability LIMIT 200`)).rows;
  return out({capabilities:CAPABILITIES,roleRules,individual,defaults:CAPS});
 }
 if(method==='POST'&&path==='/api/admin/permissions/batch'){
  await need(env,user,'permissions.manage');const d=await parse(req);
  const caps=[...new Set(Array.isArray(d.capabilities)?d.capabilities:[])];
  if(!caps.length||caps.length>CAPABILITIES.length||caps.some(c=>!CAPABILITIES.includes(c)))throwHttp(400,'Ungültige Berechtigungen.');
  if(caps.some(c=>['permissions.manage','team.manage','account.delete'].includes(c)))throwHttp(403,'CEO-Befugnisse sind nicht delegierbar.');
  if(typeof d.enabled!=='boolean')throwHttp(400,'Status fehlt.');
  const role=String(d.role||'');let target=null;
  if(d.userId){target=idGuard(d.userId);const t=await one(env,'SELECT role FROM team_members WHERE user_id=?',[target]);if(!t||t.role==='owner')throwHttp(403,'Ungültiges Teammitglied.');}
  else if(!['admin','manager','moderator','support'].includes(role))throwHttp(400,'Ungültige Rolle.');
  for(const cap of caps){if(target){await main(env,'INSERT INTO staff_permissions(user_id,capability,enabled) VALUES(?,?,?) ON CONFLICT(user_id,capability) DO UPDATE SET enabled=excluded.enabled',[target,cap,d.enabled?1:0]);}
   else await main(env,'INSERT INTO role_permissions(role,capability,enabled) VALUES(?,?,?) ON CONFLICT(role,capability) DO UPDATE SET enabled=excluded.enabled',[role,cap,d.enabled?1:0]);}
  await log(env,user.id,'permission_batch',target||role,`${caps.join(', ')} → ${d.enabled?'erlaubt':'verweigert'}`);return out({ok:true,changed:caps.length});
 }
 if(method==='POST'&&path==='/api/admin/permissions'){
  await need(env,user,'permissions.manage');const d=await parse(req);const role=String(d.role||''),cap=String(d.capability||'');
  if(!CAPABILITIES.includes(cap)||typeof d.enabled!=='boolean')throwHttp(400,'Ungültige Berechtigung.');
  if(cap==='permissions.manage'||cap==='team.manage'||cap==='account.delete')throwHttp(403,'Diese kritischen Befugnisse bleiben beim CEO.');
  if(d.userId){const id=idGuard(d.userId);const targetRole=(await one(env,'SELECT role FROM team_members WHERE user_id=?',[id]))?.role;
   if(!targetRole||targetRole==='owner')throwHttp(403,'Nur Teammitglieder außer CEO.');
   await main(env,'INSERT INTO staff_permissions(user_id,capability,enabled) VALUES(?,?,?) ON CONFLICT(user_id,capability) DO UPDATE SET enabled=excluded.enabled',[id,cap,d.enabled?1:0]);await log(env,user.id,'permission_person',id,`${cap} = ${d.enabled}`);
  }else{
   if(!['admin','manager','moderator','support'].includes(role))throwHttp(400,'Ungültige Rolle.');
   await main(env,'INSERT INTO role_permissions(role,capability,enabled) VALUES(?,?,?) ON CONFLICT(role,capability) DO UPDATE SET enabled=excluded.enabled',[role,cap,d.enabled?1:0]);await log(env,user.id,'permission_role',role,`${cap} = ${d.enabled}`);
  }
  return out({ok:true});
 }
 if(method==='GET'&&path==='/api/admin/terms'){
  await need(env,user,'terms.manage');
  const overrides=(await main(env,'SELECT term,action,language,updated_at AS updatedAt FROM moderation_terms ORDER BY updated_at DESC LIMIT 200')).rows;
  return out({defaults:DEFAULT_TERMS.slice(0,120),defaultCount:DEFAULT_TERMS.length,overrides});
 }
 if(method==='POST'&&path==='/api/admin/terms'){
  await need(env,user,'terms.manage');const d=await parse(req),term=clean(d.term,56).toLowerCase(),action=String(d.action);
  if(term.length<3||!/^[\p{L}\p{N}\s._-]+$/u.test(term)||!['review','allow','reset'].includes(action))throwHttp(400,'Ungültiger Listeneintrag.');
  if(action==='reset')await main(env,'DELETE FROM moderation_terms WHERE term=?',[term]);
  else await main(env,`INSERT INTO moderation_terms(term,action,language,changed_by) VALUES(?,?,?,?) ON CONFLICT(term) DO UPDATE SET action=excluded.action,language=excluded.language,changed_by=excluded.changed_by,updated_at=CURRENT_TIMESTAMP`,[term,action,clean(d.language,12)||'custom',user.id]);
  await log(env,user.id,'policy_term_'+action,term,'Einstellung der Wortliste geändert');return out({ok:true});
 }
 if(method==='POST'&&path==='/api/admin/identity'){
  const d=await parse(req),target=idGuard(d.userId),username=d.username===undefined?null:String(d.username||'').trim().toLowerCase();
  if(target===user.id)throwHttp(400,'Eigenes Profil bitte über die Kontoeinstellungen ändern.');
  await need(env,user,'identity.edit');
  const role=(await one(env,'SELECT role FROM team_members WHERE user_id=?',[target]))?.role;
  if(target!==user.id&&level({role})>=level(user))throwHttp(403,'Teamidentitäten dieser Rolle können nicht geändert werden.');
  const update=[];const args=[];
  if(username!==null){const invalid=await usernamePolicyFor(env,username);if(invalid)throwHttp(400,invalid);
   if(await one(env,'SELECT 1 AS n FROM users WHERE username=? COLLATE NOCASE AND id<>?',[username,target]))throwHttp(409,'Nutzername bereits vergeben.');
   update.push('username=?');args.push(username);
  }
  if(d.name!==undefined){const name=clean(d.name,32);await main(env,'UPDATE profiles SET display_name=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=?',[name,target]);}
  if(update.length)await main(env,`UPDATE users SET ${update.join(',')} WHERE id=?`,[...args,target]);
  await log(env,user.id,'identity_updated',target,`Username geändert: ${username!==null}; Anzeigename geändert: ${d.name!==undefined}`);return out({ok:true});
 }
 if(method==='POST'&&path==='/api/admin/badges'){
  await need(env,user,'badge.manage');const d=await parse(req),target=idGuard(d.userId),verified=d.verified;
  if(typeof verified!=='boolean')throwHttp(400,'Ungültige Auswahl.');
  if(verified)await main(env,"INSERT OR IGNORE INTO official_accounts(user_id,label) VALUES(?,'Verifiziert')",[target]);
  else await main(env,'DELETE FROM official_accounts WHERE user_id=?',[target]);
  await log(env,user.id,'badge_verified',target,verified?'verifiziert':'entfernt');return out({ok:true});
 }
 if(method==='POST'&&path==='/api/admin/labels'){
  const d=await parse(req),target=idGuard(d.userId),label=clean(d.label,26),color=String(d.color||'purple');
  await need(env,user,target===user.id?'labels.self':'labels.manage');
  if(!label||!['purple','blue','green','gold','gray'].includes(color)||!['add','remove'].includes(d.action))throwHttp(400,'Ungültiges Label.');
  if(target===user.id&&/\b(ceo|owner|admin|administrator|verifiziert|verified|offiziell|moderator|manager)\b/i.test(label))throwHttp(403,'Offizielle Rollen und Kennzeichnungen vergibt ausschließlich die Teamleitung.');
  if(d.action==='remove')await main(env,'DELETE FROM profile_labels WHERE user_id=? AND label=?',[target,label]);
  else{const n=await one(env,'SELECT COUNT(*) AS n FROM profile_labels WHERE user_id=?',[target]);if(Number(n?.n)>=5)throwHttp(400,'Maximal fünf Labels je Konto.');await main(env,'INSERT OR REPLACE INTO profile_labels(user_id,label,color,granted_by) VALUES(?,?,?,?)',[target,label,color,user.id]);}
  await log(env,user.id,'label_'+d.action,target,label);return out({ok:true});
 }
 if(method==='GET'&&path==='/api/admin/suspensions'){
  await need(env,user,'account.suspend');const rows=(await main(env,`SELECT s.user_id AS userId,u.username,s.reason,s.rule_id AS ruleId,s.grace_until AS graceUntil,s.appeal_status AS appealStatus,s.appeal_reason AS appealReason,s.suspended_at AS suspendedAt
 FROM account_states s JOIN users u ON u.id=s.user_id WHERE u.is_banned=1 ORDER BY s.suspended_at DESC LIMIT 50`)).rows;return out({cases:rows});
 }
 if(method==='POST'&&path==='/api/admin/suspend'){
  await need(env,user,'account.suspend');const d=await parse(req),target=idGuard(d.userId),reason=clean(d.reason,700),rule=String(d.ruleId||'community');
  if(reason.length<12||!['community','harassment','hate','spam','impersonation','sexual-minors','illegal-content','privacy','other'].includes(rule))throwHttp(400,'Konkreten Grund und Regel auswählen.');
  await suspendWithReason(env,user,target,reason,rule);return out({ok:true});
 }
 if(method==='POST'&&path==='/api/admin/reinstate'){
  await need(env,user,'account.suspend');const d=await parse(req),target=idGuard(d.userId),reason=clean(d.reason,500);
  if(reason.length<10)throwHttp(400,'Begründung erforderlich.');await reinstate(env,user,target,reason);return out({ok:true});
 }
 if(method==='POST'&&path==='/api/admin/appeals/review'){
  await need(env,user,'account.suspend');const d=await parse(req),target=idGuard(d.userId),decision=String(d.decision),reason=clean(d.reason,500);
  if(!['accepted','rejected'].includes(decision)||reason.length<10)throwHttp(400,'Entscheidung begründen.');
  const state=await one(env,"SELECT appeal_status FROM account_states WHERE user_id=?",[target]);if(state?.appeal_status!=='open')throwHttp(409,'Kein offener Einspruch.');
  if(decision==='accepted')await reinstate(env,user,target,reason);
  else{await main(env,"UPDATE account_states SET appeal_status='rejected',resolved_by=?,reviewed_at=CURRENT_TIMESTAMP WHERE user_id=?",[user.id,target]);await log(env,user.id,'suspension_appeal_rejected',target,reason);}
  return out({ok:true});
 }
 return null;
}

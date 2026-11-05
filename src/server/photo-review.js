import {main,one} from './db.js';
import {pushLive} from './live.js';
import {sendMail,configured as mailConfigured} from './mail.js';
const levels={support:1,moderator:2,manager:3,admin:4,owner:5};
const level=r=>levels[r]||0;
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
const error=(status,message)=>{const e=new Error(message);e.status=status;throw e;};
const uid=()=>crypto.randomUUID();
const valid=id=>/^[a-f0-9-]{36}$/i.test(String(id||''));
function staff(user){if(level(user.role)<2)error(403,'Nur Moderation und darüber.');}
async function data(req){const s=await req.text();if(new TextEncoder().encode(s).length>6000)error(413,'Anfrage zu groß.');try{return JSON.parse(s);}catch{error(400,'Ungültige Daten.');}}
async function note(env,target,kind,title,body,actor){await main(env,'INSERT INTO notifications(id,user_id,kind,actor_id,title,body) VALUES(?,?,?,?,?,?)',[uid(),target,kind,title,body,actor]);await pushLive(env,[target],'notification');}
async function audit(env,actor,action,id,reason){await main(env,'INSERT INTO admin_audit(id,actor_id,action,target_id,details) VALUES(?,?,?,?,?)',[uid(),actor,action,id,reason]);}
const humanReason=(v)=>String(v||'').trim().slice(0,500);
export async function photoReviewRoutes(req,env,user){
 const url=new URL(req.url),path=url.pathname,method=req.method;
 if(path==='/api/admin/photo-queue'&&method==='GET'){
   staff(user);
   const rows=(await main(env,`SELECT ph.id,ph.user_id,ph.status,ph.created_at,ph.rejection_reason AS reason,
     p.display_name AS name,u.username,u.email,
     (SELECT COUNT(*) FROM photo_review_notes n WHERE n.photo_id=ph.id) AS forwards
     FROM photos ph JOIN users u ON u.id=ph.user_id JOIN profiles p ON p.user_id=u.id
     WHERE ph.status IN ('pending','rejected') ORDER BY CASE ph.status WHEN 'pending' THEN 0 ELSE 1 END, ph.created_at DESC LIMIT 100`)).rows;
   const assigned=(await main(env,`SELECT n.id,n.photo_id,n.note,n.created_at,p.display_name AS from_name
     FROM photo_review_notes n JOIN profiles p ON p.user_id=n.from_staff_id
     WHERE n.to_staff_id=? ORDER BY n.created_at DESC LIMIT 50`,[user.id])).rows;
   return json({photos:rows,assigned});
 }
 if(path==='/api/admin/photo-staff'&&method==='GET'){
   staff(user);
   const rows=(await main(env,`SELECT u.id,t.role,p.display_name AS name FROM team_members t
     JOIN users u ON u.id=t.user_id JOIN profiles p ON p.user_id=u.id
     WHERE u.is_banned=0 AND t.role IN ('moderator','manager','admin','owner') ORDER BY t.role,p.display_name LIMIT 100`)).rows;
   return json({staff:rows});
 }
 const match=path.match(/^\/api\/admin\/photos\/([a-f0-9-]{36})\/(forward|review)$/i);
 if(!match||method!=='POST')return null;
 staff(user);
 const photoId=match[1], action=match[2], body=await data(req);
 if(!valid(photoId))error(400,'Ungültiges Foto.');
 const photo=await one(env,`SELECT ph.id,ph.user_id,ph.status,u.email,u.is_banned
   FROM photos ph JOIN users u ON u.id=ph.user_id WHERE ph.id=?`,[photoId]);
 if(!photo)error(404,'Foto nicht gefunden.');
 const uploaderRole=(await one(env,'SELECT role FROM team_members WHERE user_id=?',[photo.user_id]))?.role;
 if(level(uploaderRole)>=level(user.role))error(403,'Überprüfung gleichrangiger Teammitglieder nicht erlaubt.');
 if(action==='forward'){
   if(photo.status!=='pending')error(409,'Nur offene Fotos können weitergeleitet werden.');
   const recipient=String(body.toStaffId||''),message=humanReason(body.note);
   if(!valid(recipient)||recipient===user.id||message.length<8)error(400,'Bitte Mitarbeiter und Nachricht angeben.');
   const toRole=(await one(env,'SELECT role FROM team_members WHERE user_id=?',[recipient]))?.role;
   if(level(toRole)<2)error(400,'Nur Moderation oder höhere Rollen dürfen Fotos prüfen.');
   await main(env,'INSERT INTO photo_review_notes(id,photo_id,from_staff_id,to_staff_id,note) VALUES(?,?,?,?,?)',
     [uid(),photoId,user.id,recipient,message]);
   await audit(env,user.id,'photo_forward',photoId,`To: ${recipient}. ${message}`);
   await note(env,recipient,'photo_review','Foto benötigt deine Entscheidung',message,user.id);
   return json({ok:true});
 }
 if(!['approved','rejected'].includes(body.decision))error(400,'Bitte Freigeben oder Ablehnen wählen.');
 if(photo.status!=='pending')error(409,'Dieses Foto wurde schon entschieden. Aktualisiere die Warteschlange.');
 const reason=humanReason(body.reason);
 if(body.decision==='rejected'&&reason.length<8)error(400,'Bitte eine nachvollziehbare Begründung eingeben.');
 const moderation=String(body.moderation||'none');
 if(!['none','warning','restrict','ban'].includes(moderation))error(400,'Ungültige Maßnahme.');
 if(body.decision==='approved'&&moderation!=='none')error(400,'Maßnahmen nur bei Ablehnung.');
 if(moderation==='restrict'&&level(user.role)<3)error(403,'Managerrechte erforderlich.');
 if(moderation==='ban'&&level(user.role)<4)error(403,'Adminrechte erforderlich.');
 if(moderation!=='none'&&reason.length<8)error(400,'Bitte Grund angeben.');
 await main(env,`UPDATE photos SET status=?,reviewed_at=CURRENT_TIMESTAMP,reviewed_by=?,rejection_reason=? WHERE id=? AND status='pending'`,
   [body.decision,user.id,body.decision==='rejected'?reason:null,photoId]);
 await main(env,'INSERT INTO photo_review_actions(id,photo_id,actor_id,action,note) VALUES(?,?,?,?,?)',
   [uid(),photoId,user.id,body.decision,reason]);
 await audit(env,user.id,'photo_'+body.decision,photoId,reason);
 await note(env,photo.user_id,'photo','Profilfoto '+(body.decision==='approved'?'freigegeben':'abgelehnt'),reason||'Dein Foto kann jetzt im Profil angezeigt werden.',user.id);
 if(moderation==='warning'){
   await main(env,'INSERT INTO moderation_warnings(id,target_id,actor_id,reason) VALUES(?,?,?,?)',[uid(),photo.user_id,user.id,reason]);
   await note(env,photo.user_id,'warning','Verwarnung von Kennely',reason,user.id);
 } else if(moderation==='restrict'){
   const feature=['chat','likes','matching'].includes(body.feature)?body.feature:'chat';
   const days=Math.min(365,Math.max(1,Math.floor(Number(body.days)||7)));
   await main(env,`INSERT INTO user_restrictions(id,user_id,feature,reason,until_at,imposed_by) VALUES(?,?,?,?,datetime('now',?),?)`,
     [uid(),photo.user_id,feature,reason,`+${days} days`,user.id]);
   await note(env,photo.user_id,'restriction','Funktion vorübergehend eingeschränkt',reason,user.id);
 } else if(moderation==='ban'){
   await main(env,'UPDATE users SET is_banned=1 WHERE id=?',[photo.user_id]);
   await main(env,'DELETE FROM sessions WHERE user_id=?',[photo.user_id]);
 }
 if(moderation!=='none')await audit(env,user.id,'photo_moderation_'+moderation,photo.user_id,reason);
 let emailSent=false,emailError=null;
 if(body.notifyEmail===true&&['warning','restrict','ban'].includes(moderation)){
   try{
     if(!mailConfigured(env))throw new Error('Mailversand nicht konfiguriert');
     const label=moderation==='ban'?'dein Konto gesperrt':moderation==='warning'?'eine Verwarnung ausgesprochen':'eine Funktion eingeschränkt';
     await sendMail(env,{to:photo.email,subject:'Kennely · Wichtige Mitteilung zu deinem Konto',text:`Hallo,\\n\\nWir haben ${label}.\\n\\nGrund: ${reason}\\n\\nWenn du die Entscheidung prüfen lassen möchtest, kontaktiere support@kennely.de.\\n\\nKennely Team`});
     emailSent=true;
   }catch(e){emailError=e.message;await audit(env,user.id,'photo_email_failed',photo.user_id,'Email send failed');}
 }
 await pushLive(env,[photo.user_id],'moderation',photoId);
 return json({ok:true,emailSent,emailError});
}

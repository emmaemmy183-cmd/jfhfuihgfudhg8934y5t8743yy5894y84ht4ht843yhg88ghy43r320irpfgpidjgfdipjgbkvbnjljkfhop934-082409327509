/** Gesicherte Benutzerkontolöschung: anzeigen, dann bewusst bestätigen. */
import {main,media,one} from '../src/server/db.js';
const emailArg=process.argv.find(x=>x.startsWith('--email='))?.slice(8)?.trim().toLowerCase();
const usernameArg=process.argv.find(x=>x.startsWith('--username='))?.slice(11)?.trim().toLowerCase();
const confirmed=process.argv.includes('--bestaetigen');
if(Number(!!emailArg)+Number(!!usernameArg)!==1){console.error('Verwendung: npm run user:delete -- --email=adresse@beispiel.de [--bestaetigen]');process.exit(1)}
const env=process.env;
const found=await one(env,`SELECT id,username,email,created_at FROM users WHERE ${emailArg?'email':'username'}=? COLLATE NOCASE`,[emailArg||usernameArg]);
if(!found){console.log('Kein Konto gefunden.');process.exit(0)}
console.log('Gefunden:',{id:found.id,username:found.username,email:found.email,created_at:found.created_at});
if(!confirmed){console.log('Vorschau. Löschen nur nach Backup mit: npm run user:delete -- --email='+found.email+' --bestaetigen');process.exit(0)}
const id=found.id;
const sqls=[
 ['DELETE FROM dm_report_evidence WHERE report_id IN (SELECT id FROM social_reports WHERE reporter_id=? OR target_user_id=?)',[id,id]],
 ['DELETE FROM dm_report_evidence WHERE message_id IN (SELECT id FROM social_dms WHERE sender_id=?)',[id]],
 ['DELETE FROM content_reviews WHERE user_id=?',[id]],
 ['DELETE FROM social_hidden_threads WHERE user_id=? OR thread_id IN (SELECT id FROM social_threads WHERE user_a=? OR user_b=?)',[id,id,id]],
 ['DELETE FROM social_media_forwards WHERE from_staff_id=? OR to_staff_id=? OR media_id IN (SELECT id FROM social_media WHERE user_id=?)',[id,id,id]],
 ['DELETE FROM social_dms WHERE thread_id IN (SELECT id FROM social_threads WHERE user_a=? OR user_b=?)',[id,id]],
 ['DELETE FROM social_dms WHERE sender_id=?',[id]],
 ['DELETE FROM social_threads WHERE user_a=? OR user_b=?',[id,id]],
 ['DELETE FROM social_post_likes WHERE user_id=? OR post_id IN (SELECT id FROM social_posts WHERE user_id=?)',[id,id]],
 ['DELETE FROM social_post_saves WHERE user_id=? OR post_id IN (SELECT id FROM social_posts WHERE user_id=?)',[id,id]],
 ['DELETE FROM social_comments WHERE user_id=? OR post_id IN (SELECT id FROM social_posts WHERE user_id=?)',[id,id]],
 ['DELETE FROM social_follow_requests WHERE follower_id=? OR following_id=?',[id,id]],
 ['DELETE FROM social_story_likes WHERE user_id=? OR story_id IN (SELECT id FROM social_stories WHERE user_id=?)',[id,id]],
 ['DELETE FROM profile_labels WHERE user_id=?',[id]],
 ['DELETE FROM staff_permissions WHERE user_id=?',[id]],
 ['DELETE FROM account_states WHERE user_id=?',[id]],
 ['DELETE FROM social_follows WHERE follower_id=? OR following_id=?',[id,id]],
 ['DELETE FROM social_posts WHERE user_id=?',[id]],
 ['DELETE FROM social_stories WHERE user_id=?',[id]],
 ['DELETE FROM social_media WHERE user_id=?',[id]],
 ['DELETE FROM social_reports WHERE reporter_id=? OR target_user_id=?',[id,id]],
 ['DELETE FROM social_appeals WHERE user_id=?',[id]],
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
// Note: two remote databases cannot share an atomic transaction. Export/backup first.
// Delete media only after account and posts have been inventoried.
const photoIds=(await main(env,'SELECT id FROM photos WHERE user_id=?',[id])).rows.map(x=>x.id);
const socialIds=(await main(env,'SELECT id FROM social_media WHERE user_id=?',[id])).rows.map(x=>x.id);
// Ancillary tables may have legacy historical schema; missing tables are skipped, other errors abort.
for(const [sql,args] of sqls){
 try{await main(env,sql,args)}catch(e){if(/no such table:/i.test(e.message))continue;throw e}
}
const remains=await one(env,'SELECT id FROM users WHERE id=?',[id]);
if(remains)throw new Error('Konto konnte nicht vollständig gelöscht werden. Bitte keine erneute Registrierung, zuerst prüfen.');
for(const item of [...photoIds,...socialIds]){
 try{await media(env,'DELETE FROM media WHERE id=?',[item])}catch(e){console.error('Medienlöschung fehlgeschlagen:',item,e.message)}
}
console.log('Konto und zugehörige Daten verarbeitet. Weitere Aufbewahrungen und Backups separat prüfen.');

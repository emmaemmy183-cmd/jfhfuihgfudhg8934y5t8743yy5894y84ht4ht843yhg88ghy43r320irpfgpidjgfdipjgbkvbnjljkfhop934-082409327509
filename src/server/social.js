import {main,media,one} from './db.js';
import {clean} from './security.js';
import {notify,checkFeature,roleLevel} from './features.js';
import {pushLive} from './live.js';
import {allowed,policyFor} from './controls.js';

export class SocialError extends Error { constructor(status,message){super(message);this.status=status;} }
const err=(s,m)=>{throw new SocialError(s,m);};
const uid=()=>crypto.randomUUID();
const valid=id=>/^[0-9a-f-]{36}$/i.test(String(id||''));
const output=(obj,status=200,extra={})=>new Response(JSON.stringify(obj),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...extra}});
async function body(req,max=9000){if(req.headers.get('content-type')?.split(';')[0]!=='application/json')err(415,'JSON required');const raw=await req.text();if(new TextEncoder().encode(raw).length>max)err(413,'Request too large');try{return JSON.parse(raw);}catch{err(400,'Invalid JSON');}}
const idGuard=id=>{if(!valid(id))err(400,'Ungültige Kennung');return id;};
const allowedReason=new Set(['spam','abuse','hate','nudity','copyright','under18','impersonation','illegal','other']);
async function blocked(env,a,b){return !!await one(env,'SELECT 1 AS found FROM blocks WHERE (blocker_id=? AND blocked_id=?) OR (blocker_id=? AND blocked_id=?)',[a,b,b,a]);}
async function target(env,id){idGuard(id);const row=await one(env,`SELECT u.id,u.username,p.display_name AS name,p.bio,p.city,p.visible,p.is_private AS isPrivate,u.is_banned,
 (SELECT role FROM team_members t WHERE t.user_id=u.id) AS role,
 (SELECT 1 FROM official_accounts o WHERE o.user_id=u.id) AS official,
 (SELECT ph.id FROM photos ph WHERE ph.user_id=u.id AND ph.status='approved' ORDER BY ph.created_at DESC LIMIT 1) AS photoId
 FROM users u JOIN profiles p ON p.user_id=u.id WHERE u.id=?`,[id]);if(!row||row.is_banned||!row.visible)err(404,'Profile not available');return row;}
async function postVisible(env,id,userId){idGuard(id);const r=await one(env,`SELECT sp.id,sp.user_id,sp.caption,sp.media_id,sp.visibility,sp.status,sm.status AS media_status
 FROM social_posts sp LEFT JOIN social_media sm ON sm.id=sp.media_id WHERE sp.id=?`,[id]);
 if(!r||r.status!=='published'||(r.media_id&&r.media_status!=='approved'))err(404,'Beitrag nicht verfügbar');
 if(!await one(env,"SELECT 1 AS ok FROM content_reviews WHERE content_type='post' AND content_id=? AND status='approved'",[id]))err(404,'Beitrag wartet auf Freigabe');
 if(await blocked(env,userId,r.user_id))err(404,'Post not available');
 if((r.visibility==='followers'||(await one(env,'SELECT is_private FROM profiles WHERE user_id=?',[r.user_id]))?.is_private)&&r.user_id!==userId&&!await one(env,'SELECT 1 AS f FROM social_follows WHERE follower_id=? AND following_id=?',[userId,r.user_id]))err(403,'Followers only');
 return r;}
function imageType(bytes,mime){const jpg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;const png=bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71;const webp=new TextDecoder().decode(bytes.subarray(0,4))==='RIFF'&&new TextDecoder().decode(bytes.subarray(8,12))==='WEBP';return mime==='image/jpeg'&&jpg||mime==='image/png'&&png||mime==='image/webp'&&webp;}
async function audit(env,user,action,id,note=''){await main(env,'INSERT INTO admin_audit(id,actor_id,action,target_id,details) VALUES(?,?,?,?,?)',[uid(),user,action,id,note]);}
const userDetails=`u.id AS authorId,u.username,p.display_name AS name,(SELECT role FROM team_members t WHERE t.user_id=u.id) AS role,(SELECT 1 FROM official_accounts a WHERE a.user_id=u.id) AS official,(SELECT ph.id FROM photos ph WHERE ph.user_id=u.id AND ph.status='approved' ORDER BY ph.created_at DESC LIMIT 1) AS photoId`;
function feedSQL(where){return `SELECT sp.id,sp.user_id AS userId,sp.caption,sp.media_id AS mediaId,sp.visibility,sp.created_at AS createdAt,sm.mime AS mediaMime,${userDetails},
 (SELECT COUNT(*) FROM social_post_likes l WHERE l.post_id=sp.id) AS likes,
 (SELECT COUNT(*) FROM social_comments c WHERE c.post_id=sp.id AND c.status='published' AND EXISTS(SELECT 1 FROM content_reviews cr WHERE cr.content_type='comment' AND cr.content_id=c.id AND cr.status='approved')) AS comments,
 (SELECT 1 FROM social_post_likes l WHERE l.post_id=sp.id AND l.user_id=?) AS liked,
 (SELECT 1 FROM social_post_saves s WHERE s.post_id=sp.id AND s.user_id=?) AS saved
 FROM social_posts sp JOIN users u ON u.id=sp.user_id JOIN profiles p ON p.user_id=u.id
 LEFT JOIN social_media sm ON sm.id=sp.media_id WHERE sp.status='published' AND (sp.media_id IS NULL OR sm.status='approved') AND u.is_banned=0
 AND EXISTS(SELECT 1 FROM content_reviews cr WHERE cr.content_type='post' AND cr.content_id=sp.id AND cr.status='approved') AND p.visible=1 AND (p.is_private=0 OR u.id=? OR EXISTS(SELECT 1 FROM social_follows sf WHERE sf.follower_id=? AND sf.following_id=u.id)) AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=? AND b.blocked_id=u.id) OR (b.blocked_id=? AND b.blocker_id=u.id)) AND ${where}`;}
const staff=async(env,user,cap='media.review')=>{if(!await allowed(env,user,cap))err(403,'Team permission required');};
export async function socialRoutes(req,env,user){const url=new URL(req.url),path=url.pathname,method=req.method;
 if(!path.startsWith('/api/social/'))return null;
 const offset=Math.max(0,Math.min(100000,Number(url.searchParams.get('offset'))||0));
 if(method==='GET'&&['/api/social/feed','/api/social/explore','/api/social/official','/api/social/saved','/api/social/liked'].includes(path)){
  let filter='(sp.visibility=\'public\' OR sp.user_id=? OR EXISTS(SELECT 1 FROM social_follows sf WHERE sf.follower_id=? AND sf.following_id=sp.user_id))';let tail=[];
  if(path==='/api/social/liked') filter+=' AND EXISTS(SELECT 1 FROM social_post_likes pl WHERE pl.user_id=? AND pl.post_id=sp.id)';
  if(path==='/api/social/official') filter+=' AND EXISTS(SELECT 1 FROM official_accounts oa WHERE oa.user_id=u.id)';
  if(path==='/api/social/saved') filter+=' AND EXISTS(SELECT 1 FROM social_post_saves ss WHERE ss.user_id=? AND ss.post_id=sp.id)';
  if(path==='/api/social/feed'&&url.searchParams.get('following')==='1')filter+=' AND (sp.user_id=? OR EXISTS(SELECT 1 FROM social_follows sf WHERE sf.follower_id=? AND sf.following_id=sp.user_id))';
  const params=[user.id,user.id,user.id,user.id,user.id,user.id,user.id,user.id];
  if(path==='/api/social/saved'||path==='/api/social/liked')params.push(user.id);
  if(path==='/api/social/feed'&&url.searchParams.get('following')==='1')params.push(user.id,user.id);
  const rows=(await main(env,feedSQL(filter)+' ORDER BY sp.created_at DESC,sp.id DESC LIMIT 21 OFFSET ?', [...params,offset])).rows;
  // Lightweight non-AI ranking over the current page; no clickstream storage.
  if(path==='/api/social/feed'&&url.searchParams.get('following')!=='1') rows.sort((a,b)=>{
    const score=x=>Math.log1p(Number(x.likes)||0)*2+Math.log1p(Number(x.comments)||0)*1.5-Math.max(0,(Date.now()-Date.parse(String(x.createdAt).replace(' ','T')+'Z'))/3600000)/24;
    return score(b)-score(a);
  });
  return output({posts:rows.slice(0,20),hasMore:rows.length>20,algorithm:'activity-recency-v1'});
 }
 if(method==='GET'&&path==='/api/social/stories'){
  const stories=(await main(env,`SELECT s.id,s.user_id AS userId,s.body,s.background,s.media_id AS mediaId,s.created_at AS createdAt,s.expires_at AS expiresAt,sm.mime AS mediaMime,${userDetails}
 FROM social_stories s JOIN users u ON u.id=s.user_id JOIN profiles p ON p.user_id=u.id LEFT JOIN social_media sm ON sm.id=s.media_id
 WHERE s.expires_at>CURRENT_TIMESTAMP AND EXISTS(SELECT 1 FROM content_reviews cr WHERE cr.content_type='story' AND cr.content_id=s.id AND cr.status='approved') AND (s.media_id IS NULL OR sm.status='approved') AND p.visible=1 AND u.is_banned=0
 AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=? AND b.blocked_id=u.id) OR (b.blocked_id=? AND b.blocker_id=u.id))
 AND (p.is_private=0 OR u.id=? OR EXISTS(SELECT 1 FROM social_follows f WHERE f.follower_id=? AND f.following_id=u.id))
 ORDER BY s.created_at DESC LIMIT 90`,[user.id,user.id,user.id,user.id])).rows;return output({stories});
 }
 if(method==='POST'&&/^\/api\/social\/stories\/[a-f\d-]{36}\/(like|reply|repost)$/i.test(path)){
  const [,storyId,action]=path.match(/^\/api\/social\/stories\/([a-f\d-]{36})\/(like|reply|repost)$/i);
  const story=await one(env,`SELECT s.*,p.is_private FROM social_stories s JOIN profiles p ON p.user_id=s.user_id
   WHERE s.id=? AND s.expires_at>CURRENT_TIMESTAMP`,[storyId]);
  if(!story||await blocked(env,user.id,story.user_id))err(404,'Story nicht verfügbar');
  if(story.is_private&&story.user_id!==user.id&&!await one(env,'SELECT 1 AS n FROM social_follows WHERE follower_id=? AND following_id=?',[user.id,story.user_id]))err(404,'Story nicht verfügbar');
  if(!await one(env,"SELECT 1 AS n FROM content_reviews WHERE content_type='story' AND content_id=? AND status='approved'",[storyId]))err(404,'Story wird geprüft.');
  if(action==='like'){
    const old=await one(env,'SELECT 1 AS n FROM social_story_likes WHERE story_id=? AND user_id=?',[storyId,user.id]);
    if(old){await main(env,'DELETE FROM social_story_likes WHERE story_id=? AND user_id=?',[storyId,user.id]);return output({liked:false});}
    await main(env,'INSERT INTO social_story_likes(story_id,user_id) VALUES(?,?)',[storyId,user.id]);
    if(story.user_id!==user.id)await notify(env,story.user_id,'story_like','Deine Story gefällt',`@${user.username} gefällt deine Story.`,user.id);return output({liked:true});
  }
  const d=await body(req);if(story.user_id===user.id)err(400,'Eigene Story nicht zulässig.');
  const text=clean(d.body,500);
  if(action==='reply'){
    if(!text)err(400,'Bitte eine Antwort eingeben.');const pair=[user.id,story.user_id].sort(),threadId=`${pair[0]}:${pair[1]}`;
    await main(env,"INSERT OR IGNORE INTO social_threads(id,user_a,user_b,initiator_id,status) VALUES(?,?,?,?,?)",[threadId,...pair,user.id,'pending']);
    const th=await one(env,'SELECT status,initiator_id FROM social_threads WHERE id=?',[threadId]);
    if(th.status==='pending'&&await one(env,'SELECT 1 AS n FROM social_dms WHERE thread_id=? LIMIT 1',[threadId]))err(403,'Warte, bis deine erste Nachrichtenanfrage angenommen wurde.');
    await main(env,'INSERT INTO social_dms(id,thread_id,sender_id,body) VALUES(?,?,?,?)',[uid(),threadId,user.id,`Antwort auf Story: ${text}`]);
    await notify(env,story.user_id,'message','Antwort auf deine Story',`@${user.username} hat auf deine Story geantwortet.`,user.id);return output({ok:true});
  }
  // A follower may read a private Story but must not broadcast it to the public.
  if(story.is_private)err(403,'Private Stories können nicht öffentlich geteilt werden.');
  // Repost becomes an ordinary moderated text post, never an unreviewed copy of the original private photo.
  const content=`Story von @${(await one(env,'SELECT username FROM users WHERE id=?',[story.user_id]))?.username||'Nutzer'}: ${text||'Schau dir diese Story an.'}`;
  const flagged=await policyFor(env,content);const id=uid(),auto=roleLevel(user.role)>=2&&!flagged.review;
  await main(env,"INSERT INTO social_posts(id,user_id,caption,visibility) VALUES(?,?,?,'public')",[id,user.id,content]);
  await main(env,'INSERT INTO content_reviews(id,content_type,content_id,user_id,status,reason) VALUES(?,?,?,?,?,?)',[uid(),'post',id,user.id,auto?'approved':'pending',flagged.review?'Automatischer Prüfhinweis':'Repost benötigt Prüfung']);
  return output({ok:true,id,pendingReview:!auto},201);
 }
 if(method==='POST'&&path==='/api/social/media'){
  const mime=req.headers.get('content-type')?.split(';')[0]||'';
  const maxBytes=650_000;
  if(Number(req.headers.get('content-length')||0)>maxBytes)err(413,'Foto zu groß');
  const bytes=new Uint8Array(await req.arrayBuffer());
  if(bytes.length<32||bytes.length>maxBytes||!imageType(bytes,mime))err(415,'Nur JPG, PNG oder WebP bis 650 KB');
  const kind=url.searchParams.get('kind');if(!['post','story'].includes(kind))err(400,'Choose post or story');
  const recentUploads=await one(env,"SELECT COUNT(*) AS n FROM social_media WHERE user_id=? AND created_at>datetime('now','-1 hour')",[user.id]);
  if(Number(recentUploads?.n||0)>=18)err(429,'Too many uploads in a short period');
  const id=uid(),trusted=roleLevel(user.role)>=2;
  await media(env,'INSERT INTO media(id,owner_id,mime,content) VALUES(?,?,?,?)',[id,user.id,mime,bytes]);
  try{await main(env,"INSERT INTO social_media(id,user_id,mime,kind,status) VALUES(?,?,?,?,?)",[id,user.id,mime,kind,trusted?'approved':'pending']);}
  catch(e){await media(env,'DELETE FROM media WHERE id=?',[id]).catch(()=>{});throw e;}
  return output({id,status:trusted?'approved':'pending',message:trusted?'Foto veröffentlicht':'Dein Foto wird geprüft.'},201);
 }
 if(method==='GET'&&path.startsWith('/api/social/media/')){
  const id=idGuard(path.slice('/api/social/media/'.length)),r=await one(env,'SELECT * FROM social_media WHERE id=?',[id]);if(!r)err(404,'Media not found');
  if(r.status!=='approved'&&r.user_id!==user.id&&roleLevel(user.role)<2)err(404,'Medium nicht verfügbar');
  if(r.status==='approved'&&await blocked(env,user.id,r.user_id))err(404,'Medium nicht verfügbar');
  if(r.status==='approved'&&r.user_id!==user.id&&roleLevel(user.role)<2){
    const privacy=await one(env,'SELECT is_private FROM profiles WHERE user_id=?',[r.user_id]);
    if(privacy?.is_private&&!await one(env,'SELECT 1 AS yes FROM social_follows WHERE follower_id=? AND following_id=?',[user.id,r.user_id]))err(404,'Medium nicht verfügbar');
    if(r.kind==='post'){
      const allowed=await one(env,`SELECT 1 AS ok FROM social_posts p WHERE p.media_id=? AND p.status='published'
        AND (p.visibility='public' OR EXISTS(SELECT 1 FROM social_follows f WHERE f.follower_id=? AND f.following_id=p.user_id)) LIMIT 1`,[id,user.id]);
      if(!allowed)err(404,'Medium nicht verfügbar');
    }else{
      const allowed=await one(env,'SELECT 1 AS ok FROM social_stories WHERE media_id=? AND expires_at>CURRENT_TIMESTAMP LIMIT 1',[id]);
      if(!allowed)err(404,'Medium nicht verfügbar');
    }
  }
  if(r.user_id!==user.id&&roleLevel(user.role)>=2&&r.status!=='approved')await audit(env,user.id,'review_media_view',id);
  if(r.mime.startsWith('video/')){
    if(!env.MEDIA_BUCKET)err(503,'Videospeicher nicht erreichbar');
    const object=await env.MEDIA_BUCKET.get(id,{range:req.headers});if(!object)err(404,'Video nicht vorhanden');
    const h=new Headers({'content-type':r.mime,'x-content-type-options':'nosniff','cache-control':r.status==='approved'?'private, max-age=180':'no-store','accept-ranges':'bytes'});
    if(object.range&&object.size){const start=object.range.offset||0;const length=object.range.length||object.size;h.set('content-range',`bytes ${start}-${start+length-1}/${object.size}`);h.set('content-length',String(length));}
    return new Response(object.body,{status:object.range?206:200,headers:h});
  }
  const blob=await media(env,'SELECT mime,content FROM media WHERE id=?',[id]);if(!blob.rows[0])err(404,'Medium nicht verfügbar');
  return new Response(blob.rows[0].content,{headers:{'content-type':blob.rows[0].mime,'cache-control':r.status==='approved'?'private, max-age=180':'no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; sandbox"}});
 }
 if(method==='POST'&&path==='/api/social/posts'){
  const d=await body(req),caption=clean(d.caption,1500),mediaId=d.mediaId||null;
  if(!caption&&!mediaId)err(400,'Write something or choose a photo');
  if(mediaId){idGuard(mediaId);const m=await one(env,'SELECT kind,status FROM social_media WHERE id=? AND user_id=?',[mediaId,user.id]);if(!m||m.kind!=='post')err(400,'Ungültiger Upload');}
  const recent=await one(env,"SELECT COUNT(*) AS n FROM social_posts WHERE user_id=? AND created_at>datetime('now','-1 hour')",[user.id]);if(Number(recent.n)>25)err(429,'Posting too frequently');
  const visibility=['public','followers'].includes(d.visibility)?d.visibility:'public',id=uid(),policy=await policyFor(env,caption),auto=roleLevel(user.role)>=2&&!policy.review;
  await main(env,'INSERT INTO social_posts(id,user_id,caption,media_id,visibility) VALUES(?,?,?,?,?)',[id,user.id,caption,mediaId,visibility]);
  await main(env,'INSERT INTO content_reviews(id,content_type,content_id,user_id,status,reason) VALUES(?,?,?,?,?,?)',[uid(),'post',id,user.id,auto?'approved':'pending',policy.review?'Automatischer Prüfhinweis (mehrsprachige Wortliste).':'' ]);
  return output({ok:true,id,pendingReview:!auto,policyReview:policy.review},201);
 }
 if(method==='POST'&&path==='/api/social/stories'){
  const d=await body(req),txt=clean(d.body,320),mediaId=d.mediaId||null;
  if(!txt&&!mediaId)err(400,'Add a photo or some text');
  if(mediaId){idGuard(mediaId);const m=await one(env,'SELECT kind FROM social_media WHERE id=? AND user_id=?',[mediaId,user.id]);if(!m||m.kind!=='story')err(400,'Invalid story photo');}
  const recent=await one(env,"SELECT COUNT(*) AS n FROM social_stories WHERE user_id=? AND created_at>datetime('now','-1 hour')",[user.id]);if(Number(recent.n)>=12)err(429,'Too many stories');
  const bg=/^#[\da-f]{6}$/i.test(d.background||'')?d.background:'#6436d8',id=uid(),policy=await policyFor(env,txt),auto=roleLevel(user.role)>=2&&!policy.review;
  await main(env,'INSERT INTO social_stories(id,user_id,media_id,body,background) VALUES(?,?,?,?,?)',[id,user.id,mediaId,txt,bg]);
  await main(env,'INSERT INTO content_reviews(id,content_type,content_id,user_id,status,reason) VALUES(?,?,?,?,?,?)',[uid(),'story',id,user.id,auto?'approved':'pending',policy.review?'Automatischer Prüfhinweis (mehrsprachige Wortliste).':'' ]);
  return output({ok:true,id,pendingReview:!auto,expiresInHours:24},201);
 }
 if(method==='GET'&&path.startsWith('/api/social/profiles/')){
  const id=idGuard(path.slice('/api/social/profiles/'.length)),p=await target(env,id);
  if(await blocked(env,user.id,id))err(404,'Profile unavailable');
  const posts=(await main(env,`SELECT sp.id,sp.caption,sp.media_id AS mediaId,sm.mime AS mediaMime,sp.created_at AS createdAt FROM social_posts sp LEFT JOIN social_media sm ON sm.id=sp.media_id
  WHERE sp.user_id=? AND sp.status='published' AND (sp.media_id IS NULL OR sm.status='approved') AND EXISTS(SELECT 1 FROM content_reviews cr WHERE cr.content_type='post' AND cr.content_id=sp.id AND cr.status='approved') AND ((sp.visibility='public' AND ?=0) OR sp.user_id=? OR EXISTS(SELECT 1 FROM social_follows sf WHERE sf.follower_id=? AND sf.following_id=?)) ORDER BY sp.created_at DESC LIMIT 60`,[id,p.isPrivate?1:0,user.id,user.id,id])).rows;
  const followers=(await one(env,'SELECT COUNT(*) AS n FROM social_follows WHERE following_id=?',[id]))?.n||0;
  const following=(await one(env,'SELECT COUNT(*) AS n FROM social_follows WHERE follower_id=?',[id]))?.n||0;
  const totalLikes=(await one(env,`SELECT COUNT(*) AS n FROM social_post_likes l JOIN social_posts p ON p.id=l.post_id WHERE p.user_id=? AND p.status='published'`,[id]))?.n||0;
  const followingUser=!!await one(env,'SELECT 1 AS n FROM social_follows WHERE follower_id=? AND following_id=?',[user.id,id]);
  const requested=!!await one(env,'SELECT 1 AS n FROM social_follow_requests WHERE follower_id=? AND following_id=?',[user.id,id]);
  const labels=(await main(env,'SELECT label,color FROM profile_labels WHERE user_id=? LIMIT 5',[id])).rows;
  return output({profile:{...p,followers,following,totalLikes,followingUser,requested,labels,posts}});
 }
 if(method==='POST'&&path==='/api/social/follow'){
  const d=await body(req),to=idGuard(d.userId);if(to===user.id)err(400,'Cannot follow yourself');await target(env,to);if(await blocked(env,user.id,to))err(403,'Profile not available');
  const existing=await one(env,'SELECT 1 AS e FROM social_follows WHERE follower_id=? AND following_id=?',[user.id,to]);
  if(existing){await main(env,'DELETE FROM social_follows WHERE follower_id=? AND following_id=?',[user.id,to]);return output({following:false,requested:false});}
  const pending=await one(env,'SELECT 1 AS e FROM social_follow_requests WHERE follower_id=? AND following_id=?',[user.id,to]);
  if(pending){await main(env,'DELETE FROM social_follow_requests WHERE follower_id=? AND following_id=?',[user.id,to]);return output({following:false,requested:false});}
  const p=await one(env,'SELECT is_private FROM profiles WHERE user_id=?',[to]);
  if(p?.is_private){await main(env,'INSERT OR IGNORE INTO social_follow_requests(follower_id,following_id) VALUES(?,?)',[user.id,to]);await notify(env,to,'follow_request','Neue Follow-Anfrage',`${user.username||'Jemand'} möchte dir folgen.`,user.id);return output({following:false,requested:true});}
  await main(env,'INSERT OR IGNORE INTO social_follows(follower_id,following_id) VALUES(?,?)',[user.id,to]);await notify(env,to,'follow','Neuer Follower',`${user.username||'Jemand'} folgt dir jetzt`,user.id);await pushLive(env,[to],'notification');return output({following:true,requested:false});
 }
 if(method==='GET'&&path==='/api/social/follow-requests'){
  const rows=(await main(env,`SELECT f.follower_id AS userId,u.username,p.display_name AS name,f.created_at AS createdAt
    FROM social_follow_requests f JOIN users u ON u.id=f.follower_id JOIN profiles p ON p.user_id=u.id
    WHERE f.following_id=? ORDER BY f.created_at DESC LIMIT 40`,[user.id])).rows;
  return output({requests:rows});
 }
 if(method==='POST'&&path==='/api/social/follow-requests'){
  const d=await body(req),from=idGuard(d.userId),decision=String(d.decision);
  if(!['accept','reject'].includes(decision))err(400,'Ungültige Entscheidung.');
  const pending=await one(env,'SELECT 1 AS n FROM social_follow_requests WHERE follower_id=? AND following_id=?',[from,user.id]);
  if(!pending)err(404,'Follow-Anfrage nicht gefunden.');
  await main(env,'DELETE FROM social_follow_requests WHERE follower_id=? AND following_id=?',[from,user.id]);
  if(decision==='accept'){await main(env,'INSERT OR IGNORE INTO social_follows(follower_id,following_id) VALUES(?,?)',[from,user.id]);await notify(env,from,'follow','Follow-Anfrage angenommen',`@${user.username} hat deine Anfrage bestätigt.`,user.id);}
  return output({ok:true});
 }
 if(method==='POST'&&/^\/api\/social\/posts\/[a-f\d-]{36}\/(like|save)$/i.test(path)){
  const [,id,action]=path.match(/^\/api\/social\/posts\/([a-f\d-]{36})\/(like|save)$/i),p=await postVisible(env,id,user.id);
  const table=action==='save'?'social_post_saves':'social_post_likes',existing=await one(env,`SELECT 1 AS e FROM ${table} WHERE user_id=? AND post_id=?`,[user.id,id]);
  if(existing){await main(env,`DELETE FROM ${table} WHERE user_id=? AND post_id=?`,[user.id,id]);return output({active:false});}
  await main(env,`INSERT OR IGNORE INTO ${table}(user_id,post_id) VALUES(?,?)`,[user.id,id]);
  if(action==='like'&&p.user_id!==user.id){await notify(env,p.user_id,'like','Neues Like',`${user.username||'Jemand'} gefällt dein Beitrag`,user.id);await pushLive(env,[p.user_id],'notification');}
  return output({active:true});
 }
 if(method==='GET'&&/^\/api\/social\/posts\/[a-f\d-]{36}\/comments$/i.test(path)){
  const id=path.split('/')[4];await postVisible(env,id,user.id);
  const rows=(await main(env,`SELECT c.id,c.user_id AS userId,c.body,c.created_at AS createdAt,u.username,p.display_name AS name,
  (SELECT role FROM team_members t WHERE t.user_id=u.id) AS role,(SELECT 1 FROM official_accounts oa WHERE oa.user_id=u.id) AS official
  FROM social_comments c JOIN users u ON u.id=c.user_id JOIN profiles p ON p.user_id=u.id WHERE c.post_id=? AND c.status='published' AND EXISTS(SELECT 1 FROM content_reviews cr WHERE cr.content_type='comment' AND cr.content_id=c.id AND cr.status='approved') AND u.is_banned=0 ORDER BY c.created_at ASC LIMIT 100`,[id])).rows;
  return output({comments:rows});
 }
 if(method==='POST'&&/^\/api\/social\/posts\/[a-f\d-]{36}\/comments$/i.test(path)){
  const id=path.split('/')[4],p=await postVisible(env,id,user.id),d=await body(req),txt=clean(d.body,500);
  if(!txt)err(400,'Comment is empty');const recent=await one(env,"SELECT COUNT(*) AS n FROM social_comments WHERE user_id=? AND created_at>datetime('now','-1 minute')",[user.id]);if(Number(recent.n)>=12)err(429,'Slow down');
  const cid=uid(),policy=await policyFor(env,txt),auto=roleLevel(user.role)>=2&&!policy.review;await main(env,'INSERT INTO social_comments(id,post_id,user_id,body) VALUES(?,?,?,?)',[cid,id,user.id,txt]);
  await main(env,'INSERT INTO content_reviews(id,content_type,content_id,user_id,status,reason) VALUES(?,?,?,?,?,?)',[uid(),'comment',cid,user.id,auto?'approved':'pending',policy.review?'Automatischer Prüfhinweis (mehrsprachige Wortliste).':'']);
  // Benachrichtigung erst nach Moderationsfreigabe des Kommentars.
  return output({ok:true},201);
 }
 if(method==='DELETE'&&/^\/api\/social\/posts\/[a-f\d-]{36}$/i.test(path)){
  const id=path.split('/')[4],p=await one(env,'SELECT user_id FROM social_posts WHERE id=?',[id]);if(!p)err(404,'No post');if(p.user_id!==user.id&&roleLevel(user.role)<2)err(403,'Not permitted');
  await main(env,"UPDATE social_posts SET status='removed' WHERE id=?",[id]);
  const img=await one(env,'SELECT media_id FROM social_posts WHERE id=?',[id]);
  if(img?.media_id){const m=await one(env,'SELECT mime FROM social_media WHERE id=?',[img.media_id]);if(m?.mime?.startsWith('video/'))await env.MEDIA_BUCKET?.delete(img.media_id).catch(()=>{});else await media(env,'DELETE FROM media WHERE id=?',[img.media_id]);}
  if(p.user_id!==user.id)await audit(env,user.id,'post_removed',id);return output({ok:true});
 }
 if(method==='POST'&&path==='/api/social/report'){
  const d=await body(req),reason=String(d.reason||'');if(!allowedReason.has(reason))err(400,'Select a valid reason');
  const type=String(d.type||'user'),id=idGuard(d.id);let targetId=null,postId=null,commentId=null,storyId=null;
  if(type==='user'){await target(env,id);targetId=id;}
  else if(type==='post'){const post=await postVisible(env,id,user.id);postId=id;targetId=post.user_id;}
  else if(type==='story'){const s=await one(env,'SELECT user_id FROM social_stories WHERE id=?',[id]);if(!s)err(404,'No story');storyId=id;targetId=s.user_id;}
  else if(type==='comment'){const c=await one(env,'SELECT user_id FROM social_comments WHERE id=?',[id]);if(!c)err(404,'No comment');commentId=id;targetId=c.user_id;}
  else err(400,'Unknown report target');
  if(targetId===user.id)err(400,'Cannot report own content');
  const recent=await one(env,"SELECT COUNT(*) AS n FROM social_reports WHERE reporter_id=? AND created_at>datetime('now','-1 hour')",[user.id]);if(Number(recent.n)>=15)err(429,'Zu viele Meldungen');
  await main(env,'INSERT INTO social_reports(id,reporter_id,target_user_id,post_id,comment_id,story_id,reason,details) VALUES(?,?,?,?,?,?,?,?)',[uid(),user.id,targetId,postId,commentId,storyId,reason,clean(d.details,800)]);
  return output({ok:true},201);
 }
 if(method==='POST'&&path==='/api/social/appeal'){
  const d=await body(req),reason=clean(d.reason,1000);if(reason.length<15)err(400,'Bitte begründe deinen Einspruch');
  await main(env,'INSERT INTO social_appeals(id,user_id,report_id,reason) VALUES(?,?,?,?)',[uid(),user.id,valid(d.reportId)?d.reportId:null,reason]);return output({ok:true},201);
 }
 if(method==='GET'&&path==='/api/social/dm'){
  const rows=(await main(env,`SELECT t.id,t.status,t.initiator_id AS initiatorId,t.created_at AS createdAt,u.id AS otherId,u.username,p.display_name AS name,
  (SELECT COUNT(*) FROM social_dms d WHERE d.thread_id=t.id AND d.sender_id<>? AND d.read_at IS NULL) AS unread,
  (SELECT ph.id FROM photos ph WHERE ph.user_id=u.id AND ph.status='approved' ORDER BY ph.created_at DESC LIMIT 1) AS photoId,
  (SELECT body FROM social_dms d WHERE d.thread_id=t.id ORDER BY created_at DESC LIMIT 1) AS lastMessage
  FROM social_threads t JOIN users u ON u.id=CASE WHEN t.user_a=? THEN t.user_b ELSE t.user_a END JOIN profiles p ON p.user_id=u.id
  WHERE (t.user_a=? OR t.user_b=?) AND t.status<>'declined' AND NOT EXISTS(SELECT 1 FROM social_hidden_threads h WHERE h.user_id=? AND h.thread_id=t.id) AND u.is_banned=0
 
  ORDER BY t.created_at DESC LIMIT 60`,[user.id,user.id,user.id,user.id,user.id])).rows;return output({threads:rows});
 }
 if(method==='GET'&&path==='/api/social/dm/unread'){
  const r=await one(env,`SELECT COUNT(*) AS count FROM social_dms d JOIN social_threads t ON t.id=d.thread_id
   WHERE d.sender_id<>? AND d.read_at IS NULL AND (t.user_a=? OR t.user_b=?)
   AND t.status<>'declined' AND NOT EXISTS(SELECT 1 FROM social_hidden_threads h WHERE h.user_id=? AND h.thread_id=t.id)`,[user.id,user.id,user.id,user.id]);
  return output({count:Number(r?.count||0)});
 }
 if(method==='POST'&&path==='/api/social/dm/open'){
  await checkFeature(env,user.id,'chat');const d=await body(req),other=idGuard(d.userId);
  if(other===user.id)err(400,'Choose another user');await target(env,other);if(await blocked(env,user.id,other))err(403,'Blocked');
  const [a,b]=[user.id,other].sort(),id=`${a}:${b}`;
  const isMutual=await one(env,`SELECT 1 AS mutual FROM social_follows f1 JOIN social_follows f2 ON f2.follower_id=f1.following_id AND f2.following_id=f1.follower_id WHERE f1.follower_id=? AND f1.following_id=?`,[user.id,other]);
  await main(env,"INSERT OR IGNORE INTO social_threads(id,user_a,user_b,initiator_id,status) VALUES(?,?,?,?,?)",[id,a,b,user.id,isMutual?'accepted':'pending']);return output({id});
 }
 if(/^\/api\/social\/dm\/[^/]+$/.test(path)&&method==='GET'){
  const id=decodeURIComponent(path.split('/').pop()),thread=await one(env,'SELECT * FROM social_threads WHERE id=? AND (user_a=? OR user_b=?)',[id,user.id,user.id]);if(!thread||thread.status==='declined')err(404,'Conversation unavailable');
  const other=thread.user_a===user.id?thread.user_b:thread.user_a;
  const rows=(await main(env,'SELECT id,sender_id AS senderId,body,created_at AS createdAt,read_at AS readAt FROM social_dms WHERE thread_id=? ORDER BY created_at DESC LIMIT 100',[id])).rows;
  if(rows.some(m=>m.senderId!==user.id&&!m.readAt))await main(env,'UPDATE social_dms SET read_at=CURRENT_TIMESTAMP WHERE thread_id=? AND sender_id<>? AND read_at IS NULL',[id,user.id]);
  return output({thread,messages:rows.reverse(),blocked:await blocked(env,user.id,other)});
 }
 if(/^\/api\/social\/dm\/[^/]+\/hide$/.test(path)&&method==='POST'){
  const id=decodeURIComponent(path.split('/')[4]);const thread=await one(env,'SELECT 1 AS ok FROM social_threads WHERE id=? AND (user_a=? OR user_b=?)',[id,user.id,user.id]);
  if(!thread)err(404,'Unterhaltung nicht gefunden');
  await main(env,'INSERT OR IGNORE INTO social_hidden_threads(user_id,thread_id) VALUES(?,?)',[user.id,id]);return output({ok:true});
 }
 if(/^\/api\/social\/dm\/[^/]+\/send$/.test(path)&&method==='POST'){
  await checkFeature(env,user.id,'chat');const id=decodeURIComponent(path.split('/')[4]),thread=await one(env,'SELECT * FROM social_threads WHERE id=? AND (user_a=? OR user_b=?)',[id,user.id,user.id]);if(!thread||thread.status==='declined')err(404,'Conversation unavailable');
  const other=thread.user_a===user.id?thread.user_b:thread.user_a;if(await blocked(env,user.id,other))err(403,'Blocked');
  const d=await body(req),txt=clean(d.body,2000);if(!txt)err(400,'Message is empty');
  if(thread.status==='pending'&&thread.initiator_id!==user.id)err(403,'Accept the request first');
  if(thread.status==='pending'&&await one(env,'SELECT 1 FROM social_dms WHERE thread_id=? LIMIT 1',[id]))err(403,'Only one message can be sent before acceptance');
  await main(env,'INSERT INTO social_dms(id,thread_id,sender_id,body) VALUES(?,?,?,?)',[uid(),id,user.id,txt]);await notify(env,other,'message','Neue Nachricht',`${user.username||'Someone'} hat dir eine Nachricht geschrieben`,user.id);await pushLive(env,[other],'message',id);
  return output({ok:true},201);
 }
 if(/^\/api\/social\/dm\/[^/]+\/typing$/.test(path)&&method==='POST'){
  const id=decodeURIComponent(path.split('/')[4]);const thread=await one(env,'SELECT * FROM social_threads WHERE id=? AND (user_a=? OR user_b=?)',[id,user.id,user.id]);
  if(!thread||thread.status!=='accepted')err(403,'Nicht erlaubt');
  const other=thread.user_a===user.id?thread.user_b:thread.user_a;
  if(await blocked(env,user.id,other))err(403,'Blockiert');
  await pushLive(env,[other],'typing',id);return output({ok:true});
 }
 if(/^\/api\/social\/dm\/[^/]+\/accept$/.test(path)&&method==='POST'){
  const id=decodeURIComponent(path.split('/')[4]),thread=await one(env,'SELECT * FROM social_threads WHERE id=?',[id]);
  if(!thread||thread.status!=='pending'||thread.initiator_id===user.id||![thread.user_a,thread.user_b].includes(user.id))err(403,'Cannot accept this request');
  await main(env,"UPDATE social_threads SET status='accepted' WHERE id=?",[id]);return output({ok:true});
 }
 if(method==='GET'&&path==='/api/social/admin/queue'){
  if(!await allowed(env,user,'media.review')&&!await allowed(env,user,'reports.review'))err(403,'Team permission required');
  const mediaRows=(await main(env,`SELECT m.id,m.kind,m.mime,m.status,m.created_at AS createdAt,u.username,p.display_name AS name,COALESCE(sp.caption,st.body,'') AS caption FROM social_media m JOIN users u ON u.id=m.user_id JOIN profiles p ON p.user_id=u.id LEFT JOIN social_posts sp ON sp.media_id=m.id LEFT JOIN social_stories st ON st.media_id=m.id WHERE m.status='pending' ORDER BY m.created_at ASC LIMIT 70`)).rows;
  const reports=(await main(env,"SELECT * FROM social_reports WHERE status='open' ORDER BY created_at DESC LIMIT 70")).rows;
  const appeals=(await main(env,"SELECT * FROM social_appeals WHERE status='open' ORDER BY created_at ASC LIMIT 70")).rows;
  const content=(await main(env,`SELECT cr.content_type AS type,cr.content_id AS id,cr.created_at AS createdAt, u.username,
     COALESCE(p.caption,s.body,c.body,'') AS body,cr.reason AS policyReason
     FROM content_reviews cr JOIN users u ON u.id=cr.user_id
     LEFT JOIN social_posts p ON cr.content_type='post' AND p.id=cr.content_id
     LEFT JOIN social_stories s ON cr.content_type='story' AND s.id=cr.content_id
     LEFT JOIN social_comments c ON cr.content_type='comment' AND c.id=cr.content_id
     WHERE cr.status='pending' AND ((cr.content_type='post' AND p.media_id IS NULL) OR (cr.content_type='story' AND s.media_id IS NULL) OR cr.content_type='comment')
     ORDER BY cr.created_at ASC LIMIT 100`)).rows;
  const pendingCount=Number((await one(env,"SELECT COUNT(*) AS n FROM content_reviews WHERE status='pending'"))?.n||0);
  return output({media:mediaRows,content,reports,appeals,pendingCount});
 }
 if(method==='GET'&&path==='/api/social/admin/staff'){
  await staff(env,user);const staffMembers=(await main(env,`SELECT u.id,p.display_name AS name,t.role FROM team_members t JOIN users u ON u.id=t.user_id JOIN profiles p ON p.user_id=u.id WHERE u.is_banned=0 AND t.role IN ('moderator','manager','admin','owner') ORDER BY p.display_name LIMIT 100`)).rows;
  return output({staff:staffMembers});
 }
 if(method==='POST'&&path==='/api/social/admin/forward'){
  await staff(env,user);const d=await body(req),id=idGuard(d.mediaId),to=idGuard(d.toStaffId),note=clean(d.note,600);
  if(to===user.id||note.length<8)err(400,'Bitte Mitarbeiter und Nachricht angeben');
  const mediaItem=await one(env,"SELECT 1 AS ok FROM social_media WHERE id=? AND status='pending'",[id]);
  const recipient=await one(env,"SELECT role FROM team_members WHERE user_id=?",[to]);
  if(!mediaItem||roleLevel(recipient?.role)<2)err(400,'Medium oder Mitarbeiter nicht verfügbar');
  await main(env,'INSERT INTO social_media_forwards(id,media_id,from_staff_id,to_staff_id,note) VALUES(?,?,?,?,?)',[uid(),id,user.id,to,note]);
  await audit(env,user.id,'media_forward',id,`An ${to}: ${note}`);
  await notify(env,to,'moderation','Inhalt zur gemeinsamen Prüfung',note,user.id);
  return output({ok:true});
 }
 if(method==='POST'&&path==='/api/social/admin/review'){
  await staff(env,user);const d=await body(req),id=idGuard(d.mediaId),status=d.status;
  if(!['approved','rejected'].includes(status))err(400,'Choose approve or reject');const row=await one(env,'SELECT * FROM social_media WHERE id=?',[id]);if(!row||row.status!=='pending')err(409,'Already decided');if(row.user_id===user.id)err(403,'Eigene Medien darfst du nicht freigeben.');const reason=clean(d.reason,600);
  if(status==='rejected'&&reason.length<6)err(400,'Give a reason');
  await main(env,'UPDATE social_media SET status=?,reviewed_by=?,review_reason=? WHERE id=? AND status=\'pending\'',[status,user.id,reason,id]);
  await audit(env,user.id,'social_media_'+status,id,reason);
  for(const type of ['post','story']){
    const related=type==='post'?'social_posts':'social_stories';
    const refs=(await main(env,`SELECT id FROM ${related} WHERE media_id=?`,[id])).rows;
    for(const item of refs){
      await main(env,"UPDATE content_reviews SET status=?,reviewer_id=?,reason=?,decided_at=CURRENT_TIMESTAMP WHERE content_type=? AND content_id=? AND status='pending'",[status,user.id,reason,type,item.id]);
      if(type==='story'&&status==='approved')await main(env,"UPDATE social_stories SET expires_at=datetime('now','+24 hours') WHERE id=?",[item.id]);
    }
  }
  await notify(env,row.user_id,'moderation',status==='approved'?'Medium freigegeben':'Medium abgelehnt',reason||'Dein Inhalt wurde geprüft.',user.id);
  if(status==='approved'){
    const followers=(await main(env,'SELECT follower_id AS id FROM social_follows WHERE following_id=? LIMIT 100',[row.user_id])).rows;
    await pushLive(env,followers.map(x=>x.id),'feed');
  }
  return output({ok:true});
 }
 if(method==='POST'&&path==='/api/social/admin/content-review'){
  await staff(env,user);const d=await body(req),id=idGuard(d.id),type=String(d.type||''),status=String(d.status||'');
  if(!['post','story','comment'].includes(type)||!['approved','rejected'].includes(status))err(400,'Ungültige Entscheidung');
  const entry=await one(env,'SELECT * FROM content_reviews WHERE content_type=? AND content_id=?',[type,id]);
  if(!entry||entry.status!=='pending')err(409,'Schon entschieden');if(entry.user_id===user.id)err(403,'Eigene Inhalte darfst du nicht freigeben.');
  const reason=clean(d.reason,600);if(status==='rejected'&&reason.length<6)err(400,'Bitte begründen');
  await main(env,"UPDATE content_reviews SET status=?,reviewer_id=?,reason=?,decided_at=CURRENT_TIMESTAMP WHERE content_type=? AND content_id=? AND status='pending'",[status,user.id,reason,type,id]);
  if(type==='story'&&status==='approved'){
    await main(env,"UPDATE social_stories SET expires_at=datetime('now','+24 hours') WHERE id=?",[id]);
    const st=await one(env,'SELECT body,user_id FROM social_stories WHERE id=?',[id]);
    for(const name of [...new Set((st?.body||'').match(/@[a-z][a-z0-9._]{9,23}/gi)||[])].slice(0,5)){
      const mention=await one(env,'SELECT id FROM users WHERE username=? COLLATE NOCASE',[name.slice(1)]);
      if(mention&&mention.id!==st.user_id)await notify(env,mention.id,'mention','Du wurdest in einer Story erwähnt','Eine neue Erwähnung ist verfügbar.',st.user_id);
    }
  }
  await audit(env,user.id,'content_'+status,id,`${type}: ${reason}`);
  await notify(env,entry.user_id,'moderation',status==='approved'?'Inhalt freigegeben':'Inhalt abgelehnt',reason||'Dein Beitrag wurde geprüft.',user.id);
  if(status==='approved'&&type==='comment'){const c=await one(env,'SELECT post_id,user_id FROM social_comments WHERE id=?',[id]);const post=await one(env,'SELECT user_id FROM social_posts WHERE id=?',[c?.post_id]);if(post&&post.user_id!==entry.user_id)await notify(env,post.user_id,'comment','Neuer Kommentar',`${user.username||'Jemand'} hat deinen Beitrag kommentiert.`,entry.user_id);}
  if(status==='approved'&&type==='post'){
    const followers=(await main(env,'SELECT follower_id AS id FROM social_follows WHERE following_id=? LIMIT 100',[entry.user_id])).rows;
    await pushLive(env,followers.map(x=>x.id),'feed');
  }
  await pushLive(env,[entry.user_id],'moderation');return output({ok:true});
 }
 // Nutzer übergeben explizit Belege zu einer gemeldeten Unterhaltung.
 if(method==='POST'&&/^\/api\/social\/dm\/[^/]+\/report$/.test(path)){
  const id=decodeURIComponent(path.split('/')[4]),thread=await one(env,'SELECT * FROM social_threads WHERE id=? AND (user_a=? OR user_b=?)',[id,user.id,user.id]);
  if(!thread)err(404,'Unterhaltung nicht vorhanden');
  const d=await body(req),details=clean(d.details,800),reason=String(d.reason||'abuse');
  if(!allowedReason.has(reason))err(400,'Ungültiger Grund');
  const other=thread.user_a===user.id?thread.user_b:thread.user_a;
  const recent=(await main(env,'SELECT id FROM social_dms WHERE thread_id=? ORDER BY created_at DESC LIMIT 20',[id])).rows;
  const rid=uid();await main(env,'INSERT INTO social_reports(id,reporter_id,target_user_id,reason,details) VALUES(?,?,?,?,?)',[rid,user.id,other,reason,details]);
  for(const m of recent)await main(env,'INSERT INTO dm_report_evidence(id,report_id,thread_id,message_id) VALUES(?,?,?,?)',[uid(),rid,id,m.id]);
  await audit(env,user.id,'dm_report_submit',rid,'Nutzer hat max. 20 Chatnachrichten als Belege übermittelt');
  return output({ok:true,reportId:rid},201);
 }
 // Kein freies Mitlesen. Nur Owner mit bestehender Nutzer-Meldung, erfasster Begründung und Audit.
 if(method==='GET'&&/^\/api\/social\/admin\/conversation-evidence\/[a-f0-9-]{36}$/.test(path)){
  if(user.role!=='owner')err(403,'Nur CEO');
  const rid=idGuard(path.split('/').pop()),reason=clean(url.searchParams.get('reason'),200);
  if(reason.length<12)err(400,'Begründung erforderlich');
  const report=await one(env,'SELECT id,reporter_id,target_user_id,reason,status,created_at FROM social_reports WHERE id=?',[rid]);
  if(!report)err(404,'Meldung fehlt');
  const evidence=(await main(env,`SELECT d.id,d.body,d.sender_id AS senderId,d.created_at AS createdAt
   FROM dm_report_evidence e JOIN social_dms d ON d.id=e.message_id AND d.thread_id=e.thread_id
   WHERE e.report_id=? ORDER BY d.created_at ASC LIMIT 20`,[rid])).rows;
  if(!evidence.length)err(404,'Keine vom Nutzer übermittelten Chatbelege');
  await audit(env,user.id,'chat_report_evidence_access',rid,reason);
  return output({report,evidence});
 }
 if(method==='POST'&&path==='/api/social/admin/report'){
  await staff(env,user,'reports.review');const d=await body(req),id=idGuard(d.reportId),status=d.status;
  if(!['resolved','dismissed'].includes(status))err(400,'Ungültige Entscheidung');const r=await one(env,'SELECT * FROM social_reports WHERE id=?',[id]);if(!r||r.status!=='open')err(409,'Meldung wurde bereits bearbeitet');
  if(status==='resolved'&&d.removeContent===true){if(r.post_id)await main(env,"UPDATE social_posts SET status='removed' WHERE id=?",[r.post_id]);if(r.comment_id)await main(env,"UPDATE social_comments SET status='removed' WHERE id=?",[r.comment_id]);if(r.story_id)await main(env,'UPDATE social_stories SET expires_at=CURRENT_TIMESTAMP WHERE id=?',[r.story_id]);}
  await main(env,'UPDATE social_reports SET status=?,action_note=? WHERE id=?',[status,clean(d.note,600),id]);await audit(env,user.id,'social_report_'+status,id,clean(d.note,600));const note=clean(d.note,600);if(r.target_user_id&&status==='resolved')await notify(env,r.target_user_id,'moderation','Entscheidung zur Meldung',note||'Die Moderation hat über eine Meldung entschieden.',user.id);if(r.reporter_id)await notify(env,r.reporter_id,'moderation','Deine Meldung wurde bearbeitet',status==='resolved'?'Wir haben deine Meldung geprüft und Maßnahmen ergriffen.':'Wir haben deine Meldung geprüft und keine Maßnahme ergriffen.',user.id);return output({ok:true});
 }
 if(method==='POST'&&path==='/api/social/admin/appeal'){
  await staff(env,user,'reports.review');const d=await body(req),id=idGuard(d.appealId),status=d.status;if(!['accepted','rejected'].includes(status))err(400,'Invalid decision');
  const r=await one(env,'SELECT user_id FROM social_appeals WHERE id=? AND status=\'open\'',[id]);if(!r)err(404,'Appeal not found');await main(env,'UPDATE social_appeals SET status=? WHERE id=?',[status,id]);await notify(env,r.user_id,'moderation','Appeal reviewed',status,user.id);await audit(env,user.id,'appeal_'+status,id);return output({ok:true});
 }
 return null;
}

export async function pruneSocial(env){
 const expired=(await main(env,"SELECT id,media_id FROM social_stories WHERE expires_at<CURRENT_TIMESTAMP ORDER BY expires_at ASC LIMIT 18")).rows;
 for(const s of expired){
   await main(env,'DELETE FROM social_stories WHERE id=?',[s.id]);
   if(s.media_id){const m=await one(env,'SELECT mime FROM social_media WHERE id=?',[s.media_id]);if(m?.mime?.startsWith('video/'))await env.MEDIA_BUCKET?.delete(s.media_id).catch(()=>{});else await media(env,'DELETE FROM media WHERE id=?',[s.media_id]);await main(env,'DELETE FROM social_media WHERE id=?',[s.media_id]);}
 }
 const orphaned=(await main(env,"SELECT m.id FROM social_media m WHERE m.status='pending' AND m.created_at<datetime('now','-30 days') AND NOT EXISTS(SELECT 1 FROM social_posts p WHERE p.media_id=m.id) AND NOT EXISTS(SELECT 1 FROM social_stories s WHERE s.media_id=m.id) LIMIT 12")).rows;
 for(const m of orphaned){const x=await one(env,'SELECT mime FROM social_media WHERE id=?',[m.id]);if(x?.mime?.startsWith('video/'))await env.MEDIA_BUCKET?.delete(m.id).catch(()=>{});else await media(env,'DELETE FROM media WHERE id=?',[m.id]);await main(env,'DELETE FROM social_media WHERE id=?',[m.id]);}
 return {expired:expired.length,unusedMedia:orphaned.length};
}

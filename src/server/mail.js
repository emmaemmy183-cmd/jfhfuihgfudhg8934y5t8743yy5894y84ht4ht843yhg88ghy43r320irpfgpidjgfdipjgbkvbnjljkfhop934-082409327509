import {main} from './db.js';
import {digest} from './security.js';
/** Transactional SendPulse API, server-side only. Send only necessary emails. */
export function configured(env){return env.MAIL_ENABLED==='true' && !!env.SENDPULSE_API_KEY && /^https:\/\//.test(env.PUBLIC_ORIGIN||'');}
export async function sendMail(env,{to,subject,text}) {
  if (!configured(env)) throw new Error('Mail provider not configured for production.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(to))) throw new Error('Invalid recipient');
  if (!['no-support@kennely.de'].includes(env.MAIL_FROM)) throw new Error('Invalid configured sender');
  if (!String(text).trim() || String(text).length>5000) throw new Error('Invalid email');
  // Conservatively reserve an email slot in Turso. A shared database enforces
  // the hourly cap even after server restarts, and avoids an email on every like.
  const cap=Math.max(1,Math.min(50,Number(env.EMAIL_HOURLY_CAP||10)));
  const bucket=new Date().toISOString().slice(0,13);
  const idHash=await digest(String(to).toLowerCase()+':'+(env.IP_HASH_SECRET||''));
  const quotas=[['global',cap],['recipient:'+idHash,2]];
  if(env.TEST_EMAIL_QUOTA_SKIP!=='yes')for(const [key,limit] of quotas){
    await main(env,'INSERT OR IGNORE INTO email_quotas(key,bucket,used) VALUES(?,?,0)',[key,bucket]);
    const reserved=await main(env,'UPDATE email_quotas SET used=used+1 WHERE key=? AND bucket=? AND used<?',[key,bucket,limit]);
    if(!reserved.count)throw new Error('E-Mail-Limit erreicht. Bitte später erneut versuchen.');
  }
  const payload={email:{text,subject,from:{name:'Kennely',email:env.MAIL_FROM},
    to:[{email:to}],reply_to:{name:'Kennely',email:env.MAIL_REPLY_TO||'mahmoudbankousli@gmail.com'}}};
  const response=await fetch('https://api.sendpulse.com/smtp/emails',{method:'POST',
    headers:{'Authorization':`Bearer ${env.SENDPULSE_API_KEY}`,'Content-Type':'application/json'},
    body:JSON.stringify(payload)});
  const result=await response.json().catch(()=>null);
  if(!response.ok || result?.result!==true)throw new Error(`Email provider declined request (${response.status}).`);
  return {ok:true,providerId:result.id||null};
}

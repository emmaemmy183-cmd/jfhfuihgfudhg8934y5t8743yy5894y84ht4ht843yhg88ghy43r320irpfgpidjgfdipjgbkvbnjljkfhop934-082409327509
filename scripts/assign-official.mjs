import { main, one } from '../src/server/db.js';
const email=String(process.argv[2]||'').trim().toLowerCase();
if(!email.includes('@')){console.error('Usage: npm run official:assign -- official@kennely.de');process.exit(1);}
const row=await one(process.env,'SELECT id FROM users WHERE email=?',[email]);
if(!row){console.error('Create and secure the official account first, then run this script.');process.exit(1);}
await main(process.env,'INSERT OR IGNORE INTO official_accounts(user_id,label) VALUES(?,?)',[row.id,'Official Kennely']);
console.log('Official account flag assigned. This does not grant administrator permissions.');

import { main, one } from '../src/server/db.js';
const email=String(process.argv[2]||'').trim().toLowerCase();
if(!email.includes('@')){console.error('Usage: npm run owner:assign -- your-existing-email@example.com');process.exit(1);}
const env=process.env;
const existing=await one(env,'SELECT user_id FROM team_members WHERE role=?',['owner']);
if(existing){console.error('Owner already exists. This script refuses to change an existing owner.');process.exit(1);}
const user=await one(env,'SELECT id FROM users WHERE email=?',[email]);
if(!user){console.error('Register the account first in the local test environment.');process.exit(1);}
await main(env,'INSERT INTO team_members(user_id,role) VALUES(?,?)',[user.id,'owner']);
console.log('Owner assigned to the existing account. Restart the dev server and sign in again.');

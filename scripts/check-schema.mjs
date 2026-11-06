import {one,media} from '../src/server/db.js';
const expected=['users','profiles','team_members','official_accounts','social_posts','social_stories','social_media','social_post_likes','social_comments','social_follows','social_threads','social_dms','social_reports','social_appeals','content_reviews','dm_report_evidence','disclosure_requests','social_hidden_threads','social_media_forwards','staff_private_review_access'];
let missing=[];
for(const table of expected){const row=await one(process.env,'SELECT name FROM sqlite_master WHERE type=? AND name=?',['table',table]);if(!row)missing.push(table);}
const mediaTable=(await media(process.env,'SELECT name FROM sqlite_master WHERE type=? AND name=?',['table','media'])).rows[0];
console.log(`Kennely Social: ${expected.length-missing.length}/${expected.length} main tables`);
if(!mediaTable){console.error('Missing: media table in MEDIA database');process.exitCode=1;}
if(missing.length){console.error('Missing:',missing.join(', '));console.error('Run npm run db:migrate after taking a database backup.');process.exitCode=1;}
else {
  console.log('Main database social schema looks ready.');
  for (const [table,column] of [['profiles','allow_story_reposts'],['social_stories','story_style']]) {
    const check=await one(process.env,`SELECT name FROM pragma_table_info('${table}') WHERE name=?`,[column]);
    if(!check){console.error(`Missing column ${table}.${column}; back up and run npm run db:migrate.`);process.exitCode=1;}
  }
}

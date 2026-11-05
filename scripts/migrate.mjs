import { readFile } from 'node:fs/promises';
import { execute } from '../src/server/db.js';
const env = process.env;
const scripts = [['main','db/main.sql'], ['media','db/media.sql'], ['main','db/social.sql'], ['main','db/deutschland.sql'], ['main','db/mail_quotas.sql'], ['main','db/2027_9.sql'], ['main','db/2027_10.sql'], ['main','db/2027_12.sql'];
// Extend existing user databases before CREATE INDEX statements reference the new columns.
const upgrades = {
 users: {username: 'TEXT COLLATE NOCASE', email_verified_at: 'TEXT', last_login_at: 'TEXT', username_changed_at:'TEXT'},
 profiles:{is_private:'INTEGER NOT NULL DEFAULT 0', display_name_changed_at:'TEXT', message_policy:"TEXT NOT NULL DEFAULT 'everyone'", follow_visibility:"TEXT NOT NULL DEFAULT 'everyone'", comment_policy:"TEXT NOT NULL DEFAULT 'everyone'", discoverable:'INTEGER NOT NULL DEFAULT 1'},
 social_comments:{parent_id:'TEXT'},
 social_dms:{read_at:'TEXT'},
 photos: {status: "TEXT NOT NULL DEFAULT 'pending'", reviewed_at:'TEXT', reviewed_by:'TEXT', rejection_reason:'TEXT'}
};
for (const [table, columns] of Object.entries(upgrades)) {
  const current = await execute(env,'main',`PRAGMA table_info(${table})`);
  if (!current.rows.length) continue; // Fresh installation: CREATE TABLE will include columns.
  const names = new Set(current.rows.map(x=>x.name));
  for (const [column, definition] of Object.entries(columns)) {
    if (!names.has(column)) {
      console.log(`Extending ${table}.${column} ...`);
      await execute(env,'main',`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }
}
for (const [database, path] of scripts) {
  console.log(`Installing ${path} in ${database} ...`);
  const sql = await readFile(new URL(`../${path}`, import.meta.url), 'utf8');
  const statements = sql.split(';').map(s => s.trim()).filter(Boolean);
  for (const statement of statements) await execute(env, database, `${statement};`);
  console.log(`OK: ${statements.length} statements applied`);
}
console.log('Both Kennenly databases are ready.');

// Import legacy mutual-match conversations once, without deleting old data.
const {execute: run} = await import('../src/server/db.js');
await run(env,'main',`INSERT OR IGNORE INTO social_threads(id,user_a,user_b,initiator_id,status,created_at) SELECT id,user_a,user_b,user_a,'accepted',created_at FROM matches`).catch(e=>console.warn('Legacy thread import skipped:',e.message));
await run(env,'main',`INSERT OR IGNORE INTO social_dms(id,thread_id,sender_id,body,created_at) SELECT id,match_id,sender_id,body,created_at FROM messages WHERE match_id IN (SELECT id FROM social_threads)`).catch(e=>console.warn('Legacy message import skipped:',e.message));

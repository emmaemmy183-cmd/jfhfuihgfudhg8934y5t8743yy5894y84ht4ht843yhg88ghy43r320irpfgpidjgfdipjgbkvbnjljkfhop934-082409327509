import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {MIGRATION_FILES,migrationStatements} from '../scripts/migration-plan.mjs';

test('2027.14: SQL comments containing semicolons are ignored',()=>{
 assert.deepEqual(migrationStatements('-- comment; with semicolon\nCREATE TABLE IF NOT EXISTS t(id TEXT);'),['CREATE TABLE IF NOT EXISTS t(id TEXT)']);
});
test('2027.14: fresh Turso schema can be installed twice without SQL parse errors',async()=>{
 const main=new DatabaseSync(':memory:'),media=new DatabaseSync(':memory:');
 try {
  for(let run=0;run<2;run++)for(const [which,path] of MIGRATION_FILES){
   const sql=await readFile(new URL('../'+path,import.meta.url),'utf8');
   const db=which==='main'?main:media;
   for(const statement of migrationStatements(sql))db.exec(statement+';');
  }
  assert.equal(main.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='social_dm_reactions'").get().n,1);
  assert.equal(main.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='social_comment_likes'").get().n,1);
  assert.equal(media.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='media'").get().n,1);
 } finally {main.close();media.close();}
});

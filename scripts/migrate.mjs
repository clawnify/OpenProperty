import {readFileSync} from 'node:fs';
// The CLI uses a direct PostgreSQL driver for multi-statement DDL via simple query.
import pg from 'pg';
const client=new pg.Client({connectionString:process.env.MIGRATION_DATABASE_URL});
if(!process.env.MIGRATION_DATABASE_URL) throw Error('Set MIGRATION_DATABASE_URL to the database owner connection.');
await client.connect();
try{
 await client.query('BEGIN');
 await client.query('CREATE TABLE IF NOT EXISTS sill_migrations(version text primary key)');
 await client.query("SELECT pg_advisory_xact_lock(hashtext('sill_migrations'))");
 for(const file of ['001_init.sql','002_delivery.sql']){
  const version=file.slice(0,3);
  if((await client.query('SELECT 1 FROM sill_migrations WHERE version=$1',[version])).rowCount)continue;
  await client.query(readFileSync(new URL('../db/'+file,import.meta.url),'utf8'));
  await client.query('INSERT INTO sill_migrations VALUES($1)',[version]);
 }
 await client.query('COMMIT');
} catch(error){await client.query('ROLLBACK');throw error;}finally{await client.end();}


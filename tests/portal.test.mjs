import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import worker from '../dist/server/index.js';
const origin='https://sill.test',env={DATABASE_URL:'postgresql://sill_runtime:fixture@ep-fixture.example.test/db',BETTER_AUTH_URL:origin,BETTER_AUTH_SECRET:'fixture-only-'+crypto.randomUUID()};
const engine=new PGlite(),originalFetch=globalThis.fetch;
before(async()=>{
 for(const file of ['001_init.sql','002_delivery.sql'])await engine.exec(await readFile(new URL('../db/'+file,import.meta.url),'utf8'));
 await engine.exec('CREATE ROLE sill_runtime NOSUPERUSER NOBYPASSRLS');
 await engine.exec(await readFile(new URL('../db/runtime-grants.sql',import.meta.url),'utf8'));
 await engine.exec('SET ROLE sill_runtime');
 // Exercise the real Worker, Better Auth, Drizzle and SQL using a local PostgreSQL engine.
 globalThis.fetch=async(input,options)=>{
  if(!String(input).endsWith('/sql'))throw Error('Unexpected outbound request');
  const payload=JSON.parse(options.body);
  async function run(db,q){
   const r=await db.query(q.query,q.params,{rowMode:'array'});
   const raw=v=>v===null?null:v instanceof Date?v.toISOString():typeof v==='boolean'?(v?'t':'f'):String(v);
   return {rowCount:r.affectedRows??r.rows.length,fields:r.fields,rows:r.rows.map(row=>row.map(raw)),command:q.query.trim().split(' ')[0].toUpperCase()};
  }
  try{return Response.json(payload.queries?{results:await engine.transaction(async tx=>{const result=[];for(const q of payload.queries)result.push(await run(tx,q));return result;})}:await run(engine,payload));}
  catch(e){return Response.json({message:e.message,code:e.code},{status:400});}
 };
});
after(async()=>{globalThis.fetch=originalFetch;await engine.close();});
async function request(path,{cookie,home,data,bearer}={}){
 const r=await worker.fetch(new Request(origin+path,{method:data?'POST':'GET',headers:{origin,...(cookie?{cookie}:{}),...(home?{'x-sill-home':home}:{}),...(bearer?{authorization:'Bearer '+bearer}:{}),...(data?{'content-type':'application/json'}:{})},body:data?JSON.stringify(data):undefined}),env);
 return {status:r.status,cookie:r.headers.getSetCookie().map(v=>v.split(';')[0]).join('; '),body:r.headers.get('content-type')?.includes('json')?await r.json():await r.text()};
}
async function account(email){
 const r=await request('/api/auth/sign-up/email',{data:{name:'Fixture',email,password:'Test-password-1234!'}});assert.equal(r.status,200,JSON.stringify(r.body));assert.ok(r.cookie);return r.cookie;
}
async function createHome(cookie,name){
 const p=await request('/api/portfolios',{cookie,data:{name}});assert.equal(p.status,201,JSON.stringify(p.body));
 const h=await request('/api/homes',{cookie,data:{label:'Unit A',portfolio:p.body.id}});assert.equal(h.status,201,JSON.stringify(h.body));return h.body.id;
}
test('Resident sessions, property roles, revocation, idempotency, RLS and household machine keys',async()=>{
 const manager=await account('manager@example.test'),resident=await account('resident@example.test'),stranger=await account('other@example.test');
 const home=await createHome(manager,'Alpha'),other=await createHome(stranger,'Beta');
 const ticket={subject:'Sink drips',details:'Reply to resident@example.test',category:'Plumbing',urgency:'high',requestKey:crypto.randomUUID()};
 assert.equal((await request('/api/tickets',{home,cookie:resident})).status,404);
 const invite=await request('/api/invite',{home,cookie:manager,data:{email:'resident@example.test'}});
 assert.equal(invite.status,201,JSON.stringify(invite.body));
 assert.equal((await request('/api/claim',{cookie:stranger,data:{token:invite.body.invite}})).status,400);
 assert.equal((await request('/api/claim',{cookie:resident,data:{token:invite.body.invite}})).status,200);
 assert.equal((await request('/api/claim',{cookie:resident,data:{token:invite.body.invite}})).status,400);
 const t=await request('/api/tickets',{home,cookie:resident,data:ticket});assert.equal(t.status,201,JSON.stringify(t.body));
 assert.equal((await request('/api/tickets',{home,cookie:resident,data:ticket})).body.id,t.body.id);
 assert.equal((await request('/api/tickets',{home,cookie:resident,data:{...ticket,subject:'changed'}})).status,409);
 assert.equal((await request('/api/tickets',{home:other,cookie:resident,data:ticket})).status,404);
 assert.equal((await request('/api/ledger',{home,cookie:resident,data:{}})).status,403);
 const charge={kind:'charge',label:'November rent',date:'2026-11-01',cents:125000,requestKey:crypto.randomUUID()};
 const l=await request('/api/ledger',{home,cookie:manager,data:charge});assert.equal(l.status,201,JSON.stringify(l.body));
 assert.equal((await request('/api/ledger',{home,cookie:manager,data:charge})).body.id,l.body.id);
 assert.equal((await request('/api/ledger',{home,cookie:resident})).body[0].amount_cents,125000);
 const update={id:t.body.id,status:'assigned',urgency:'high',note:'Plumber scheduled.'};
 assert.equal((await request('/api/ticket-update',{home,cookie:manager,data:update})).status,200);
 assert.equal((await request('/api/ticket-update',{home:other,cookie:stranger,data:update})).status,404);
 assert.equal((await request('/api/ticket-history?id='+t.body.id,{home,cookie:resident})).body.length,2);
 assert.equal((await request('/api/tickets',{home:other,cookie:stranger})).body.length,0);
 const k=await request('/api/integration-key',{home,cookie:manager,data:{}}),bearer=k.body.key;assert.ok(bearer);
 assert.equal((await request('/api/webhooks/tickets')).status,401);
 const feed=await request('/api/webhooks/tickets',{bearer});assert.equal(feed.body.events.length,2);
 assert.ok(!JSON.stringify(feed.body).includes('resident@'));
 assert.equal((await request('/api/webhooks/tickets?after='+feed.body.events[1].id,{bearer})).body.events.length,0);
 const rpc={jsonrpc:'2.0',id:7,method:'tools/call',params:{name:'tickets_list',arguments:{}}};
 assert.equal((await request('/api/mcp',{data:rpc})).status,401);
 const rpcResult=await request('/api/mcp',{bearer,data:rpc});assert.ok(rpcResult.body.result.content);assert.ok(!JSON.stringify(rpcResult.body).includes('resident@'));
 const webhook=await request('/api/webhooks/tickets',{bearer,data:{...ticket,requestKey:crypto.randomUUID()}});assert.equal(webhook.status,201);assert.ok(!Object.hasOwn(webhook.body,'details'));
 assert.equal((await engine.query('SELECT * FROM tickets')).rows.length,0);
 await request('/api/key-revoke',{home,cookie:manager,data:{}});
 assert.equal((await request('/api/webhooks/tickets',{bearer})).status,401);
 const member=(await request('/api/members',{home,cookie:manager})).body[0];
 await request('/api/remove-member',{home,cookie:manager,data:{id:member.id}});
 assert.equal((await request('/api/tickets',{home,cookie:resident})).status,404);
 const off=await request('/api/auth/sign-out',{cookie:resident,data:{}});assert.equal(off.status,200);
 assert.equal((await request('/api/me',{cookie:resident})).status,401);
 const signin=await request('/api/auth/sign-in/email',{data:{email:'resident@example.test',password:'Test-password-1234!'}});assert.equal(signin.status,200);
});
test('Public pages, contact persistence, chat fallback and discovery',async()=>{
 for(const p of ['/','/docs','/blog','/blog/report-a-repair','/about','/contact','/portal'])assert.equal((await request(p)).status,200);
 const contact=await request('/api/contact',{data:{email:'contact@example.test',message:'Help with my account.'}});assert.equal(contact.status,201);
 assert.equal((await engine.query('select count(*) as n from contact_messages')).rows[0].n,1);
 const reply=await request('/api/chat',{data:{message:'How do I pay my rent?'}});assert.equal(reply.body.mode,'guide');assert.match(reply.body.reply,/Payments/);
 const rpc=await request('/mcp',{data:{jsonrpc:'2.0',id:1,method:'tools/list'}});assert.equal(rpc.body.result.tools.length,4);
});


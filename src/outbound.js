import {sql} from 'drizzle-orm';
import {services,rows,uuid} from './db.js';
import {readEvents} from './tickets.js';
export async function deliver(env){
 const {WEBHOOK_HOME_ID:home,TICKET_WEBHOOK_URL:target,TICKET_WEBHOOK_SECRET:secret}=env;
 if(!home||!target||!secret)return;
 if(new URL(target).protocol!=='https:')throw Error('HTTPS receiver required');
 uuid(home);const {db}=services(env),claim=crypto.randomUUID();
 const [cursor]=await rows(db,sql`insert into webhook_delivery(home_id,lease_until,claim) values(${home},now()+interval '2 minutes',${claim}) on conflict(home_id) do update set lease_until=excluded.lease_until,claim=excluded.claim where webhook_delivery.lease_until is null or webhook_delivery.lease_until<now() returning last_id`);
 if(!cursor)return;
 try{
  const events=await readEvents(db,home,cursor.last_id);
  if(!events.length)return;
  const payload=JSON.stringify({version:1,events}),ts=String(Math.floor(Date.now()/1000)),enc=new TextEncoder();
  const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signature=[...new Uint8Array(await crypto.subtle.sign('HMAC',key,enc.encode(ts+'.'+payload)))].map(x=>x.toString(16).padStart(2,'0')).join('');
  const res=await fetch(target,{method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),headers:{'content-type':'application/json','x-sill-timestamp':ts,'x-sill-signature':'v1='+signature},body:payload});
  if(res.ok)await rows(db,sql`update webhook_delivery set last_id=${events.at(-1).id} where home_id=${home} and claim=${claim}`);
 }finally{await rows(db,sql`update webhook_delivery set lease_until=null,claim=null where home_id=${home} and claim=${claim}`);}
}


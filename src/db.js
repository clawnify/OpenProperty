import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { sql } from 'drizzle-orm';
import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import * as schema from './schema.js';
export function services(env){
  if (!env.DATABASE_URL || !env.BETTER_AUTH_SECRET || !env.BETTER_AUTH_URL) throw new Problem(503,'Account services are temporarily unavailable.');
  const db=drizzle(neon(env.DATABASE_URL),{schema});
  const auth=betterAuth({appName:'SiLL',baseURL:env.BETTER_AUTH_URL,secret:env.BETTER_AUTH_SECRET,
    database:drizzleAdapter(db,{provider:'pg',schema,transaction:false}),emailAndPassword:{enabled:true,minPasswordLength:12},
    advanced:{ipAddress:{ipAddressHeaders:['cf-connecting-ip']}},trustedOrigins:[env.BETTER_AUTH_URL],rateLimit:{enabled:true,storage:'memory'}});
  return {db,auth};
}
export class Problem extends Error {constructor(status,message){super(message);this.status=status;}}
export function demand(test,status,message){if(!test)throw new Problem(status,message);}
export function field(value,max,label,min=1){demand(typeof value==='string' && value.trim().length>=min && value.trim().length<=max,400,'Check '+label+'.');return value.trim();}
export function choice(value,allowed){demand(allowed.includes(value),400,'Choose a supported option.');return value;}
export function uuid(value){demand(typeof value==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value),400,'A valid identifier is required.');return value;}
export const rows=async(db,query)=>(await db.execute(query)).rows;
export async function scoped(db,home,query,note=''){
  const result=await db.batch([db.execute(sql`select set_config('sill.home',${home},true),set_config('sill.note',${note},true)`),db.execute(query)]);
  return result[1].rows;
}
export async function hash(value){const buffer=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return [...new Uint8Array(buffer)].map(b=>b.toString(16).padStart(2,'0')).join('');}
export function token(){return crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');}
export async function limit(db,bucket,maximum){
  const key=await hash(bucket+'|'+Math.floor(Date.now()/3600000));
  const [hit]=await rows(db,sql`insert into request_limits(bucket,hits,expires_at) values(${key},1,now()+interval '2 hours') on conflict(bucket) do update set hits=request_limits.hits+1 where request_limits.hits<${maximum} returning hits`);
  demand(hit,429,'Please try again later.');
}


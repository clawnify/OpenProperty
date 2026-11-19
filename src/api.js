import {sql} from 'drizzle-orm';
import {services,demand,field,choice,uuid,rows,scoped,hash,token,limit,Problem} from './db.js';
import {categories,urgencies,statuses,createTicket,readTickets,updateTicket,readEvents} from './tickets.js';
import {mcp} from './mcp.js';
import {assistant,checkProvider,triage} from './integrations.js';
export const json=(value,status=200)=>Response.json(value,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
const emailValue=s=>{const value=field(s,254,'email').toLowerCase();demand(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value),400,'Enter a valid email address.');return value;};
async function body(request,max=24000){
 demand(request.headers.get('content-type')?.split(';')[0]==='application/json',415,'Send a JSON object.');
 const reader=request.body?.getReader();demand(reader,400,'Request body is required.');
 let size=0,parts=[];
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();throw new Problem(413,'Request is too large.');}parts.push(value);}
 try{const obj=JSON.parse(await new Blob(parts).text());demand(obj&&typeof obj==='object'&&!Array.isArray(obj),400,'Invalid JSON object.');return obj;}catch{throw new Problem(400,'Invalid JSON object.');}
}
async function integration(db,request){
 const match=/^Bearer ([0-9a-f]{64})$/i.exec(request.headers.get('authorization')??'');
 demand(match,401,'A household integration key is required.');
 const [key]=await rows(db,sql`select home_id from integration_keys where digest=${await hash(match[1])}`);
 demand(key,401,'Invalid household key.');return {db,home:key.home_id};
}
const dateVal=v=>{demand(typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v,400,'Check the date.');return v;};
function cents(v,zero=false){demand(Number.isSafeInteger(v)&&v>=(zero?0:1)&&v<=2000000000,400,'Check the amount.');return v;}
function checkout(value){
 if(!value)return null;
 let u;try{u=new URL(value);}catch{throw new Problem(400,'Use a valid HTTPS payment link.');}
 demand(u.protocol==='https:'&&!u.username&&!u.password,400,'Use a secure payment link.');return u.href;
}
export async function api(req,env){
 const url=new URL(req.url),p=url.pathname,method=req.method;
 const post=method==='POST', get=method==='GET';
 if(p==='/api/health'&&get)return json({service:'sill',status:'up'});
 // Tool discovery is public; running a tool always requires a household key.
 if((p==='/mcp'||p==='/api/mcp')&&post){
  const result=await mcp(await body(req),()=>integration(services(env).db,req));return result?json(result):new Response(null,{status:202});
 }
 const authOrigin=url.origin===env.CUSTOM_ORIGIN?env.CUSTOM_ORIGIN:env.BETTER_AUTH_URL;
 const {db,auth}=services({...env,BETTER_AUTH_URL:authOrigin});
 const origin=req.headers.get('origin');
 if(!get && origin)demand(origin===env.BETTER_AUTH_URL || origin===url.origin,403,'Origin is not allowed.');
 if(p.startsWith('/api/auth/')){
  if(post)await limit(db,'auth:'+ (req.headers.get('cf-connecting-ip')??'local'),120);
  return auth.handler(req);
 }
 const ip=req.headers.get('cf-connecting-ip')??'local';
 if(p==='/api/contact'&&post){
  await limit(db,'contact:'+ip,10);const b=await body(req);
  const [created]=await rows(db,sql`insert into contact_messages(email,message) values(${emailValue(b.email)},${field(b.message,2000,'message')}) returning id`);
  return json({id:created.id},201);
 }
 if(p==='/api/chat'&&post){
  await limit(db,'chat:'+ip,45);const b=await body(req);return json(await assistant(env,field(b.message,600,'question')));
 }
 if(p==='/api/webhooks/tickets'){
  const {home}=await integration(db,req);
  if(get)return json({events:await readEvents(db,home,url.searchParams.get('after')??0)});
  if(post){const b=await body(req);if(b.action==='update')return json(await updateTicket(db,home,b));return json(await createTicket(db,home,b,true),201);}
  throw new Problem(405,'Use GET or POST.');
 }
 const session=await auth.api.getSession({headers:req.headers});demand(session?.user,401,'Sign in to your portal.');
 const uid=session.user.id;
 if(p==='/api/me'&&get){
  const homes=await rows(db,sql`select h.*,p.name as portfolio_name,(p.manager_id=${uid}) as manager from homes h join portfolios p on p.id=h.portfolio_id where p.manager_id=${uid} or exists(select 1 from memberships m where m.home_id=h.id and m.user_id=${uid}) order by p.name,h.label`);
  const portfolios=await rows(db,sql`select id,name from portfolios where manager_id=${uid} order by name`);
  return json({user:{name:session.user.name,email:session.user.email},homes,portfolios});
 }
 if(p==='/api/portfolios'&&post){
  await limit(db,'portfolios:'+uid,10);const b=await body(req);
  const [record]=await rows(db,sql`insert into portfolios(name,manager_id) values(${field(b.name,100,'portfolio name')},${uid}) returning id,name`);return json(record,201);
 }
 if(p==='/api/homes'&&post){
  const b=await body(req);
  const [h]=await rows(db,sql`insert into homes(portfolio_id,label) select id,${field(b.label,120,'household label')} from portfolios where id=${uuid(b.portfolio)} and manager_id=${uid} on conflict do nothing returning id`);
  demand(h,409,'Check the portfolio or choose a distinct household label.');return json(h,201);
 }
 if(p==='/api/claim'&&post){
  const b=await body(req);const digest=await hash(field(b.token,90,'invite code',32));
  const [claimed]=await rows(db,sql`with accepted as(delete from invitations where digest=${digest} and email=${session.user.email.toLowerCase()} and expires_at>now() returning home_id), joined as(insert into memberships(home_id,user_id) select home_id,${uid} from accepted on conflict do nothing) select home_id from accepted`);
  demand(claimed,400,'This invitation is invalid, expired, or belongs to another email.');return json(claimed);
 }
 const home=uuid(req.headers.get('x-sill-home'));
 const [h]=await rows(db,sql`select h.*,p.manager_id=${uid} as manager from homes h join portfolios p on p.id=h.portfolio_id where h.id=${home} and (p.manager_id=${uid} or exists(select 1 from memberships m where m.user_id=${uid} and m.home_id=h.id))`);
 demand(h,404,'Household not found.');
 if(p==='/api/tickets'&&get)return json(await readTickets(db,home));
 if(p==='/api/tickets'&&post)return json(await createTicket(db,home,await body(req)),201);
 if(p==='/api/ticket-history'&&get)return json(await scoped(db,home,sql`select status,urgency,note,created_at from ticket_events where ticket_id=${uuid(url.searchParams.get('id'))} order by id`));
 if(p==='/api/ledger'&&get)return json(await scoped(db,home,sql`select id,kind,label,amount_cents,booked_on from ledger order by booked_on desc,id`));
 demand(h.manager,403,'Property manager access is required.');
 if(p==='/api/ticket-update'&&post)return json(await updateTicket(db,home,await body(req)));
 if(p==='/api/invite'&&post){
  const b=await body(req),secret=token();
  await rows(db,sql`insert into invitations(digest,home_id,email) values(${await hash(secret)},${home},${emailValue(b.email)})`);
  return json({invite:secret},201);
 }
 if(p==='/api/integration-key'&&post){
  const secret=token();await rows(db,sql`insert into integration_keys(digest,home_id) values(${await hash(secret)},${home}) on conflict(home_id) do update set digest=excluded.digest`);return json({key:secret});
 }
 if(p==='/api/key-revoke'&&post){await rows(db,sql`delete from integration_keys where home_id=${home}`);return json({revoked:true});}
 if(p==='/api/household'&&post){
  const b=await body(req),start=b.start?dateVal(b.start):null,end=b.end?dateVal(b.end):null;
  demand(!start||!end||end>=start,400,'Lease end must follow lease start.');
  await rows(db,sql`update homes set checkout_url=${checkout(b.checkout)},lease_start=${start},lease_end=${end},monthly_cents=${b.monthly===null?null:cents(b.monthly,true)} where id=${home}`);
  return json({saved:true});
 }
 if(p==='/api/ledger'&&post){
  const b=await body(req),kind=choice(b.kind,['charge','payment']),amount=cents(b.cents),day=dateVal(b.date),label=field(b.label,100,'description'),key=uuid(b.requestKey);
  let [entry]=await scoped(db,home,sql`insert into ledger(home_id,kind,label,amount_cents,booked_on,request_key) values(${home},${kind},${label},${amount},${day},${key}) on conflict(home_id,request_key) do nothing returning id`);
  if(!entry){[entry]=await scoped(db,home,sql`select id from ledger where request_key=${key} and kind=${kind} and label=${label} and amount_cents=${amount} and booked_on=${day}`);demand(entry,409,'This entry key was already used.');}
  return json(entry,201);
 }
 if(p==='/api/members'&&get)return json(await rows(db,sql`select u.id,u.email from memberships m join "user" u on u.id=m.user_id where home_id=${home} order by u.email`));
 if(p==='/api/remove-member'&&post){
  const b=await body(req),id=field(b.id,160,'resident identifier');
  await rows(db,sql`with removed as(delete from memberships where home_id=${home} and user_id=${id} returning user_id) delete from invitations where home_id=${home} and email in(select lower(email) from "user" join removed on removed.user_id="user".id)`);return json({removed:true});
 }
 if(p==='/api/triage'&&post){
  const b=await body(req),[t]=await scoped(db,home,sql`select category,urgency from tickets where id=${uuid(b.id)}`);demand(t,404,'Request not found.');return json(await triage(env,t));
 }
 if(p==='/api/check-provider'&&post){
  const b=await body(req);try{return json(await checkProvider(env,choice(b.service,['ledgerflow','apisync','clipguard'])));}catch(e){if(e.status)throw e;throw new Problem(502,'The provider did not return a valid MCP response.');}
 }
 throw new Problem(404,'Route not found.');
}


import {sql} from 'drizzle-orm';
import {scoped,demand,field,choice,uuid} from './db.js';
export const categories=['Plumbing','Heating and cooling','Electrical','Appliance','Access','Payment','Other'];
export const urgencies=['low','normal','high','urgent'];
export const statuses=['open','assigned','in_progress','completed','cancelled'];
const publicMeta=t=>({id:t.id,category:t.category,urgency:t.urgency,status:t.status,created_at:t.created_at,updated_at:t.updated_at});
export async function createTicket(db,home,b,external=false){
 const subject=field(b.subject,120,'subject'),details=field(b.details,3000,'description'),category=choice(b.category,categories),urgency=choice(b.urgency,urgencies),key=uuid(b.requestKey);
 // Repeated submissions return their first result. A reused key with changed input is a conflict.
 let [ticket]=await scoped(db,home,sql`insert into tickets(home_id,subject,details,category,urgency,request_key) values(${home},${subject},${details},${category},${urgency},${key}) on conflict(home_id,request_key) do nothing returning *`);
 if(!ticket){
  [ticket]=await scoped(db,home,sql`select * from tickets where request_key=${key}`);
  demand(ticket.subject===subject && ticket.category===category && ticket.details===details,409,'That request key already belongs to a different ticket.');
 }
 return external?publicMeta(ticket):ticket;
}
export async function readTickets(db,home,external=false){
 const records=await scoped(db,home,sql`select * from tickets order by case when status in ('completed','cancelled') then 1 else 0 end, case urgency when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end,created_at desc`);
 return external?records.map(publicMeta):records;
}
export async function updateTicket(db,home,b){
 const status=choice(b.status,statuses),urgency=choice(b.urgency,urgencies),note=field(b.note??'',1500,'update',0),id=uuid(b.id);
 const [ticket]=await scoped(db,home,sql`update tickets set status=${status},urgency=${urgency},updated_at=now() where id=${id} returning *`,note);
 demand(ticket,404,'Request not found.');return publicMeta(ticket);
}
export async function readEvents(db,home,after){
 demand(/^\d{1,18}$/.test(String(after)),400,'Invalid event cursor.');
 return scoped(db,home,sql`select id,ticket_id,category,status,urgency,created_at from ticket_events where id>${after} order by id limit 100`);
}


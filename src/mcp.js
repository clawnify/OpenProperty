import {categories,urgencies,statuses,createTicket,readTickets,updateTicket,readEvents} from './tickets.js';
const string={type:'string'},optionalCursor={type:'integer',minimum:0};
const definitions=[
 ['tickets_list','List redacted ticket metadata for the connected household.',{},[]],
 ['tickets_create','Open a household request. Use a new UUID for each request.',{subject:string,details:string,category:{enum:categories},urgency:{enum:urgencies},requestKey:{type:'string',format:'uuid'}},['subject','details','category','urgency','requestKey']],
 ['tickets_update','Update a ticket and optionally leave a resident-visible note.',{id:string,status:{enum:statuses},urgency:{enum:urgencies},note:string},['id','status','urgency']],
 ['tickets_events','Read a page of redacted changes after an event cursor.',{after:optionalCursor},[]]
];
export async function mcp(message,authorize){
 const {method,params,id}=message??{};
 const ok=result=>({jsonrpc:'2.0',id,result}),err=(code,message)=>({jsonrpc:'2.0',id:id??null,error:{code,message}});
 if(message?.jsonrpc!=='2.0'||typeof method!=='string')return err(-32600,'Invalid request');
 if(method==='notifications/initialized')return null;
 if(id===undefined)return null;
 if(method==='server/discover')return ok({supportedVersions:['2026-07-28','2025-11-25','2025-03-26'],capabilities:{tools:{}}});
 if(method==='initialize')return ok({protocolVersion:['2026-07-28','2025-11-25','2025-06-18','2025-03-26'].includes(params?.protocolVersion)?params.protocolVersion:'2025-11-25',capabilities:{tools:{}},serverInfo:{name:'sill',version:'1.0.0'}});
 if(method==='ping')return ok({});
 if(method==='tools/list')return ok({tools:definitions.map(([name,description,properties,required])=>({name,description,inputSchema:{type:'object',properties,required,additionalProperties:false}}))});
 if(method!=='tools/call')return err(-32601,'Unknown method');
 const op=params?.name,b=params?.arguments??{};
 if(!definitions.some(([name])=>name===op))return err(-32602,'Unknown tool');
 const {db,home}=await authorize();
 try {
  let value;
  if(op==='tickets_create')value=await createTicket(db,home,b,true);
  else if(op==='tickets_update')value=await updateTicket(db,home,b);
  else if(op==='tickets_events')value=await readEvents(db,home,b.after??0);
  else value=await readTickets(db,home,true);
  return ok({content:[{type:'text',text:JSON.stringify(value)}]});
 }catch(error){return ok({isError:true,content:[{type:'text',text:error.status?error.message:'The ticket service could not complete the request.'}]});}
}


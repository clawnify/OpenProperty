const urls={omnidesk:'https://omnidesk.worksai.org/api/mcp',clipguard:'https://clipguard.worksai.org/api/mcp',ledgerflow:'https://ledgerflow.worksai.org/api/mcp',apisync:'https://apisync.worksai.org/api/mcp'};
export async function callTool(env,service,name,input){
  const id=crypto.randomUUID(),key=env[service.toUpperCase()+'_TOKEN'];
  const response=await fetch(urls[service],{method:'POST',redirect:'error',signal:AbortSignal.timeout(6000),
    headers:{'content-type':'application/json',accept:'application/json',...(key?{authorization:'Bearer '+key}:{})},
    body:JSON.stringify({jsonrpc:'2.0',id,method:'tools/call',params:{name,arguments:{input}}})});
  if(!response.ok)throw Error('Provider unavailable');
  const rpc=await response.json();
  if(rpc.id!==id || rpc.error || rpc.result?.isError || !rpc.result?.structuredContent)throw Error('Provider returned an invalid result');
  return rpc.result.structuredContent;
}
const topics=[
 ['emergency',/immediate danger|fire\b|smell gas|gas leak|emergency/i,'If anyone is in immediate danger, call your local emergency number. Once you are safe, contact your property’s emergency maintenance line.'],
 ['payments',/pay|rent|bill|balance|ledger|receipt/i,'Open Payments in your portal to see recorded charges and payments. If your manager has connected checkout, choose Pay rent to continue.'],
 ['tickets',/repair|ticket|request|leak|maintenan|broken|heat|plumb/i,'Choose New request, select the issue and urgency, and describe what needs attention. You can follow the updates under Requests.'],
 ['access',/login|log in|sign in|invit|account|join|password/i,'Open the resident portal and sign in with the email your property manager invited. Use the invitation link to connect your household.'],
 ['contact',/human|person|contact|agent|manager|help/i,'Use Contact to reach SiLL support. For a question about your home, send a request in the portal so your property team can follow up.']
];
export function intent(text){return topics.find(x=>x[1].test(text))??['general',null,'I can help with rent payments, maintenance requests, or signing in. Which one do you need?'];}
export async function assistant(env,message){
 const [topic,,guide]=intent(message);
 if(topic==='emergency'||!env.OPENROUTER_API_KEY)return {reply:guide,mode:'guide'};
 try{
  const text='Resident needs portal guidance about '+topic+'.';
  const checked=await callTool(env,'clipguard','clipguard.scrub_clipboard',text);
  if(checked.scrubbedText!==text)return {reply:guide,mode:'guide'};
  const res=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',redirect:'error',signal:AbortSignal.timeout(8500),
   headers:{authorization:'Bearer '+env.OPENROUTER_API_KEY,'content-type':'application/json'},
   body:JSON.stringify({model:'openrouter/free',provider:{data_collection:'deny'},max_tokens:110,messages:[
    {role:'system',content:'You are the SiLL resident concierge. Be warm and concise. In one or two sentences restate only the supplied help text. Never claim to see records, move money, file a ticket or contact the team.'},
    {role:'user',content:checked.scrubbedText+' Approved help text: '+guide}]})});
  const reply=res.ok&&(await res.json()).choices?.[0]?.message?.content;
  if(typeof reply==='string'&&reply.trim())return {reply:reply.trim().slice(0,700),mode:'ai'};
 }catch{}
 return {reply:guide,mode:'guide'};
}
export async function checkProvider(env,service){
 if(service==='apisync'){
  const result=await callTool(env,service,'apisync.diff_openapi',JSON.stringify({openApiRoutes:[{method:'POST',path:'/api/webhooks/tickets',expectedStatus:201,requiredFields:['category','urgency','requestKey','subject','details']}],savedCollectionRequests:[{method:'POST',path:'/api/webhooks/tickets',bodyFields:['category','urgency','requestKey','subject','details']}]}));
  return {service,reachable:true,review:result.breakingChanges??[]};
 }
 if(service==='ledgerflow'){
  await callTool(env,service,'ledgerflow.normalize_csv','date,payee,amount,category\n2026-01-01,Sample,10.00,rent');
  return {service,reachable:true,fixtureOnly:true};
 }
 const result=await callTool(env,'clipguard','clipguard.scrub_clipboard','Contact fixture@example.com');
 return {service:'clipguard',reachable:true,redacted:typeof result.scrubbedText==='string'&&!result.scrubbedText.includes('fixture@example.com')};
}


export async function triage(env,ticket){
 const summary='Maintenance category: '+ticket.category+'. Resident-selected urgency: '+ticket.urgency+'.';
 try{
  const scrub=await callTool(env,'clipguard','clipguard.scrub_clipboard',summary);
  if(scrub.scrubbedText!==summary)throw Error('Redaction unavailable');
  const advice=await callTool(env,'omnidesk','omnidesk.triage_ticket',scrub.scrubbedText);
  const candidate=['P1','P2','P3','P4'].includes(advice.priority)?advice.priority:'unavailable';
  return {message:'Provider suggestion: '+candidate+'. Review the actual repair before changing its urgency. The resident-selected urgency is '+ticket.urgency+'.'};
 }catch{return {message:'External routing is unavailable. Your team can triage this '+ticket.urgency+' request in SiLL.'};}
}

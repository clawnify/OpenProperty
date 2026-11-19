import assert from 'node:assert/strict';
import {test} from 'node:test';
import {assistant,triage} from '../src/integrations.js';
test('The free-model path sends only an approved intent and returns the provider reply',async t=>{
 const calls=[];t.mock.method(globalThis,'fetch',async(url,init)=>{
  const b=JSON.parse(init.body);calls.push([url,b]);
  if(url.includes('clipguard'))return Response.json({jsonrpc:'2.0',id:b.id,result:{structuredContent:{scrubbedText:b.params.arguments.input}}});
  return Response.json({choices:[{message:{content:'Open Payments to check your ledger.'}}]});
 });
 const result=await assistant({OPENROUTER_API_KEY:'fixture'},'I am Taylor at 122 Elm St, 555-0109. What is my rent?');
 assert.equal(result.mode,'ai');assert.equal(calls.length,2);assert.equal(calls[1][1].model,'openrouter/free');
 assert.doesNotMatch(JSON.stringify(calls),/Taylor|Elm St|555-0109/);
});
test('Failed redaction keeps the chat local and preserves ticket urgency',async t=>{
 let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;return new Response('',{status:503});});
 assert.equal((await assistant({OPENROUTER_API_KEY:'fixture'},'rent')).mode,'guide');
 assert.match((await triage({},{category:'Plumbing',urgency:'high'})).message,/high request/);
 assert.equal(calls,2);
});
test('External ticket routing sees category and urgency without the resident narrative',async t=>{
 const calls=[];t.mock.method(globalThis,'fetch',async(url,init)=>{
  const b=JSON.parse(init.body);calls.push([url,b]);const result=url.includes('clipguard')?{scrubbedText:b.params.arguments.input}:{priority:'P2'};
  return Response.json({jsonrpc:'2.0',id:b.id,result:{structuredContent:result}});
 });
 const result=await triage({},{category:'Plumbing',urgency:'normal',details:'Jane lives at 12 Main St.'});
 assert.equal(calls.length,2);assert.match(result.message,/P2/);assert.match(result.message,/normal/);assert.doesNotMatch(JSON.stringify(calls),/Jane|Main St/);
});


import assets from 'sill:assets';
import {page} from './pages.js';
import {api,json} from './api.js';
import {deliver} from './outbound.js';
export default {
 async fetch(req,env,ctx){
  const path=new URL(req.url).pathname.replace(/\/$/,'')||'/';
  try{
   if(path.startsWith('/api/')||path==='/mcp'){
    const response=await api(req,env);
    if(response.ok && req.method==='POST'&&env.WEBHOOK_HOME_ID&&['/api/tickets','/api/ticket-update','/api/webhooks/tickets','/api/mcp','/mcp'].includes(path))ctx?.waitUntil(deliver(env).catch(()=>{}));
    return response;
   }
   if(!['GET','HEAD'].includes(req.method))return json({error:'Method not allowed.'},405);
   if(Object.hasOwn(assets,path)){const [mime,b64]=assets[path];const bytes=req.method==='HEAD'?null:Uint8Array.from(atob(b64),c=>c.charCodeAt(0));return new Response(bytes,{headers:{'content-type':mime,'cache-control':'public, max-age=3600','x-content-type-options':'nosniff'}});}
   const html=page(path);
   if(!html)return new Response('Page not found',{status:404});
   return new Response(req.method==='HEAD'?null:html,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','referrer-policy':'strict-origin-when-cross-origin','x-content-type-options':'nosniff','content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; form-action 'self'; object-src 'none'; base-uri 'none'"}});
  }catch(e){return json({error:e.status?e.message:'The service is temporarily unavailable.'},e.status||503);}
 },
 async scheduled(event,env,ctx){ctx.waitUntil(deliver(env));}
};


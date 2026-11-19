import {decodeBytes,detectFormat,parseCamt,parseCsv,guessMapping,readCsv} from './shared/statement.ts';
const $=(q,root=document)=>root.querySelector(q);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n/100);
const fmt=(date)=>date?new Date(date.length===10?date+'T12:00:00':date).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'—';
const params=new URLSearchParams(location.search),portal=$('#portal');
const invitation=new URLSearchParams(location.hash.slice(1)).get('invite');
if(invitation){sessionStorage.setItem('sill-invite',invitation);history.replaceState(null,'',location.pathname+location.search);}
let me,home,section=params.get('view')||'overview',generation=0,signup=false;
const cats=['Plumbing','Heating and cooling','Electrical','Appliance','Access','Payment','Other'],urg=['low','normal','high','urgent'],statuses=['open','assigned','in_progress','completed','cancelled'];
const pretty=s=>String(s).replaceAll('_',' '),opts=(arr,selected)=>arr.map(x=>'<option value="'+esc(x)+'" '+(x===selected?'selected':'')+'>'+esc(pretty(x))+'</option>').join('');
const statusOut=(form,message,error=false)=>{const out=$('output',form);if(out){out.textContent=message;out.classList.toggle('error',error);}};
async function api(path,data,scope=home?.id){
 const r=await fetch('/api/'+path,{method:data===undefined?'GET':'POST',credentials:'same-origin',headers:{...(data===undefined?{}:{'content-type':'application/json'}),...(scope?{'x-sill-home':scope}:{})},body:data===undefined?undefined:JSON.stringify(data)});
 let b={};try{b=await r.json();}catch{}
 if(!r.ok){const e=new Error(b.error?.message||b.message||(typeof b.error==='string'?b.error:'The service could not complete this request.'));e.status=r.status;throw e;}return b;
}
function bindForm(id,fn,root=document){
 const form=$(id,root);if(!form)return;
 form.onsubmit=async e=>{e.preventDefault();if(form.dataset.busy)return;form.dataset.busy='1';const btn=form.querySelector('button[type=submit],button:not([type])');if(btn)btn.disabled=true;statusOut(form,'');try{await fn(Object.fromEntries(new FormData(form)),form);}catch(err){statusOut(form,err.message,true);}finally{delete form.dataset.busy;if(btn)btn.disabled=false;}};
}
function basicFields(title,inside,id,action){return '<form class="panel form" id="'+id+'"><h2>'+title+'</h2>'+inside+'<button class="btn dark" type="submit">'+action+'</button><output role="status"></output></form>';}
function input(label,name,type='text',extra=''){return '<label>'+label+'<input type="'+type+'" name="'+name+'" '+extra+'></label>';}
function select(label,name,arr,selected){return '<label>'+label+'<select name="'+name+'">'+opts(arr,selected)+'</select></label>';}
$('.mobile-menu').onclick=e=>{const nav=$('#nav');nav.classList.toggle('open');e.currentTarget.setAttribute('aria-expanded',String(nav.classList.contains('open')));};
bindForm('#contact-form',async(b,f)=>{const t=await api('contact',b);f.reset();statusOut(f,'Message received. Your reference is '+t.id.slice(0,8).toUpperCase()+'.');});
const chat=$('#chat-panel'),chatForm=$('#chat-form'),log=$('.chat-log');
function showChat(open){chat.hidden=!open;$('#chat-toggle').setAttribute('aria-expanded',String(open));if(open)chatForm.message.focus();else $('#chat-toggle').focus();}
$('#chat-toggle').onclick=()=>showChat(chat.hidden);$('#chat-close').onclick=()=>showChat(false);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!chat.hidden)showChat(false);});
const bubble=(text,cls)=>{const p=document.createElement('p');p.className=cls;p.textContent=text;log.append(p);log.scrollTop=log.scrollHeight;return p;};
chatForm.onsubmit=async e=>{e.preventDefault();const message=chatForm.message.value.trim();if(!message||chatForm.dataset.busy)return;chatForm.dataset.busy='1';bubble(message,'question');chatForm.reset();const answer=bubble('One moment…','answer');try{answer.textContent=(await api('chat',{message})).reply;}catch{answer.textContent='I couldn’t reach the assistant. The resident guide and Contact page are available.';}finally{delete chatForm.dataset.busy;log.scrollTop=log.scrollHeight;}};
$('.chips').onclick=e=>{if(e.target.tagName==='BUTTON'){chatForm.message.value=e.target.textContent;chatForm.requestSubmit();}};
function login(){
 portal.innerHTML='<div class="auth-layout"><div class="auth-copy"><div class="eyebrow"><span class="rule"></span> RESIDENT PORTAL</div><h1>Welcome home.</h1><p>Sign in to check your balance, report a repair, or see the latest from your property team.</p></div>'+basicFields(signup?'Create your account':'Sign in',(signup?input('Your name','name','text','required maxlength="80" autocomplete="name"'):'')+input('Email address','email','email','required autocomplete="email"')+input('Password','password','password','required '+(signup?'minlength="12" autocomplete="new-password"':'autocomplete="current-password"'))+(signup?'<span class="hint">Use at least 12 characters.</span>':'')+'<button type="button" class="bare text-link" id="switch-auth">'+(signup?'Already registered? Sign in':'New to SiLL? Create an account')+'</button>','login',signup?'Create account':'Sign in')+'</div>';
 $('#switch-auth').onclick=()=>{signup=!signup;login();};
 bindForm('#login',async b=>{await api('auth/'+(signup?'sign-up':'sign-in')+'/email',b);await start();});
}
async function start(preferred){
 try{me=await api('me');}catch(e){if(e.status===401)return login();portal.innerHTML='<div class="notice" role="alert">'+esc(e.message)+' <a href="/portal">Try again</a></div>';return;}
 home=me.homes.find(h=>h.id===(preferred||sessionStorage.getItem('sill-home')))||me.homes[0];
 if(home)sessionStorage.setItem('sill-home',home.id);
 await render();
}
const createPortfolio=()=>basicFields('Create a portfolio',input('Portfolio name','name','text','required maxlength="100" placeholder="Property or management company"'),'portfolio-form','Create portfolio');
const addHome=()=>me.portfolios.length?basicFields('Add a household','<label>Portfolio<select name="portfolio">'+me.portfolios.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.name)+'</option>').join('')+'</select></label>'+input('Unit and lease label','label','text','required maxlength="120" placeholder="Oak House · Unit 2 · 2026 lease"')+'<p class="hint">Create a new household for each tenancy to keep past ledgers and requests private.</p>','home-form','Add household'):'';
function wireSetup(){
 bindForm('#portfolio-form',async(b)=>{await api('portfolios',b);await start();});
 bindForm('#home-form',async(b)=>{const h=await api('homes',b);section='manage';await start(h.id);});
 bindForm('#claim-form',async(b)=>{const r=await api('claim',{token:b.token});sessionStorage.removeItem('sill-invite');await start(r.home_id);});
}
const claim=()=>basicFields('Join a household',input('Invitation code','token','text','required autocomplete="off" value="'+esc(sessionStorage.getItem('sill-invite')||'')+'"'),'claim-form','Accept invitation');
async function render(){
 const revision=++generation;const valid=['overview','payments','requests',...(home?.manager?['manage']:[])];if(!valid.includes(section))section='overview';
 const header='<div class="row-between"><div class="eyebrow"><span class="rule"></span> RESIDENT PORTAL</div><button id="signout" class="tab">Sign out</button></div><h1>'+esc(home?.label||'Your household')+'</h1><div class="row-between"><p class="subtle">'+esc(home?home.portfolio_name:me.user.email)+'</p>'+(home?'<select class="house-select" id="house" aria-label="Current household">'+me.homes.map(h=>'<option value="'+h.id+'" '+(h.id===home.id?'selected':'')+'>'+esc(h.portfolio_name+' · '+h.label)+'</option>').join('')+'</select>':'')+'</div>';
 portal.innerHTML=header+(home?'<div class="tabbar">'+valid.map(v=>'<button class="tab '+(v===section?'active':'')+'" data-tab="'+v+'">'+v[0].toUpperCase()+v.slice(1)+'</button>').join('')+'</div>':'')+'<div id="portal-body" aria-live="polite"></div>';
 $('#signout').onclick=async()=>{try{await api('auth/sign-out',{});sessionStorage.removeItem('sill-home');home=null;me=null;generation++;login();}catch(e){$('#portal-body').textContent=e.message;}};
 if(home)$('#house').onchange=e=>start(e.target.value);
 portal.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{section=b.dataset.tab;history.replaceState(null,'','/portal?view='+section);render();});
 const box=$('#portal-body');
 if(!home){box.innerHTML='<div class="notice">Join your home with an invitation, or create a portfolio if you manage properties.</div><div class="portal-grid">'+claim()+createPortfolio()+addHome()+'</div>';wireSetup();return;}
 try{
  if(section==='manage'){await manage(box);return;}
  const [entries,tickets]=await Promise.all([section==='requests'?[]:api('ledger'),section==='payments'?[]:api('tickets')]);if(revision!==generation)return;
  const balance=entries.reduce((n,e)=>n+(e.kind==='charge'?1:-1)*e.amount_cents,0);
  const payCard='<div class="panel"><div class="eyebrow">HOUSEHOLD BALANCE</div><p class="amount">'+money(Math.abs(balance))+(balance<0?' credit':'')+'</p><p class="subtle">Recorded charges less payments · USD</p>'+(home.checkout_url?'<p><a class="btn dark" rel="noopener noreferrer" href="'+esc(home.checkout_url)+'">Pay rent ↗</a></p>':'<p class="hint">Ask your manager for payment instructions. A checkout link has not been set for this household.</p>')+'</div>';
  if(section==='overview'){
   box.innerHTML='<div class="portal-grid">'+payCard+'<div class="panel"><div class="eyebrow">MAINTENANCE</div><p class="amount">'+tickets.filter(t=>!['completed','cancelled'].includes(t.status)).length+'</p><p>Open requests</p><button class="tab" id="view-requests">View requests →</button></div></div><div class="panel"><h2>Lease details</h2><p>'+fmt(home.lease_start)+' – '+fmt(home.lease_end)+'</p><p>Monthly rent · '+(home.monthly_cents===null?'Awaiting lease details':money(home.monthly_cents))+'</p></div><details><summary>Connect another household or manage a new portfolio</summary><div class="portal-grid">'+claim()+createPortfolio()+addHome()+'</div></details>';
   $('#view-requests').onclick=()=>{section='requests';render();};wireSetup();
  }else if(section==='payments'){
   box.innerHTML=payCard+'<div class="panel"><h2>Payment history</h2>'+(entries.length?'<table class="table"><thead><tr><th>Date</th><th>Description</th><th>Type</th><th>Amount</th></tr></thead><tbody>'+entries.map(e=>'<tr><td>'+fmt(e.booked_on)+'</td><td>'+esc(e.label)+'</td><td>'+esc(e.kind)+'</td><td>'+money(e.amount_cents)+'</td></tr>').join('')+'</tbody></table>':'<p class="empty">No charges or payments have been recorded yet.</p>')+'</div>';
  }else{
   box.innerHTML='<div class="portal-grid"><div><h2>Household requests</h2><div class="entries">'+(tickets.length?tickets.map(ticketHtml).join(''):'<p class="empty">No requests yet. Use the form to report an issue.</p>')+'</div></div>'+basicFields('New request',input('Subject','subject','text','required maxlength="120"')+select('Category','category',cats,'Other')+select('Urgency','urgency',urg,'normal')+'<label>What needs attention?<textarea name="details" rows="4" required maxlength="3000"></textarea></label><p class="hint">For immediate danger, call local emergency services. Check your lease for your emergency maintenance number.</p>','new-ticket','Submit request')+'</div>';
   const requestKey=crypto.randomUUID();bindForm('#new-ticket',async b=>{await api('tickets',{...b,requestKey});await render();});
   box.querySelectorAll('[data-ticket]').forEach(el=>el.ontoggle=async()=>{if(!el.open)return;const timeline=$('.history',el);try{const events=await api('ticket-history?id='+el.dataset.ticket);timeline.innerHTML='<ul class="timeline">'+events.map(v=>'<li><strong>'+esc(pretty(v.status))+'</strong> <small>'+fmt(v.created_at)+'</small>'+esc(v.note)+'</li>').join('')+'</ul>';}catch(e){timeline.textContent=e.message;}});
   if(home.manager)for(const t of tickets){bindForm('#update-'+t.id,async b=>{await api('ticket-update',{...b,id:t.id});await render();});bindForm('#triage-'+t.id,async(b,f)=>{const v=await api('triage',{id:t.id});statusOut(f,v.message);});}
  }
  if(sessionStorage.getItem('sill-invite')&&home&&!$('#claim-form')){box.insertAdjacentHTML('afterbegin',claim());wireSetup();}
 }catch(e){if(revision===generation)box.innerHTML='<p class="notice error">'+esc(e.message)+'</p>';}
}
function ticketHtml(t){return '<details class="entry" data-ticket="'+t.id+'"><summary><span>'+esc(t.subject)+'<small>'+esc(pretty(t.status))+' · '+esc(t.category)+'</small></span><span class="pill '+esc(t.urgency)+'">'+esc(t.urgency)+'</span></summary><p class="wrap">'+esc(t.details)+'</p><div class="history"></div>'+(home.manager?'<form class="form" id="update-'+t.id+'">'+select('Status','status',statuses,t.status)+select('Urgency','urgency',urg,t.urgency)+'<label>Resident update<textarea name="note" maxlength="1500"></textarea></label><button class="btn dark">Save update</button><output role="status"></output></form><form class="form" id="triage-'+t.id+'"><button class="tab">Check support routing</button><output role="status"></output></form>':'')+'</details>';}
async function manage(box){
 const h=home;box.innerHTML='<div class="portal-grid"><div>'+basicFields('Invite a resident',input('Resident email','email','email','required')+'<p class="hint">Share the resulting invitation privately with the resident.</p>','invite','Create invitation')+basicFields('Lease & checkout',input('Lease start','start','date','value="'+esc(h.lease_start?.slice(0,10))+'"')+input('Lease end','end','date','value="'+esc(h.lease_end?.slice(0,10))+'"')+input('Monthly rent (USD)','monthly','number','min="0" step=".01" value="'+(h.monthly_cents===null?'':h.monthly_cents/100)+'"')+input('Provider checkout link','checkout','url','value="'+esc(h.checkout_url)+'"'),'lease','Save household')+addHome()+'</div><div>'+basicFields('Record a ledger entry',select('Entry type','kind',['charge','payment'],'charge')+input('Amount (USD)','amount','number','required step=".01" min=".01"')+input('Description','label','text','required maxlength="100"')+input('Booking date','date','date','required value="'+new Date().toISOString().slice(0,10)+'"'),'ledger','Record entry')+'<section class="panel"><h2>Bank statement preview</h2><p class="hint">Choose a CSV or CAMT.053 file. Review one incoming payment before recording it. The file stays in your browser.</p><input id="statement" type="file" accept=".csv,.xml" aria-label="Bank statement"><div id="preview"></div></section><section class="panel"><h2>Integrations</h2><p class="hint">A key can read event metadata and manage tickets for this household. Replacing it disconnects the old key.</p><div class="inline"><button class="tab" id="issue-key">Generate or rotate key</button><button class="tab" id="revoke-key">Revoke key</button></div><output id="key-result" class="wrap" role="status"></output><div class="inline">'+['clipguard','ledgerflow','apisync'].map(s=>'<button class="tab" data-service="'+s+'">Test '+s+'</button>').join('')+'</div><output id="provider-result" role="status"></output></section><section class="panel"><h2>Residents</h2><div id="members"></div></section></div></div>';
 bindForm('#invite',async(b,f)=>{const v=await api('invite',b);statusOut(f,location.origin+'/portal#invite='+v.invite);});
 bindForm('#lease',async(b)=>{await api('household',{...b,monthly:b.monthly===''?null:Math.round(Number(b.monthly)*100)});await start(h.id);});
 let entryKey=crypto.randomUUID();
 bindForm('#ledger',async(b,f)=>{await api('ledger',{kind:b.kind,label:b.label,cents:Math.round(Number(b.amount)*100),date:b.date,requestKey:entryKey});entryKey=crypto.randomUUID();f.reset();statusOut(f,'Entry recorded in this household’s ledger.');});wireSetup();
 $('#statement').onchange=async e=>{const file=e.target.files[0],target=$('#preview');if(!file)return;try{if(file.size>500000)throw Error('Choose a statement smaller than 500 KB.');const text=decodeBytes(await file.arrayBuffer());let lines;if(detectFormat(text)==='camt053')lines=parseCamt(text);else{const t=parseCsv(text),map=guessMapping(t);if(!map)throw Error('Could not identify date and amount columns.');lines=readCsv(t,map).lines;}lines=lines.filter(l=>l.amount>0&&(!l.currency||l.currency==='USD')).slice(0,200);target.innerHTML=lines.length?'<p class="hint">Confirm the payer and household before selecting an entry.</p>'+lines.map((l,i)=>'<button class="tab" data-row="'+i+'">'+esc(l.booked_on)+' · '+money(Math.round(l.amount*100))+' · '+esc(l.payer_name||l.reference||'Unlabeled')+'</button>').join(''):'<p>No incoming USD payments found.</p>';target.querySelectorAll('[data-row]').forEach(b=>b.onclick=()=>{const l=lines[Number(b.dataset.row)],f=$('#ledger');f.kind.value='payment';f.amount.value=l.amount;f.date.value=l.booked_on;f.label.value='Rent payment';f.scrollIntoView({block:'center'});});}catch(err){target.textContent=err.message;}};
 async function keyAction(revoke){if(!confirm(revoke?'Revoke access for this household key?':'Generate a new key and replace any current household key?'))return;const out=$('#key-result');try{const r=await api(revoke?'key-revoke':'integration-key',{});out.textContent=revoke?'Key revoked.':'Copy this key now: '+r.key;}catch(e){out.textContent=e.message;}}
 $('#issue-key').onclick=()=>keyAction(false);$('#revoke-key').onclick=()=>keyAction(true);
 box.querySelectorAll('[data-service]').forEach(b=>b.onclick=async()=>{const out=$('#provider-result');out.textContent='Checking…';try{const v=await api('check-provider',{service:b.dataset.service});out.textContent=v.service+' responded to the synthetic check.';}catch(e){out.textContent=e.message;}});
 const members=$('#members');try{const records=await api('members');members.innerHTML=records.length?records.map(r=>'<div class="row-between"><span>'+esc(r.email)+'</span><button class="tab" data-remove="'+esc(r.id)+'">Remove access</button></div>').join(''):'<p class="hint">No residents have accepted an invitation yet.</p>';members.querySelectorAll('[data-remove]').forEach(b=>b.onclick=async()=>{if(!confirm('Remove this resident’s access to the household?'))return;try{await api('remove-member',{id:b.dataset.remove});await render();}catch(e){members.textContent=e.message;}});}catch(e){members.textContent=e.message;}
}
if(portal)start();


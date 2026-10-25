import { VERSION, createState, sample, addDonation, coordinate, respond, handoff, advance, toggleRecipient, loadScenario, metrics, guideStep, freeCapacity, donation, event as recordEvent } from './engine.mjs';

const icons = {
  grid:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  box:'<path d="m3 7 9-4 9 4v11l-9 4-9-4Z"/><path d="m3 7 9 4 9-4M12 11v11M7.5 5l9 4"/>',
  people:'<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6M21 21v-3a6 6 0 0 0-4-5.65"/>',
  activity:'<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  spark:'<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"/>',
  search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
  help:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 4.2 1.8c-1.2.6-1.7 1.2-1.7 2.7M12 17h.01"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',
  leaf:'<path d="M20 4C9 2 3 7 5 15c2 7 13 6 15-11Z"/><path d="M4 21 16 9M9 15V9M9 15h6"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  heart:'<path d="m12 21-8.2-8.2a5.5 5.5 0 0 1 7.8-7.8l.4.4.4-.4a5.5 5.5 0 0 1 7.8 7.8Z"/>',
  repeat:'<path d="m17 2 4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3"/>',
  shield:'<path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6Z"/><path d="m8 12 3 3 5-6"/>',
  bowl:'<path d="M3 11h18a9 9 0 0 1-18 0ZM6 21h12M8 3v3M12 2v4M16 3v3"/>',
  bread:'<path d="M6 20V9a4 4 0 0 1 0-8h12a4 4 0 0 1 0 8v11Z"/><path d="M10 7v5M14 7v5"/>',
  pin:'<path d="M19 10c0 6-7 11-7 11S5 16 5 10a7 7 0 0 1 14 0Z"/><circle cx="12" cy="10" r="2"/>',
  alert:'<path d="m12 3 10 18H2Z"/><path d="M12 9v5M12 17h.01"/>',
  download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]||icons.box}</svg>`;
const $ = s => document.querySelector(s);
const escape = v => String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const time = n => new Date(n).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'});
const storageKey='second-serving-workspace-v1';
const labels={ready:'Ready to match',offered:'Awaiting reply',accepted:'Pickup accepted',picked_up:'In transit',received:'Received',unmatched:'Needs human help',expired:'Window ended',pending:'Pending',declined:'Declined',unavailable:'Unavailable'};
let state;
try{const saved=JSON.parse(localStorage.getItem(storageKey)||localStorage.getItem('rescuerelay-practice-v1'));if(saved?.version===VERSION && Array.isArray(saved.donations) && Array.isArray(saved.offers) && Array.isArray(saved.recipients) && Array.isArray(saved.events) && Number.isFinite(saved.clock)) state=saved;}catch{}
state ||= createState();
let view=location.hash.slice(1)||'overview', filter='all', query='', toastTimer, confirmation;
let mode='practice',modeExplicit=false,busy=false,agentConfig={configured:false,checking:true},agentMessage='',lastAgentSummary='';
function save(){try{localStorage.setItem(storageKey,JSON.stringify(state));}catch{toast('Browser storage is unavailable. Keep this tab open to preserve your practice.');}}
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),4500);}
function recipient(id){return state.recipients.find(r=>r.id===id);}
function badge(status){return `<span class="badge ${escape(status)}"><i></i>${escape(labels[status]||status)}</span>`;}
function button(action,label,id='',kind='primary',small=false){return `<button class="button ${kind}${small?' small':''}" data-action="${action}"${id?` data-id="${escape(id)}"`:''}>${label}</button>`;}
function filtered(){return state.donations.filter(d=>{
  const match=!query || `${d.food} ${d.restaurant} ${d.location}`.toLowerCase().includes(query.toLowerCase());
  return match && (filter==='all'||filter==='action'&&['ready','offered','unmatched','expired'].includes(d.status)||filter==='complete'&&d.status==='received');
});}
function filters(){return `<div class="filters">${[['all','All donations'],['action','Needs action'],['complete','Completed']].map(([key,label])=>`<button class="filter ${filter===key?'active':''}" data-filter="${key}">${label}</button>`).join('')}</div>`;}
function title(heading,sub,action=true){return `<div class="view-heading"><div><h1>${heading}</h1><p>${sub}</p></div>${action?button('new',`${icon('plus')} New donation`):''}</div>`;}
function foodIcon(d){return `<span class="food-icon ${d.category}">${icon(d.category==='prepared'?'bowl':'bread')}</span>`;}
function quickAction(d){if(d.status==='ready')return button('match','Find recipient →',d.id,'soft',true);if(d.status==='accepted')return button('pickup','Confirm pickup',d.id,'primary',true);if(d.status==='picked_up')return button('receive','Confirm receipt',d.id,'primary',true);return button('details','View details ↗',d.id,'secondary',true);}
function renderStats(){const m=metrics(state);return `<section class="stats" aria-label="Practice statistics">${[
  ['Demo portions received',m.received,'heart','Human-confirmed handoffs'],['Active donations',m.active,'box','Food on its way to a next stop'],['Pending offers',m.pending,'clock','Waiting for a recipient response'],['Donations reassigned',m.rematches,'repeat','A second chance to reach someone'],
].map(([name,value,symbol,foot])=>`<article class="stat"><div class="stat-top"><span>${name}</span><span class="stat-icon">${icon(symbol)}</span></div><div class="stat-value">${value.toLocaleString()}</div><div class="stat-foot">${foot}</div></article>`).join('')}</section>`;}
function hero(){return `<section class="hero"><div class="hero-copy"><p class="eyebrow">GOOD FOOD. BETTER COORDINATION.</p><h2>A little surplus.<br>A lot of <em>possibility.</em></h2><p>Connect restaurant surplus with the community.<br>One thoughtful match. One less missed meal.</p><div class="hero-buttons">${button('guided',`Try a guided rescue ${icon('arrow')}`)}<a href="#agent" class="button link">Meet the coordinator ↗</a></div></div><div class="hero-logo-card"><img src="./assets/second-serving-logo.png" alt="Second Serving — good food, connected." width="2172" height="724"><span>GOOD FOOD DESERVES A SECOND SERVING.</span></div></section>`;}
function simulationNote(){return `<p class="simulation-note">${icon('shield')} ${mode==='ai'?'Live AI coordinator · Fictional organizations and pickup estimates':'Practice coordinator · Simulated decisions and fictional organizations'} · Offers stay inside this demo · No real messages</p>`;}
function guideBanner(){
  const step=guideStep(state);if(!step)return '';
  const d=state.donations[0], pending=state.offers.find(o=>o.donationId===d?.id&&o.status==='pending');
  const steps={
    1:['Start with one donation','Load the example, review it, and check the confirmation box.','new-sample','Add the sample donation'],
    2:['Let the first match fall through','Decline the first offer to see the coordinator adapt.','decline','Decline & find another',pending?.id],
    3:['Accept the replacement offer','Another eligible recipient is ready. You play the recipient.','accept','Accept replacement',pending?.id],
    4:['Confirm the food was picked up','A human confirms collection. Received portions will still be zero.','pickup','Confirm pickup',d?.id],
    5:['Confirm the recipient received it','This human confirmation updates the impact counter.','receive','Confirm receipt',d?.id],
    6:['One rescue, practiced from start to finish.','You tested a failed match, a recovery, and a confirmed handoff.','guided','Practice again'],
  };
  let [heading,sub,action,label,id]=steps[step];
  if(d&&['unmatched','expired'].includes(d.status)){heading='This practice needs human help.';sub='The pickup could not be arranged. Start a fresh guide to try again.';action='guided';label='Start again';id='';}
  return `<section class="guide-banner"><span class="guide-num">${step===6?'✓':step}</span><div class="guide-copy"><p class="eyebrow">GUIDED PRACTICE · ${step===6?'COMPLETE':`STEP ${step} OF 5`}</p><h2>${heading}</h2><p>${sub}</p><div class="guide-progress" aria-label="${Math.min(step-1,5)} of 5 steps completed">${[1,2,3,4,5].map(i=>`<span class="${i<step?'done':''}"></span>`).join('')}</div></div>${button(action,label,id)}</section>`;
}
function donationRows(){const list=filtered();if(!list.length)return `<div class="empty"><span>${icon('box')}</span><h3>No donations here yet.</h3><p>Try another filter or add a fictional donation to begin.</p>${button('new','Add a donation','','soft',true)}</div>`;return list.slice(0,5).map(d=>`<article class="donation-row">${foodIcon(d)}<div class="donation-info"><h3>${escape(d.food)}</h3><p>${escape(d.restaurant)} · ${escape(d.location.split(',')[0])}</p></div><div class="donation-right">${badge(d.status)}<small>${d.quantity} portions · by ${time(d.pickupEnd)}</small></div><button class="icon-button" data-action="details" data-id="${d.id}" aria-label="View ${escape(d.food)}">↗</button></article>`).join('');}
function offerContent(o){const r=recipient(o.recipientId), d=donation(state,o.donationId);return `<div class="inbox-content"><div class="offer-recipient"><span class="recipient-avatar ${r.tone}">${r.initials}</span><div><h3>${escape(r.name)}</h3><p>${escape(r.neighborhood)} · Fictional recipient</p></div></div><div class="offer-details"><strong>${d.quantity} portions of ${escape(d.food.toLowerCase())}</strong><br><span class="offer-origin">${o.origin==='ai'?'Created by live AI':'Created by practice coordinator'}</span><br>${escape(o.explanation)}</div><div class="offer-meta"><span>${icon('clock')}Reply by ${time(o.expiresAt)}</span><span>${icon('pin')}${r.minutes} min pickup*</span></div><div class="offer-buttons">${button('decline','Decline & rematch',o.id,'secondary')}${button('accept',`${icon('check')} Accept pickup`,o.id)}</div></div>`;}
function inboxPanel(){const pending=state.offers.filter(o=>o.status==='pending');return `<section class="panel"><div class="panel-heading"><h2>Recipient inbox <span class="number">${pending.length}</span></h2>${badge('pending')}</div>${pending.length?offerContent(pending[0]):`<div class="empty"><span>${icon('check')}</span><h3>All caught up.</h3><p>New pickup offers will appear here when a donation is matched.</p></div>`}${pending.length>1?'<div class="row-bottom"><span>More offers are waiting</span><a href="#donations">View all offers ↗</a></div>':''}<div class="panel-note">You play the recipient. *Pickup times are simulated.</div></section>`;}
function activityItems(limit){return state.events.slice(0,limit).map(e=>`<article class="activity-item"><span class="activity-dot ${e.kind}">${icon(e.kind==='attention'?'alert':e.kind==='human'?'check':'spark')}</span><div class="activity-copy"><h3>${escape(e.title)}</h3><p>${escape(e.detail)}</p></div><time class="activity-time">${time(e.at)}</time></article>`).join('')||'<div class="empty"><p>Every practice action will appear here.</p></div>';}
function overview(){return `${title('A good day to do good.','Your food rescue coordination, all in one place.')}${state.guide?guideBanner():hero()}${simulationNote()}${coordinatorStrip()}${renderStats()}<div class="overview-grid"><section class="panel"><div class="panel-heading"><div><h2>Donation board <span class="number">${state.donations.length}</span></h2><p>A little surplus, ready for its next chapter.</p></div><a href="#donations">View all ↗</a></div>${filters()}${donationRows()}<div class="row-bottom"><span>${filtered().length} demo donation${filtered().length===1?'':'s'}</span><button data-action="new">+ Add a donation</button></div></section><div class="right-stack">${inboxPanel()}<section class="panel"><div class="panel-heading"><h2>Latest activity</h2><a href="#activity">View all ↗</a></div><div class="activity-mini">${activityItems(3)}</div></section></div></div>`;}
function donationsPage(){const list=filtered(), pending=state.offers.filter(o=>o.status==='pending');return `${title('Every donation has a journey.','Follow food from restaurant surplus to a confirmed handoff.')}${guideBanner()}<section class="panel"><div class="panel-heading"><h2>All donations <span class="number">${state.donations.length}</span></h2><span class="clock-chip">${icon('clock')}Practice time ${time(state.clock)}</span></div>${filters()}<div class="table-scroll"><table class="full-table"><thead><tr><th>Food & donor</th><th>Portions</th><th>Pickup by</th><th>Status</th><th>Next step</th></tr></thead><tbody>${list.map(d=>`<tr><td><div class="food-cell">${foodIcon(d)}<div><h3>${escape(d.food)}</h3><small>${escape(d.restaurant)}<br>${escape(d.location)}</small></div></div></td><td>${d.quantity}</td><td>${time(d.pickupEnd)}</td><td>${badge(d.status)}</td><td>${quickAction(d)}</td></tr>`).join('')}</tbody></table>${!list.length?'<div class="no-results">No donations match this search or filter.</div>':''}</div><div class="panel-note">Received portions count only after human confirmation. All records are practice data.</div></section>${pending.length?`<div class="panel-heading section-space"><h2>Pending recipient offers</h2><span class="text-muted" style="font-size:10px">${pending.length} waiting for a response</span></div><div class="recipients-grid">${pending.map(o=>`<section class="panel"><div class="panel-heading"><h2>${escape(donation(state,o.donationId).restaurant)}</h2>${badge('offered')}</div>${offerContent(o)}</section>`).join('')}</div>`:''}`;}
function recipientsPage(){return `${title('Good food needs a good fit.','Explore recipient capacity and try pausing an organization.',false)}<div class="warning-note">These four organizations are fictional. Each recipient supplies its own pickup. Pausing a recipient automatically reassigns its pending offers.</div><section class="recipients-grid">${state.recipients.map(r=>{const remaining=freeCapacity(state,r), used=r.capacity-remaining;return `<article class="recipient-card"><div class="recipient-top"><span class="recipient-avatar ${r.tone}">${r.initials}</span><div><h2>${escape(r.name)}</h2><p>${escape(r.neighborhood)}, Miami · Fictional</p></div></div><div class="recipient-capacity"><div class="capacity-label"><span>Available capacity</span><strong>${remaining} / ${r.capacity} portions</strong></div><div class="capacity-bar" role="meter" aria-label="${escape(r.name)} used capacity" aria-valuemin="0" aria-valuemax="${r.capacity}" aria-valuenow="${used}"><div style="width:${used/r.capacity*100}%"></div></div></div><div class="recipient-tags">${r.categories.map(c=>`<span>${c==='prepared'?'Prepared food':'Pantry food'}</span>`).join('')}${r.storage.map(c=>`<span>${c==='refrigerated'?'Refrigeration':'Ambient storage'}</span>`).join('')}<span>${r.minutes} min simulated pickup</span></div><div class="recipient-bottom"><span class="availability ${r.available?'':'paused'}"><i></i>${r.available?'Accepting offers':'Offers paused'}</span>${button('toggle-recipient',r.available?'Pause offers':'Resume offers',r.id,'secondary',true)}</div></article>`;}).join('')}</section><div class="panel-note section-space">Capacity is reserved when an offer is made and used after acceptance. It resets when you start a fresh scenario.</div>`;}
const scenarios=[
  ['guided','The guided rescue','YOUR FIRST FIVE MINUTES','Learn the full journey, including a decline and automatic rematch. We’ll guide you at every step.','spark',''],
  ['smooth','A smooth handoff','THE HAPPY PATH','A restaurant has 30 meals. Accept a match, confirm pickup, and record a successful receipt.','heart',''],
  ['decline','A change of plans','RECOVERY IN ACTION','The first recipient cannot collect. Decline the offer and watch the next eligible recipient get a chance.','repeat','peach'],
  ['capacity','More food than capacity','KNOW WHEN TO ASK FOR HELP','Offer 100 prepared meals. See why the coordinator stops and requests human support.','people','blue'],
  ['expiry','An unanswered offer','PRACTICE WITH TIME','Advance the clock by 10 minutes. An unanswered offer expires and the coordinator tries again.','clock','peach'],
  ['deadline','A very tight deadline','TIME IS A REAL CONSTRAINT','Food must leave within 10 minutes. All pickup estimates are too long, so no promise is made.','alert','blue'],
];
function practicePage(){return `${title('A safe place to try things.','Build confidence before your hackathon presentation.',false)}<section class="practice-intro"><div><p class="eyebrow small">NO SETUP. NO API KEY.</p><h2>Learn by doing one good rescue.</h2><p>Play the restaurant, coordinator, and recipient. Every scenario uses fictional data and simulated decisions. Your practice stays in this browser.</p></div>${button('guided',`Start guided practice ${icon('arrow')}`)}</section><section class="scenario-grid">${scenarios.map(([key,name,tag,description,symbol,tone])=>`<article class="scenario-card"><span class="scenario-symbol ${tone}">${icon(symbol)}</span><span class="scenario-tag">${tag}</span><h2>${name}</h2><p>${description}</p><button class="button secondary small" data-scenario="${key}">Load scenario ${icon('arrow')}</button></article>`).join('')}</section><section class="practice-clock"><div><h3>Make time part of your rehearsal.</h3><p>Practice time advances only when you press this button.<br>Existing pending offers expire after 10 simulated minutes.</p></div><div class="clock-actions"><span class="clock-display">${time(state.clock)}</span>${button('advance',`${icon('clock')} +10 min`,'','secondary')}</div></section><div class="panel-note section-space">Loading a scenario replaces this browser’s current practice data. ${button('reset','Reset to sample workspace','','link')}</div>`;}
function activityPage(){return `${title('Every step, out in the open.','See how coordinator decisions and human confirmations change the workflow.',false)}<section class="panel"><div class="panel-heading"><h2>Practice activity <span class="number">${state.events.length}</span></h2>${button('export',`${icon('download')} Export log`,'','secondary',true)}</div><div class="panel-note">Purple spark icons mark live AI tool actions; green sparks mark practice actions. Check marks are human actions. No email or SMS is sent.</div><div class="activity-list">${activityItems(150)}</div></section>`;}
function coordinatorStrip(){return `<section class="coordinator-strip"><span class="coordinator-symbol">${icon('spark')}</span><div><strong>${busy?'Coordinator is working…':mode==='ai'?'Live AI coordinates new offers':'Your practice coordinator is ready'}</strong><p>${lastAgentSummary?escape(lastAgentSummary):mode==='ai'?'Donation matching and rematching use real server-side AI tool calls.':'Try the complete workflow now. Optional live AI can join the same donation and recipient screens.'}</p></div><a href="#agent" class="button secondary small">${mode==='ai'?'View agent':'Meet the agent'} ↗</a></section>`;}

function agentPage(){
  const configured=agentConfig.configured,connected=configured&&!agentConfig.issue;
  const connectionNote=agentConfig.issue?`<p class="connection-note">${escape(agentConfig.issue.message)} ${agentConfig.issue.billing_url?`<a href="${escape(agentConfig.issue.billing_url)}" target="_blank" rel="noopener noreferrer">Open provider account ↗</a>`:''}</p>`:!configured?'<p class="connection-note">Live AI has not been configured. Practice mode works without a key.</p>':`<p class="connection-note">${escape(agentConfig.provider_name||'AI')} · ${escape(agentConfig.model||'')} is configured on the server.</p>`;
  return `${title('One agent. A second chance.','Let the coordinator turn surplus into the next confirmed pickup.',false)}<section class="agent-hero"><div><p class="eyebrow">SECOND SERVING / COORDINATOR</p><h2>From “we have extra”<br>to “we can collect.”</h2><p>The coordinator checks recipients, creates an eligible offer, and tries another match when plans change. People stay in control of acceptance and handoffs.</p></div><span class="agent-emblem">${icon('spark')}</span></section><div class="agent-layout"><section class="panel"><div class="panel-heading"><div><h2>Choose your coordinator</h2><p>The same workflow, with a clear source for every offer.</p></div></div><div class="agent-body"><div class="agent-mode ${mode==='practice'?'selected':''}"><div><strong>Practice coordinator</strong><p>Rules run on this computer. No API key or external AI service is used.</p></div>${button('mode-practice',mode==='practice'?'Active':'Use practice','','secondary',true)}</div><div class="agent-mode ${mode==='ai'?'selected':''}"><div><strong>${escape(agentConfig.provider_name||'Live AI')} coordinator <span class="agent-status ${connected?'connected':''}">${agentConfig.checking?'Checking…':connected?(agentConfig.verified?'Live verified':'Configured'):configured?'Needs attention':'Not connected'}</span></strong><p>Real AI reads recipient eligibility and calls offer tools. Your practice records stay in this browser; AI requests use ${escape(agentConfig.provider_name||'the configured provider')} from this server.</p></div><button class="button ${connected?'primary':'secondary'} small" data-action="mode-ai" ${!connected?'disabled data-unavailable="true"':''}>${mode==='ai'?'Active':'Use live AI'}</button></div>${connectionNote}<div class="agent-controls">${button('refresh-agent','Test AI connection','','link')}${button('fresh-live','Start fresh live demo','','secondary',true)}</div></div></section><section class="panel"><div class="panel-heading"><div><h2>What the agent can do</h2><p>Actions that connect directly to your workspace.</p></div></div><ol class="agent-capabilities"><li><span>01</span><div><strong>Draft a donation</strong><p>Extract stated facts from a restaurant’s message for a person to review.</p></div></li><li><span>02</span><div><strong>Check the actual fit</strong><p>Compare food category, storage, capacity, and the pickup window.</p></div></li><li><span>03</span><div><strong>Create and recover offers</strong><p>Save an eligible offer in the recipient inbox; rematch after a decline or expiry.</p></div></li><li><span>04</span><div><strong>Ask for human help</strong><p>Stop when no recipient qualifies. Acceptance, pickup, and receipt stay human actions.</p></div></li></ol></section></div><section class="panel section-space"><div class="panel-heading"><div><h2>Describe a donation</h2><p>With live AI connected, this becomes a draft in the existing donation form.</p></div>${button('message-example','Use example','','secondary',true)}</div><form id="agent-message-form" class="agent-draft"><label for="agent-message">Restaurant message<textarea id="agent-message" name="message" rows="4" maxlength="3000" placeholder="We have 30 portions of prepared meals…" required>${escape(agentMessage)}</textarea></label><div class="agent-draft-footer"><p>Review every extracted field before confirming. Use fictional information for this demo.</p><button class="button primary" type="submit" ${!connected?'disabled data-unavailable="true"':''}>${icon('spark')} Draft with AI</button></div></form></section>${state.donations.some(d=>d.status==='ready')?`<section class="panel section-space"><div class="panel-heading"><h2>Ready for the coordinator</h2></div>${state.donations.filter(d=>d.status==='ready').map(d=>`<article class="donation-row">${foodIcon(d)}<div class="donation-info"><h3>${escape(d.food)}</h3><p>${d.quantity} portions · ${escape(d.restaurant)}</p></div>${button('match',mode==='ai'?'Run AI matching':'Run practice matching',d.id,'soft',true)}</article>`).join('')}</section>`:''}${lastAgentSummary?`<div class="agent-last-run">${icon('check')} ${escape(lastAgentSummary)}</div>`:''}`;
}

function applyBusy(){document.querySelectorAll('button').forEach(button=>{button.disabled=busy||button.dataset.unavailable==='true';});}
async function postAgent(action,data){
  const response=await fetch(`/api/agent/${action}`,{method:'POST',headers:{'Content-Type':'application/json','X-Second-Serving':'workspace'},body:JSON.stringify(data),signal:AbortSignal.timeout(150000)});
  const result=await response.json();if(!response.ok){if(result.configuration){agentConfig={...result.configuration,checking:false};if(agentConfig.issue)mode='practice';}throw new Error(result.error||'The agent could not complete this action.');}return result;
}
async function checkAgent(){
  agentConfig={...agentConfig,checking:true};render();
  try{const response=await fetch('/api/agent/config');if(!response.ok)throw new Error('Connection check unavailable.');agentConfig={...await response.json(),checking:false};}
  catch{agentConfig={configured:false,checking:false};}
  if(!agentConfig.configured||agentConfig.issue)mode='practice';else if(!modeExplicit)mode='ai';render();
}
async function runCoordinator(donationId){
  if(mode!=='ai')return coordinate(state,donationId);
  save();
  const result=await postAgent('coordinate',{state,donationId});
  state=result.state;lastAgentSummary=result.summary;save();
  return result;
}
async function extractMessage(message){
  const result=await postAgent('extract',{message});mode='ai';
  openDonation();const form=$('#donation-form');
  for(const key of ['restaurant','food','quantity','category','storage','location','allergens','readyIn','window']){
    const field=form.elements[key],value=result.draft[key];
    if(field.tagName==='SELECT'&&['readyIn','window'].includes(key)){
      if(value===null||value===undefined){if(!Array.from(field.options).some(o=>o.value===''))field.add(new Option('Choose pickup timing',''));field.value='';}
      else{if(!Array.from(field.options).some(o=>o.value===String(value)))field.add(new Option(`${value} minutes from now`,String(value)));field.value=String(value);}
      field.required=true;
    }else field.value=value??'';
  }
  form.elements.confirmed.checked=false;
  recordEvent(state,'AI drafted donation details',`Human review required.${result.missing.length?' Missing: '+result.missing.join(', '):''}`,null,'ai');
  $('#donation-intro').textContent=`AI draft ready for review.${result.missing.length?' Please fill missing details: '+result.missing.join(', ')+'.':''} Confirm only after reviewing every field.`;
  lastAgentSummary='AI draft prepared. No donation or pickup offer is created until you confirm.';
}

function render(){
  if(!['overview','donations','recipients','activity','practice','agent'].includes(view))view='overview';
  $('#breadcrumb').textContent=({overview:'Overview',donations:'Donations',recipients:'Recipients',activity:'Activity',practice:'Practice lab',agent:'AI coordinator'})[view];
  document.querySelectorAll('[data-view]').forEach(a=>{a.classList.toggle('active',a.dataset.view===view);if(a.dataset.view===view)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
  $('#nav-count').textContent=state.donations.length;
  $('#mode-indicator').innerHTML=`<i></i><span>${busy?'Coordinator working…':agentConfig.issue?.code==='credit_balance_exhausted'?'AI needs credits':mode==='ai'?`${agentConfig.provider_name||'Live'} AI active`:'Practice mode'}</span>`;
  $('#content').innerHTML=({overview,donations:donationsPage,recipients:recipientsPage,activity:activityPage,practice:practicePage,agent:agentPage})[view]();
  applyBusy();
}
function navigate(next){view=next;if(location.hash!==`#${next}`)location.hash=next;render();}
function openDonation(prefill=false){$('#donation-form').reset();$('#form-error').textContent='';$('#donation-intro').textContent=mode==='ai'?`Review the donation details. ${agentConfig.provider_name||'The AI coordinator'} will check eligible recipients after you confirm.`:'Review the donation details. The practice coordinator will check recipients after you confirm.';if(prefill)fillSample();$('#donation-dialog').showModal();}
function fillSample(){const fields=sample(state), form=$('#donation-form');for(const name of ['restaurant','food','quantity','category','storage','location','allergens','readyIn','window'])form.elements[name].value=fields[name];form.elements.confirmed.checked=false;}
function details(donationId){
  const d=donation(state,donationId), offers=state.offers.filter(o=>o.donationId===d.id), evaluations=d.lastEvaluation||[];
  $('#detail-content').innerHTML=`<div class="dialog-heading"><div><p class="eyebrow">DONATION DETAILS</p><h2 id="detail-title">${escape(d.food)}</h2></div><button class="icon-button" data-action="close-detail" aria-label="Close donation details">×</button></div><p class="dialog-intro">${escape(d.restaurant)} · ${escape(d.location)}</p>${badge(d.status)}<div class="detail-meta"><div><small>PORTIONS</small><strong>${d.quantity}</strong></div><div><small>PICKUP WINDOW</small><strong>${time(d.pickupStart)}–${time(d.pickupEnd)}</strong></div><div><small>STORAGE REQUIRED</small><strong>${escape(d.storage)}</strong></div><div><small>ALLERGEN INFORMATION</small><strong>${escape(d.allergens)}</strong></div></div><div class="detail-section"><h3>Why these recipients?</h3>${evaluations.length?evaluations.map(e=>`<div class="evaluation ${e.eligible?'':'excluded'}"><span>${e.eligible?'✓':'−'}</span><div><strong>${escape(e.name)}</strong><p>${e.eligible?`${e.remaining} portions of capacity · ${e.minutes} min simulated pickup. Eligible when matching ran.`:escape(e.reasons.join(' · '))}</p></div></div>`).join(''):'<p class="dialog-intro">Match this donation to check recipient eligibility.</p>'}</div>${offers.length?`<div class="offer-history"><h3 style="font-size:12px">Offer history</h3>${offers.map(o=>`<p>${escape(recipient(o.recipientId).name)} · ${badge(o.status)} · ${time(o.createdAt)}</p>`).join('')}</div>`:''}<div class="dialog-footer">${button('close-detail','Close','','secondary')}${['ready','accepted','picked_up'].includes(d.status)?quickAction(d):''}</div>`;
  $('#detail-dialog').dataset.donationId=d.id;
  if(!$('#detail-dialog').open)$('#detail-dialog').showModal();
}
function confirmFresh(name){
  if(name==='live'&&(!agentConfig.configured||agentConfig.issue))return toast('A working live AI connection is needed for this demo.');
  $('#confirm-title').textContent=name==='live'?'Start a fresh live-AI demo?':name==='reset'?'Reset the practice workspace?':'Load a fresh practice scenario?';
  $('#confirm-message').textContent='This replaces the fictional donations, offers, and activity saved in this browser. No real organizations will be contacted.';
  confirmation=()=>{mode=name==='live'?'ai':'practice';modeExplicit=true;state=name==='live'?createState({seed:false}):name==='reset'?createState():loadScenario(name);filter='all';query='';$('#search').value='';save();navigate(name==='live'?'agent':'overview');toast(name==='live'?'Fresh live-AI workspace ready. Use the example message, then Draft with AI.':name==='guided'?'Your guided rescue is ready. Start by adding the sample donation.':'Practice scenario loaded. Explore the donation and recipient inbox.');};
  $('#confirm-dialog').showModal();
}
async function mutate(action,message){if(busy)return;busy=true;render();try{await action();save();if(message)toast(message);}catch(error){recordEvent(state,'Coordinator needs attention',error.message,null,'attention');save();toast(error.message);}finally{busy=false;render();if($('#detail-dialog').open)details($('#detail-dialog').dataset.donationId);}}
document.querySelectorAll('[data-icon]').forEach(el=>{el.innerHTML=icon(el.dataset.icon);});
document.addEventListener('click',event=>{
  if(busy&&event.target.closest('button'))return;
  const filterButton=event.target.closest('[data-filter]');if(filterButton){filter=filterButton.dataset.filter;render();return;}
  const scenario=event.target.closest('[data-scenario]');if(scenario){confirmFresh(scenario.dataset.scenario);return;}
  const target=event.target.closest('[data-action]');if(!target)return;
  const {action,id}=target.dataset;
  if(action==='new'||action==='new-sample')return openDonation(action==='new-sample');
  if(action==='guided')return confirmFresh('guided');
  if(action==='reset')return confirmFresh('reset');
  if(action==='fresh-live')return confirmFresh('live');
  if(action==='close-dialog')return $('#donation-dialog').close();
  if(action==='close-detail')return $('#detail-dialog').close();
  if(action==='close-confirm')return $('#confirm-dialog').close();
  if(action==='details')return details(id);
  if(action==='mode-practice'){mode='practice';modeExplicit=true;render();return toast('Local practice coordinator selected.');}
  if(action==='mode-ai'){if(!agentConfig.configured||agentConfig.issue)return toast(agentConfig.issue?.message||'Live AI is not connected. Practice mode is available.');mode='ai';modeExplicit=true;render();return toast('Live AI will coordinate new offers and rematches.');}
  if(action==='refresh-agent')return mutate(async()=>{const result=await postAgent('check',{});agentConfig={...result,checking:false};if(result.available){mode='ai';modeExplicit=true;}lastAgentSummary='The live AI connection was tested successfully. New offers can now use the agent.';},'Live AI connection verified.');
  if(action==='message-example'){agentMessage='We are Café Mar y Sol in Little River, Miami. We have 30 portions of prepared vegetarian meals requiring refrigerated storage. The food is ready in 15 minutes and needs pickup within 90 minutes. Allergens are unknown.';render();return;}
  if(action==='match')return mutate(()=>runCoordinator(id),'Recipient check complete.');
  if(action==='decline')return mutate(async()=>{const offer=state.offers.find(o=>o.id===id);respond(state,id,'decline',{autoCoordinate:mode!=='ai'});if(mode==='ai')await runCoordinator(offer.donationId);},'Offer declined. The next eligible recipient was checked.');
  if(action==='accept')return mutate(()=>respond(state,id,'accept'),'Pickup accepted. Confirm collection when you are ready.');
  if(action==='pickup'||action==='receive')return mutate(()=>handoff(state,id,action),action==='pickup'?'Pickup recorded. Receipt still needs confirmation.':'Receipt confirmed. Your demo portions received counter has updated.');
  if(action==='toggle-recipient')return mutate(async()=>{const ids=toggleRecipient(state,id,{autoCoordinate:mode!=='ai'});if(mode==='ai')for(const donationId of ids)await runCoordinator(donationId);},'Recipient availability updated.');
  if(action==='advance')return mutate(async()=>{const ids=advance(state,10,{autoCoordinate:mode!=='ai'});if(mode==='ai')for(const donationId of ids)await runCoordinator(donationId);},'Practice clock advanced by 10 minutes. Expired offers were checked.');
  if(action==='export'){
    const report={practiceSimulation:true,exportedAt:new Date().toISOString(),metrics:metrics(state),donations:state.donations,offers:state.offers,events:state.events};
    const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'})), link=document.createElement('a');link.href=url;link.download='second-serving-practice-log.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Practice log downloaded.');
  }
});
$('#confirm-yes').addEventListener('click',()=>{$('#confirm-dialog').close();confirmation?.();confirmation=null;});
$('#fill-sample').addEventListener('click',fillSample);
$('#donation-form').addEventListener('submit',async event=>{
  event.preventDefault();const form=event.currentTarget, data=Object.fromEntries(new FormData(form));data.confirmed=form.elements.confirmed.checked;
  if(busy)return;
  let d;try{d=addDonation(state,data);}catch(error){$('#form-error').textContent=error.message;return;}
  save();$('#donation-dialog').close();navigate('overview');
  await mutate(()=>runCoordinator(d.id),'Donation confirmed. Check the board and recipient inbox.');
});
document.addEventListener('input',event=>{if(event.target.id==='agent-message')agentMessage=event.target.value;});
document.addEventListener('submit',event=>{if(event.target.id!=='agent-message-form')return;event.preventDefault();if(!agentConfig.configured)return toast('Live AI is not connected yet.');mutate(()=>extractMessage(agentMessage),'AI draft ready. Review and complete the form before confirming.');});
$('#mode-indicator').addEventListener('click',()=>navigate('agent'));
$('#help').addEventListener('click',()=>navigate('practice'));
$('#search').addEventListener('input',event=>{query=event.target.value;view='donations';if(location.hash!=='#donations')location.hash='donations';render();});
window.addEventListener('hashchange',()=>{view=location.hash.slice(1)||'overview';render();window.scrollTo({top:0,behavior:'instant'});});
for(const dialog of document.querySelectorAll('dialog'))dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
save();render();checkAgent();

// Browser-only practice engine. These are deterministic simulation rules, not AI calls.
export const VERSION = 1;
let counter = 0;
const id = prefix => `${prefix}-${Date.now().toString(36)}-${(++counter).toString(36)}`;
const minute = 60000;

export function event(state, title, detail, donationId = null, kind = 'agent') {
  state.events.unshift({ id:id('event'), at:state.clock, title, detail, donationId, kind });
  state.events = state.events.slice(0, 150);
}

export function createState({ seed = true, clock = Date.now() } = {}) {
  const state = { version:VERSION, clock, donations:[], offers:[], events:[], guide:false,
    recipients:[
      { id:'little-river', name:'Little River Pantry', neighborhood:'Little River', initials:'LR', capacity:40, used:0, minutes:12, categories:['prepared','pantry'], storage:['refrigerated','ambient'], available:true, tone:'sage' },
      { id:'biscayne', name:'Biscayne Community Kitchen', neighborhood:'Upper Eastside', initials:'BK', capacity:60, used:0, minutes:20, categories:['prepared','pantry'], storage:['refrigerated','ambient'], available:true, tone:'peach' },
      { id:'shelf-stable', name:'Shelf-Stable Food Bank', neighborhood:'Downtown', initials:'SF', capacity:100, used:0, minutes:9, categories:['pantry'], storage:['ambient'], available:true, tone:'blue' },
      { id:'neighborhood', name:'Neighborhood Community Fridge', neighborhood:'Little Haiti', initials:'NF', capacity:10, used:0, minutes:10, categories:['prepared'], storage:['refrigerated'], available:true, tone:'lavender' },
    ] };
  if (seed) {
    const first = addDonation(state, sample(state));
    coordinate(state, first.id);
    addDonation(state, { ...sample(state), restaurant:'Sunrise Bakery', food:'Fresh bread & pantry boxes', quantity:18, category:'pantry', storage:'ambient', location:'Downtown, Miami', allergens:'Wheat; other allergens unknown' });
  }
  return state;
}

export function sample(state) {
  return { restaurant:'Café Mar y Sol', food:'Boxed vegetarian meals', quantity:30,
    category:'prepared', storage:'refrigerated', location:'Little River, Miami',
    allergens:'Unknown — human verification required', readyIn:15, window:90, confirmed:true };
}

export function donation(state, donationId) {
  const d = state.donations.find(d => d.id === donationId);
  if (!d) throw new Error('Donation was not found. Try loading a fresh scenario.');
  return d;
}

function required(value, name, limit = 180) {
  if (typeof value !== 'string' || !value.trim() || value.length > limit) throw new Error(`Enter ${name} (up to ${limit} characters).`);
  return value.trim();
}

export function addDonation(state, fields) {
  const quantity = Number(fields.quantity), readyIn = Number(fields.readyIn), window = Number(fields.window);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1000) throw new Error('Enter between 1 and 1,000 portions.');
  if (!['prepared','pantry'].includes(fields.category)) throw new Error('Choose a food category.');
  if (!['refrigerated','ambient'].includes(fields.storage)) throw new Error('Choose a storage requirement.');
  if (!Number.isFinite(readyIn) || readyIn < 0 || readyIn > 180 || !Number.isFinite(window) || window <= readyIn || window > 360) throw new Error('The pickup deadline must be after the food is ready.');
  if (fields.confirmed !== true) throw new Error('Review the donation details and check the confirmation box.');
  const d = { id:id('donation'), restaurant:required(fields.restaurant, 'a restaurant name', 80),
    food:required(fields.food, 'a food description', 120), location:required(fields.location,'a pickup neighborhood',100),
    allergens:required(fields.allergens, 'allergen information, or write “unknown”', 200), quantity,
    category:fields.category, storage:fields.storage, pickupStart:state.clock + readyIn * minute,
    pickupEnd:state.clock + window * minute, status:'ready', createdAt:state.clock };
  state.donations.unshift(d);
  event(state, 'Donation details confirmed', `${d.restaurant} offered ${quantity} portions of ${d.food.toLowerCase()}.`, d.id, 'human');
  return d;
}

export function freeCapacity(state, recipient) {
  const reserved = state.offers.filter(o => o.recipientId === recipient.id && o.status === 'pending').reduce((sum,o) => sum + o.quantity,0);
  return recipient.capacity - recipient.used - reserved;
}

export function evaluate(state, donationId) {
  const d = donation(state, donationId);
  const tried = new Set(state.offers.filter(o => o.donationId === d.id).map(o => o.recipientId));
  return state.recipients.map(r => {
    const remaining = freeCapacity(state,r), reasons = [];
    if (!r.available) reasons.push('Paused: not accepting new offers');
    if (tried.has(r.id)) reasons.push('Already contacted for this donation');
    if (!r.categories.includes(d.category)) reasons.push('Does not accept prepared food');
    if (!r.storage.includes(d.storage)) reasons.push(`Cannot meet ${d.storage} storage requirements`);
    if (remaining < d.quantity) reasons.push(`Only ${remaining} portions of capacity available`);
    const pickup = Math.max(state.clock + r.minutes * minute, d.pickupStart);
    if (pickup >= d.pickupEnd) reasons.push('Cannot reach pickup before the deadline');
    return { recipientId:r.id, name:r.name, minutes:r.minutes, remaining, eligible:reasons.length === 0, reasons };
  }).sort((a,b) => Number(b.eligible) - Number(a.eligible) || a.minutes - b.minutes);
}

export function coordinate(state, donationId) {
  const d = donation(state,donationId);
  if (d.status !== 'ready') throw new Error('This donation already has an offer or is complete.');
  if (d.pickupEnd <= state.clock) { d.status='expired'; event(state,'Pickup window ended','Human follow-up is needed. No new offer was created.',d.id,'attention'); return null; }
  const evaluations = evaluate(state,d.id), eligible = evaluations.filter(r => r.eligible);
  event(state,'Eligibility checked',`${eligible.length} of ${state.recipients.length} recipients qualify for category, storage, capacity, and pickup timing.`,d.id);
  d.lastEvaluation = evaluations;
  if (!eligible.length) { d.status='unmatched'; event(state,'Human help needed','No eligible recipient remains. The simulator has not promised a pickup.',d.id,'attention'); return null; }
  return createOffer(state, donationId, eligible[0].recipientId);
}

// Both the AI and practice coordinator use this same checked action.
export function createOffer(state, donationId, recipientId, explanation=null, origin='practice') {
  const d=donation(state,donationId);
  if(d.status!=='ready')throw new Error('Only a ready donation can receive an offer.');
  const evaluations=evaluate(state,donationId),best=evaluations.find(r=>r.recipientId===recipientId&&r.eligible);
  if(!best)throw new Error('Recipient is not eligible. Use find_matches to choose an eligible recipient.');
  d.lastEvaluation=evaluations;
  const offer = { id:id('offer'), donationId:d.id, recipientId:best.recipientId,
    quantity:d.quantity, status:'pending', createdAt:state.clock,
    expiresAt:Math.min(state.clock + 10*minute, d.pickupEnd - best.minutes*minute),
    origin,
    explanation:explanation?required(explanation,'a match explanation',800):`Can accept ${d.quantity} portions, meets the storage requirement, and has the shortest eligible simulated pickup time (${best.minutes} min).` };
  if (offer.expiresAt <= state.clock) throw new Error('The pickup window is too short for this offer.');
  state.offers.unshift(offer); d.status='offered';
  const attempt = state.offers.filter(o => o.donationId===d.id).length;
  event(state, attempt > 1 ? 'Replacement offer created' : 'Pickup offer created', `${best.name} · ${d.quantity} portions · simulated ${best.minutes}-minute pickup.`, d.id,origin==='ai'?'ai':'agent');
  return offer;
}

export function markUnmatched(state,donationId){
  const d=donation(state,donationId);
  if(d.status!=='ready')throw new Error('Only a ready donation can be marked unmatched.');
  if(evaluate(state,donationId).some(r=>r.eligible))throw new Error('Eligible recipients still exist.');
  d.status='unmatched';d.lastEvaluation=evaluate(state,donationId);
  event(state,'AI requested human help','No eligible recipient remains. No pickup was promised.',d.id,'ai');
  return {status:'unmatched'};
}

export function respond(state, offerId, decision, {autoCoordinate=true}={}) {
  const o = state.offers.find(o => o.id===offerId);
  if (!o || o.status !== 'pending') throw new Error('This offer has already been answered or expired.');
  const d = donation(state,o.donationId), r = state.recipients.find(r => r.id===o.recipientId);
  if (o.expiresAt <= state.clock) throw new Error('This offer has expired. Advance the practice clock to refresh it.');
  if (decision==='decline') {
    o.status='declined'; d.status='ready';
    event(state,'Recipient declined',`${r.name} cannot collect. Another eligible recipient is needed.`,d.id,'human');
    return autoCoordinate?coordinate(state,d.id):null;
  }
  if (decision!=='accept') throw new Error('Choose accept or decline.');
  if (!r.available || freeCapacity(state,r) + o.quantity < o.quantity || state.clock + r.minutes*minute >= d.pickupEnd) throw new Error('Availability changed. Decline this offer to find another recipient.');
  r.used += o.quantity; o.status='accepted'; d.status='accepted';
  event(state,'Pickup accepted',`${r.name} will collect ${d.quantity} portions. Food has not yet been counted as received.`,d.id,'human');
  return o;
}

export function handoff(state, donationId, action) {
  const d=donation(state,donationId);
  if (action==='pickup' && d.status==='accepted') { d.status='picked_up'; event(state,'Pickup confirmed',`A person confirmed collection from ${d.restaurant}.`,d.id,'human'); }
  else if (action==='receive' && d.status==='picked_up') { d.status='received'; event(state,'Food received',`${d.quantity} demo portions confirmed by the recipient.`,d.id,'human'); }
  else throw new Error('Accept the offer, confirm pickup, then confirm receipt.');
}

export function advance(state, minutes=10, {autoCoordinate=true}={}) {
  if (!Number.isFinite(minutes) || minutes<=0 || minutes>180) throw new Error('Advance between 1 and 180 minutes.');
  state.clock += minutes*minute;
  event(state,'Practice clock advanced',`${minutes} simulated minutes elapsed.`,null,'human');
  const retry=[];
  for(const o of state.offers) if(o.status==='pending' && o.expiresAt<=state.clock) {
    o.status='expired'; const d=donation(state,o.donationId); d.status='ready'; retry.push(d.id);
    event(state,'Offer expired','The reservation was released. Trying another eligible recipient.',d.id,'attention');
  }
  for(const d of state.donations) if(['ready','unmatched'].includes(d.status) && d.pickupEnd<=state.clock) {
    d.status='expired'; event(state,'Pickup window ended','This donation needs human follow-up.',d.id,'attention');
  }
  const ready=retry.filter(donationId=>donation(state,donationId).status==='ready');
  if(autoCoordinate)for(const donationId of ready)coordinate(state,donationId);
  return ready;
}

export function toggleRecipient(state, recipientId, {autoCoordinate=true}={}) {
  const r=state.recipients.find(r=>r.id===recipientId);
  if(!r) throw new Error('Recipient not found.');
  r.available=!r.available;
  event(state,r.available?'Recipient available':'Recipient paused',`${r.name} ${r.available?'can receive new offers.':'is not taking new offers.'}`,null,'human');
  if(!r.available) {
    const pending=state.offers.filter(o=>o.recipientId===r.id && o.status==='pending');
    for(const o of pending) { o.status='unavailable'; const d=donation(state,o.donationId); d.status='ready'; if(autoCoordinate)coordinate(state,d.id); }
    return pending.map(o=>o.donationId);
  }
  return [];
}

export function loadScenario(name, clock=Date.now()) {
  const s=createState({seed:false,clock});
  s.scenario=name;
  if(name==='guided') { s.guide=true; return s; }
  const fields=sample(s);
  if(name==='capacity') fields.quantity=100;
  if(name==='deadline') { fields.readyIn=0; fields.window=10; }
  const d=addDonation(s,fields); coordinate(s,d.id);
  return s;
}

export function metrics(state) {
  return { received:state.donations.filter(d=>d.status==='received').reduce((sum,d)=>sum+d.quantity,0),
    active:state.donations.filter(d=>['ready','offered','accepted','picked_up'].includes(d.status)).length,
    pending:state.offers.filter(o=>o.status==='pending').length,
    rematches:state.donations.filter(d=>state.offers.filter(o=>o.donationId===d.id).length>1).length };
}

export function guideStep(state) {
  if(!state.guide) return 0;
  const d=state.donations[0];
  if(!d) return 1;
  if(d.status==='received') return 6;
  if(d.status==='picked_up') return 5;
  if(d.status==='accepted') return 4;
  if(state.offers.filter(o=>o.donationId===d.id).length>1) return 3;
  return 2;
}

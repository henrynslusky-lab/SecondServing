import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, sample, addDonation, coordinate, respond, handoff, advance, loadScenario, metrics, guideStep, toggleRecipient, freeCapacity } from './shared/engine.mjs';
const fresh=()=>createState({seed:false,clock:1800000000000});

test('guided rescue tracks decline, replacement, pickup, and human-confirmed receipt',()=>{
  const s=loadScenario('guided',1800000000000);assert.equal(guideStep(s),1);
  const d=addDonation(s,sample(s));coordinate(s,d.id);assert.equal(guideStep(s),2);
  const first=s.offers[0];assert.equal(first.recipientId,'little-river');
  respond(s,first.id,'decline');assert.equal(guideStep(s),3);assert.equal(s.offers[0].recipientId,'biscayne');
  respond(s,s.offers[0].id,'accept');assert.equal(guideStep(s),4);assert.equal(metrics(s).received,0);
  handoff(s,d.id,'pickup');assert.equal(guideStep(s),5);assert.equal(metrics(s).received,0);
  handoff(s,d.id,'receive');assert.equal(guideStep(s),6);assert.equal(metrics(s).received,30);assert.equal(metrics(s).rematches,1);
  assert.throws(()=>handoff(s,d.id,'receive'));
});
test('full recipient reservation prevents duplicate offers and excess capacity',()=>{
  const s=fresh();const a=addDonation(s,sample(s));coordinate(s,a.id);
  assert.equal(freeCapacity(s,s.recipients[0]),10);
  assert.throws(()=>coordinate(s,a.id));
  const b=addDonation(s,sample(s));coordinate(s,b.id);assert.equal(s.offers[0].recipientId,'biscayne');
  respond(s,s.offers[0].id,'accept');assert.equal(s.recipients[1].used,30);
  assert.throws(()=>respond(s,s.offers[0].id,'accept'));
});
test('capacity and deadline scenarios honestly escalate without promising pickup',()=>{
  for(const scenario of ['capacity','deadline']){const s=loadScenario(scenario,1800000000000);assert.equal(s.donations[0].status,'unmatched');assert.equal(s.offers.length,0);assert.equal(metrics(s).received,0);}
});
test('expired offer releases reservation and creates replacement; expired window stops matching',()=>{
  const s=loadScenario('expiry',1800000000000);const first=s.offers[0];
  advance(s,10);assert.equal(first.status,'expired');assert.equal(s.offers[0].recipientId,'biscayne');
  assert.throws(()=>respond(s,first.id,'accept'));
  advance(s,90);assert.equal(s.donations[0].status,'expired');assert.equal(s.offers.filter(o=>o.status==='pending').length,0);
});
test('pausing a recipient reroutes pending offer and preserves capacity',()=>{
  const s=loadScenario('smooth',1800000000000), first=s.offers[0];toggleRecipient(s,'little-river');
  assert.equal(first.status,'unavailable');assert.equal(s.offers[0].recipientId,'biscayne');assert.equal(freeCapacity(s,s.recipients[0]),40);
});
test('required data and donor confirmation block incomplete donations',()=>{
  const s=fresh();assert.throws(()=>addDonation(s,{...sample(s),confirmed:false}));
  assert.throws(()=>addDonation(s,{...sample(s),quantity:0}));
  assert.throws(()=>addDonation(s,{...sample(s),restaurant:''}));
  assert.throws(()=>addDonation(s,{...sample(s),readyIn:30,window:10}));
  assert.equal(s.donations.length,0);
});
test('receipt requires accepted pickup; initial seed carries no received impact',()=>{
  const s=createState({clock:1800000000000});assert.equal(metrics(s).received,0);
  assert.throws(()=>handoff(s,s.donations[0].id,'receive'));
});
test('serialization preserves practice state and a valid next action',()=>{
  const original=loadScenario('smooth',1800000000000), s=JSON.parse(JSON.stringify(original));
  respond(s,s.offers[0].id,'accept');assert.equal(s.donations[0].status,'accepted');assert.equal(metrics(s).pending,0);
});

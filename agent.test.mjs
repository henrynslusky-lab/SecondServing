import test from 'node:test';
import assert from 'node:assert/strict';
import {configuration,validateSnapshot,coordinateDonation,extractDonation,verifyConnection,setConnectionIssue} from './server/agent.mjs';
import {createState,sample,addDonation,respond} from './shared/engine.mjs';
const ready=()=>{const state=createState({seed:false});const d=addDonation(state,sample(state));return {state,d};};
const mock=(calls)=>{let index=0;return async(_url,options)=>{const body=JSON.parse(options.body);const output=calls[index++]?.(body)||[];return {ok:true,json:async()=>({id:`response-${index}`,output})};};};
const call=(name,args,callId)=>({type:'function_call',name,arguments:JSON.stringify(args),call_id:callId});
test('no credential is exposed and live AI remains explicitly unavailable',async()=>{
  assert.equal(configuration({}).configured,false);assert.equal(configuration({OPENAI_API_KEY:'private-test'}).configured,true);
  assert.ok(!JSON.stringify(configuration({OPENAI_API_KEY:'private-test'})).includes('private-test'));
  const {state,d}=ready();await assert.rejects(coordinateDonation({},state,d.id),/not connected/);
});
test('live tool loop creates a checked AI offer and returns the tool result',async()=>{
  const {state,d}=ready();
  const fetcher=mock([
    ()=>[call('find_matches',{},'match-1')],
    body=>{assert.equal(body.input[0].call_id,'match-1');return [call('create_offer',{recipient_id:'little-river',explanation:'Eligible capacity and shortest pickup estimate.'},'offer-1')];},
    body=>{assert.equal(body.input[0].call_id,'offer-1');return [];},
  ]);
  const result=await coordinateDonation({OPENAI_API_KEY:'fake-for-offline-test'},state,d.id,fetcher);
  assert.equal(result.state.offers[0].origin,'ai');assert.equal(result.state.donations[0].status,'offered');assert.equal(state.donations[0].status,'ready');
  respond(result.state,result.state.offers[0].id,'decline',{autoCoordinate:false});
  assert.equal(result.state.donations[0].status,'ready');assert.equal(result.state.offers.length,1);
  assert.doesNotThrow(()=>validateSnapshot(result.state));
});
test('invalid AI recipient is rejected before a valid replacement is saved',async()=>{
  const {state,d}=ready();
  const fetcher=mock([
    ()=>[call('find_matches',{},'c1')],
    ()=>[call('create_offer',{recipient_id:'neighborhood',explanation:'Invalid capacity choice.'},'c2')],
    body=>{assert.match(JSON.parse(body.input[0].output).error,/not eligible/);return [call('create_offer',{recipient_id:'biscayne',explanation:'Eligible alternate recipient.'},'c3')];},
    ()=>[],
  ]);
  const result=await coordinateDonation({OPENAI_API_KEY:'fake'},state,d.id,fetcher);
  assert.equal(result.state.offers.length,1);assert.equal(result.state.offers[0].recipientId,'biscayne');assert.equal(result.trace[1].status,'rejected');
});
test('AI draft preserves missing facts and requires human review',async()=>{
  const result=await extractDonation({OPENAI_API_KEY:'fake'},'There are 30 portions of meals.',mock([()=>[call('draft_donation',{restaurant:null,food:'Meals',location:null,quantity:30,category:'prepared',storage:null,allergens:null,readyIn:null,window:null},'draft')] ]));
  assert.equal(result.reviewRequired,true);assert.ok(result.missing.includes('allergens'));assert.equal(result.draft.storage,null);
});
test('altered client capacity is replaced with canonical recipient capabilities',()=>{
  const {state}=ready();state.recipients[0].capacity=9999;state.recipients[0].minutes=0;
  const checked=validateSnapshot(state);assert.equal(checked.recipients[0].capacity,40);assert.equal(checked.recipients[0].minutes,12);
});

test('exhausted API credits are distinguished from temporary rate limits',async()=>{
  const fetcher=async()=>({ok:false,status:429,json:async()=>({error:{code:'credit_balance_exhausted',type:'insufficient_quota'}})});
  try{
    await assert.rejects(verifyConnection({OPENAI_API_KEY:'fake'},fetcher),error=>error.code==='credit_balance_exhausted'&&error.message.includes('no API credits'));
    const config=configuration({OPENAI_API_KEY:'fake'});assert.equal(config.configured,true);assert.equal(config.available,false);assert.equal(config.issue.code,'credit_balance_exhausted');assert.ok(config.issue.billing_url);
  }finally{setConnectionIssue(null);}
});

test('a temporary rate limit does not direct the user to add credits',async()=>{
  const fetcher=async()=>({ok:false,status:429,json:async()=>({error:{code:'rate_limit_exceeded',type:'rate_limit_error'}})});
  try{
    await assert.rejects(verifyConnection({OPENAI_API_KEY:'fake'},fetcher),error=>error.code==='rate_limit_exceeded'&&!error.message.includes('credits'));
    assert.equal(configuration({OPENAI_API_KEY:'fake'}).issue.billing_url,undefined);
  }finally{setConnectionIssue(null);}
});

test('a successful connection test clears the previous blocking issue',async()=>{
  setConnectionIssue({code:'credit_balance_exhausted',message:'Add credits.'});
  const result=await verifyConnection({OPENAI_API_KEY:'fake'},mock([()=>[]]));
  assert.equal(result.available,true);assert.equal(result.issue,null);
});

test('Kimi executes tool calls using its own credential and preserves the tool transcript',async()=>{
  setConnectionIssue(null);
  const {state,d}=ready(),requests=[];
  const fetcher=async(url,options)=>{
    assert.equal(url,'https://api.moonshot.ai/v1/chat/completions');
    assert.equal(options.headers.Authorization,'Bearer fake-kimi-only');
    const body=JSON.parse(options.body);requests.push(structuredClone(body));
    assert.equal(body.model,'kimi-k2.6');assert.equal(body.thinking.type,'disabled');assert.equal(body.previous_response_id,undefined);
    let message;
    if(requests.length===1){assert.equal(body.tool_choice.function.name,'find_matches');message={role:'assistant',content:null,tool_calls:[{id:'kimi-match',type:'function',function:{name:'find_matches',arguments:'{}'}}]};}
    else if(requests.length===2){assert.ok(body.messages.some(m=>m.role==='tool'&&m.tool_call_id==='kimi-match'));message={role:'assistant',content:null,tool_calls:[{id:'kimi-offer',type:'function',function:{name:'create_offer',arguments:JSON.stringify({recipient_id:'little-river',explanation:'Eligible recipient with the shortest pickup estimate.'})}}]};}
    else{assert.ok(body.messages.some(m=>m.role==='tool'&&m.tool_call_id==='kimi-offer'));message={role:'assistant',content:'The offer was saved.'};}
    return {ok:true,json:async()=>({id:`kimi-${requests.length}`,choices:[{message}]})};
  };
  const env={AI_PROVIDER:'moonshot',MOONSHOT_API_KEY:'fake-kimi-only',OPENAI_API_KEY:'must-never-be-used'};
  const result=await coordinateDonation(env,state,d.id,fetcher);
  assert.equal(result.provider,'moonshot');assert.equal(result.state.offers[0].origin,'ai');assert.equal(requests.length,3);assert.equal(configuration(env).verified,true);
});

test('an old OpenAI billing issue does not block a configured Kimi connection',()=>{
  setConnectionIssue({provider:'openai',code:'credit_balance_exhausted',message:'Old provider issue.'});
  try{const config=configuration({AI_PROVIDER:'moonshot',MOONSHOT_API_KEY:'fake'});assert.equal(config.available,true);assert.equal(config.issue,null);assert.equal(config.provider_name,'Kimi');assert.equal(config.verified,false);}
  finally{setConnectionIssue(null);}
});

test('Kimi donation drafting uses the nested function schema and requires review',async()=>{
  const result=await extractDonation({AI_PROVIDER:'moonshot',MOONSHOT_API_KEY:'fake'},'We have 30 portions of meals.',async(_url,options)=>{
    const body=JSON.parse(options.body);assert.equal(body.tool_choice.function.name,'draft_donation');assert.equal(body.tools[0].function.strict,true);
    return {ok:true,json:async()=>({id:'kimi-draft',choices:[{message:{role:'assistant',content:null,tool_calls:[{id:'draft',type:'function',function:{name:'draft_donation',arguments:JSON.stringify({restaurant:null,food:'Meals',location:null,quantity:30,category:'prepared',storage:null,allergens:null,readyIn:null,window:null})}}]}}]})};
  });
  assert.equal(result.draft.quantity,30);assert.equal(result.reviewRequired,true);assert.ok(result.missing.includes('storage'));
});

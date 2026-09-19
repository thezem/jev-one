import test from 'node:test';
import assert from 'node:assert/strict';
import { JevOne, PointKernel } from '../dist/index.js';

function engine(ids) {
  let calls=0;
  const one=new JevOne(new PointKernel({id:'test-only',async point({choices}){
    const selected=ids[calls++];
    assert.ok(choices.some(c=>c.id===selected),`Unavailable fixture selection ${selected}`);
    return {selected,probabilities:Object.fromEntries(choices.map(c=>[c.id,c.id===selected?1:0]))};
  }}));
  one.vocabularies.register({id:'root',label:'Actions',description:'Test actions.',entries:[
    {id:'move',label:'MOVE',meaning:'Advance.',payload:{type:'capability',target:'move'}},
    {id:'stop',label:'STOP',meaning:'Stop.',payload:{type:'control',action:'stop'}},
    {id:'continue',label:'CONTINUE',meaning:'Reconsider.',payload:{type:'control',action:'continue'}},
  ]});
  one.capabilities.register({id:'move',description:'Advance',effects:['none'],handler:({state})=>({state:{position:state.position+1},observation:'Advanced',done:true})});
  return {one,calls:()=>calls};
}
const options={goal:'Reach two',context:'Start at zero.',root:'root',state:{position:0},verifyCompletion:s=>s.position===2};

test('objective predicate overrides premature handler done and verifies actual state',async()=>{
  const {one,calls}=engine(['move','move']);const observed=[];
  const result=await one.runtime.run({...options,onTurn:t=>{observed.push(t);t.stateAfter.position=99;}});
  assert.equal(result.reason,'verified');assert.equal(result.done,true);assert.equal(result.state.position,2);assert.equal(calls(),2);
  assert.equal(result.turns[0].stateAfter.position,1);assert.equal(observed.length,2);
});
test('Jev STOP is not objective success',async()=>{
  const {one}=engine(['stop']);const result=await one.runtime.run(options);
  assert.equal(result.done,false);assert.equal(result.reason,'jev_stop');
});
test('already satisfied objective returns without spending a Jev call',async()=>{
  const {one,calls}=engine([]);const result=await one.runtime.run({...options,state:{position:2}});
  assert.equal(result.done,true);assert.equal(calls(),0);
});
test('cancellation after pointing prevents the selected effect',async()=>{
  const {one}=engine(['move']);const controller=new AbortController();
  const result=await one.runtime.run({...options,signal:controller.signal,onDecision:()=>controller.abort()});
  assert.equal(result.reason,'aborted');assert.equal(result.state.position,0);assert.equal(result.turns.length,0);
});
test('streamed committed turn remains visible when observer requests cancellation',async()=>{
  const {one,calls}=engine(['move']);const controller=new AbortController();
  const result=await one.runtime.run({...options,signal:controller.signal,onTurn:()=>controller.abort()});
  assert.equal(result.reason,'aborted');assert.equal(result.state.position,1);assert.equal(calls(),1);
});
test('CONTINUE cannot evade the no-progress limit',async()=>{
  const {one,calls}=engine(['continue','continue']);const result=await one.runtime.run(options);
  assert.equal(result.reason,'no_progress');assert.equal(result.done,false);assert.equal(calls(),2);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CommanderModule,
  CortexModule,
  DEFAULT_COMMAND_GRAMMAR,
  JevOne,
  NavigatorModule,
  OracleModule,
  PointKernel,
  TraceLedger,
  VoiceModule,
} from '../dist/index.js';

class ScriptedJev {
  id = 'test-only-scripted-jev';
  constructor(selections) { this.selections = [...selections]; }
  async point(request) {
    const wanted = this.selections.shift();
    const selected = request.choices.some((choice) => choice.id === wanted) ? wanted : request.choices[0].id;
    const remainder = request.choices.length > 1 ? 0.12 / (request.choices.length - 1) : 0;
    return {
      selected,
      probabilities: Object.fromEntries(request.choices.map((choice) => [choice.id, choice.id === selected ? 0.88 : remainder])),
      model: 'typesafe-ai/jev-test-fixture',
    };
  }
}

test('kernel validates and records a hash-chained Jev point', async () => {
  const ledger = new TraceLedger();
  const kernel = new PointKernel(new ScriptedJev(['b']), { ledger });
  const result = await kernel.point({
    goal:'Choose one',context:'B fits.',question:'Which?',module:'test',
    choices:[{id:'a',label:'A',description:'First'},{id:'b',label:'B',description:'Second'}],
  });
  assert.equal(result.selected.id, 'b');
  assert.equal(result.strength, 'decisive');
  assert.equal(ledger.all().length, 1);
  assert.equal(ledger.verify(), true);
});

test('Oracle uses real Jev points across the 100-word lexicon', async () => {
  const oracle = new OracleModule(new PointKernel(new ScriptedJev(['strategy', 'simple'])));
  const answer = await oracle.ask('The system has too many moving parts.', 'What should guide the next move?');
  assert.equal(answer.category.id, 'strategy');
  assert.equal(answer.word.id, 'simple');
  assert.equal(answer.examinedWords, 100);
});

test('Cortex sequence appends each answer to later context', async () => {
  const cortex = new CortexModule(new PointKernel(new ScriptedJev(['small', 'after_eval'])));
  const result = await cortex.sequence('Plan release', 'Build passes.', [
    {id:'scope',question:'Scope?',choices:[{id:'small',label:'Small',description:'Core only'},{id:'broad',label:'Broad',description:'Everything'}]},
    {id:'timing',question:'Timing?',choices:[{id:'now',label:'Now',description:'Immediately'},{id:'after_eval',label:'After eval',description:'Evaluate first'}]},
  ]);
  assert.match(result.context, /Selected: Small/);
  assert.match(result.context, /Selected: After eval/);
  assert.equal(result.steps.length, 2);
});

test('Navigator observes, points, transitions, and stops through the environment', async () => {
  const navigator = new NavigatorModule(new PointKernel(new ScriptedJev(['right', 'finish'])));
  const environment = {
    id:'test-map',
    async observe(state) {
      if (state === 2) return {state,summary:'target',choices:[],done:true,target:'found',depth:2};
      return {state,summary:`position ${state}`,depth:state,choices:[
        {id:'right',label:'Right',description:'Advance',kind:'transition',value:state + 1},
        {id:'finish',label:'Finish',description:'Stay',kind:'control',value:2},
      ]};
    },
    async transition(_state, next) { return next; },
  };
  const run = await navigator.run('Reach target', 0, environment);
  assert.equal(run.done, true);
  assert.equal(run.target, 'found');
  assert.equal(run.steps.length, 2);
});

test('Commander only returns an inert dry-run proposal', async () => {
  const commander = new CommanderModule(new PointKernel(new ScriptedJev(['destructive', 'trash', 'target'])));
  const proposal = await commander.propose('Remove the old cache safely', 'Target is known.', DEFAULT_COMMAND_GRAMMAR, [
    {id:'target',label:'old-cache.json',description:'Old cache file',reference:'G:/virtual/old-cache.json'},
    {id:'other',label:'index.json',description:'Current index',reference:'G:/virtual/index.json'},
  ]);
  assert.equal(proposal.operation.id, 'trash');
  assert.equal(proposal.target.id, 'target');
  assert.equal(proposal.dryRun, true);
  assert.equal('execute' in proposal, false);
});

test('Voice lets Jev select speech while templates own the words', async () => {
  const voice = new VoiceModule(new PointKernel(new ScriptedJev(['warn', 'concise'])));
  const speech = await voice.speak('Communicate risk', 'A risk was observed.', [{id:'risk',label:'Risk',text:'The target is outside the allowed root.',source:'observed'}]);
  assert.equal(speech.act, 'warn');
  assert.match(speech.text, /outside the allowed root/);
});

test('JEV ONE registers every independent capability and the Will Gate chooses posture', async () => {
  const one = new JevOne(new PointKernel(new ScriptedJev(['choose'])));
  const result = await one.orchestrator.run({
    goal:'Decide next move',context:'Several paths exist.',legalPostures:['talk','choose','stop'],maxCycles:1,
    handlers:{talk:async()=>({done:true}),choose:async()=>({done:true})},
  });
  assert.deepEqual(one.registry.list().map((item)=>item.id), ['oracle','cortex','navigator','commander','voice']);
  assert.equal(result.cycles[0].will.selected.value, 'choose');
  assert.equal(one.kernel.ledger.verify(), true);
});

test('custom vocabularies answer directly and recursively navigate to a leaf', async () => {
  const one = new JevOne(new PointKernel(new ScriptedJev(['emotions', 'curious'])));
  one.vocabularies.registerMany([
    { id:'root', label:'Root', description:'Answer territories.', entries:[
      {id:'emotions',label:'EMOTIONS',meaning:'Answer from emotional qualities.',payload:{type:'vocabulary',target:'emotions'}},
      {id:'actions',label:'ACTIONS',meaning:'Answer from possible actions.',payload:{type:'vocabulary',target:'control'}},
    ]},
    { id:'emotions', label:'Emotions', description:'Emotional qualities.', entries:[
      {id:'curious',label:'CURIOUS',meaning:'Drawn toward discovering more.',payload:{type:'meaning'}},
      {id:'calm',label:'CALM',meaning:'Settled and unhurried.',payload:{type:'meaning'}},
    ]},
  ]);
  const answer = await one.vocabulary.navigate({root:'root',context:'The writer keeps testing strange ideas.',question:'What quality dominates?'});
  assert.equal(answer.entry.id, 'curious');
  assert.deepEqual(answer.path, ['root','emotions','emotions','curious']);
  assert.equal(answer.steps.length, 2);
});

test('semantic runtime loops through capabilities and stops on observed completion', async () => {
  const one = new JevOne(new PointKernel(new ScriptedJev(['explore', 'advance', 'explore', 'finish'])));
  one.vocabularies.registerMany([
    {id:'mission',label:'Mission',description:'Mission routes.',entries:[
      {id:'explore',label:'EXPLORE',meaning:'Use available world actions.',payload:{type:'vocabulary',target:'moves'}},
      {id:'stop',label:'STOP',meaning:'Stop the mission.',payload:{type:'control',action:'stop'}},
    ]},
    {id:'moves',label:'Moves',description:'Legal world actions.',entries:[
      {id:'advance',label:'ADVANCE',meaning:'Move one position forward.',payload:{type:'capability',target:'world.advance'},effects:['navigate']},
      {id:'finish',label:'FINISH',meaning:'Complete the mission at the destination.',payload:{type:'capability',target:'world.finish'},effects:['read']},
    ]},
  ]);
  one.capabilities
    .register({id:'world.advance',description:'Advance.',effects:['navigate'],handler:({state})=>({state:{position:state.position+1},observation:'Advanced.'})})
    .register({id:'world.finish',description:'Finish.',effects:['read'],handler:({state})=>({state,observation:'Destination verified.',done:true})});
  const result = await one.runtime.run({goal:'Reach and verify the destination.',context:'Start at zero.',root:'mission',state:{position:0},policy:{maxTurns:3}});
  assert.equal(result.done, true);
  assert.equal(result.reason, 'capability_done');
  assert.equal(result.turns.length, 2);
  assert.equal(result.state.position, 1);
});

test('number vocabulary binds positions 1-25 to any current list', async () => {
  const one = new JevOne(new PointKernel(new ScriptedJev(['3'])));
  const answer = await one.numbers.choose({
    context:'Find the feline inside the animals directory.',question:'Which current entry should be opened?',
    items:[
      {label:'birds',description:'Directory containing winged animals.',value:'birds'},
      {label:'dogs',description:'Directory containing canine animals.',value:'dogs'},
      {label:'cats',description:'Directory containing feline animals.',value:'cats'},
      {label:'fish',description:'Directory containing aquatic animals.',value:'fish'},
    ],
  });
  assert.equal(answer.number, 3);
  assert.equal(answer.index, 2);
  assert.equal(answer.item.value, 'cats');
  assert.deepEqual(answer.decision.ranking.map(item=>item.choice.label), ['3','1','2','4']);
});

test('semantic runtime can change the legal root vocabulary between phases', async () => {
  const one = new JevOne(new PointKernel(new ScriptedJev(['tender', 'tiny'])));
  one.vocabularies.registerMany([
    {id:'interpret',label:'Interpret',description:'Interpret the moment.',entries:[
      {id:'tender',label:'TENDER',meaning:'Use gentleness.',payload:{type:'capability',target:'record'},effects:['read']},
      {id:'scattered',label:'SCATTERED',meaning:'Attention is divided.',payload:{type:'capability',target:'record'},effects:['read']},
    ]},
    {id:'respond',label:'Respond',description:'Choose one response.',entries:[
      {id:'tiny',label:'MAKE IT TINY',meaning:'Choose one tiny action.',payload:{type:'capability',target:'record'},effects:['read']},
      {id:'reach',label:'REACH OUT',meaning:'Make light contact.',payload:{type:'capability',target:'record'},effects:['read']},
    ]},
  ]);
  one.capabilities.register({id:'record',description:'Record selection.',effects:['read'],handler:({state,entry,turn})=>({state:{words:[...state.words,entry.label]},observation:`Recorded ${entry.label}.`,done:turn===2})});
  const run=await one.runtime.run({goal:'Interpret then respond.',context:'A real story.',root:(_state,turn)=>turn===1?'interpret':'respond',state:{words:[]},policy:{maxTurns:2}});
  assert.deepEqual(run.state.words,['TENDER','MAKE IT TINY']);
  assert.equal(run.turns.length,2);
  assert.equal(run.done,true);
});

import type { PointKernel } from './kernel.js';
import { CapabilityRegistry } from './registry.js';
import { CommanderModule } from './modules/commander.js';
import { CortexModule } from './modules/cortex.js';
import { NavigatorModule } from './modules/navigator.js';
import { OracleModule } from './modules/oracle/oracle.js';
import { VoiceModule } from './modules/voice.js';
import { JevOneOrchestrator } from './orchestrator.js';
import { VocabularyEngine } from './vocabulary/engine.js';
import { VocabularyRegistry } from './vocabulary/registry.js';
import { CONTROL_VOCABULARY } from './vocabulary/builtins.js';
import { RuntimeCapabilityRegistry } from './runtime/capabilities.js';
import { SemanticRuntime } from './runtime/runtime.js';
import { IndexedVocabulary } from './vocabulary/indexed.js';
import { ProfileStore } from './recommendation/profile.js';
import { recommend, type RecommendationOptions } from './recommendation/recommend.js';
import { DecisionCards } from './cards.js';

export class JevOne {
  readonly kernel: PointKernel;
  readonly registry = new CapabilityRegistry();
  readonly oracle: OracleModule;
  readonly cortex: CortexModule;
  readonly navigator: NavigatorModule;
  readonly commander: CommanderModule;
  readonly voice: VoiceModule;
  readonly orchestrator: JevOneOrchestrator;
  readonly vocabularies: VocabularyRegistry;
  readonly vocabulary: VocabularyEngine;
  readonly capabilities: RuntimeCapabilityRegistry;
  readonly runtime: SemanticRuntime;
  readonly numbers: IndexedVocabulary;
  readonly cards: DecisionCards;
  readonly profiles = new ProfileStore();

  recommend<T>(options: RecommendationOptions<T>) { return recommend(this.kernel, options); }

  constructor(kernel: PointKernel) {
    this.kernel = kernel;
    this.oracle = new OracleModule(kernel);
    this.cortex = new CortexModule(kernel);
    this.navigator = new NavigatorModule(kernel);
    this.commander = new CommanderModule(kernel);
    this.voice = new VoiceModule(kernel);
    this.orchestrator = new JevOneOrchestrator(kernel);
    this.vocabularies = new VocabularyRegistry().register(CONTROL_VOCABULARY);
    this.vocabulary = new VocabularyEngine(kernel, this.vocabularies);
    this.capabilities = new RuntimeCapabilityRegistry();
    this.runtime = new SemanticRuntime(this.vocabulary, this.capabilities);
    this.numbers = new IndexedVocabulary(kernel);
    this.cards = new DecisionCards(kernel);
    this.registry
      .register({manifest:{id:'oracle',name:'Oracle',version:'0.1.0',description:'Universal semantic meanings.',postures:['choose','talk'],effects:['none']},implementation:this.oracle})
      .register({manifest:{id:'cortex',name:'Cortex',version:'0.1.0',description:'Consequential judgment and cumulative decisions.',postures:['choose'],effects:['none']},implementation:this.cortex})
      .register({manifest:{id:'navigator',name:'Navigator',version:'0.1.0',description:'Bounded movement through observed legal transitions.',postures:['act','wait'],effects:['read','navigate'],forbiddenEffects:['write','delete','execute']},implementation:this.navigator})
      .register({manifest:{id:'commander',name:'Commander',version:'0.1.0',description:'Inert operation proposals from fixed action grammars.',postures:['act'],effects:['none'],forbiddenEffects:['write','delete','execute']},implementation:this.commander})
      .register({manifest:{id:'voice',name:'Voice',version:'0.1.0',description:'Deterministic speech from Jev-selected acts and trace facts.',postures:['talk'],effects:['none']},implementation:this.voice});
  }
}

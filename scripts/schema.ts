import { z } from 'zod';
import type { Condition } from '../src/engine/types';
import { vectorProblems } from '../src/engine/heroDevelopmentProfile';
export const resourceSchema = z.enum(['wealth','strength','peace','bonds']);
export const qualitySchema = z.enum(['attention','honesty','compassion','letgo','courage']);
export const facetSchema = z.enum(['work','relationships','body','inner']);
export const logicSchema = z.enum(['opportunist','diplomat','expert','achiever','individualist','strategist','alchemist','ironic']);
const value = z.union([z.string().min(1),z.boolean()]);
const day = z.number().int().min(1);
const range = (min: number, max: number) => z.number().int().min(min).max(max);
export const conditionSchema: z.ZodType<Condition> = z.lazy(() => z.union([
  z.object({all:z.array(conditionSchema).min(1)}).strict(),z.object({any:z.array(conditionSchema).min(1)}).strict(),z.object({not:conditionSchema}).strict(),
  z.object({quality:qualitySchema,gte:range(-20,20).optional(),lte:range(-20,20).optional()}).strict(),
  z.object({resource:resourceSchema,gte:range(0,100).optional(),lte:range(0,100).optional()}).strict(),
  z.object({fact:z.string().min(1),equals:value}).strict(),z.object({flag:z.string().min(1)}).strict(),
  z.object({chapter:z.number().int().min(1)}).strict(),z.object({dayGte:day.optional(),dayLte:day.optional()}).strict().refine(v=>v.dayGte!==undefined||v.dayLte!==undefined),
  z.object({shown:z.string().min(1)}).strict(),z.object({chose:z.object({card:z.string().min(1),choice:z.string().min(1)}).strict()}).strict(),
  z.object({heroStage:logicSchema}).strict(),z.object({availableLogic:logicSchema}).strict(),z.object({developmentEvent:z.string().min(1)}).strict(),
  z.object({developmentBeat:z.object({arc:z.string().min(1),beat:z.enum(['trial','consequence','review','transfer','pressure']),is:z.enum(['done','open','withdrawn'])}).strict()}).strict(),
  z.object({developmentSince:z.object({arc:z.string().min(1),beat:z.enum(['trial','consequence','review','transfer','pressure']),of:z.enum(['done','withdrawal']),decisions:z.number().int().min(0).max(10),evenings:z.number().int().min(0).max(10)}).strict()}).strict(),
  z.object({topQuality:qualitySchema,gte:range(-20,20).optional()}).strict(),z.object({intention:facetSchema}).strict()
] ) as unknown as z.ZodType<Condition>);
export const effectsSchema=z.object({
 resources:z.record(resourceSchema,range(-20,20)).optional(),qualities:z.record(qualitySchema,range(-2,2)).refine(v=>Object.keys(v).length<=2).optional(),
 setFlags:z.array(z.string().min(1)).optional(),clearFlags:z.array(z.string().min(1)).optional(),setFacts:z.record(value).optional(),
 schedule:z.array(z.object({cardId:z.string().min(1),inDays:z.number().int().min(1),latestDay:day.optional()}).strict()).optional(),wisdomId:z.string().min(1).optional()
}).strict();
export const developmentEventSchema=z.object({eventId:z.string().min(1),arcId:z.string().min(1),contextId:z.string().min(1),kind:z.enum(['limitation','trial','review','withdrawal','transfer','pressure','consequence']),when:conditionSchema.optional(),beat:z.enum(['trial','consequence','review','transfer','pressure']).optional()}).strict();
const text = z.string().min(1);
export const logicVectorSchema = z.object(Object.fromEntries(['opportunist','diplomat','expert','achiever','individualist','strategist','alchemist','ironic'].map(l=>[l,z.number()]))).strict()
  .superRefine((v,ctx)=>{for(const message of vectorProblems(v))ctx.addIssue({code:z.ZodIssueCode.custom,message});}) as unknown as z.ZodType<Record<z.infer<typeof logicSchema>,number>>;
export const rationaleSchema = z.object({SELF:text,OTHERS:text,COMPLEXITY:text,TIME:text,PERSPECTIVE:text,UNCERTAINTY:text}).strict();
export const diagnosticSignalSchema = z.object({vector:logicVectorSchema,rationale:rationaleSchema,scoringVersion:z.literal('1'),rubricVersion:z.literal('1')}).strict();
export const cardDiagnosticSchema = z.object({situationId:text,contextId:text,facets:z.array(facetSchema).min(1).max(2),developmentWeight:z.number().min(0).max(1),
  pressure:z.boolean().optional(),expiresInDays:z.number().int().min(1).max(7).optional(),distinguishes:z.array(logicSchema).min(2).max(2).optional()}).strict();
export const diagnosticMotiveSchema = z.object({promptId:text,text:text.max(120),optional:z.literal(true),
  options:z.array(z.object({id:text,label:text.max(80),signal:diagnosticSignalSchema}).strict()).min(2).max(4)}).strict();
export const diagnosticBehaviorSchema = z.object({continuesSituationId:text,signal:diagnosticSignalSchema}).strict();
export const profileConfigSchema = z.object({currentAlgorithmVersion:text,rollout:z.object({adaptiveSelection:z.boolean(),developmentArcs:z.boolean(),facetAttention:z.boolean()}).strict(),
 facetAttention:z.object({windowSize:z.number().int().positive(),minEvidence:z.number().int().min(0),playerWeight:z.number().min(0).max(1),minMultiplier:z.number().positive().max(1),maxMultiplier:z.number().min(1),declaredIntentionMultiplier:z.number().min(1)}).strict()
  .refine(c=>c.minEvidence<=c.windowSize,'minEvidence must not exceed windowSize'),
 algorithms:z.record(z.object({scoringVersion:text,rubricVersion:text,scoring:z.enum(['full','contrast']).optional(),windowCases:z.number().int().positive(),defaultExpiresInDays:z.number().int().positive(),motivePrompt:z.object({maxPerDay:z.number().int().positive()}).strict(),
  probe:z.object({maxShareOfIndependentWindow:z.number().positive().max(1),maxBeforeShareRule:z.number().int().min(0),shareRuleFromIndependentCases:z.number().int().positive()}).strict(),
  sourceWeights:z.object({action:z.number().positive(),motive:z.number().positive(),behavior:z.number().positive()}).strict(),
  provisional:z.object({minDay:z.number().int().positive(),minCases:z.number().int().positive(),minContexts:z.number().int().positive()}).strict(),
  stableCandidate:z.object({minDay:z.number().int().positive(),minCases:z.number().int().positive(),minWeight:z.number().positive(),minContexts:z.number().int().positive(),minLeaderShare:z.number().positive(),minDelta:z.number().positive(),minConfidence:z.number().positive(),evenings:z.literal(2),minNewIndependentActionsBetweenConfirmations:z.number().int().min(1),minFacetsFirstStable:z.number().int().min(1).max(4).optional()}).strict(),
  confidence:z.object({nTarget:z.number().positive(),wTarget:z.number().positive(),kTarget:z.number().positive(),deltaTarget:z.number().positive()}).strict(),
  facetConfidence:z.object({nTarget:z.number().positive(),wTarget:z.number().positive(),kTarget:z.number().positive(),deltaTarget:z.number().positive(),minCases:z.number().int().positive(),minWeight:z.number().positive(),minContexts:z.number().int().positive(),minConfidence:z.number().positive()}).strict(),
  fallback:z.object({minActions:z.number().int().positive(),minContexts:z.number().int().positive(),minShare:z.number().positive(),minDelta:z.number().positive(),evenings:z.literal(2)}).strict(),
  leadingEdge:z.object({minShare:z.number().positive(),minActions:z.number().int().positive(),minComponent:z.number().positive(),minContexts:z.number().int().positive()}).strict(),
  emerging:z.object({minActions:z.number().int().positive(),minComponent:z.number().positive(),minContexts:z.number().int().positive()}).strict(),
  rubric:z.object({axes:rationaleSchema,logics:z.record(logicSchema,rationaleSchema).refine(v=>Object.keys(v).length===8)}).strict()}).strict())}).strict();
export const developmentSchema=z.object({stages:z.array(z.object({id:logicSchema,name:z.string().min(1),description:z.string().min(1),ability:z.string().min(1),lens:z.string().min(1),wonder:z.string().min(1)}).strict()).length(8),arcs:z.array(z.object({id:z.string().min(1),from:logicSchema,to:logicSchema,ability:z.string().min(1),question:z.string().min(1),model:z.enum(['cycles','beats']).optional(),cycles:z.array(z.object({trial:z.string(),consequence:z.string(),review:z.string()}).strict()),minContexts:z.number().int().min(2),promotionText:z.string().min(1)}).strict()
  .refine(a=>a.model==='beats'?a.cycles.length===0:a.cycles.length>=1,{message:'a cycles arc needs cycles; a beats arc has none'}))}).strict();
export const choiceSchema=z.object({id:z.string().min(1),label:z.string().min(1),effects:effectsSchema,servesFacets:z.array(facetSchema).min(1).max(2).optional(),obligation:z.string().min(1).optional(),decisionKinds:z.array(z.enum(['pursue','cost','perspective','experiment','reconsider'])).optional(),pursuesGoals:z.array(z.enum(['order','workshop','alexey'])).optional(),lineStep:z.object({line:z.enum(['pace','apprentice','commitments']),step:z.string()}).strict().optional(),response:z.string().optional(),developmentEvents:z.array(developmentEventSchema).optional(),
 diagnosticAction:diagnosticSignalSchema.optional(),diagnosticMotive:diagnosticMotiveSchema.optional(),diagnosticBehavior:diagnosticBehaviorSchema.optional()}).strict()
 .refine(c=>!(c.diagnosticAction&&c.diagnosticBehavior),{message:'a choice cannot open a case and continue another one'});
const pair=z.array(choiceSchema).min(2).max(4);
const position=z.object({day,slot:range(0,3)}).strict();
export const textVariantSchema=z.object({id:z.string().min(1),when:conditionSchema,text:z.string().min(1).max(500),kind:z.enum(['perception','consequence','shadow','intention']),familiarCardId:z.string().optional()}).strict();
export const cardSchema=z.object({
 id:z.string().min(1),chapter:z.union([z.number().int().min(1),z.literal('any')]),type:z.enum(['situation','chain','routine','crisis']),character:z.string().optional(),
 facets:z.array(facetSchema).min(1).max(2),text:z.string().min(1).max(500),choices:pair,textVariants:z.array(textVariantSchema).optional(),
 choiceVariants:z.array(z.object({when:conditionSchema,choices:pair}).strict()).optional(),key:z.boolean().optional(),required:z.boolean().optional(),at:position.optional(),
 mustShowBy:day.optional(),requires:conditionSchema.optional(),fixedSides:z.boolean().optional(),weight:z.number().nonnegative().optional(),once:z.boolean().optional(),
 cooldownDays:day.optional(),crisis:z.object({resource:resourceSchema,edge:z.union([z.literal(0),z.literal(100)])}).strict().optional(),
 development:z.object({stages:z.array(logicSchema).min(1).optional(),arcId:z.string().optional(),presentedEvents:z.array(developmentEventSchema).optional()}).strict().optional(),diagnostic:cardDiagnosticSchema.optional(),
 shadow:z.object({quality:qualitySchema,evidence:conditionSchema}).strict().optional(),tags:z.array(z.string()).optional()
}).strict().superRefine((c,ctx)=>{
 const fail=(message:string)=>ctx.addIssue({code:z.ZodIssueCode.custom,message});
 if(c.at&&c.mustShowBy!==undefined)fail('at and mustShowBy are mutually exclusive');
 if((c.type==='crisis')!==Boolean(c.crisis))fail('crisis metadata must match type');
 if(c.type==='routine'&&(c.once!==false||c.cooldownDays!==3))fail('routine must repeat with cooldown 3');
 if(c.type==='crisis'&&(c.once!==false||!c.textVariants?.length))fail('crisis needs repetition text');
});
export const insightSchema=z.object({id:z.string(),title:z.string(),text:z.string(),requires:conditionSchema,effects:effectsSchema,window:z.object({fromDay:day,throughDay:day}).strict(),visibleResult:conditionSchema}).strict();
export const wisdomSchema=z.object({id:z.string(),text:z.string().max(280)}).strict();
export const reflectionSchema=z.object({id:z.string(),text:z.string().max(120),optionalNote:z.literal(true)}).strict();
export const dayTextSchema=z.object({id:z.string(),part:z.enum(['morning','evening']),day:day.optional(),quality:qualitySchema.optional(),text:z.string(),textVariants:z.array(textVariantSchema).optional()}).strict();
export const endingSchema=z.object({id:z.string(),title:z.string(),text:z.string(),requires:conditionSchema,priority:z.number().int()}).strict();
export const characterSchema=z.object({id:z.string(),name:z.string(),role:z.string(),themes:z.array(z.string()),intention:z.string()}).strict();
const routeOption=z.object({id:z.string(),label:z.string(),facets:z.array(facetSchema).min(1).max(2),routePool:z.string()}).strict();
export const episodeSchema=z.object({id:z.string(),title:z.string(),days:day,daysPerChapter:day,slotsPerDay:z.literal(4),
 intentionOptions:z.array(z.object({id:z.string(),facet:facetSchema,label:z.string()}).strict()).length(4),
 routeMoments:z.array(z.object({day,slot:range(0,3),options:z.tuple([routeOption,routeOption])}).strict()),routePools:z.record(z.array(z.string()).min(2)),
 opportunities:z.array(z.object({id:z.string(),facet:facetSchema,opensWhen:conditionSchema,throughDay:day,resolvedFact:z.string(),takenValue:value,expiredValue:value,offeredAt:position,offerText:z.string(),cardIds:z.array(z.string()).min(1)}).strict()).max(4),
 finalFacts:z.array(z.string()),initialFacts:z.record(value),inheritedFactKeys:z.array(z.string()),chapters:z.array(z.object({id:day,from:day,through:day,title:z.string()}).strict()).min(1),milestones:z.array(z.object({id:z.string(),day,slot:range(0,3)}).strict()),goalReviewDays:z.array(day),goals:z.array(z.object({id:z.enum(['order','workshop','alexey']),label:z.string()}).strict())}).strict();
export const factsSchema=z.record(z.object({values:z.array(value).min(1),initial:value,finalValues:z.array(value).optional()}).strict());
export const traceSchema=z.object({source:z.object({cardId:z.string(),choiceId:z.string()}).strict(),readers:z.array(z.object({kind:z.enum(['card','text','ending','fact']),id:z.string()}).strict()).min(1),response:z.string().min(1).max(280),visibleByDay:day.optional()}).strict();
export const portraitFragmentSchema=z.object({id:z.string(),text:z.string(),requires:conditionSchema,group:z.enum(['order','alexey','market','relationship','shadow'])}).strict();

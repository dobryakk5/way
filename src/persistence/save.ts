import { z } from 'zod';
import legacyContent from './legacy-v3.json';
import legacyContentV4 from './legacy-v4.json';
import { validateDevelopmentEvidence } from '../engine/development';
import { createEmptyHeroDevelopmentProfile } from '../engine/heroDevelopmentProfile';
import { allChoices } from '../engine/variants';
import { developmentEventSchema, diagnosticBehaviorSchema, diagnosticMotiveSchema, diagnosticSignalSchema, logicSchema } from '../../scripts/schema';
import { content } from '../content';
import { CONTENT_VERSION } from '../content/version';
import { GAME_STATE_VERSION } from '../engine/initialState';
import type { ActionLogic, GameContent, GameState } from '../engine/types';

type Manifest=Pick<GameContent,'cards'|'factsSchema'|'episode'>;
const manifestV3=legacyContent as unknown as Manifest;
const manifestV4=legacyContentV4 as unknown as Manifest;
const day = z.number().int().min(1).max(content.episode.days);
const slot = z.number().int().min(0).max(content.episode.slotsPerDay - 1);
const facet = z.enum(['work','relationships','body','inner']);
const goal = z.enum(['order','workshop','alexey']);
const decision = z.enum(['pursue','cost','perspective','experiment','reconsider']);
const line = z.enum(['pace','apprentice','commitments']);
const fact = z.union([z.string(),z.boolean()]);
const resources = z.object({wealth:z.number().min(0).max(100),strength:z.number().min(0).max(100),peace:z.number().min(0).max(100),bonds:z.number().min(0).max(100)}).strict();
const phases = ['morning','intention','route','slot','evening','insight','reflection','chapter','ending','goal','dice','boundary'] as const;
const phase4 = z.enum(phases);
const phase5 = z.enum([...phases,'motive']);

const str = z.string().min(1);
const effects = z.object({resources:z.record(z.enum(['wealth','strength','peace','bonds']),z.number()).optional(),qualities:z.record(z.enum(['attention','honesty','compassion','letgo','courage']),z.number()).optional(),setFlags:z.array(str).optional(),clearFlags:z.array(str).optional(),setFacts:z.record(fact).optional(),schedule:z.array(z.object({cardId:str,inDays:z.number().int().positive(),latestDay:day.optional()}).strict()).optional(),wisdomId:str.optional()}).strict();
const choice4 = z.object({id:str,label:str,effects,servesFacets:z.array(facet).optional(),obligation:str.optional(),decisionKinds:z.array(decision).optional(),pursuesGoals:z.array(z.enum(['order','workshop','alexey'])).optional(),lineStep:z.object({line,step:str}).strict().optional(),response:z.string().optional(),developmentEvents:z.array(developmentEventSchema).optional()}).strict();
const choice = choice4.extend({diagnosticAction:diagnosticSignalSchema.optional(),diagnosticMotive:diagnosticMotiveSchema.optional(),diagnosticBehavior:diagnosticBehaviorSchema.optional()}).strict()
 .refine(c=>!(c.diagnosticAction&&c.diagnosticBehavior));
const development4 = z.object({current:logicSchema,available:z.array(logicSchema),growingEdge:logicSchema.optional(),activeArcId:str.optional(),
 evidence:z.array(developmentEventSchema.omit({when:true}).extend({day,slot,cardId:str,choiceId:str.optional(),variantId:str.optional()}).strict()),
 pendingPromotion:z.object({arcId:str,to:logicSchema}).strict().optional(),
 transitions:z.array(z.object({arcId:str,from:logicSchema,to:logicSchema,day,evidenceIds:z.array(str)}).strict())}).strict();
const stage = z.object({logic:logicSchema,origin:z.enum(['observed-initial','legacy-authored']),day:z.number().int().min(0).max(content.episode.days),available:z.array(logicSchema).min(1)}).strict();
const development = z.object({developmentCurrent:logicSchema.optional(),currentOrigin:z.enum(['observed-initial','promotion','legacy-authored']).optional(),initialRebaseCount:z.union([z.literal(0),z.literal(1)]),initialStage:stage.optional(),
 available:z.array(logicSchema),transitionTarget:logicSchema.optional(),activeArcId:str.optional(),
 evidence:development4.shape.evidence,pendingPromotion:development4.shape.pendingPromotion,
 transitions:z.array(development4.shape.transitions.element.extend({reason:z.enum(['promotion','initial-reconciliation']).optional()}).strict())}).strict();
const num = z.number().finite();
const vector = z.object(Object.fromEntries(['opportunist','diplomat','expert','achiever','individualist','strategist','alchemist','ironic'].map(l=>[l,num.min(0)]))).strict();
const origin = z.enum(['neutral','probe','adaptive']);
const status = z.enum(['insufficient','provisional','stable']);
const count = z.number().int().min(0);
const slice = z.object({distribution:vector.optional(),N:count,W:num.min(0),K:count,delta:num,coverage:num,confidence:num,caseIds:z.array(str)}).strict();
const emerging = z.object({logic:logicSchema,actionCount:count,contextIds:z.array(str),evidenceIds:z.array(str)}).strict();
const snapshot = z.object({day,status,current:slice,observedPrimary:logicSchema.optional(),candidatePrimary:logicSchema.optional(),candidateSinceDay:day.optional(),candidateSinceIndependentActionCount:count.optional(),
 asOfEvidenceCount:count,developmentCurrent:logicSchema.optional(),fallbackCandidate:logicSchema.optional(),fallback:logicSchema.optional(),leadingEdge:logicSchema.optional(),emergingSignals:z.array(emerging)}).strict();
const profileEvidence = z.object({id:str,caseId:str,situationId:str,source:z.enum(['action','motive','behavior']),day,slot,cardId:str,choiceId:str,variantId:str.optional(),motiveOptionId:str.optional(),
 contextId:str,facets:z.array(facet).min(1).max(2),pressure:z.boolean(),selectionOrigin:origin,developmentWeight:num.min(0).max(1),vector,algorithmVersion:str,scoringVersion:str,rubricVersion:str,contentVersion:str}).strict();
const profileCase = z.object({id:str,situationId:str,openedDay:day,openedSlot:slot,cardId:str,choiceId:str,contextId:str,facets:z.array(facet).min(1).max(2),pressure:z.boolean(),actionOrigin:origin,developmentWeight:num.min(0).max(1),
 actionEvidenceId:str,motiveEvidenceId:str.optional(),behaviorEvidenceId:str.optional(),motiveState:z.enum(['none','pending','recorded','skipped','suppressed']),behaviorState:z.enum(['none','pending','recorded','expired']),
 status:z.enum(['open','complete','expired']),expiresDay:z.number().int().min(1)}).strict();
const facetProfile = z.object({lifetime:slice.optional(),current:slice.optional(),sufficient:z.boolean()}).strict();
const heroDevelopmentProfile = z.object({algorithmVersion:str,evidence:z.array(profileEvidence),cases:z.array(profileCase),status,lifetimeDistribution:vector.optional(),currentDistribution:vector.optional(),
 observedPrimary:logicSchema.optional(),candidatePrimary:logicSchema.optional(),candidateSinceDay:day.optional(),candidateSinceIndependentActionCount:count.optional(),fallback:logicSchema.optional(),leadingEdge:logicSchema.optional(),
 emergingSignals:z.array(emerging),coverage:num,confidence:num,facets:z.object({work:facetProfile,relationships:facetProfile,body:facetProfile,inner:facetProfile}).strict(),eveningSnapshots:z.array(snapshot)}).strict();
const pendingMotive = z.object({caseId:str,promptId:str,text:str,options:z.array(z.object({id:str,label:str}).strict()).min(2).max(4),resume:z.object({day,slot,next:z.enum(['next-slot','evening'])}).strict()}).strict();
const persistenceChoice = z.object({authorChoiceId:str,choiceId:z.number().int().positive(),presentationId:z.number().int().positive(),position:z.number().int().min(1).max(4)}).strict();
const presentedPersistence = z.object({sceneInstanceId:z.string().uuid(),sceneId:z.number().int().positive(),scenePresentationId:z.number().int().positive(),gameSlot:slot,selectionOrigin:origin,choices:z.array(persistenceChoice).min(2).max(4)}).strict();
const currentOf = (c: typeof choice | typeof choice4) => z.object({cardId:str,leftChoiceId:str.optional(),choiceIds:z.array(str).min(2).max(4),text:str,variantId:str.optional(),choices:z.array(c).min(2).max(4),selectionOrigin:origin.optional(),persistence:presentedPersistence.optional()}).strict();
const common = {
 episodeId:z.literal(content.episode.id),runId:str,seed:z.number().int().nonnegative(),serverPersistence:z.object({enabled:z.literal(true),schema:z.literal(1)}).strict().optional(),
 chapter:z.number().int().positive(),day,slot,
 resources,qualities:z.object({attention:z.number(),honesty:z.number(),compassion:z.number(),letgo:z.number(),courage:z.number()}).strict(),
 declaredIntention:facet.optional(),intentionHistory:z.array(z.object({day,facet}).strict()),
 activeRoute:z.object({day,slot,optionId:str,facets:z.array(facet)}).strict().optional(),routeHistory:z.array(z.object({day,slot,optionId:str}).strict()),
 opportunityState:z.record(z.enum(['open','taken','expired'])),opportunityExposure:z.record(z.object({day,via:z.enum(['card','route'])}).strict()),
 facts:z.record(fact),flags:z.array(str),inheritedFacts:z.record(fact),shown:z.record(z.array(day)),
 scheduled:z.array(z.object({cardId:str,day,latestDay:day.optional()}).strict()),pendingCrises:z.array(str),pendingWisdoms:z.array(str),pendingInsight:str.optional(),appliedInsights:z.array(str),pendingReflection:str.optional(),
 eveningPrimaryId:str.optional(),preparedEveningDay:day.optional(),lastMorningVariant:z.object({day,quality:z.enum(['attention','honesty','compassion','letgo','courage'])}).strict().optional(),morningText:z.string().optional(),
 journal:z.array(z.object({day,kind:z.enum(['wisdom','insight','reflection']),id:str,note:z.string().optional()}).strict()),
 history:z.array(z.object({day,slot,cardId:str,choiceId:str,text:str,label:str,facets:z.array(facet),decisionKinds:z.array(decision),goalId:goal.optional(),response:z.string().optional()}).strict()),
 observations:z.array(z.object({day,slot,kind:z.enum(['variant','trace','insight','opportunity','dropped']),id:str,text:z.string().optional()}).strict()),summaryCommitted:z.boolean(),
 goal:z.object({id:goal,wording:str}).strict().optional(),goalHistory:z.array(z.object({day,id:goal,wording:str,action:z.enum(['select','keep','clarify','change'])}).strict()),
 evidence:z.array(z.object({day,slot,cardId:str,choiceId:str,line,step:str}).strict()),
 nights:z.array(z.object({day,primary:z.string(),note:z.string().optional(),resources}).strict()),
 milestones:z.record(z.object({day,facts:z.record(fact),text:z.string()}).strict())
};
const dice4 = z.array(z.object({day,slot,candidates:z.array(str).length(6),face:z.number().int().min(1).max(6).optional(),cardId:str.optional()}).strict());
const dice5 = z.array(z.object({day,slot,candidates:z.array(str).length(6),candidateOrigins:z.array(origin).length(6).optional(),face:z.number().int().min(1).max(6).optional(),cardId:str.optional()}).strict());
export const V4_CONTENT_VERSION = 'mvp-v2.4-alpha.1';
export const V3_CONTENT_VERSION = 'mvp-v2.3-alpha.1';
export const gameSchema = z.object({...common,version:z.literal(GAME_STATE_VERSION),contentVersion:z.literal(CONTENT_VERSION),phase:phase5,resumePhase:phase5.optional(),
 current:currentOf(choice).optional(),diceHistory:dice5,development,heroDevelopmentProfile,pendingMotive:pendingMotive.optional()}).strict();
const gameV4 = z.object({...common,version:z.literal(4),contentVersion:z.literal(V4_CONTENT_VERSION),phase:phase4,resumePhase:phase4.optional(),
 current:currentOf(choice4).omit({selectionOrigin:true}).optional(),diceHistory:dice4,development:development4}).strict();
const gameV3 = gameV4.omit({development:true}).extend({version:z.literal(3),contentVersion:z.literal(V3_CONTENT_VERSION)});
const envelope = z.object({schema:z.literal(1),started:z.boolean(),game:gameSchema}).strict();
const envelopeV4 = z.object({schema:z.literal(1),started:z.boolean(),game:gameV4}).strict();
const envelopeV3 = z.object({schema:z.literal(1),started:z.boolean(),game:gameV3}).strict();
export type SaveRecord = { schema: 1; started: boolean; game: GameState };
type LegacyV4Record = { schema: 1; started: boolean; game: Omit<GameState,'development'|'heroDevelopmentProfile'|'version'|'contentVersion'|'pendingMotive'|'phase'|'current'|'diceHistory'> & { version: 4; contentVersion: string; phase: Exclude<GameState['phase'],'motive'>;
   current?: Omit<NonNullable<GameState['current']>,'selectionOrigin'>; diceHistory: Omit<GameState['diceHistory'][number],'candidateOrigins'>[];
   development: { current: ActionLogic; available: ActionLogic[]; growingEdge?: ActionLogic; activeArcId?: string; evidence: GameState['development']['evidence']; pendingPromotion?: { arcId: string; to: ActionLogic }; transitions: GameState['development']['transitions'] } } };
function canonical(value:unknown):string { if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';if(value&&typeof value==='object')return '{'+Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+canonical(v)).join(',')+'}';return JSON.stringify(value); }
type Mode = 3 | 4 | 5;
const knownChoices = (cards:Manifest['cards'],id:string) => { const card=cards.find(c=>c.id===id);return card?allChoices(card):[]; };
function validateRecord(raw: unknown, mode: Mode = 5): SaveRecord | LegacyV4Record | undefined {
 const parsed = (mode===3 ? envelopeV3 : mode===4 ? envelopeV4 : envelope).safeParse(raw);
 if (!parsed.success) return undefined;
 const g = parsed.data.game as unknown as GameState;
 const source:Manifest = mode===3 ? manifestV3 : mode===4 ? manifestV4 : content;
 // A pair shown under an older content version stays valid exactly as it was shown.
 const history:Manifest[] = mode===5 ? [manifestV4,manifestV3] : mode===4 ? [manifestV3] : [];
 const hasCard = (id:string) => source.cards.some(c => c.id === id);
 if(Object.entries(g.facts).some(([key,value])=>!source.factsSchema[key]?.values.includes(value)) || Object.keys(source.episode.initialFacts).some(key=>!(key in g.facts)))return undefined;
 if(g.history.some((h,i)=>h.day!==Math.floor(i/source.episode.slotsPerDay)+1||h.slot!==i%source.episode.slotsPerDay))return undefined;
 // A pending motive question has already consumed the slot's decision but not moved on.
 const usedToday=['evening','chapter','boundary','ending'].includes(g.phase)?source.episode.slotsPerDay:g.phase==='motive'?g.slot+1:g.slot;
 if(g.history.length!==(g.day-1)*source.episode.slotsPerDay+usedToday)return undefined;
 if(g.nights.some((n,i)=>n.day!==i+1))return undefined;
 if (g.current && (!hasCard(g.current.cardId) || (g.current.choiceIds.length===2?!g.current.choiceIds.includes(g.current.leftChoiceId!):g.current.leftChoiceId!==undefined) || g.current.choices!.length!==g.current.choiceIds.length ||
   g.current.choices!.some((c,i) => c.id !== g.current!.choiceIds[i] || ![...knownChoices(source.cards,g.current!.cardId),...history.flatMap(m=>knownChoices(m.cards,g.current!.cardId))].some(known=>canonical(known)===canonical(c))))) return undefined;
 if (g.phase === 'slot' && !g.current || g.phase === 'motive' && g.current || g.phase === 'dice' && !g.diceHistory.some(d=>d.day===g.day&&d.slot===g.slot)) return undefined;
 if (g.history.some(h=>!source.cards.some(c=>c.id===h.cardId&&allChoices(c).some(ch=>ch.id===h.choiceId)))) return undefined;
 if (new Set(g.history.map(h=>`${h.day}/${h.slot}`)).size !== g.history.length) return undefined;
 if (g.evidence.some(e=>!g.history.some(h=>h.day===e.day&&h.slot===e.slot&&h.cardId===e.cardId&&h.choiceId===e.choiceId))) return undefined;
 if (new Set(g.nights.map(n=>n.day)).size!==g.nights.length || g.nights.some(n=>g.history.filter(h=>h.day===n.day).length!==source.episode.slotsPerDay)) return undefined;
 if (g.diceHistory.some(d=>new Set(d.candidates).size!==6 || d.candidates.some(id=>!hasCard(id)) ||
   (d.face!==undefined && d.cardId!==d.candidates[d.face-1]))) return undefined;
 if (new Set(g.diceHistory.map(d=>d.day)).size!==g.diceHistory.length) return undefined;
 if (!source.episode.chapters.some(ch=>ch.id===g.chapter && g.day>=ch.from && g.day<=ch.through)) return undefined;
 if (g.phase==='boundary' && g.nights.at(-1)?.day!==source.episode.days) return undefined;
 if (mode===5) {
  if (g.phase==='motive' !== !!g.pendingMotive) return undefined;
  if (g.pendingMotive) {
   const m=g.pendingMotive; const c=g.heroDevelopmentProfile.cases.find(x=>x.id===m.caseId);
   const prompt=c&&knownChoices(content.cards,c.cardId).find(x=>x.id===c.choiceId)?.diagnosticMotive;
   if(!c||!prompt||prompt.promptId!==m.promptId||prompt.text!==m.text||canonical(prompt.options.map(o=>({id:o.id,label:o.label})))!==canonical(m.options)) return undefined;
   if(m.resume.day!==g.day||m.resume.slot!==g.slot||m.resume.next!==(g.slot===content.episode.slotsPerDay-1?'evening':'next-slot')||c.openedDay!==g.day||c.openedSlot!==g.slot) return undefined;
  }
  if (g.diceHistory.some(d=>d.candidateOrigins&&d.face!==undefined&&g.current&&g.current.cardId===d.cardId&&d.day===g.day&&d.slot===g.slot&&g.current.selectionOrigin!==d.candidateOrigins[d.face-1])) return undefined;
  if(!validateDevelopmentEvidence(g,content))return undefined;
 }
 return parsed.data as unknown as SaveRecord | LegacyV4Record;
}
export function validateSave(raw:unknown):SaveRecord|undefined { return validateRecord(raw) as SaveRecord|undefined; }
/** Stage and arc exactly as the v3 → v4 content shipped them. */
const V4_START = { current:'expert', available:['opportunist','diplomat','expert'], growingEdge:'achiever', activeArcId:'expert-achiever' } as const;
function v3ToV4(old:z.infer<typeof envelopeV3>):unknown {
 return {...old,game:{...old.game,version:4,contentVersion:V4_CONTENT_VERSION,development:{current:V4_START.current,available:[...V4_START.available],growingEdge:V4_START.growingEdge,activeArcId:V4_START.activeArcId,evidence:[],transitions:[]}}};
}
/** Copies a fully valid v4 save; the old stage becomes an authored legacy start and the profile starts empty. */
function v4ToV5(old:LegacyV4Record):SaveRecord {
 const { development:od, ...rest } = old.game;
 const development:GameState['development']={developmentCurrent:od.current,currentOrigin:od.transitions.length?'promotion':'legacy-authored',initialRebaseCount:0,
  initialStage:{logic:V4_START.current,origin:'legacy-authored',day:0,available:[...V4_START.available]},available:[...od.available],
  ...(od.growingEdge?{transitionTarget:od.growingEdge}:{}),...(od.activeArcId?{activeArcId:od.activeArcId}:{}),evidence:od.evidence,
  ...(od.pendingPromotion?{pendingPromotion:od.pendingPromotion}:{}),transitions:od.transitions};
 return {schema:1,started:old.started,game:{...rest,version:GAME_STATE_VERSION,contentVersion:CONTENT_VERSION,development,heroDevelopmentProfile:createEmptyHeroDevelopmentProfile(content.profile)} as GameState};
}
/**
 * A v5 record written before the rebase work: `transition` is the old name of `promotion`, and the rebase counter did not exist.
 * Same version, same content: only these two fields are brought up to date.
 */
function normalizeDevelopmentV5(raw:unknown):unknown {
 const game=(raw as {game?:{development?:Record<string,unknown>}}|null)?.game;
 if(!game?.development)return raw;
 const d=game.development;
 if(d.currentOrigin!=='transition'&&d.initialRebaseCount!==undefined)return raw;
 return {...(raw as object),game:{...game,development:{...d,...(d.currentOrigin==='transition'?{currentOrigin:'promotion'}:{}),...(d.initialRebaseCount===undefined?{initialRebaseCount:0}:{})}}};
}
/**
 * Validate the complete known v3 or v4 contract before copying. Never replay historical choices and never derive
 * a profile from them: old decisions were not recorded as diagnostic cases.
 */
export function migrateSave(raw:unknown):SaveRecord|undefined {
 const version=(raw as {game?:{version?:unknown}}|null)?.game?.version;
 let v4:LegacyV4Record|undefined;
 if(version===3){const parsed=envelopeV3.safeParse(raw);if(!parsed.success)return undefined;if(!validateRecord(raw,3))return undefined;v4=validateRecord(v3ToV4(parsed.data),4) as LegacyV4Record|undefined;}
 else if(version===4)v4=validateRecord(raw,4) as LegacyV4Record|undefined;
 else if(version===GAME_STATE_VERSION)return validateSave(normalizeDevelopmentV5(raw));
 return v4?validateSave(v4ToV5(v4)):undefined;
}
function request<T>(r:IDBRequest<T>):Promise<T> { return new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);}); }
function complete(t:IDBTransaction):Promise<void> { return new Promise((resolve,reject)=>{t.oncomplete=()=>resolve();t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error??new Error('Запись прервана'));}); }
let database:Promise<IDBDatabase>|undefined;
function open():Promise<IDBDatabase> {
 if (!database) database = new Promise((resolve,reject)=>{
  const r=indexedDB.open('put-local-profile',1);
  r.onupgradeneeded=()=>r.result.createObjectStore('saves');
  r.onsuccess=()=>resolve(r.result);r.onerror=()=>{database=undefined;reject(r.error);};
 });
 return database;
}
export async function loadSave() {
 const db=await open();const t=db.transaction('saves','readonly');const done=complete(t);const s=t.objectStore('saves');
 const [raw,backup] = await Promise.all([request(s.get('active')),request(s.get('backup'))]);await done;
 const record=validateSave(raw)??migrateSave(raw), backupRecord=validateSave(backup)??migrateSave(backup);
 const migrations=[{key:'active',raw,record},{key:'backup',raw:backup,record:backupRecord}].filter(x=>x.record&&!validateSave(x.raw));
 if(migrations.length){
  const transaction=db.transaction('saves','readwrite');const committed=complete(transaction);const store=transaction.objectStore('saves');
  try { for(const m of migrations){store.put(m.raw,`legacy-v${(m.raw as {game:{version:number}}).game.version}-${m.key}-${crypto.randomUUID()}`);store.put(m.record,m.key);} }
  catch(error){transaction.abort();await committed.catch(()=>undefined);throw error;}
  await committed;
 }
 return {record,backup:backupRecord,damaged:raw!==undefined&&!record,raw};
}
export async function writeSave(record:SaveRecord) {
 if (!validateSave(record)) throw new Error('Структура текущего сохранения не прошла проверку');
 const db=await open();const t=db.transaction('saves','readwrite');const done=complete(t);const s=t.objectStore('saves');
 // Preserve only a known-good previous version. All state/history/night fields live in one envelope.
 const old=s.get('active');
 old.onsuccess=()=>{try{if(validateSave(old.result))s.put(old.result,'backup');s.put(record,'active');}catch{t.abort();}};
 await done;
}
export async function restoreBackup() {
 const loaded=await loadSave();if(!loaded.backup)throw new Error('Корректной копии пока нет');
 const db=await open();const t=db.transaction('saves','readwrite');const done=complete(t);const s=t.objectStore('saves');
 s.put(loaded.raw,`damaged-${crypto.randomUUID()}`);s.put(loaded.backup,'active');await done;
 return loaded.backup;
}
export async function preserveAndRestart() {
 const db=await open();const t=db.transaction('saves','readwrite');const done=complete(t);const s=t.objectStore('saves');const r=s.get('active');
 r.onsuccess=()=>{if(r.result!==undefined)s.put(r.result,`archived-${crypto.randomUUID()}`);s.delete('active');s.delete('backup');};await done;
}
// Web Locks is shared across same-origin tabs and releases automatically on close/crash.
export function acquireProfileLock(onAcquired:(release:()=>void)=>void, onBlocked:()=>void) {
 if (!navigator.locks) { onBlocked();return; }
 void navigator.locks.request('put-active-profile',{ifAvailable:true},async lock=>{
  if(!lock){onBlocked();return;}
  await new Promise<void>(resolve=>onAcquired(resolve));
 });
}

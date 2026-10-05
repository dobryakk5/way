import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Mechanical extraction of the v2.5 handoff package into structured JSON. No wording is interpreted here:
// ids, positions, vectors, roles and development events are copied; the world text is replaced later by a skin.
export const PACKAGE_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../PUT-v2.5-DEVELOPMENT-HANDOFF-integrated-v2');
export const SOURCE_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../content-src/v2.5');
export const PACKAGE_VERSION = 'v2.5-integrated-v2';
export const LOGICS = ['opportunist', 'diplomat', 'expert', 'achiever', 'individualist', 'strategist', 'alchemist', 'ironic'] as const;
export type Logic = typeof LOGICS[number];
export type Vector = Record<Logic, number>;
export const AXES = ['SELF', 'OTHERS', 'COMPLEXITY', 'TIME', 'PERSPECTIVE', 'UNCERTAINTY'] as const;
export type Rationale = Record<typeof AXES[number], string>;
const read = (name: string) => readFileSync(join(PACKAGE_DIR, name), 'utf8');

export interface SourceRef { doc: string; id: string; choiceId?: string; version: string }
export interface SourceChoice { id: string; position: number; text: string; vector: Vector; rationale: Rationale; lead?: string; slug?: string }
export interface SourceScene {
  id: string; title: string; ref: SourceRef; situationId: string; contextId: string; facets: string[]; developmentWeight: number;
  pressure: boolean; hasMotive: boolean; text: string; choices: SourceChoice[];
}
export interface SourceMotive { situationId: string; prompt: string; options: SourceChoice[] }
export interface SourceBehavior {
  id: string; title: string; ref: SourceRef; continuesSituationId: string; contextId: string; facets: string[]; text: string; choices: SourceChoice[];
}
export interface SourceProbe {
  id: string; title: string; ref: SourceRef; distinguishes: [Logic, Logic]; contextId: string; facets: string[]; developmentWeight: number;
  text: string; choices: SourceChoice[];
}
export interface SourceDevChoice { id: string; position: number; text: string; event: string | null; note: string }
export interface SourceDevCard {
  id: string; title: string; ref: SourceRef; arcId: string; from: Logic; to: Logic; fn: string; beat: string; retry: boolean; facet: string; contextId: string;
  pressure: boolean; requires: string; cast: string[]; text: string; choices: SourceDevChoice[];
}
export interface ParsedPackage {
  neutral: SourceScene[]; motives: SourceMotive[]; behaviors: SourceBehavior[]; probes: SourceProbe[]; development: SourceDevCard[];
}

const ref = (doc: string, id: string, choiceId?: string): SourceRef => ({ doc, id, ...(choiceId ? { choiceId } : {}), version: PACKAGE_VERSION });
function fail(message: string): never { throw new Error(`parse-package: ${message}`); }

function parseObjectVector(text: string, where: string): Vector {
  const m = /\{([^}]*)\}/.exec(text); if (!m) fail(`no vector in ${where}`);
  const out = {} as Vector;
  for (const part of m[1]!.split(',')) {
    const [k, v] = part.split(':').map(s => s.trim());
    if (!k || v === undefined) fail(`bad vector part "${part}" in ${where}`);
    if (!LOGICS.includes(k as Logic)) fail(`unknown logic ${k} in ${where}`);
    out[k as Logic] = Number(v);
  }
  for (const l of LOGICS) if (typeof out[l] !== 'number' || Number.isNaN(out[l])) fail(`missing ${l} in ${where}`);
  return out;
}
function parseArrayVector(text: string, where: string): Vector {
  const m = /\[([^\]]*)\]/.exec(text); if (!m) fail(`no array vector in ${where}`);
  const nums = m[1]!.split(',').map(s => Number(s.trim()));
  if (nums.length !== 8 || nums.some(Number.isNaN)) fail(`bad array vector in ${where}`);
  return Object.fromEntries(LOGICS.map((l, i) => [l, nums[i]!])) as Vector;
}
function parseRationaleBullets(block: string, where: string): Rationale {
  const out = {} as Rationale;
  for (const axis of AXES) {
    const m = new RegExp(`^- ${axis} — (.+)$`, 'm').exec(block);
    if (!m) fail(`rationale ${axis} missing in ${where}`);
    out[axis] = m[1]!.trim();
  }
  return out;
}
function parseMeta(block: string): Record<string, string> {
  const m = /```text\n([\s\S]*?)\n```/.exec(block); if (!m) return {};
  const out: Record<string, string> = {};
  for (const line of m[1]!.split('\n')) { const i = line.indexOf(':'); if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }
  return out;
}
const list = (v: string | undefined) => (v ?? '').replace(/^\[|\]$/g, '').split(',').map(s => s.trim()).filter(Boolean);
/** Narrative of a scene: the text between the meta code block and the first "###" heading. */
function narrative(block: string): string {
  const afterMeta = block.replace(/```text\n[\s\S]*?\n```/, '');
  const head = afterMeta.split(/\n### /)[0]!;
  return head.split('\n').slice(1).join('\n').replace(/^\*\*Prompt:\*\*\s*/m, '').trim();
}
function parseChoices(block: string, where: string, idPattern: RegExp): SourceChoice[] {
  const parts = block.split(/\n### /).slice(1);
  return parts.map((part, position) => {
    const head = part.split('\n')[0]!;
    const m = idPattern.exec(head); if (!m) fail(`bad choice heading "${head}" in ${where}`);
    const lead = /\*\*Lead \(не игроку\):\*\*\s*(.+?)\s*$/m.exec(part)?.[1];
    const vectorLine = /\*\*LogicVector:\*\*\s*`([^`]+)`/.exec(part)?.[1]; if (!vectorLine) fail(`no LogicVector in ${where}/${m[1]}`);
    const rationale = part.split('**Rationale:**')[1]; if (!rationale) fail(`no Rationale in ${where}/${m[1]}`);
    return { id: m[1]!, position, text: m[2]!.trim(), vector: parseObjectVector(vectorLine, `${where}/${m[1]}`),
      rationale: parseRationaleBullets(rationale, `${where}/${m[1]}`), ...(lead ? { lead } : {}) };
  });
}

function parseNeutral(): Pick<ParsedPackage, 'neutral' | 'motives' | 'behaviors'> {
  const doc = 'NEUTRAL-DIAGNOSTIC-CONTENT-v1-final.md';
  const full = read(doc);
  const i7 = full.indexOf('\n# 7. Опциональные motive prompts'), i8 = full.indexOf('\n# 8. Behavior continuations'), i9 = full.indexOf('\n# 9. Production-правила');
  if (i7 < 0 || i8 < 0 || i9 < 0) fail('neutral sections not found');
  const mainText = full.slice(0, i7), motiveText = full.slice(i7, i8), behaviorText = full.slice(i8, i9);
  const letter = /^([A-D])\. (.+)$/;
  const neutral: SourceScene[] = [];
  for (const block of mainText.split(/\n## (?=neutral\.[a-z]+\.\d\d )/).slice(1)) {
    const head = /^(neutral\.[a-z]+\.\d\d) — (.+)$/m.exec(block.split('\n')[0]!); if (!head) fail('bad neutral heading');
    const meta = parseMeta(block);
    neutral.push({ id: head[1]!, title: head[2]!.trim(), ref: ref(doc, head[1]!), situationId: meta.situationId ?? head[1]!, contextId: meta.contextId ?? '',
      facets: list(meta.facets), developmentWeight: Number(meta.developmentWeight), pressure: meta.pressure === 'true', hasMotive: meta.diagnosticMotive === 'yes',
      text: narrative(block), choices: parseChoices(block, head[1]!, letter) });
  }
  const motives: SourceMotive[] = [];
  for (const block of motiveText.split(/\n## (?=neutral\.)/).slice(1)) {
    const id = block.split('\n')[0]!.trim();
    const prompt = /\*\*Prompt:\*\*\s*(.+)/.exec(block)?.[1]; if (!prompt) fail(`no prompt for ${id}`);
    motives.push({ situationId: id, prompt: prompt.trim(), options: parseChoices(block, `${id}/motive`, /^(M\d)\. (.+)$/) });
  }
  const behaviors: SourceBehavior[] = [];
  for (const block of behaviorText.split(/\n## (?=neutral\.behavior\.)/).slice(1)) {
    const head = /^(neutral\.behavior\.[a-z]+\.\d\d) — (.+)$/m.exec(block.split('\n')[0]!); if (!head) fail('bad behavior heading');
    const meta = parseMeta(block);
    behaviors.push({ id: head[1]!, title: head[2]!.trim(), ref: ref(doc, head[1]!), continuesSituationId: meta.continuesSituationId ?? '',
      contextId: meta.contextId ?? '', facets: list(meta.facets), text: narrative(block), choices: parseChoices(block, head[1]!, letter) });
  }
  return { neutral, motives, behaviors };
}

function parseProbes(): SourceProbe[] {
  const doc = 'DIAGNOSTIC-PROBES-v1-final.md';
  const full = read(doc);
  const end = full.indexOf('\n# 12. Position balance v1'); if (end < 0) fail('probe end not found');
  const probes: SourceProbe[] = [];
  for (const block of full.slice(0, end).split(/\n## (?=`probe\.)/).slice(1)) {
    const head = /^`(probe\.[a-z]+\.\d\d)` — (.+)$/m.exec(block.split('\n')[0]!); if (!head) fail('bad probe heading');
    const id = head[1]!; const meta = parseMeta(block);
    const dist = list(meta.distinguishes) as Logic[]; if (dist.length !== 2 || dist.some(l => !LOGICS.includes(l))) fail(`bad distinguishes in ${id}`);
    const text = /\*\*Ситуация\.\*\*\s*([\s\S]*?)\n\n### Варианты/.exec(block)?.[1]?.trim(); if (!text) fail(`no situation text in ${id}`);
    const rows = [...block.matchAll(/^\| \*\*([ABC])\*\* `([^`]+)` \| (.+?) \| `(\[[^`]*\])` \| ([^|]+) \|$/gm)];
    if (rows.length !== 3) fail(`${id}: expected 3 choice rows, got ${rows.length}`);
    const rat = new Map<string, string[]>();
    for (const m of block.matchAll(/^\| \*\*([ABC])\*\* \| (.+) \|$/gm)) {
      const cells = m[2]!.split(' | ').map(s => s.trim());
      if (cells.length === 6) rat.set(m[1]!, cells);
    }
    const choices: SourceChoice[] = rows.map((m, position) => {
      const cells = rat.get(m[1]!); if (!cells) fail(`${id}/${m[1]}: rationale row missing`);
      return { id: m[1]!, slug: m[2]!, position, text: m[3]!.trim(), vector: parseArrayVector(m[4]!, `${id}/${m[1]}`),
        rationale: Object.fromEntries(AXES.map((a, i) => [a, cells[i]!])) as Rationale, lead: m[5]!.trim() };
    });
    probes.push({ id, title: head[2]!.trim(), ref: ref(doc, id), distinguishes: [dist[0]!, dist[1]!], contextId: meta.contextId ?? '', facets: list(meta.facets),
      developmentWeight: Number(meta.developmentWeight), text, choices });
  }
  return probes;
}

const ARC_ORDER: Record<string, [Logic, Logic]> = {
  'opportunist-diplomat': ['opportunist', 'diplomat'], 'diplomat-expert': ['diplomat', 'expert'], 'achiever-individualist': ['achiever', 'individualist'],
  'individualist-strategist': ['individualist', 'strategist'], 'strategist-alchemist': ['strategist', 'alchemist'], 'alchemist-ironic': ['alchemist', 'ironic']
};
function parseDevelopment(): SourceDevCard[] {
  const doc = 'DEVELOPMENT-PRODUCTION-CARDS-v1-final.md';
  const full = read(doc);
  const end = full.indexOf('\n# 7. `expert-achiever`'); if (end < 0) fail('dev end not found');
  const cards: SourceDevCard[] = [];
  for (const arcBlock of full.slice(0, end).split(/\n# \d+\. ARC /).slice(1)) {
    const arcId = /^`([^`]+)`/.exec(arcBlock)?.[1]; if (!arcId || !ARC_ORDER[arcId]) fail(`unknown arc heading: ${arcBlock.slice(0, 40)}`);
    const [from, to] = ARC_ORDER[arcId]!;
    for (const block of arcBlock.split(/\n## (?=`dev\.)/).slice(1)) {
      const head = /^`(dev\.[^`]+)` — (.+)$/m.exec(block.split('\n')[0]!); if (!head) fail('bad dev heading');
      const id = head[1]!;
      const field = (name: string) => new RegExp(`^- ${name}: (.+)$`, 'm').exec(block)?.[1]?.trim();
      const tick = (v: string | undefined) => (v ?? '').replace(/`/g, '');
      const fn = tick(field('function')); if (!fn) fail(`${id}: no function`);
      const text = /\*\*Текст\*\*\s*\n\n([\s\S]*?)\n\n\*\*Варианты\*\*/.exec(block)?.[1]?.trim(); if (!text) fail(`${id}: no text`);
      const variants = block.split('**Варианты**')[1]!;
      const items = variants.split(/\n(?=\d\. `)/).filter(s => /^\d\. `/.test(s));
      const choices: SourceDevChoice[] = items.map((it, position) => {
        const h = /^(\d)\. `([^`]+)` — \*\*(.+)\*\*\s*$/m.exec(it.split('\n')[0]!); if (!h) fail(`${id}: bad choice line "${it.split('\n')[0]}"`);
        const event = /developmentEvent: (\w+)/.exec(it)?.[1] ?? null;
        return { id: h[2]!, position, text: h[3]!.trim(), event, note: it.split('\n').slice(1).join('\n').trim() };
      });
      const retry = fn.startsWith('retry');
      cards.push({ id, title: head[2]!.trim(), ref: ref(doc, id), arcId, from, to, fn, beat: fn === 'retry' ? 'pressure' : fn.replace(/^retry-/, ''), retry,
        facet: tick(field('facet')), contextId: tick(field('contextId')), pressure: tick(field('pressure')) === 'true', requires: field('requires') ?? '',
        cast: tick(field('cast')).split(',').map(s => s.trim()).filter(Boolean), text, choices });
    }
  }
  return cards;
}

export function parsePackage(): ParsedPackage {
  return { ...parseNeutral(), probes: parseProbes(), development: parseDevelopment() };
}

/** The committed extraction (content-src/v2.5/*.json) is the structural source of truth after the one-time parse: editors fix vectors here. */
export function loadSourceJson(): ParsedPackage {
  const readJson = <T>(name: string) => JSON.parse(readFileSync(join(SOURCE_DIR, name), 'utf8')) as T;
  return { neutral: readJson('neutral.json'), motives: readJson('motives.json'), behaviors: readJson('behaviors.json'), probes: readJson('probes.json'), development: readJson('development.json') };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const p = parsePackage();
  mkdirSync(SOURCE_DIR, { recursive: true });
  const write = (name: string, value: unknown) => writeFileSync(join(SOURCE_DIR, name), JSON.stringify(value, null, 2) + '\n');
  write('neutral.json', p.neutral); write('motives.json', p.motives); write('behaviors.json', p.behaviors);
  write('probes.json', p.probes); write('development.json', p.development);
  console.log(`parsed: neutral ${p.neutral.length}, motives ${p.motives.length}, behaviors ${p.behaviors.length}, probes ${p.probes.length}, development ${p.development.length}`);
}

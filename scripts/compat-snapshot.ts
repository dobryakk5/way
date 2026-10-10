// APPEND-ONLY CONTENT (REQs/FOCUSED-ENCOUNTERS-v1.1 review, 2026-10-08). What a player may already have seen or saved, and what the server catalog already holds, must never change:
//  - the text of a scene, of a text variant and the label of a choice are server presentations (append-only table, `ON CONFLICT DO NOTHING`);
//  - a presented choice is frozen inside a save and compared with the content on load (`save.ts`), effects included.
// So existing presentations are never edited: a new wording is a NEW text variant, a new choice (or new effects) is a NEW choice id in a `choiceVariants` entry.
// This script keeps a snapshot of everything published (hashes only) and refuses to let it change; new entries may be added.
//   npm run compat:snapshot                -> verify the current content against the snapshot
//   npm run compat:snapshot -- --write     -> after a release is published: ADD the new entries (never changes or removes existing ones)
//   npm run compat:snapshot -- --init      -> (re)create the snapshot from the CURRENT content (only on the content that is published, e.g. a worktree of the release)
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { content } from '../src/content';
import { allChoices } from '../src/engine';
import type { Choice, GameContent } from '../src/engine';

export const SNAPSHOT_FILE = new URL('../reports/compat-presented-baseline.json', import.meta.url);
const sha = (s: string) => createHash('sha1').update(s).digest('hex').slice(0, 16);
function canonical(v: unknown): string {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.entries(v).filter(([, x]) => x !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => JSON.stringify(k) + ':' + canonical(x)).join(',') + '}';
  return JSON.stringify(v);
}
const withoutImpact = ({ impact: _impact, ...rest }: Choice) => rest;

/** key -> short hash. `scene:` texts and `choice:` labels are what the server catalog stores; `presented:` is the whole choice object a save freezes (impact metadata is not part of it). */
export function presentedSnapshot(c: GameContent = content): Record<string, string> {
  const out: Record<string, string> = {};
  for (const card of c.cards) {
    out[`scene:${card.id}`] = sha(card.text);
    for (const v of card.textVariants ?? []) out[`scene:${card.id}#${v.id}`] = sha(v.text);
    for (const ch of allChoices(card)) { out[`choice:${card.id}/${ch.id}`] = sha(ch.label); out[`presented:${card.id}/${ch.id}`] = sha(canonical(withoutImpact(ch))); }
  }
  return out;
}
/** Differences of `current` against the published snapshot: changed and removed entries (additions are fine). */
export function snapshotViolations(current: Record<string, string>, published: Record<string, string>): { changed: string[]; removed: string[] } {
  const changed: string[] = [], removed: string[] = [];
  for (const [k, h] of Object.entries(published)) { if (!(k in current)) removed.push(k); else if (current[k] !== h) changed.push(k); }
  return { changed, removed };
}
if (process.argv[1]?.endsWith('compat-snapshot.ts')) {
  const now = presentedSnapshot();
  const sorted = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
  if (process.argv.includes('--init')) { writeFileSync(SNAPSHOT_FILE, JSON.stringify(sorted(now), null, 0).replace(/,"/g, ',\n"') + '\n'); console.log(`snapshot created: ${Object.keys(now).length} entries`); }
  else {
    if (!existsSync(SNAPSHOT_FILE)) throw new Error('no snapshot: run with --init on the published content');
    const published = JSON.parse(readFileSync(SNAPSHOT_FILE, 'utf8')) as Record<string, string>;
    const { changed, removed } = snapshotViolations(now, published);
    const added = Object.keys(now).filter(k => !(k in published));
    console.log(`published ${Object.keys(published).length}, current ${Object.keys(now).length}, added ${added.length}, changed ${changed.length}, removed ${removed.length}`);
    for (const k of changed) console.error('CHANGED  ' + k);
    for (const k of removed) console.error('REMOVED  ' + k);
    if (changed.length || removed.length) process.exitCode = 1;
    else if (process.argv.includes('--write')) { writeFileSync(SNAPSHOT_FILE, JSON.stringify(sorted({ ...published, ...now }), null, 0).replace(/,"/g, ',\n"') + '\n'); console.log('snapshot extended with the new entries'); }
  }
}

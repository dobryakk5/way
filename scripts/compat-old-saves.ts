// Old saves under new content. Two halves:
//   generate <dir>   (run in a checkout of the PUBLISHED build): plays several runs and writes the save record of many moments, including every scene on the screen;
//   verify <dir>     (run in the CURRENT build): every record must load (validateSave/migrateSave) and the run must be playable to the end (120 decisions), the final state valid.
// scripts/compat-old-saves.sh does both with a temporary worktree of the published commit.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { content } from '../src/content';
import { drawCard, persistDraw } from '../src/engine';
import type { GameState } from '../src/engine';
import { migrateSave, validateSave } from '../src/persistence/save';
import { play, POLICIES } from './play';

const [, , mode, dir] = process.argv;
if (!dir) throw new Error('usage: compat-old-saves.ts generate|verify <dir>');
const PER_RUN = Number(process.env.COMPAT_EVERY ?? 6);
if (mode === 'generate') {
  mkdirSync(dir, { recursive: true });
  let n = 0;
  for (const policy of POLICIES.filter((_, i) => i % 2 === 0 || i === 6)) for (let seed = 1; seed <= Number(process.env.COMPAT_SEEDS ?? 4); seed++) {
    let step = 0;
    play(seed, { policy, goal: (['order', 'workshop', 'alexey'] as const)[seed % 3]!, beforeStep: s => {
      if (++step % PER_RUN === 0 || s.current) {
        const game: GameState = s.phase === 'slot' && !s.current ? persistDraw(s, drawCard(s, content)!, content) : s;
        if (step % PER_RUN === 0 || s.current) writeFileSync(join(dir, `${policy}-${seed}-${String(n++).padStart(4, '0')}.json`), JSON.stringify({ schema: 1, started: true, game }));
      }
      return s;
    } });
  }
  console.log(`generated ${n} saves with content ${content.cards.length} cards`);
} else {
  const files = readdirSync(dir).filter(f => f.endsWith('.json')).sort();
  const failed: string[] = [], inFlight: Record<string, number> = {}; let valid = 0, completed = 0;
  for (const f of files) {
    const raw = JSON.parse(readFileSync(join(dir, f), 'utf8')) as { game: GameState };
    const record = validateSave(raw) ?? migrateSave(raw);
    if (!record) { failed.push(`${f}: does not load (current ${raw.game.current?.cardId ?? '-'}, phase ${raw.game.phase}, day ${raw.game.day})`); continue; }
    valid++;
    if (raw.game.current) inFlight[raw.game.current.cardId] = (inFlight[raw.game.current.cardId] ?? 0) + 1;
    try {
      const { state } = play(record.game.seed, { resume: record.game, policy: 'mixed' });
      if (state.history.length !== 120) throw new Error(`ended with ${state.history.length} decisions`);
      if (!validateSave({ schema: 1, started: true, game: state })) throw new Error('the finished run does not validate');
      completed++;
    } catch (e) { failed.push(`${f}: cannot be continued: ${(e as Error).message}`); }
  }
  console.log(JSON.stringify({ saves: files.length, load: valid, continuedToTheEnd: completed, scenesOnScreen: Object.keys(inFlight).length, onScreenByCard: Object.fromEntries(Object.entries(inFlight).sort((a, b) => b[1] - a[1]).slice(0, 8)), failures: failed.length }, null, 1));
  for (const x of failed.slice(0, 20)) console.error(x);
  if (failed.length) process.exitCode = 1;
}

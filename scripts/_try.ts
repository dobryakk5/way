import { content } from '../src/content';
import { validateContent } from './check-content';
import { buildRuntime, placeholderSkin } from './v25/runtime';
import { loadSourceJson } from './v25/parse-package';
import { checkParity } from './v25/parity';
const src = loadSourceJson();
const rt = buildRuntime(src, placeholderSkin(src));
const full = { ...content, cards: [...content.cards, ...rt.neutral, ...rt.probes, ...rt.development], traces: [...content.traces, ...rt.traces],
  development: { ...content.development, arcs: [...content.development.arcs, ...rt.arcs] } };
console.log('parity', checkParity(src, full));
const errs = validateContent(full as never);
console.log(errs.length); console.log(errs.slice(0, 40).map(e => e.slice(0, 220)).join('\n'));

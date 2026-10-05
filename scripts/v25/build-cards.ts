import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadSourceJson, SOURCE_DIR } from './parse-package';
import { buildRuntime, type Section, type Skin } from './runtime';

// content-src/v2.5 (structure) × content-src/v2.5/skin (world text) → src/content/data. Run `npm run v25:build`, then `npm run check`.
const DATA = join(SOURCE_DIR, '../../src/content/data');
const SKIN_DIR = join(SOURCE_DIR, 'skin');
const readSkin = <T>(name: string): T | undefined => existsSync(join(SKIN_DIR, name)) ? JSON.parse(readFileSync(join(SKIN_DIR, name), 'utf8')) as T : undefined;
const write = (name: string, value: unknown) => writeFileSync(join(DATA, name), JSON.stringify(value, null, 2) + '\n');

export function loadSkin(): { skin: Skin; sections: Section[] } {
  const neutral = readSkin<Skin['neutral']>('neutral.json'), behaviors = readSkin<Skin['behaviors']>('behaviors.json'), probes = readSkin<Skin['probes']>('probes.json');
  const development = readSkin<Skin['development']>('development.json'), arcs = readSkin<Skin['arcs']>('arcs.json');
  const sections: Section[] = [];
  if (neutral && behaviors) sections.push('neutral');
  if (probes) sections.push('probes');
  if (development && arcs) sections.push('development');
  return { skin: { neutral: neutral ?? {}, behaviors: behaviors ?? {}, probes: probes ?? {}, development: development ?? {}, arcs: arcs ?? {} }, sections };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { skin, sections } = loadSkin();
  if (!sections.length) { console.error('No skin files in content-src/v2.5/skin'); process.exit(1); }
  const rt = buildRuntime(loadSourceJson(), skin, 30, sections);
  if (sections.includes('neutral')) write('cards.neutral.json', rt.neutral);
  if (sections.includes('probes')) write('cards.probe.json', rt.probes);
  if (sections.includes('development')) { write('cards.arcs.json', rt.development); write('development.arcs.json', rt.arcs); }
  write('traces.v25.json', rt.traces);
  console.log(`built ${sections.join(', ')}: neutral ${rt.neutral.length}, probes ${rt.probes.length}, development ${rt.development.length}, traces ${rt.traces.length}, arcs ${rt.arcs.length}`);
}

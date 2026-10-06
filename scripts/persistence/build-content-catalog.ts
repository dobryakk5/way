import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { content } from '../../src/content';
import { allChoices } from '../../src/engine/variants';
import type { Choice } from '../../src/engine/types';
import {
  choiceId,
  choiceKey,
  choicePresentationId,
  choicePresentationKey,
  sceneId,
  sceneKey,
  scenePresentationId,
  scenePresentationKey
} from '../../src/content/persistenceIds';

const TAXONOMY_VERSION = 'development-centers-v1';
const EVIDENCE_MODEL_VERSION = 'evidence-v1';
const CALCULATION_VERSION = 'development-v1';

type Evidence = Record<string, number>;

interface CatalogChoice {
  id: number;
  sceneId: number;
  choiceKey: string;
  presentation: {
    id: number;
    presentationKey: string;
    revision: number;
    text: string;
  };
  evidence?: Evidence;
}

interface CatalogScene {
  id: number;
  sceneKey: string;
  presentations: {
    id: number;
    presentationKey: string;
    revision: number;
    text: string;
  }[];
  choices: CatalogChoice[];
}

interface Catalog {
  taxonomyVersion: string;
  evidenceModelVersion: string;
  calculationVersion: string;
  scenes: CatalogScene[];
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => JSON.stringify(key) + ':' + canonical(item))
      .join(',') + '}';
  }
  return JSON.stringify(value);
}

function evidenceOf(choice: Choice): Evidence | undefined {
  return choice.diagnosticAction?.vector ?? choice.diagnosticBehavior?.signal.vector;
}

function assertNoCollision(
  map: Map<number, string>,
  id: number,
  key: string
): void {
  const previous = map.get(id);
  if (previous && previous !== key) {
    throw new Error('Persistence id collision ' + id + ': ' + previous + ' vs ' + key);
  }
  map.set(id, key);
}

export function buildPersistenceCatalog(): Catalog {
  const ids = new Map<number, string>();
  const scenes: CatalogScene[] = [];

  for (const card of content.cards) {
    const sid = sceneId(card.id);
    assertNoCollision(ids, sid, 'scene:' + sceneKey(card.id));

    const presentations = [
      {
        id: scenePresentationId(card.id),
        presentationKey: scenePresentationKey(),
        revision: 1,
        text: card.text
      },
      ...(card.textVariants ?? []).map(variant => ({
        id: scenePresentationId(card.id, variant.id),
        presentationKey: scenePresentationKey(variant.id),
        revision: 1,
        text: variant.text
      }))
    ];

    for (const presentation of presentations) {
      assertNoCollision(
        ids,
        presentation.id,
        'scene-presentation:' + card.id + ':' + presentation.presentationKey
      );
    }

    const byAuthorChoiceId = new Map<string, CatalogChoice>();
    for (const choice of allChoices(card)) {
      const numericChoiceId = choiceId(card.id, choice.id);
      const numericPresentationId = choicePresentationId(card.id, choice.id);
      const key = choiceKey(card.id, choice.id);
      const evidence = evidenceOf(choice);
      const candidate: CatalogChoice = {
        id: numericChoiceId,
        sceneId: sid,
        choiceKey: key,
        presentation: {
          id: numericPresentationId,
          presentationKey: choicePresentationKey(),
          revision: 1,
          text: choice.label
        },
        ...(evidence ? { evidence } : {})
      };

      const existing = byAuthorChoiceId.get(choice.id);
      if (existing) {
        if (existing.presentation.text !== candidate.presentation.text ||
            canonical(existing.evidence) !== canonical(candidate.evidence)) {
          throw new Error(
            'Choice ' + key + ' appears with different label/evidence. ' +
            'Give the semantic variants different choice ids or add explicit presentation keys.'
          );
        }
        continue;
      }

      assertNoCollision(ids, numericChoiceId, 'choice:' + key);
      assertNoCollision(ids, numericPresentationId, 'choice-presentation:' + key);
      byAuthorChoiceId.set(choice.id, candidate);
    }

    scenes.push({
      id: sid,
      sceneKey: sceneKey(card.id),
      presentations,
      choices: [...byAuthorChoiceId.values()]
    });
  }

  return {
    taxonomyVersion: TAXONOMY_VERSION,
    evidenceModelVersion: EVIDENCE_MODEL_VERSION,
    calculationVersion: CALCULATION_VERSION,
    scenes
  };
}

function sqlString(value: string): string {
  return "'" + value.replaceAll("'", "''") + "'";
}

function jsonb(value: unknown): string {
  return sqlString(JSON.stringify(value)) + '::jsonb';
}

export function catalogSql(catalog: Catalog): string {
  const lines: string[] = [
    'BEGIN;',
    '',
    'INSERT INTO development_taxonomies(version) VALUES (' + sqlString(catalog.taxonomyVersion) + ') ON CONFLICT DO NOTHING;',
    'INSERT INTO evidence_model_versions(version, taxonomy_version) VALUES (' +
      sqlString(catalog.evidenceModelVersion) + ', ' + sqlString(catalog.taxonomyVersion) + ') ON CONFLICT DO NOTHING;',
    'INSERT INTO calculation_versions(version) VALUES (' + sqlString(catalog.calculationVersion) + ') ON CONFLICT DO NOTHING;',
    ''
  ];

  for (const scene of catalog.scenes) {
    lines.push(
      'INSERT INTO game_scenes(id, scene_key) OVERRIDING SYSTEM VALUE VALUES (' +
      scene.id + ', ' + sqlString(scene.sceneKey) + ') ON CONFLICT DO NOTHING;'
    );
    for (const presentation of scene.presentations) {
      lines.push(
        'INSERT INTO scene_presentations(id, scene_id, presentation_key, revision, text) VALUES (' +
        presentation.id + ', ' + scene.id + ', ' + sqlString(presentation.presentationKey) + ', ' +
        presentation.revision + ', ' + sqlString(presentation.text) + ') ON CONFLICT DO NOTHING;'
      );
    }
    for (const choice of scene.choices) {
      lines.push(
        'INSERT INTO game_choices(id, scene_id, choice_key) OVERRIDING SYSTEM VALUE VALUES (' +
        choice.id + ', ' + scene.id + ', ' + sqlString(choice.choiceKey) + ') ON CONFLICT DO NOTHING;'
      );
      lines.push(
        'INSERT INTO choice_presentations(id, choice_id, presentation_key, revision, style, text) OVERRIDING SYSTEM VALUE VALUES (' +
        choice.presentation.id + ', ' + choice.id + ', ' + sqlString(choice.presentation.presentationKey) + ', ' +
        choice.presentation.revision + ", 'normal', " + sqlString(choice.presentation.text) + ') ON CONFLICT DO NOTHING;'
      );
      if (choice.evidence) {
        lines.push(
          'INSERT INTO choice_evidence(choice_id, evidence_model_version, taxonomy_version, evidence) VALUES (' +
          choice.id + ', ' + sqlString(catalog.evidenceModelVersion) + ', ' +
          sqlString(catalog.taxonomyVersion) + ', ' + jsonb(choice.evidence) + ') ON CONFLICT DO NOTHING;'
        );
      }
    }
    lines.push('');
  }

  lines.push('COMMIT;', '');
  return lines.join('\n');
}

function write(path: string, body: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body);
}

const catalog = buildPersistenceCatalog();
const choiceCount = catalog.scenes.reduce((sum, scene) => sum + scene.choices.length, 0);
const evidenceCount = catalog.scenes.reduce(
  (sum, scene) => sum + scene.choices.filter(choice => choice.evidence).length,
  0
);

if (process.argv.includes('--write')) {
  const jsonPath = resolve('server/generated/content-catalog.v1.json');
  const sqlPath = resolve('server/generated/content-catalog.v1.sql');
  write(jsonPath, JSON.stringify(catalog, null, 2) + '\n');
  write(sqlPath, catalogSql(catalog));
  console.log('Wrote ' + jsonPath);
  console.log('Wrote ' + sqlPath);
}

console.log(JSON.stringify({
  scenes: catalog.scenes.length,
  choices: choiceCount,
  evidence: evidenceCount,
  taxonomyVersion: catalog.taxonomyVersion,
  evidenceModelVersion: catalog.evidenceModelVersion,
  calculationVersion: catalog.calculationVersion
}, null, 2));

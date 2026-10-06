import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { content } from '../../src/content';
import { allChoices } from '../../src/engine/variants';
import type { Card, Choice } from '../../src/engine/types';
import {
  choiceId,
  choiceKey,
  choicePresentationId,
  choicePresentationKey,
  motiveOptionId,
  motiveOptionKey,
  motivePromptId,
  motivePromptKey,
  sceneId,
  sceneKey,
  scenePresentationId,
  scenePresentationKey
} from '../../src/content/persistenceIds';
import {
  PERSISTENCE_CALCULATION_VERSION,
  PERSISTENCE_EVIDENCE_MODEL_VERSION,
  PERSISTENCE_TAXONOMY_VERSION
} from '../../src/persistence/versions';

type Evidence = Record<string, unknown>;

interface CatalogMotiveOption {
  id: number;
  optionKey: string;
  evidence: Evidence;
}

interface CatalogMotivePrompt {
  id: number;
  promptKey: string;
  options: CatalogMotiveOption[];
}

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
  motive?: CatalogMotivePrompt;
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

function evidenceOf(card: Card, choice: Choice): Evidence | undefined {
  if (choice.diagnosticAction) {
    if (!card.diagnostic) {
      throw new Error('Diagnostic action without card diagnostic metadata: ' + card.id + '/' + choice.id);
    }
    return {
      source: 'action',
      situationId: card.diagnostic.situationId,
      contextId: card.diagnostic.contextId,
      facets: card.diagnostic.facets,
      developmentWeight: card.diagnostic.developmentWeight,
      pressure: card.diagnostic.pressure ?? false,
      vector: choice.diagnosticAction.vector,
      scoringVersion: choice.diagnosticAction.scoringVersion,
      rubricVersion: choice.diagnosticAction.rubricVersion
    };
  }
  if (choice.diagnosticBehavior) {
    return {
      source: 'behavior',
      continuesSituationId: choice.diagnosticBehavior.continuesSituationId,
      vector: choice.diagnosticBehavior.signal.vector,
      scoringVersion: choice.diagnosticBehavior.signal.scoringVersion,
      rubricVersion: choice.diagnosticBehavior.signal.rubricVersion
    };
  }
  return undefined;
}

function motiveOf(card: Card, choice: Choice): CatalogMotivePrompt | undefined {
  const motive = choice.diagnosticMotive;
  if (!motive) return undefined;
  const promptId = motivePromptId(card.id, choice.id, motive.promptId);
  return {
    id: promptId,
    promptKey: motivePromptKey(card.id, choice.id, motive.promptId),
    options: motive.options.map(option => ({
      id: motiveOptionId(card.id, choice.id, motive.promptId, option.id),
      optionKey: motiveOptionKey(card.id, choice.id, motive.promptId, option.id),
      evidence: {
        source: 'motive',
        vector: option.signal.vector,
        scoringVersion: option.signal.scoringVersion,
        rubricVersion: option.signal.rubricVersion
      }
    }))
  };
}

function assertNoCollision(map: Map<number, string>, id: number, key: string): void {
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
      const evidence = evidenceOf(card, choice);
      const motive = motiveOf(card, choice);
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
        ...(evidence ? { evidence } : {}),
        ...(motive ? { motive } : {})
      };

      const existing = byAuthorChoiceId.get(choice.id);
      if (existing) {
        if (
          existing.presentation.text !== candidate.presentation.text ||
          canonical(existing.evidence) !== canonical(candidate.evidence) ||
          canonical(existing.motive) !== canonical(candidate.motive)
        ) {
          throw new Error(
            'Choice ' + key + ' appears with different label/evidence/motive. ' +
            'Give semantic variants different choice ids or explicit presentation keys.'
          );
        }
        continue;
      }

      assertNoCollision(ids, numericChoiceId, 'choice:' + key);
      assertNoCollision(ids, numericPresentationId, 'choice-presentation:' + key);
      if (motive) {
        assertNoCollision(ids, motive.id, 'motive-prompt:' + motive.promptKey);
        for (const option of motive.options) {
          assertNoCollision(ids, option.id, 'motive-option:' + option.optionKey);
        }
      }
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
    taxonomyVersion: PERSISTENCE_TAXONOMY_VERSION,
    evidenceModelVersion: PERSISTENCE_EVIDENCE_MODEL_VERSION,
    calculationVersion: PERSISTENCE_CALCULATION_VERSION,
    scenes
  };
}

function sqlString(value: string): string {
  return "'" + value.replaceAll("'", "''") + "'";
}

function jsonb(value: unknown): string {
  return sqlString(JSON.stringify(value)) + '::jsonb';
}

function assertSql(condition: string, label: string): string {
  return 'SELECT pg_temp.assert_catalog(' + condition + ', ' + sqlString(label) + ');';
}

export function catalogSql(catalog: Catalog): string {
  const lines: string[] = [
    'BEGIN;',
    '',
    'CREATE OR REPLACE FUNCTION pg_temp.assert_catalog(ok boolean, label text)',
    'RETURNS void LANGUAGE plpgsql AS $$',
    'BEGIN',
    "  IF NOT ok THEN RAISE EXCEPTION 'CATALOG_DRIFT:%', label; END IF;",
    'END;',
    '$$;',
    '',
    'INSERT INTO development_taxonomies(version) VALUES (' + sqlString(catalog.taxonomyVersion) + ') ON CONFLICT DO NOTHING;',
    assertSql(
      'EXISTS (SELECT 1 FROM development_taxonomies WHERE version = ' + sqlString(catalog.taxonomyVersion) + ')',
      'taxonomy:' + catalog.taxonomyVersion
    ),
    'INSERT INTO evidence_model_versions(version, taxonomy_version) VALUES (' +
      sqlString(catalog.evidenceModelVersion) + ', ' + sqlString(catalog.taxonomyVersion) + ') ON CONFLICT DO NOTHING;',
    assertSql(
      'EXISTS (SELECT 1 FROM evidence_model_versions WHERE version = ' + sqlString(catalog.evidenceModelVersion) +
        ' AND taxonomy_version = ' + sqlString(catalog.taxonomyVersion) + ')',
      'evidence-model:' + catalog.evidenceModelVersion
    ),
    'INSERT INTO calculation_versions(version) VALUES (' + sqlString(catalog.calculationVersion) + ') ON CONFLICT DO NOTHING;',
    assertSql(
      'EXISTS (SELECT 1 FROM calculation_versions WHERE version = ' + sqlString(catalog.calculationVersion) + ')',
      'calculation:' + catalog.calculationVersion
    ),
    ''
  ];

  for (const scene of catalog.scenes) {
    lines.push(
      'INSERT INTO game_scenes(id, scene_key) OVERRIDING SYSTEM VALUE VALUES (' +
      scene.id + ', ' + sqlString(scene.sceneKey) + ') ON CONFLICT DO NOTHING;',
      assertSql(
        'EXISTS (SELECT 1 FROM game_scenes WHERE id = ' + scene.id +
          ' AND scene_key = ' + sqlString(scene.sceneKey) + ')',
        'scene:' + scene.sceneKey
      )
    );

    for (const presentation of scene.presentations) {
      lines.push(
        'INSERT INTO scene_presentations(id, scene_id, presentation_key, revision, text) VALUES (' +
        presentation.id + ', ' + scene.id + ', ' + sqlString(presentation.presentationKey) + ', ' +
        presentation.revision + ', ' + sqlString(presentation.text) + ') ON CONFLICT DO NOTHING;',
        assertSql(
          'EXISTS (SELECT 1 FROM scene_presentations WHERE id = ' + presentation.id +
            ' AND scene_id = ' + scene.id +
            ' AND presentation_key = ' + sqlString(presentation.presentationKey) +
            ' AND revision = ' + presentation.revision +
            ' AND text = ' + sqlString(presentation.text) + ')',
          'scene-presentation:' + scene.sceneKey + ':' + presentation.presentationKey
        )
      );
    }

    for (const choice of scene.choices) {
      lines.push(
        'INSERT INTO game_choices(id, scene_id, choice_key) OVERRIDING SYSTEM VALUE VALUES (' +
        choice.id + ', ' + scene.id + ', ' + sqlString(choice.choiceKey) + ') ON CONFLICT DO NOTHING;',
        assertSql(
          'EXISTS (SELECT 1 FROM game_choices WHERE id = ' + choice.id +
            ' AND scene_id = ' + scene.id +
            ' AND choice_key = ' + sqlString(choice.choiceKey) + ')',
          'choice:' + choice.choiceKey
        ),
        'INSERT INTO choice_presentations(id, choice_id, presentation_key, revision, style, text) OVERRIDING SYSTEM VALUE VALUES (' +
        choice.presentation.id + ', ' + choice.id + ', ' + sqlString(choice.presentation.presentationKey) + ', ' +
        choice.presentation.revision + ", 'normal', " + sqlString(choice.presentation.text) + ') ON CONFLICT DO NOTHING;',
        assertSql(
          'EXISTS (SELECT 1 FROM choice_presentations WHERE id = ' + choice.presentation.id +
            ' AND choice_id = ' + choice.id +
            ' AND presentation_key = ' + sqlString(choice.presentation.presentationKey) +
            ' AND revision = ' + choice.presentation.revision +
            " AND style = 'normal' AND text = " + sqlString(choice.presentation.text) + ')',
          'choice-presentation:' + choice.choiceKey
        )
      );

      if (choice.evidence) {
        lines.push(
          'INSERT INTO choice_evidence(choice_id, evidence_model_version, taxonomy_version, evidence) VALUES (' +
          choice.id + ', ' + sqlString(catalog.evidenceModelVersion) + ', ' +
          sqlString(catalog.taxonomyVersion) + ', ' + jsonb(choice.evidence) + ') ON CONFLICT DO NOTHING;',
          assertSql(
            'EXISTS (SELECT 1 FROM choice_evidence WHERE choice_id = ' + choice.id +
              ' AND evidence_model_version = ' + sqlString(catalog.evidenceModelVersion) +
              ' AND taxonomy_version = ' + sqlString(catalog.taxonomyVersion) +
              ' AND evidence = ' + jsonb(choice.evidence) + ')',
            'choice-evidence:' + choice.choiceKey
          )
        );
      }

      if (choice.motive) {
        lines.push(
          'INSERT INTO choice_motive_prompts(id, choice_id, prompt_key) VALUES (' +
          choice.motive.id + ', ' + choice.id + ', ' + sqlString(choice.motive.promptKey) + ') ON CONFLICT DO NOTHING;',
          assertSql(
            'EXISTS (SELECT 1 FROM choice_motive_prompts WHERE id = ' + choice.motive.id +
              ' AND choice_id = ' + choice.id +
              ' AND prompt_key = ' + sqlString(choice.motive.promptKey) + ')',
            'motive-prompt:' + choice.motive.promptKey
          )
        );
        for (const option of choice.motive.options) {
          lines.push(
            'INSERT INTO choice_motive_options(id, choice_id, prompt_id, option_key) VALUES (' +
            option.id + ', ' + choice.id + ', ' + choice.motive.id + ', ' + sqlString(option.optionKey) +
            ') ON CONFLICT DO NOTHING;',
            assertSql(
              'EXISTS (SELECT 1 FROM choice_motive_options WHERE id = ' + option.id +
                ' AND choice_id = ' + choice.id +
                ' AND prompt_id = ' + choice.motive.id +
                ' AND option_key = ' + sqlString(option.optionKey) + ')',
              'motive-option:' + option.optionKey
            ),
            'INSERT INTO choice_motive_evidence(motive_option_id, evidence_model_version, taxonomy_version, evidence) VALUES (' +
            option.id + ', ' + sqlString(catalog.evidenceModelVersion) + ', ' +
            sqlString(catalog.taxonomyVersion) + ', ' + jsonb(option.evidence) + ') ON CONFLICT DO NOTHING;',
            assertSql(
              'EXISTS (SELECT 1 FROM choice_motive_evidence WHERE motive_option_id = ' + option.id +
                ' AND evidence_model_version = ' + sqlString(catalog.evidenceModelVersion) +
                ' AND taxonomy_version = ' + sqlString(catalog.taxonomyVersion) +
                ' AND evidence = ' + jsonb(option.evidence) + ')',
              'motive-evidence:' + option.optionKey
            )
          );
        }
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
const motiveOptionCount = catalog.scenes.reduce(
  (sum, scene) => sum + scene.choices.reduce(
    (choiceSum, choice) => choiceSum + (choice.motive?.options.length ?? 0),
    0
  ),
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
  motiveOptions: motiveOptionCount,
  taxonomyVersion: catalog.taxonomyVersion,
  evidenceModelVersion: catalog.evidenceModelVersion,
  calculationVersion: catalog.calculationVersion
}, null, 2));

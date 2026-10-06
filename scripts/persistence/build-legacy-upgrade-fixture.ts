import { readFileSync } from 'node:fs';

interface Catalog {
  taxonomyVersion: string;
  evidenceModelVersion: string;
  calculationVersion: string;
  scenes: { id: number; sceneKey: string }[];
}

const catalog = JSON.parse(
  readFileSync('server/generated/content-catalog.v1.json', 'utf8')
) as Catalog;

const scene = catalog.scenes[0];
if (!scene) throw new Error('Generated content catalog has no scenes');

function q(value: string): string {
  return "'" + value.replaceAll("'", "''") + "'";
}

const lines = [
  'BEGIN;',
  'INSERT INTO development_taxonomies(version) VALUES (' + q(catalog.taxonomyVersion) + ');',
  'INSERT INTO evidence_model_versions(version,taxonomy_version) VALUES (' +
    q(catalog.evidenceModelVersion) + ',' + q(catalog.taxonomyVersion) + ');',
  'INSERT INTO calculation_versions(version) VALUES (' + q(catalog.calculationVersion) + ');',
  'INSERT INTO game_scenes(id,scene_key) OVERRIDING SYSTEM VALUE VALUES (' +
    scene.id + ',' + q(scene.sceneKey) + ');',
  "INSERT INTO characters(id,user_id,taxonomy_version,evidence_model_version,calculation_version) VALUES (" +
    "'00000000-0000-4000-8000-00000000aa01'," +
    "'00000000-0000-4000-8000-00000000aa02'," +
    q(catalog.taxonomyVersion) + ',' +
    q(catalog.evidenceModelVersion) + ',' +
    q(catalog.calculationVersion) + ');',
  "INSERT INTO scene_instances(id,character_id,scene_id,game_day) VALUES (" +
    "'00000000-0000-4000-8000-00000000aa03'," +
    "'00000000-0000-4000-8000-00000000aa01'," +
    scene.id + ',1);',
  'COMMIT;'
];

process.stdout.write(lines.join('\n') + '\n');

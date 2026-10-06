import { Pool } from 'pg';
import type { ChoiceMadeEventInput, CreateCharacterInput, SceneInstanceInput } from './schemas.js';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

export type AcceptedStatus = 'accepted' | 'alreadyAccepted';

export async function createCharacter(userId: string, input: CreateCharacterInput): Promise<AcceptedStatus> {
  const result = await pool.query<{ status: AcceptedStatus }>(
    'SELECT create_character_v1($1,$2,$3,$4,$5) AS status',
    [input.characterId, userId, input.taxonomyVersion, input.evidenceModelVersion, input.calculationVersion]
  );
  return result.rows[0]!.status;
}

export async function registerSceneInstance(userId: string, input: SceneInstanceInput): Promise<AcceptedStatus> {
  const result = await pool.query<{ status: AcceptedStatus }>(
    'SELECT register_scene_instance_v1($1,$2,$3,$4,$5,$6,$7::jsonb) AS status',
    [
      userId,
      input.characterId,
      input.sceneInstanceId,
      input.gameDay,
      input.sceneId,
      input.scenePresentationId,
      JSON.stringify(input.choices)
    ]
  );
  return result.rows[0]!.status;
}

export async function acceptChoiceEvent(
  userId: string,
  input: ChoiceMadeEventInput,
  payloadHash: string
): Promise<AcceptedStatus> {
  const result = await pool.query<{ status: AcceptedStatus }>(
    'SELECT accept_choice_event_v1($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) AS status',
    [
      userId,
      input.eventId,
      payloadHash,
      input.characterId,
      input.gameSessionId,
      input.seq,
      input.gameDay,
      input.sceneInstanceId,
      input.choiceId,
      input.occurredAt
    ]
  );
  return result.rows[0]!.status;
}

const BUSINESS_CODES = new Set([
  'CHARACTER_NOT_FOUND',
  'DAY_ALREADY_CLOSED',
  'DAY_NOT_OPEN',
  'SCENE_INSTANCE_PAYLOAD_MISMATCH',
  'SCENE_INSTANCE_CONFLICT',
  'INVALID_SCENE_CHOICE',
  'INVALID_SCENE_INSTANCE',
  'EVENT_ID_PAYLOAD_MISMATCH',
  'CHOICE_ALREADY_RECORDED',
  'SEQ_CONFLICT',
  'INVALID_EVENT'
]);

export function persistenceBusinessCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object' || !('message' in error)) return undefined;
  const message = String((error as { message: unknown }).message);
  return BUSINESS_CODES.has(message) ? message : undefined;
}

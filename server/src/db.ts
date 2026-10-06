import { Pool } from 'pg';
import type { ChoiceMadeEventInput, CompleteDayInput, CreateCharacterInput, SceneInstanceInput } from './schemas.js';

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
    'SELECT register_scene_instance_v1($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb) AS status',
    [
      userId,
      input.characterId,
      input.sceneInstanceId,
      input.gameDay,
      input.sceneId,
      input.scenePresentationId,
      input.gameSlot,
      input.selectionOrigin,
      JSON.stringify(input.choices)
    ]
  );
  return result.rows[0]!.status;
}

export interface CompleteDayResult {
  status: 'completed' | 'alreadyCompleted';
  gameDay: number;
  lastSeq: number;
  profileStatus: 'insufficient_data' | 'provisional' | 'stable' | 'transition';
  centerScores: Record<string, number>;
  currentCenter: string | null;
  currentCenterConfidence: number | null;
  emergingCenter: string | null;
  emergingCenterConfidence: number | null;
  dailyEvidence: Record<string, number>;
  algorithmState: Record<string, unknown>;
  evidenceCount: number;
  taxonomyVersion: string;
  evidenceModelVersion: string;
  calculationVersion: string;
}

export async function completeCharacterDay(
  userId: string,
  characterId: string,
  gameDay: number,
  input: CompleteDayInput
): Promise<CompleteDayResult> {
  const result = await pool.query<{ result: CompleteDayResult }>(
    'SELECT complete_character_day_v1($1,$2,$3,$4) AS result',
    [userId, characterId, gameDay, input.lastSeq]
  );
  return result.rows[0]!.result;
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
  'CHARACTER_VERSION_MISMATCH',
  'DAY_ALREADY_CLOSED',
  'DAY_NOT_OPEN',
  'SCENE_INSTANCE_PAYLOAD_MISMATCH',
  'INVALID_SCENE_CHOICES',
  'SCENE_INSTANCE_CONFLICT',
  'INVALID_SCENE_CHOICE',
  'INVALID_SCENE_INSTANCE',
  'EVENT_ID_PAYLOAD_MISMATCH',
  'CHOICE_ALREADY_RECORDED',
  'SEQ_CONFLICT',
  'INVALID_EVENT',
  'DAY_COMPLETE_PAYLOAD_MISMATCH',
  'DAY_COMPLETE_INVALID_LAST_SEQ',
  'DAY_COMPLETE_LAST_SEQ_TOO_LOW'
]);

export function persistenceBusinessCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object' || !('message' in error)) return undefined;
  const message = String((error as { message: unknown }).message);
  if (BUSINESS_CODES.has(message)) return message;
  if (message.startsWith('DAY_EVENTS_INCOMPLETE:')) return message;
  return undefined;
}

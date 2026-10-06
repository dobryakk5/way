import { Pool } from 'pg';
import type {
  ChoiceMadeEventInput,
  CompleteDayInput,
  CreateCharacterInput,
  MotiveResolutionInput,
  SceneInstanceInput
} from './schemas.js';

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



export async function acceptMotiveResolution(
  userId: string,
  input: MotiveResolutionInput,
  payloadHash: string
): Promise<AcceptedStatus> {
  const result = await pool.query<{ status: AcceptedStatus }>(
    'SELECT accept_motive_resolution_v1($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) AS status',
    [
      userId,
      input.eventId,
      payloadHash,
      input.characterId,
      input.gameSessionId,
      input.gameDay,
      input.sceneInstanceId,
      input.choiceId,
      input.promptId,
      input.resolutionType,
      input.resolutionType === 'answered' ? input.motiveOptionId : null,
      input.occurredAt
    ]
  );
  return result.rows[0]!.status;
}

export interface DevelopmentStateView {
  processedThroughDay: number;
  lastProcessedSeq: number;
  taxonomyVersion: string;
  evidenceModelVersion: string;
  calculationVersion: string;
  profileStatus: 'insufficient_data' | 'provisional' | 'stable' | 'transition';
  centerScores: Record<string, number>;
  currentCenter: string | null;
  currentCenterConfidence: number | null;
  emergingCenter: string | null;
  emergingCenterConfidence: number | null;
  algorithmState: Record<string, unknown>;
  evidenceCount: number;
  updatedAt: string;
}

export interface CharacterPersistenceProjection {
  characterId: string;
  resumeCapable: false;
  game: {
    currentGameDay: number;
    currentSceneId: number | null;
    currentSceneInstanceId: string | null;
    storyState: Record<string, unknown>;
    lastSeq: number;
    updatedAt: string;
  };
  development: DevelopmentStateView;
}

export async function getDevelopmentState(
  userId: string,
  characterId: string
): Promise<DevelopmentStateView | undefined> {
  const result = await pool.query<{ state: DevelopmentStateView }>(
    `SELECT jsonb_build_object(
      'processedThroughDay', ds.processed_through_day,
      'lastProcessedSeq', ds.last_processed_seq,
      'taxonomyVersion', ds.taxonomy_version,
      'evidenceModelVersion', ds.evidence_model_version,
      'calculationVersion', ds.calculation_version,
      'profileStatus', ds.profile_status,
      'centerScores', ds.center_scores,
      'currentCenter', ds.current_center,
      'currentCenterConfidence', ds.current_center_confidence,
      'emergingCenter', ds.emerging_center,
      'emergingCenterConfidence', ds.emerging_center_confidence,
      'algorithmState', ds.algorithm_state,
      'evidenceCount', ds.evidence_count,
      'updatedAt', ds.updated_at
    ) AS state
    FROM character_development_state ds
    JOIN characters c ON c.id = ds.character_id
    WHERE ds.character_id = $1 AND c.user_id = $2`,
    [characterId, userId]
  );
  return result.rows[0]?.state;
}

export async function getCharacterPersistenceProjection(
  userId: string,
  characterId: string
): Promise<CharacterPersistenceProjection | undefined> {
  const result = await pool.query<{ state: CharacterPersistenceProjection }>(
    `SELECT jsonb_build_object(
      'characterId', c.id,
      'resumeCapable', false,
      'game', jsonb_build_object(
        'currentGameDay', gs.current_game_day,
        'currentSceneId', gs.current_scene_id,
        'currentSceneInstanceId', gs.current_scene_instance_id,
        'storyState', gs.story_state,
        'lastSeq', gs.last_seq,
        'updatedAt', gs.updated_at
      ),
      'development', jsonb_build_object(
        'processedThroughDay', ds.processed_through_day,
        'lastProcessedSeq', ds.last_processed_seq,
        'taxonomyVersion', ds.taxonomy_version,
        'evidenceModelVersion', ds.evidence_model_version,
        'calculationVersion', ds.calculation_version,
        'profileStatus', ds.profile_status,
        'centerScores', ds.center_scores,
        'currentCenter', ds.current_center,
        'currentCenterConfidence', ds.current_center_confidence,
        'emergingCenter', ds.emerging_center,
        'emergingCenterConfidence', ds.emerging_center_confidence,
        'algorithmState', ds.algorithm_state,
        'evidenceCount', ds.evidence_count,
        'updatedAt', ds.updated_at
      )
    ) AS state
    FROM characters c
    JOIN character_game_state gs ON gs.character_id = c.id
    JOIN character_development_state ds ON ds.character_id = c.id
    WHERE c.id = $1 AND c.user_id = $2`,
    [characterId, userId]
  );
  return result.rows[0]?.state;
}

export async function getDevelopmentHistory(
  userId: string,
  characterId: string,
  versions: {
    taxonomyVersion?: string;
    evidenceModelVersion?: string;
    calculationVersion?: string;
  } = {}
): Promise<CompleteDayResult[]> {
  const result = await pool.query<{ snapshot: CompleteDayResult }>(
    `SELECT jsonb_build_object(
      'status', 'completed',
      'gameDay', s.game_day,
      'lastSeq', s.last_seq,
      'profileStatus', s.profile_status,
      'centerScores', s.center_scores,
      'currentCenter', s.current_center,
      'currentCenterConfidence', s.current_center_confidence,
      'emergingCenter', s.emerging_center,
      'emergingCenterConfidence', s.emerging_center_confidence,
      'dailyEvidence', s.daily_evidence,
      'algorithmState', s.algorithm_state,
      'evidenceCount', s.evidence_count,
      'taxonomyVersion', s.taxonomy_version,
      'evidenceModelVersion', s.evidence_model_version,
      'calculationVersion', s.calculation_version
    ) AS snapshot
    FROM character_development_snapshots s
    JOIN characters c ON c.id = s.character_id
    WHERE s.character_id = $1
      AND c.user_id = $2
      AND ($3::text IS NULL OR s.taxonomy_version = $3)
      AND ($4::text IS NULL OR s.evidence_model_version = $4)
      AND ($5::text IS NULL OR s.calculation_version = $5)
    ORDER BY s.game_day, s.created_at`,
    [
      characterId,
      userId,
      versions.taxonomyVersion ?? null,
      versions.evidenceModelVersion ?? null,
      versions.calculationVersion ?? null
    ]
  );
  return result.rows.map(row => row.snapshot);
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
  'DAY_COMPLETE_LAST_SEQ_TOO_LOW',
  'DAY_COMPLETE_LAST_SEQ_MISMATCH',
  'DAY_MOTIVE_INCOMPLETE',
  'MOTIVE_ALREADY_RECORDED',
  'INVALID_MOTIVE_RESOLUTION'
]);

export function persistenceBusinessCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object' || !('message' in error)) return undefined;
  const message = String((error as { message: unknown }).message);
  if (BUSINESS_CODES.has(message)) return message;
  if (message.startsWith('DAY_EVENTS_INCOMPLETE:')) return message;
  if (message.startsWith('DAY_SLOTS_INCOMPLETE:')) return message;
  return undefined;
}

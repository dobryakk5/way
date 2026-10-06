import { z } from 'zod';
import {
  PERSISTENCE_CALCULATION_VERSION,
  PERSISTENCE_EVIDENCE_MODEL_VERSION,
  PERSISTENCE_TAXONOMY_VERSION
} from '../persistence/versions';

const responseSchema = z.object({
  characterId: z.string().uuid(),
  status: z.enum(['accepted', 'alreadyAccepted'])
}).strict();

export type EnsureCharacterResult =
  | { status: 'ok' }
  | { status: 'paused-auth' }
  | { status: 'retry'; reason: 'network' | 'server' | 'invalid-response' }
  | { status: 'rejected'; httpStatus: number };

export async function ensureRemoteCharacter(options: {
  characterId: string;
  endpoint: string;
  fetchImpl?: typeof fetch;
}): Promise<EnsureCharacterResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(options.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        characterId: options.characterId,
        taxonomyVersion: PERSISTENCE_TAXONOMY_VERSION,
        evidenceModelVersion: PERSISTENCE_EVIDENCE_MODEL_VERSION,
        calculationVersion: PERSISTENCE_CALCULATION_VERSION
      })
    });
  } catch {
    return { status: 'retry', reason: 'network' };
  }

  if (response.status === 401) return { status: 'paused-auth' };
  if (response.status >= 500) return { status: 'retry', reason: 'server' };
  if (!response.ok) return { status: 'rejected', httpStatus: response.status };

  try {
    const parsed = responseSchema.safeParse(await response.json());
    if (!parsed.success || parsed.data.characterId !== options.characterId) {
      return { status: 'retry', reason: 'invalid-response' };
    }
  } catch {
    return { status: 'retry', reason: 'invalid-response' };
  }
  return { status: 'ok' };
}

import { z } from 'zod';

export const completeDayResponseSchema = z.object({
  status: z.enum(['completed', 'alreadyCompleted']),
  gameDay: z.number().int().positive(),
  lastSeq: z.number().int().min(0),
  profileStatus: z.enum(['insufficient_data', 'provisional', 'stable', 'transition']),
  centerScores: z.record(z.number()),
  currentCenter: z.string().nullable(),
  currentCenterConfidence: z.number().nullable(),
  emergingCenter: z.string().nullable(),
  emergingCenterConfidence: z.number().nullable(),
  dailyEvidence: z.record(z.number()),
  algorithmState: z.record(z.unknown()),
  evidenceCount: z.number().int().min(0),
  taxonomyVersion: z.string().min(1),
  evidenceModelVersion: z.string().min(1),
  calculationVersion: z.string().min(1)
}).strict();

export type CompleteDayResponse = z.infer<typeof completeDayResponseSchema>;

export type CompleteDayResult =
  | { status: 'ok'; result: CompleteDayResponse }
  | { status: 'paused-auth' }
  | { status: 'retry'; reason: 'network' | 'server' | 'invalid-response' }
  | { status: 'incomplete'; missingSeq: number[] }
  | { status: 'slots-incomplete'; missingSlots: number[] }
  | { status: 'rejected'; code: string };

const errorSchema = z.object({
  code: z.string().min(1),
  missingSeq: z.array(z.number().int().positive()).optional(),
  missingSlots: z.array(z.number().int().min(0)).optional()
}).passthrough();

export async function completeCharacterDay(options: {
  characterId: string;
  gameDay: number;
  lastSeq: number;
  apiBaseUrl: string;
  fetchImpl?: typeof fetch;
}): Promise<CompleteDayResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const base = options.apiBaseUrl.replace(/\/$/, '');
  let response: Response;
  try {
    response = await fetchImpl(
      `${base}/api/v1/characters/${options.characterId}/days/${options.gameDay}/complete`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ lastSeq: options.lastSeq })
      }
    );
  } catch {
    return { status: 'retry', reason: 'network' };
  }

  if (response.status === 401) return { status: 'paused-auth' };
  if (response.status >= 500) return { status: 'retry', reason: 'server' };

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { status: 'retry', reason: 'invalid-response' };
  }

  if (response.ok) {
    const parsed = completeDayResponseSchema.safeParse(body);
    return parsed.success
      ? { status: 'ok', result: parsed.data }
      : { status: 'retry', reason: 'invalid-response' };
  }

  const error = errorSchema.safeParse(body);
  if (!error.success) return { status: 'rejected', code: `HTTP_${response.status}` };
  if (error.data.code === 'DAY_EVENTS_INCOMPLETE') {
    return { status: 'incomplete', missingSeq: error.data.missingSeq ?? [] };
  }
  if (error.data.code === 'DAY_SLOTS_INCOMPLETE') {
    return { status: 'slots-incomplete', missingSlots: error.data.missingSlots ?? [] };
  }
  return { status: 'rejected', code: error.data.code };
}

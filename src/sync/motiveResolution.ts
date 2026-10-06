import { z } from 'zod';

const base = {
  eventId: z.string().uuid(),
  characterId: z.string().uuid(),
  gameSessionId: z.string().uuid(),
  gameDay: z.number().int().positive(),
  sceneInstanceId: z.string().uuid(),
  choiceId: z.number().int().positive(),
  promptId: z.number().int().positive(),
  occurredAt: z.string().datetime()
} as const;

export const motiveResolutionSchema = z.discriminatedUnion('resolutionType', [
  z.object({
    ...base,
    resolutionType: z.literal('answered'),
    motiveOptionId: z.number().int().positive()
  }).strict(),
  z.object({
    ...base,
    resolutionType: z.literal('skipped')
  }).strict()
]);

export type MotiveResolutionEvent = z.infer<typeof motiveResolutionSchema>;

export const motiveResolutionBatchSchema = z.object({
  resolutions: z.array(motiveResolutionSchema).min(1).max(100)
}).strict();

export const motiveResolutionBatchResponseSchema = z.object({
  results: z.array(z.object({
    eventId: z.string().uuid(),
    status: z.enum(['accepted', 'alreadyAccepted', 'rejected']),
    code: z.string().min(1).optional()
  }).strict())
}).strict();

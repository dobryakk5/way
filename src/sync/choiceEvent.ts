import { z } from 'zod';

export const choiceMadeEventSchema = z.object({
  eventId: z.string().uuid(),
  characterId: z.string().uuid(),
  gameSessionId: z.string().uuid(),
  seq: z.number().int().positive(),
  gameDay: z.number().int().positive(),
  eventType: z.literal('CHOICE_MADE'),
  sceneInstanceId: z.string().uuid(),
  choiceId: z.number().int().positive(),
  occurredAt: z.string().datetime()
}).strict();

export type ChoiceMadeEvent = z.infer<typeof choiceMadeEventSchema>;

export const eventBatchRequestSchema = z.object({
  events: z.array(choiceMadeEventSchema).min(1).max(100)
}).strict();

export const eventBatchResultSchema = z.object({
  eventId: z.string().uuid(),
  status: z.enum(['accepted', 'alreadyAccepted', 'rejected']),
  code: z.string().min(1).optional()
}).strict();

export const eventBatchResponseSchema = z.object({
  results: z.array(eventBatchResultSchema)
}).strict();

export type EventBatchResponse = z.infer<typeof eventBatchResponseSchema>;

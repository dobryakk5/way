import { z } from 'zod';

const uuid = z.string().uuid();
const positiveId = z.number().int().positive();

export const createCharacterSchema = z.object({
  characterId: uuid,
  taxonomyVersion: z.string().min(1),
  evidenceModelVersion: z.string().min(1),
  calculationVersion: z.string().min(1)
}).strict();

export const sceneInstanceSchema = z.object({
  sceneInstanceId: uuid,
  characterId: uuid,
  gameDay: z.number().int().positive(),
  sceneId: positiveId,
  scenePresentationId: positiveId,
  gameSlot: z.number().int().min(0).max(3),
  selectionOrigin: z.enum(['neutral', 'probe', 'adaptive']),
  choices: z.array(z.object({
    choiceId: positiveId,
    presentationId: positiveId,
    position: z.number().int().min(1).max(4)
  }).strict()).min(2).max(4)
}).strict().superRefine((value, ctx) => {
  const choiceIds = new Set(value.choices.map(choice => choice.choiceId));
  const positions = [...new Set(value.choices.map(choice => choice.position))].sort((a, b) => a - b);
  if (choiceIds.size !== value.choices.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'duplicate choiceId' });
  }
  if (positions.length !== value.choices.length || positions.some((position, index) => position !== index + 1)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'positions must be unique and contiguous from 1' });
  }
});

export const choiceMadeEventSchema = z.object({
  eventId: uuid,
  characterId: uuid,
  gameSessionId: uuid,
  seq: z.number().int().positive(),
  gameDay: z.number().int().positive(),
  eventType: z.literal('CHOICE_MADE'),
  sceneInstanceId: uuid,
  choiceId: positiveId,
  occurredAt: z.string().datetime()
}).strict();

export const rawSceneBatchSchema = z.object({
  sceneInstances: z.array(z.unknown()).min(1).max(100)
}).strict();

export const rawEventBatchSchema = z.object({
  events: z.array(z.unknown()).min(1).max(100)
}).strict();

export type CreateCharacterInput = z.infer<typeof createCharacterSchema>;
export type SceneInstanceInput = z.infer<typeof sceneInstanceSchema>;
export type ChoiceMadeEventInput = z.infer<typeof choiceMadeEventSchema>;

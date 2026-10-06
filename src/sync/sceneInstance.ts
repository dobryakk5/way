import { z } from 'zod';

export const presentedChoiceSchema = z.object({
  choiceId: z.number().int().positive(),
  presentationId: z.number().int().positive(),
  position: z.number().int().min(1).max(4)
}).strict();

export const sceneInstanceSchema = z.object({
  sceneInstanceId: z.string().uuid(),
  characterId: z.string().uuid(),
  gameDay: z.number().int().positive(),
  sceneId: z.number().int().positive(),
  scenePresentationId: z.number().int().positive(),
  gameSlot: z.number().int().min(0).max(3),
  selectionOrigin: z.enum(['neutral', 'probe', 'adaptive']),
  choices: z.array(presentedChoiceSchema).min(2).max(4)
}).strict().superRefine((value, ctx) => {
  const choiceIds = new Set(value.choices.map(choice => choice.choiceId));
  const positions = new Set(value.choices.map(choice => choice.position));
  if (choiceIds.size !== value.choices.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'choiceId must be unique in scene instance' });
  }
  if (positions.size !== value.choices.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'position must be unique in scene instance' });
  }
  const expected = value.choices.map((_, index) => index + 1);
  const actual = [...positions].sort((a, b) => a - b);
  if (expected.some((position, index) => actual[index] !== position)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'positions must be contiguous from 1' });
  }
});

export type SceneInstancePayload = z.infer<typeof sceneInstanceSchema>;

export const sceneInstanceBatchRequestSchema = z.object({
  sceneInstances: z.array(sceneInstanceSchema).min(1).max(100)
}).strict();

export const sceneInstanceBatchResultSchema = z.object({
  sceneInstanceId: z.string().uuid(),
  status: z.enum(['accepted', 'alreadyAccepted', 'rejected']),
  code: z.string().min(1).optional()
}).strict();

export const sceneInstanceBatchResponseSchema = z.object({
  results: z.array(sceneInstanceBatchResultSchema)
}).strict();

# CHARACTER-STATE-PERSISTENCE v2.1 — implementation status

## Stage 1 completed

Implemented the persistence foundation without changing the existing game flow yet.

### Frontend contracts

- strict Zod contract for `CHOICE_MADE`;
- numeric `choiceId`, UUID character/session/scene-instance/event IDs;
- batch request/response contract;
- no text or diagnostic evidence in event payloads.

### Durable Outbox

- separate IndexedDB database `put-event-outbox`;
- unique `(characterId, seq)`;
- statuses: `pending / sending / synced / rejected`;
- same `eventId` + same payload is idempotent;
- same `eventId` + different payload is rejected;
- stranded `sending` events can be returned to `pending`;
- retry counter is not incremented for 401;
- batch sync supports accepted/alreadyAccepted/rejected per event;
- sync is guarded with Web Locks when invoked through `syncChoiceEventsWithLock`.

### PostgreSQL schema

Added the initial migration for:

- immutable scene/choice identity;
- append-only choice presentations;
- append-only versioned evidence;
- taxonomy/evidence/calculation version registries;
- characters;
- scene instances and the exact variants actually shown;
- position of every shown choice;
- character events;
- character game state;
- development state;
- versioned daily snapshots.

Database constraints enforce the important content relations, including:

```text
scene instance
  -> actual shown choice
  -> exact presentation
```

and character-event references only to a choice that was actually present in that scene instance.

## Tests added

- basic Outbox persistence;
- event idempotency;
- payload mismatch;
- duplicate character seq;
- seq ordering;
- recovery of stranded `sending`;
- successful batch sync;
- 401 without retry penalty;
- network retry;
- terminal per-event rejection.

## Deliberately not wired yet

The current game content still uses string card/choice IDs from local JSON, while v2.1 requires server-owned numeric IDs for runtime event payloads.

Therefore this stage does **not** yet emit `CHOICE_MADE` from `useGameStore.choose()`. Wiring it now would either violate the v2.1 ID model or introduce a temporary protocol that would immediately need removal.

## Next stage

1. Import current cards/choices into `game_scenes/game_choices/choice_presentations` using existing string IDs as stable author keys.
2. Add content API / scene-instance creation so frontend receives production numeric `sceneId/choiceId/presentationId`.
3. Persist `sceneInstanceId` with the currently shown card.
4. Wire `choose()` to Outbox before the state transition.
5. Add backend `POST /api/v1/game/events/batch` with:
   - ownership check;
   - open-day check;
   - event hash idempotency;
   - double-tap protection;
   - per-event result.
6. Implement `POST /characters/{id}/days/{day}/complete`.

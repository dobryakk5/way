BEGIN;

UPDATE scene_instances si
SET scene_presentation_id = sp.id
FROM scene_presentations sp
WHERE si.scene_presentation_id IS NULL
  AND sp.scene_id = si.scene_id
  AND sp.presentation_key = 'base'
  AND sp.revision = 1;

WITH ranked AS (
    SELECT
        si.id,
        ((row_number() OVER (
            PARTITION BY si.character_id, si.game_day
            ORDER BY si.created_at, si.id
        ) - 1) % 4)::smallint AS fallback_slot
    FROM scene_instances si
    WHERE si.game_slot IS NULL
),
event_slots AS (
    SELECT
        e.scene_instance_id,
        ((e.seq - 1) % 4)::smallint AS event_slot
    FROM character_events e
)
UPDATE scene_instances si
SET game_slot = COALESCE(es.event_slot, ranked.fallback_slot)
FROM ranked
LEFT JOIN event_slots es ON es.scene_instance_id = ranked.id
WHERE si.id = ranked.id
  AND si.game_slot IS NULL;

UPDATE scene_instances
SET selection_origin = 'neutral'
WHERE selection_origin IS NULL;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM scene_instances
        WHERE scene_presentation_id IS NULL
           OR game_slot IS NULL
           OR selection_origin IS NULL
    ) THEN
        RAISE EXCEPTION 'LEGACY_SCENE_INSTANCE_BACKFILL_INCOMPLETE';
    END IF;
END;
$$;

ALTER TABLE scene_instances
    ALTER COLUMN scene_presentation_id SET NOT NULL,
    ALTER COLUMN game_slot SET NOT NULL,
    ALTER COLUMN selection_origin SET NOT NULL;

ALTER TABLE scene_instances
    ADD CONSTRAINT scene_instances_character_day_slot_unique
    UNIQUE (character_id, game_day, game_slot);

COMMIT;

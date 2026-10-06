\set ON_ERROR_STOP on

DO $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT count(*)
    INTO v_count
    FROM scene_instances
    WHERE id = '00000000-0000-4000-8000-00000000aa03'
      AND scene_presentation_id IS NOT NULL
      AND game_slot = 0
      AND selection_origin = 'neutral';

    IF v_count <> 1 THEN
        RAISE EXCEPTION 'legacy scene backfill failed';
    END IF;
END;
$$;

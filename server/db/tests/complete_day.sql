\set ON_ERROR_STOP on

DO $$
DECLARE
    v_user UUID := '00000000-0000-4000-8000-000000000001';
    v_character UUID := '00000000-0000-4000-8000-000000000002';
    v_scene_instance UUID := '00000000-0000-4000-8000-000000000003';
    v_event UUID := '00000000-0000-4000-8000-000000000004';
    v_scene BIGINT;
    v_scene_presentation BIGINT;
    v_choice BIGINT;
    v_choice_presentation BIGINT;
    v_second_choice BIGINT;
    v_second_presentation BIGINT;
    v_result JSONB;
BEGIN
    SELECT gs.id
    INTO v_scene
    FROM game_scenes gs
    WHERE (
        SELECT count(*)
        FROM game_choices gc
        WHERE gc.scene_id = gs.id
    ) >= 2
    ORDER BY gs.id
    LIMIT 1;

    SELECT id INTO v_scene_presentation
    FROM scene_presentations
    WHERE scene_id = v_scene
    ORDER BY id
    LIMIT 1;

    SELECT gc.id, cp.id
    INTO v_choice, v_choice_presentation
    FROM game_choices gc
    JOIN choice_presentations cp ON cp.choice_id = gc.id
    WHERE gc.scene_id = v_scene
    ORDER BY gc.id
    LIMIT 1;

    SELECT gc.id, cp.id
    INTO v_second_choice, v_second_presentation
    FROM game_choices gc
    JOIN choice_presentations cp ON cp.choice_id = gc.id
    WHERE gc.scene_id = v_scene
      AND gc.id <> v_choice
    ORDER BY gc.id
    LIMIT 1;

    PERFORM create_character_v1(
        v_character,
        v_user,
        'development-centers-v1',
        'evidence-v1',
        'development-v1'
    );

    PERFORM register_scene_instance_v1(
        v_user,
        v_character,
        v_scene_instance,
        1,
        v_scene,
        v_scene_presentation,
        0,
        'neutral',
        jsonb_build_array(
            jsonb_build_object('choiceId', v_choice, 'presentationId', v_choice_presentation, 'position', 1),
            jsonb_build_object('choiceId', v_second_choice, 'presentationId', v_second_presentation, 'position', 2)
        )
    );

    PERFORM accept_choice_event_v1(
        v_user,
        v_event,
        repeat('a', 64),
        v_character,
        '00000000-0000-4000-8000-000000000005',
        1,
        1,
        v_scene_instance,
        v_choice,
        now()
    );

    v_result := complete_character_day_v1(v_user, v_character, 1, 1);
    IF v_result->>'status' <> 'completed' THEN
        RAISE EXCEPTION 'expected completed, got %', v_result;
    END IF;

    IF (v_result->>'gameDay')::integer <> 1 OR (v_result->>'lastSeq')::bigint <> 1 THEN
        RAISE EXCEPTION 'unexpected day/seq result %', v_result;
    END IF;
END;
$;

DO $$
DECLARE
    v_user UUID := '00000000-0000-4000-8000-000000000001';
    v_character UUID := '00000000-0000-4000-8000-000000000002';
    v_result JSONB;
    v_processed INTEGER;
    v_last_seq BIGINT;
    v_snapshots INTEGER;
BEGIN
    SELECT processed_through_day, last_processed_seq
    INTO v_processed, v_last_seq
    FROM character_development_state
    WHERE character_id = v_character;

    IF v_processed <> 1 OR v_last_seq <> 1 THEN
        RAISE EXCEPTION 'development state was not advanced: day %, seq %', v_processed, v_last_seq;
    END IF;

    SELECT count(*) INTO v_snapshots
    FROM character_development_snapshots
    WHERE character_id = v_character AND game_day = 1;

    IF v_snapshots <> 1 THEN
        RAISE EXCEPTION 'expected one snapshot, got %', v_snapshots;
    END IF;

    v_result := complete_character_day_v1(v_user, v_character, 1, 1);
    IF v_result->>'status' <> 'alreadyCompleted' THEN
        RAISE EXCEPTION 'retry was not idempotent: %', v_result;
    END IF;

    SELECT count(*) INTO v_snapshots
    FROM character_development_snapshots
    WHERE character_id = v_character AND game_day = 1;

    IF v_snapshots <> 1 THEN
        RAISE EXCEPTION 'retry created another snapshot';
    END IF;
END;
$$;

DO $$
DECLARE
    v_user UUID := '00000000-0000-4000-8000-000000000011';
    v_character UUID := '00000000-0000-4000-8000-000000000012';
    v_scene_instance UUID := '00000000-0000-4000-8000-000000000013';
    v_event UUID := '00000000-0000-4000-8000-000000000014';
    v_scene BIGINT;
    v_scene_presentation BIGINT;
    v_choice BIGINT;
    v_choice_presentation BIGINT;
    v_second_choice BIGINT;
    v_second_presentation BIGINT;
BEGIN
    SELECT gs.id
    INTO v_scene
    FROM game_scenes gs
    WHERE (SELECT count(*) FROM game_choices gc WHERE gc.scene_id = gs.id) >= 2
    ORDER BY gs.id
    LIMIT 1;

    SELECT id INTO v_scene_presentation
    FROM scene_presentations WHERE scene_id = v_scene ORDER BY id LIMIT 1;

    SELECT gc.id, cp.id
    INTO v_choice, v_choice_presentation
    FROM game_choices gc
    JOIN choice_presentations cp ON cp.choice_id = gc.id
    WHERE gc.scene_id = v_scene
    ORDER BY gc.id
    LIMIT 1;

    SELECT gc.id, cp.id
    INTO v_second_choice, v_second_presentation
    FROM game_choices gc
    JOIN choice_presentations cp ON cp.choice_id = gc.id
    WHERE gc.scene_id = v_scene AND gc.id <> v_choice
    ORDER BY gc.id
    LIMIT 1;

    PERFORM create_character_v1(
        v_character,
        v_user,
        'development-centers-v1',
        'evidence-v1',
        'development-v1'
    );

    PERFORM register_scene_instance_v1(
        v_user, v_character, v_scene_instance, 1, v_scene, v_scene_presentation, 0, 'neutral',
        jsonb_build_array(
            jsonb_build_object('choiceId', v_choice, 'presentationId', v_choice_presentation, 'position', 1),
            jsonb_build_object('choiceId', v_second_choice, 'presentationId', v_second_presentation, 'position', 2)
        )
    );

    PERFORM accept_choice_event_v1(
        v_user,
        v_event,
        repeat('b', 64),
        v_character,
        '00000000-0000-4000-8000-000000000015',
        2,
        1,
        v_scene_instance,
        v_choice,
        now()
    );

    BEGIN
        PERFORM complete_character_day_v1(v_user, v_character, 1, 2);
        RAISE EXCEPTION 'expected DAY_EVENTS_INCOMPLETE';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLERRM NOT LIKE 'DAY_EVENTS_INCOMPLETE:%' THEN
                RAISE;
            END IF;
    END;
END;
$$;

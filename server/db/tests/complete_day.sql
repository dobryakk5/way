\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION pg_temp.test_scene()
RETURNS TABLE(
    scene_id BIGINT,
    scene_presentation_id BIGINT,
    choice_id BIGINT,
    choice_presentation_id BIGINT,
    second_choice_id BIGINT,
    second_presentation_id BIGINT
)
LANGUAGE sql
AS $$
    SELECT
        gs.id,
        sp.id,
        c1.id,
        cp1.id,
        c2.id,
        cp2.id
    FROM game_scenes gs
    JOIN scene_presentations sp
      ON sp.scene_id = gs.id
     AND sp.presentation_key = 'base'
     AND sp.revision = 1
    JOIN LATERAL (
        SELECT gc.id
        FROM game_choices gc
        WHERE gc.scene_id = gs.id
          AND NOT EXISTS (
              SELECT 1
              FROM choice_motive_prompts mp
              WHERE mp.choice_id = gc.id
          )
        ORDER BY gc.id
        LIMIT 1
    ) c1 ON true
    JOIN choice_presentations cp1
      ON cp1.choice_id = c1.id
    JOIN LATERAL (
        SELECT gc.id
        FROM game_choices gc
        WHERE gc.scene_id = gs.id
          AND gc.id <> c1.id
        ORDER BY gc.id
        LIMIT 1
    ) c2 ON true
    JOIN choice_presentations cp2
      ON cp2.choice_id = c2.id
    ORDER BY gs.id
    LIMIT 1
$$;

DO $$
DECLARE
    v_user UUID := '00000000-0000-4000-8000-000000000001';
    v_character UUID := '00000000-0000-4000-8000-000000000002';
    v_scene RECORD;
    v_scene_instance UUID;
    v_event UUID;
    v_result JSONB;
    v_snapshots INTEGER;
    i INTEGER;
BEGIN
    SELECT * INTO STRICT v_scene FROM pg_temp.test_scene();

    PERFORM create_character_v1(
        v_character,
        v_user,
        'development-centers-v1',
        'evidence-v1',
        'development-v1'
    );

    FOR i IN 0..3 LOOP
        v_scene_instance := md5('complete-scene-' || i)::uuid;
        v_event := md5('complete-event-' || i)::uuid;

        PERFORM register_scene_instance_v1(
            v_user,
            v_character,
            v_scene_instance,
            1,
            v_scene.scene_id,
            v_scene.scene_presentation_id,
            i::smallint,
            'neutral',
            jsonb_build_array(
                jsonb_build_object(
                    'choiceId', v_scene.choice_id,
                    'presentationId', v_scene.choice_presentation_id,
                    'position', 1
                ),
                jsonb_build_object(
                    'choiceId', v_scene.second_choice_id,
                    'presentationId', v_scene.second_presentation_id,
                    'position', 2
                )
            )
        );

        PERFORM accept_choice_event_v1(
            v_user,
            v_event,
            repeat(chr(97 + i), 64),
            v_character,
            '00000000-0000-4000-8000-000000000005',
            i + 1,
            1,
            v_scene_instance,
            v_scene.choice_id,
            now()
        );
    END LOOP;

    v_result := complete_character_day_v1(v_user, v_character, 1, 4);
    IF v_result->>'status' <> 'completed' THEN
        RAISE EXCEPTION 'expected completed, got %', v_result;
    END IF;

    IF (v_result->>'gameDay')::integer <> 1 OR (v_result->>'lastSeq')::bigint <> 4 THEN
        RAISE EXCEPTION 'unexpected day/seq result %', v_result;
    END IF;

    v_result := complete_character_day_v1(v_user, v_character, 1, 4);
    IF v_result->>'status' <> 'alreadyCompleted' THEN
        RAISE EXCEPTION 'retry was not idempotent: %', v_result;
    END IF;

    SELECT count(*) INTO v_snapshots
    FROM character_development_snapshots
    WHERE character_id = v_character AND game_day = 1;

    IF v_snapshots <> 1 THEN
        RAISE EXCEPTION 'expected one snapshot, got %', v_snapshots;
    END IF;
END;
$$;

DO $$
DECLARE
    v_user UUID := '00000000-0000-4000-8000-000000000011';
    v_character UUID := '00000000-0000-4000-8000-000000000012';
    v_scene RECORD;
    v_scene_instance UUID;
    i INTEGER;
BEGIN
    SELECT * INTO STRICT v_scene FROM pg_temp.test_scene();

    PERFORM create_character_v1(
        v_character,
        v_user,
        'development-centers-v1',
        'evidence-v1',
        'development-v1'
    );

    FOR i IN 0..2 LOOP
        v_scene_instance := md5('missing-slot-scene-' || i)::uuid;
        PERFORM register_scene_instance_v1(
            v_user, v_character, v_scene_instance, 1,
            v_scene.scene_id, v_scene.scene_presentation_id, i::smallint, 'neutral',
            jsonb_build_array(
                jsonb_build_object('choiceId', v_scene.choice_id, 'presentationId', v_scene.choice_presentation_id, 'position', 1),
                jsonb_build_object('choiceId', v_scene.second_choice_id, 'presentationId', v_scene.second_presentation_id, 'position', 2)
            )
        );
        PERFORM accept_choice_event_v1(
            v_user,
            md5('missing-slot-event-' || i)::uuid,
            repeat('e', 64),
            v_character,
            '00000000-0000-4000-8000-000000000015',
            i + 1,
            1,
            v_scene_instance,
            v_scene.choice_id,
            now()
        );
    END LOOP;

    BEGIN
        PERFORM complete_character_day_v1(v_user, v_character, 1, 3);
        RAISE EXCEPTION 'expected DAY_SLOTS_INCOMPLETE';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLERRM <> 'DAY_SLOTS_INCOMPLETE:3' THEN
                RAISE;
            END IF;
    END;
END;
$$;

DO $$
DECLARE
    v_user UUID := '00000000-0000-4000-8000-000000000021';
    v_character UUID := '00000000-0000-4000-8000-000000000022';
    v_scene RECORD;
    v_scene_instance UUID;
    seqs INTEGER[] := ARRAY[1,2,4,5];
    i INTEGER;
BEGIN
    SELECT * INTO STRICT v_scene FROM pg_temp.test_scene();

    PERFORM create_character_v1(
        v_character,
        v_user,
        'development-centers-v1',
        'evidence-v1',
        'development-v1'
    );

    FOR i IN 0..3 LOOP
        v_scene_instance := md5('gap-scene-' || i)::uuid;
        PERFORM register_scene_instance_v1(
            v_user, v_character, v_scene_instance, 1,
            v_scene.scene_id, v_scene.scene_presentation_id, i::smallint, 'neutral',
            jsonb_build_array(
                jsonb_build_object('choiceId', v_scene.choice_id, 'presentationId', v_scene.choice_presentation_id, 'position', 1),
                jsonb_build_object('choiceId', v_scene.second_choice_id, 'presentationId', v_scene.second_presentation_id, 'position', 2)
            )
        );
        PERFORM accept_choice_event_v1(
            v_user,
            md5('gap-event-' || i)::uuid,
            repeat('f', 64),
            v_character,
            '00000000-0000-4000-8000-000000000025',
            seqs[i + 1],
            1,
            v_scene_instance,
            v_scene.choice_id,
            now()
        );
    END LOOP;

    BEGIN
        PERFORM complete_character_day_v1(v_user, v_character, 1, 5);
        RAISE EXCEPTION 'expected DAY_EVENTS_INCOMPLETE';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLERRM <> 'DAY_EVENTS_INCOMPLETE:3' THEN
                RAISE;
            END IF;
    END;
END;
$$;

DO $$
DECLARE
    v_user UUID := '00000000-0000-4000-8000-000000000031';
    v_character UUID := '00000000-0000-4000-8000-000000000032';
    v_scene RECORD;
BEGIN
    SELECT * INTO STRICT v_scene FROM pg_temp.test_scene();

    PERFORM create_character_v1(
        v_character,
        v_user,
        'development-centers-v1',
        'evidence-v1',
        'development-v1'
    );

    PERFORM register_scene_instance_v1(
        v_user, v_character, md5('duplicate-slot-a')::uuid, 1,
        v_scene.scene_id, v_scene.scene_presentation_id, 0::smallint, 'neutral',
        jsonb_build_array(
            jsonb_build_object('choiceId', v_scene.choice_id, 'presentationId', v_scene.choice_presentation_id, 'position', 1),
            jsonb_build_object('choiceId', v_scene.second_choice_id, 'presentationId', v_scene.second_presentation_id, 'position', 2)
        )
    );

    BEGIN
        PERFORM register_scene_instance_v1(
            v_user, v_character, md5('duplicate-slot-b')::uuid, 1,
            v_scene.scene_id, v_scene.scene_presentation_id, 0::smallint, 'neutral',
            jsonb_build_array(
                jsonb_build_object('choiceId', v_scene.choice_id, 'presentationId', v_scene.choice_presentation_id, 'position', 1),
                jsonb_build_object('choiceId', v_scene.second_choice_id, 'presentationId', v_scene.second_presentation_id, 'position', 2)
            )
        );
        RAISE EXCEPTION 'expected SCENE_INSTANCE_CONFLICT';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLERRM <> 'SCENE_INSTANCE_CONFLICT' THEN
                RAISE;
            END IF;
    END;
END;
$$;

DO $$
DECLARE
    v_user UUID := '00000000-0000-4000-8000-000000000041';
    v_character UUID := '00000000-0000-4000-8000-000000000042';
    v_scene_instance UUID := '00000000-0000-4000-8000-000000000043';
    v_choice_event UUID := '00000000-0000-4000-8000-000000000044';
    v_motive_event UUID := '00000000-0000-4000-8000-000000000045';
    v_scene_id BIGINT;
    v_scene_presentation_id BIGINT;
    v_choice_id BIGINT;
    v_choice_presentation_id BIGINT;
    v_second_choice_id BIGINT;
    v_second_presentation_id BIGINT;
    v_prompt_id BIGINT;
    v_option_id BIGINT;
    v_status TEXT;
BEGIN
    SELECT
        gs.id,
        sp.id,
        gc.id,
        cp.id,
        cmp.id,
        cmo.id
    INTO
        v_scene_id,
        v_scene_presentation_id,
        v_choice_id,
        v_choice_presentation_id,
        v_prompt_id,
        v_option_id
    FROM choice_motive_prompts cmp
    JOIN choice_motive_options cmo
      ON cmo.prompt_id = cmp.id
    JOIN game_choices gc
      ON gc.id = cmp.choice_id
    JOIN game_scenes gs
      ON gs.id = gc.scene_id
    JOIN scene_presentations sp
      ON sp.scene_id = gs.id
     AND sp.presentation_key = 'base'
     AND sp.revision = 1
    JOIN choice_presentations cp
      ON cp.choice_id = gc.id
    ORDER BY cmp.id, cmo.id
    LIMIT 1;

    SELECT gc.id, cp.id
    INTO v_second_choice_id, v_second_presentation_id
    FROM game_choices gc
    JOIN choice_presentations cp ON cp.choice_id = gc.id
    WHERE gc.scene_id = v_scene_id
      AND gc.id <> v_choice_id
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
        v_user, v_character, v_scene_instance, 1,
        v_scene_id, v_scene_presentation_id, 0::smallint, 'neutral',
        jsonb_build_array(
            jsonb_build_object('choiceId', v_choice_id, 'presentationId', v_choice_presentation_id, 'position', 1),
            jsonb_build_object('choiceId', v_second_choice_id, 'presentationId', v_second_presentation_id, 'position', 2)
        )
    );

    PERFORM accept_choice_event_v1(
        v_user,
        v_choice_event,
        repeat('1', 64),
        v_character,
        '00000000-0000-4000-8000-000000000046',
        1,
        1,
        v_scene_instance,
        v_choice_id,
        now()
    );

    v_status := accept_motive_resolution_v1(
        v_user,
        v_motive_event,
        repeat('2', 64),
        v_character,
        '00000000-0000-4000-8000-000000000046',
        1,
        v_scene_instance,
        v_choice_id,
        v_prompt_id,
        'answered',
        v_option_id,
        now()
    );

    IF v_status <> 'accepted' THEN
        RAISE EXCEPTION 'motive resolution not accepted: %', v_status;
    END IF;

    v_status := accept_motive_resolution_v1(
        v_user,
        v_motive_event,
        repeat('2', 64),
        v_character,
        '00000000-0000-4000-8000-000000000046',
        1,
        v_scene_instance,
        v_choice_id,
        v_prompt_id,
        'answered',
        v_option_id,
        now()
    );

    IF v_status <> 'alreadyAccepted' THEN
        RAISE EXCEPTION 'motive retry not idempotent: %', v_status;
    END IF;
END;
$$;

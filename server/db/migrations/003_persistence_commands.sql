BEGIN;

ALTER TABLE scene_instances
    ALTER COLUMN scene_presentation_id SET NOT NULL;

CREATE OR REPLACE FUNCTION create_character_v1(
    p_character_id UUID,
    p_user_id UUID,
    p_taxonomy_version TEXT,
    p_evidence_model_version TEXT,
    p_calculation_version TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    existing_user UUID;
    existing_taxonomy TEXT;
    existing_evidence TEXT;
    existing_calculation TEXT;
BEGIN
    SELECT user_id, taxonomy_version, evidence_model_version, calculation_version
    INTO existing_user, existing_taxonomy, existing_evidence, existing_calculation
    FROM characters
    WHERE id = p_character_id;

    IF FOUND THEN
        IF existing_user <> p_user_id THEN
            RAISE EXCEPTION 'CHARACTER_NOT_FOUND' USING ERRCODE = 'P0001';
        END IF;
        IF existing_taxonomy <> p_taxonomy_version
           OR existing_evidence <> p_evidence_model_version
           OR existing_calculation <> p_calculation_version THEN
            RAISE EXCEPTION 'CHARACTER_VERSION_MISMATCH' USING ERRCODE = 'P0001';
        END IF;
        RETURN 'alreadyAccepted';
    END IF;

    INSERT INTO characters(
        id, user_id, taxonomy_version, evidence_model_version, calculation_version
    ) VALUES (
        p_character_id, p_user_id, p_taxonomy_version, p_evidence_model_version, p_calculation_version
    );

    INSERT INTO character_game_state(
        character_id, current_game_day, story_state, last_seq
    ) VALUES (
        p_character_id, 1, '{}'::jsonb, 0
    );

    INSERT INTO character_development_state(
        character_id, taxonomy_version, evidence_model_version, calculation_version,
        profile_status, center_scores, current_center, current_center_confidence,
        emerging_center, emerging_center_confidence, algorithm_state, evidence_count,
        processed_through_day, last_processed_seq
    ) VALUES (
        p_character_id, p_taxonomy_version, p_evidence_model_version, p_calculation_version,
        'insufficient_data', '{}'::jsonb, NULL, NULL,
        NULL, NULL, '{}'::jsonb, 0, 0, 0
    );

    RETURN 'accepted';
END;
$$;

CREATE OR REPLACE FUNCTION register_scene_instance_v1(
    p_user_id UUID,
    p_character_id UUID,
    p_scene_instance_id UUID,
    p_game_day INTEGER,
    p_scene_id BIGINT,
    p_scene_presentation_id BIGINT,
    p_game_slot SMALLINT,
    p_selection_origin TEXT,
    p_choices JSONB
)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    open_day INTEGER;
    existing_scene_id BIGINT;
    existing_character_id UUID;
    existing_game_day INTEGER;
    existing_presentation_id BIGINT;
    existing_game_slot SMALLINT;
    existing_selection_origin TEXT;
    input_count INTEGER;
    existing_count INTEGER;
BEGIN
    IF jsonb_typeof(p_choices) <> 'array' OR jsonb_array_length(p_choices) < 2 OR jsonb_array_length(p_choices) > 4 THEN
        RAISE EXCEPTION 'INVALID_SCENE_CHOICES' USING ERRCODE = 'P0001';
    END IF;

    SELECT ds.processed_through_day + 1
    INTO open_day
    FROM character_development_state ds
    JOIN characters c ON c.id = ds.character_id
    WHERE ds.character_id = p_character_id
      AND c.user_id = p_user_id
    FOR SHARE OF ds;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'CHARACTER_NOT_FOUND' USING ERRCODE = 'P0001';
    END IF;

    IF p_game_day < open_day THEN
        RAISE EXCEPTION 'DAY_ALREADY_CLOSED' USING ERRCODE = 'P0001';
    ELSIF p_game_day > open_day THEN
        RAISE EXCEPTION 'DAY_NOT_OPEN' USING ERRCODE = 'P0001';
    END IF;

    SELECT scene_id, character_id, game_day, scene_presentation_id, game_slot, selection_origin
    INTO existing_scene_id, existing_character_id, existing_game_day, existing_presentation_id, existing_game_slot, existing_selection_origin
    FROM scene_instances
    WHERE id = p_scene_instance_id;

    IF FOUND THEN
        IF existing_scene_id <> p_scene_id
           OR existing_character_id <> p_character_id
           OR existing_game_day <> p_game_day
           OR existing_presentation_id <> p_scene_presentation_id
           OR existing_game_slot <> p_game_slot
           OR existing_selection_origin <> p_selection_origin THEN
            RAISE EXCEPTION 'SCENE_INSTANCE_PAYLOAD_MISMATCH' USING ERRCODE = 'P0001';
        END IF;

        SELECT count(*) INTO input_count FROM jsonb_array_elements(p_choices);
        SELECT count(*) INTO existing_count
        FROM scene_instance_choices
        WHERE scene_instance_id = p_scene_instance_id;

        IF input_count <> existing_count OR EXISTS (
            SELECT 1
            FROM jsonb_to_recordset(p_choices) AS x(
                "choiceId" BIGINT,
                "presentationId" BIGINT,
                position SMALLINT
            )
            LEFT JOIN scene_instance_choices sic
              ON sic.scene_instance_id = p_scene_instance_id
             AND sic.choice_id = x."choiceId"
             AND sic.presentation_id = x."presentationId"
             AND sic.position = x.position
            WHERE sic.choice_id IS NULL
        ) THEN
            RAISE EXCEPTION 'SCENE_INSTANCE_PAYLOAD_MISMATCH' USING ERRCODE = 'P0001';
        END IF;

        RETURN 'alreadyAccepted';
    END IF;

    INSERT INTO scene_instances(
        id, character_id, scene_id, game_day, scene_presentation_id, game_slot, selection_origin
    ) VALUES (
        p_scene_instance_id, p_character_id, p_scene_id, p_game_day, p_scene_presentation_id, p_game_slot, p_selection_origin
    );

    INSERT INTO scene_instance_choices(
        scene_instance_id, scene_id, choice_id, presentation_id, position
    )
    SELECT
        p_scene_instance_id,
        p_scene_id,
        x."choiceId",
        x."presentationId",
        x.position
    FROM jsonb_to_recordset(p_choices) AS x(
        "choiceId" BIGINT,
        "presentationId" BIGINT,
        position SMALLINT
    );

    UPDATE character_game_state
    SET current_game_day = p_game_day,
        current_scene_id = p_scene_id,
        current_scene_instance_id = p_scene_instance_id,
        updated_at = now()
    WHERE character_id = p_character_id;

    RETURN 'accepted';
EXCEPTION
    WHEN unique_violation THEN
        RAISE EXCEPTION 'SCENE_INSTANCE_CONFLICT' USING ERRCODE = 'P0001';
    WHEN foreign_key_violation THEN
        RAISE EXCEPTION 'INVALID_SCENE_CHOICE' USING ERRCODE = 'P0001';
    WHEN check_violation THEN
        RAISE EXCEPTION 'INVALID_SCENE_INSTANCE' USING ERRCODE = 'P0001';
END;
$$;

CREATE OR REPLACE FUNCTION accept_choice_event_v1(
    p_user_id UUID,
    p_event_id UUID,
    p_payload_hash TEXT,
    p_character_id UUID,
    p_game_session_id UUID,
    p_seq BIGINT,
    p_game_day INTEGER,
    p_scene_instance_id UUID,
    p_choice_id BIGINT,
    p_occurred_at TIMESTAMPTZ
)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    open_day INTEGER;
    existing_hash TEXT;
    existing_choice BIGINT;
BEGIN
    SELECT ce.payload_hash
    INTO existing_hash
    FROM character_events ce
    JOIN characters c ON c.id = ce.character_id
    WHERE ce.event_id = p_event_id
      AND ce.character_id = p_character_id
      AND c.user_id = p_user_id;

    IF FOUND THEN
        IF existing_hash <> p_payload_hash THEN
            RAISE EXCEPTION 'EVENT_ID_PAYLOAD_MISMATCH' USING ERRCODE = 'P0001';
        END IF;
        RETURN 'alreadyAccepted';
    ELSIF EXISTS (SELECT 1 FROM character_events WHERE event_id = p_event_id) THEN
        RAISE EXCEPTION 'CHARACTER_NOT_FOUND' USING ERRCODE = 'P0001';
    END IF;

    SELECT ds.processed_through_day + 1
    INTO open_day
    FROM character_development_state ds
    JOIN characters c ON c.id = ds.character_id
    WHERE ds.character_id = p_character_id
      AND c.user_id = p_user_id
    FOR SHARE OF ds;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'CHARACTER_NOT_FOUND' USING ERRCODE = 'P0001';
    END IF;

    IF p_game_day < open_day THEN
        RAISE EXCEPTION 'DAY_ALREADY_CLOSED' USING ERRCODE = 'P0001';
    ELSIF p_game_day > open_day THEN
        RAISE EXCEPTION 'DAY_NOT_OPEN' USING ERRCODE = 'P0001';
    END IF;

    SELECT choice_id
    INTO existing_choice
    FROM character_events
    WHERE character_id = p_character_id
      AND scene_instance_id = p_scene_instance_id
      AND event_type = 'CHOICE_MADE';

    IF FOUND THEN
        RAISE EXCEPTION 'CHOICE_ALREADY_RECORDED' USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO character_events(
        event_id, payload_hash, character_id, game_session_id, seq, game_day, event_type,
        scene_instance_id, choice_id, occurred_at
    ) VALUES (
        p_event_id, p_payload_hash, p_character_id, p_game_session_id, p_seq, p_game_day,
        'CHOICE_MADE', p_scene_instance_id, p_choice_id, p_occurred_at
    );

    UPDATE character_game_state
    SET last_seq = GREATEST(last_seq, p_seq),
        current_scene_id = CASE WHEN current_scene_instance_id = p_scene_instance_id THEN NULL ELSE current_scene_id END,
        current_scene_instance_id = CASE WHEN current_scene_instance_id = p_scene_instance_id THEN NULL ELSE current_scene_instance_id END,
        updated_at = now()
    WHERE character_id = p_character_id;

    RETURN 'accepted';
EXCEPTION
    WHEN unique_violation THEN
        SELECT ce.payload_hash
        INTO existing_hash
        FROM character_events ce
        JOIN characters c ON c.id = ce.character_id
        WHERE ce.event_id = p_event_id
          AND ce.character_id = p_character_id
          AND c.user_id = p_user_id;
        IF FOUND THEN
            IF existing_hash = p_payload_hash THEN
                RETURN 'alreadyAccepted';
            END IF;
            RAISE EXCEPTION 'EVENT_ID_PAYLOAD_MISMATCH' USING ERRCODE = 'P0001';
        END IF;
        IF EXISTS (
            SELECT 1 FROM character_events
            WHERE character_id = p_character_id AND seq = p_seq
        ) THEN
            RAISE EXCEPTION 'SEQ_CONFLICT' USING ERRCODE = 'P0001';
        END IF;
        RAISE EXCEPTION 'CHOICE_ALREADY_RECORDED' USING ERRCODE = 'P0001';
    WHEN foreign_key_violation THEN
        RAISE EXCEPTION 'INVALID_SCENE_CHOICE' USING ERRCODE = 'P0001';
    WHEN check_violation THEN
        RAISE EXCEPTION 'INVALID_EVENT' USING ERRCODE = 'P0001';
END;
$$;

COMMIT;

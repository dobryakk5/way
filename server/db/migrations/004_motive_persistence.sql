BEGIN;

CREATE TABLE choice_motive_prompts (
    id BIGINT PRIMARY KEY,
    choice_id BIGINT NOT NULL REFERENCES game_choices(id),
    prompt_key TEXT NOT NULL,
    prompt_text TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (choice_id, prompt_key),
    UNIQUE (choice_id, id)
);

CREATE TABLE choice_motive_options (
    id BIGINT PRIMARY KEY,
    choice_id BIGINT NOT NULL REFERENCES game_choices(id),
    prompt_id BIGINT NOT NULL,
    option_key TEXT NOT NULL,
    option_label TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (prompt_id, option_key),
    UNIQUE (choice_id, id),
    FOREIGN KEY (choice_id, prompt_id)
        REFERENCES choice_motive_prompts(choice_id, id)
);

CREATE TABLE choice_motive_evidence (
    motive_option_id BIGINT NOT NULL REFERENCES choice_motive_options(id),
    evidence_model_version TEXT NOT NULL,
    taxonomy_version TEXT NOT NULL,
    evidence JSONB NOT NULL CHECK (jsonb_typeof(evidence) = 'object'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (motive_option_id, evidence_model_version),
    FOREIGN KEY (evidence_model_version, taxonomy_version)
        REFERENCES evidence_model_versions(version, taxonomy_version)
);

CREATE TRIGGER choice_motive_prompts_append_only
BEFORE UPDATE OR DELETE ON choice_motive_prompts
FOR EACH ROW EXECUTE FUNCTION forbid_append_only_change();

CREATE TRIGGER choice_motive_options_append_only
BEFORE UPDATE OR DELETE ON choice_motive_options
FOR EACH ROW EXECUTE FUNCTION forbid_append_only_change();

CREATE TRIGGER choice_motive_evidence_append_only
BEFORE UPDATE OR DELETE ON choice_motive_evidence
FOR EACH ROW EXECUTE FUNCTION forbid_append_only_change();

ALTER TABLE character_events
    ADD CONSTRAINT character_events_selected_choice_unique
    UNIQUE (character_id, scene_instance_id, choice_id);

CREATE TABLE character_motive_resolutions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_id UUID NOT NULL UNIQUE,
    payload_hash TEXT NOT NULL,
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    game_session_id UUID NULL,
    game_day INTEGER NOT NULL CHECK (game_day > 0),
    scene_instance_id UUID NOT NULL,
    choice_id BIGINT NOT NULL,
    prompt_id BIGINT NOT NULL,
    resolution_type TEXT NOT NULL CHECK (resolution_type IN ('answered', 'skipped')),
    motive_option_id BIGINT NULL,
    occurred_at TIMESTAMPTZ NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (character_id, scene_instance_id),
    FOREIGN KEY (scene_instance_id, character_id, game_day)
        REFERENCES scene_instances(id, character_id, game_day),
    FOREIGN KEY (character_id, scene_instance_id, choice_id)
        REFERENCES character_events(character_id, scene_instance_id, choice_id),
    FOREIGN KEY (choice_id, prompt_id)
        REFERENCES choice_motive_prompts(choice_id, id),
    FOREIGN KEY (choice_id, motive_option_id)
        REFERENCES choice_motive_options(choice_id, id),
    CHECK (
        (resolution_type = 'answered' AND motive_option_id IS NOT NULL)
        OR (resolution_type = 'skipped' AND motive_option_id IS NULL)
    )
);

CREATE INDEX character_motive_resolutions_character_day_idx
    ON character_motive_resolutions(character_id, game_day, received_at);

CREATE OR REPLACE FUNCTION accept_motive_resolution_v1(
    p_user_id UUID,
    p_event_id UUID,
    p_payload_hash TEXT,
    p_character_id UUID,
    p_game_session_id UUID,
    p_game_day INTEGER,
    p_scene_instance_id UUID,
    p_choice_id BIGINT,
    p_prompt_id BIGINT,
    p_resolution_type TEXT,
    p_motive_option_id BIGINT,
    p_occurred_at TIMESTAMPTZ
)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    open_day INTEGER;
    existing_hash TEXT;
BEGIN
    SELECT mr.payload_hash
    INTO existing_hash
    FROM character_motive_resolutions mr
    JOIN characters c ON c.id = mr.character_id
    WHERE mr.event_id = p_event_id
      AND mr.character_id = p_character_id
      AND c.user_id = p_user_id;

    IF FOUND THEN
        IF existing_hash <> p_payload_hash THEN
            RAISE EXCEPTION 'EVENT_ID_PAYLOAD_MISMATCH' USING ERRCODE = 'P0001';
        END IF;
        RETURN 'alreadyAccepted';
    ELSIF EXISTS (
        SELECT 1 FROM character_motive_resolutions WHERE event_id = p_event_id
    ) THEN
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

    INSERT INTO character_motive_resolutions(
        event_id,
        payload_hash,
        character_id,
        game_session_id,
        game_day,
        scene_instance_id,
        choice_id,
        prompt_id,
        resolution_type,
        motive_option_id,
        occurred_at
    ) VALUES (
        p_event_id,
        p_payload_hash,
        p_character_id,
        p_game_session_id,
        p_game_day,
        p_scene_instance_id,
        p_choice_id,
        p_prompt_id,
        p_resolution_type,
        p_motive_option_id,
        p_occurred_at
    );

    RETURN 'accepted';
EXCEPTION
    WHEN unique_violation THEN
        RAISE EXCEPTION 'MOTIVE_ALREADY_RECORDED' USING ERRCODE = 'P0001';
    WHEN foreign_key_violation THEN
        RAISE EXCEPTION 'INVALID_MOTIVE_RESOLUTION' USING ERRCODE = 'P0001';
    WHEN check_violation THEN
        RAISE EXCEPTION 'INVALID_MOTIVE_RESOLUTION' USING ERRCODE = 'P0001';
END;
$$;

COMMIT;

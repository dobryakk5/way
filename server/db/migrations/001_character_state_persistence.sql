BEGIN;

CREATE TABLE development_taxonomies (
    version TEXT PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE evidence_model_versions (
    version TEXT PRIMARY KEY,
    taxonomy_version TEXT NOT NULL REFERENCES development_taxonomies(version),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (version, taxonomy_version)
);

CREATE TABLE calculation_versions (
    version TEXT PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE game_scenes (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    scene_key TEXT NOT NULL UNIQUE,
    retired_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE game_choices (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    scene_id BIGINT NOT NULL REFERENCES game_scenes(id),
    choice_key TEXT NOT NULL UNIQUE,
    retired_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (scene_id, id)
);

CREATE TABLE choice_presentations (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    choice_id BIGINT NOT NULL REFERENCES game_choices(id),
    presentation_key TEXT NOT NULL,
    revision INTEGER NOT NULL CHECK (revision > 0),
    style TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (choice_id, presentation_key, revision),
    UNIQUE (choice_id, id)
);

CREATE TABLE choice_evidence (
    choice_id BIGINT NOT NULL REFERENCES game_choices(id),
    evidence_model_version TEXT NOT NULL,
    taxonomy_version TEXT NOT NULL,
    evidence JSONB NOT NULL CHECK (jsonb_typeof(evidence) = 'object'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (choice_id, evidence_model_version),
    FOREIGN KEY (evidence_model_version, taxonomy_version)
        REFERENCES evidence_model_versions(version, taxonomy_version)
);

CREATE TABLE characters (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    taxonomy_version TEXT NOT NULL REFERENCES development_taxonomies(version),
    evidence_model_version TEXT NOT NULL,
    calculation_version TEXT NOT NULL REFERENCES calculation_versions(version),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (evidence_model_version, taxonomy_version)
        REFERENCES evidence_model_versions(version, taxonomy_version),
    UNIQUE (id, taxonomy_version, evidence_model_version, calculation_version)
);

CREATE INDEX characters_user_id_idx ON characters(user_id);

CREATE TABLE scene_instances (
    id UUID PRIMARY KEY,
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    scene_id BIGINT NOT NULL REFERENCES game_scenes(id),
    game_day INTEGER NOT NULL CHECK (game_day > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (id, scene_id),
    UNIQUE (id, character_id, game_day)
);

CREATE INDEX scene_instances_character_day_idx
    ON scene_instances(character_id, game_day);

CREATE TABLE scene_instance_choices (
    scene_instance_id UUID NOT NULL,
    scene_id BIGINT NOT NULL,
    choice_id BIGINT NOT NULL,
    presentation_id BIGINT NOT NULL,
    position SMALLINT NOT NULL CHECK (position > 0),
    PRIMARY KEY (scene_instance_id, choice_id),
    UNIQUE (scene_instance_id, position),
    FOREIGN KEY (scene_instance_id, scene_id)
        REFERENCES scene_instances(id, scene_id) ON DELETE CASCADE,
    FOREIGN KEY (scene_id, choice_id)
        REFERENCES game_choices(scene_id, id),
    FOREIGN KEY (choice_id, presentation_id)
        REFERENCES choice_presentations(choice_id, id)
);

CREATE TABLE character_events (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_id UUID NOT NULL UNIQUE,
    payload_hash TEXT NOT NULL,
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    game_session_id UUID NULL,
    seq BIGINT NOT NULL CHECK (seq > 0),
    game_day INTEGER NOT NULL CHECK (game_day > 0),
    event_type TEXT NOT NULL CHECK (event_type = 'CHOICE_MADE'),
    scene_instance_id UUID NOT NULL,
    choice_id BIGINT NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (character_id, seq),
    UNIQUE (character_id, scene_instance_id, event_type),
    FOREIGN KEY (scene_instance_id, character_id, game_day)
        REFERENCES scene_instances(id, character_id, game_day),
    FOREIGN KEY (scene_instance_id, choice_id)
        REFERENCES scene_instance_choices(scene_instance_id, choice_id)
);

CREATE INDEX character_events_character_day_seq_idx
    ON character_events(character_id, game_day, seq);

CREATE TABLE character_game_state (
    character_id UUID PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
    current_game_day INTEGER NOT NULL CHECK (current_game_day > 0),
    current_scene_id BIGINT NULL REFERENCES game_scenes(id),
    current_scene_instance_id UUID NULL REFERENCES scene_instances(id),
    story_state JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(story_state) = 'object'),
    last_seq BIGINT NOT NULL DEFAULT 0 CHECK (last_seq >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE character_development_state (
    character_id UUID PRIMARY KEY,
    taxonomy_version TEXT NOT NULL,
    evidence_model_version TEXT NOT NULL,
    calculation_version TEXT NOT NULL,
    profile_status TEXT NOT NULL CHECK (
        profile_status IN ('insufficient_data', 'provisional', 'stable', 'transition')
    ),
    center_scores JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(center_scores) = 'object'),
    current_center TEXT NULL,
    current_center_confidence NUMERIC NULL,
    emerging_center TEXT NULL,
    emerging_center_confidence NUMERIC NULL,
    algorithm_state JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(algorithm_state) = 'object'),
    evidence_count INTEGER NOT NULL DEFAULT 0 CHECK (evidence_count >= 0),
    processed_through_day INTEGER NOT NULL DEFAULT 0 CHECK (processed_through_day >= 0),
    last_processed_seq BIGINT NOT NULL DEFAULT 0 CHECK (last_processed_seq >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (
        character_id,
        taxonomy_version,
        evidence_model_version,
        calculation_version
    ) REFERENCES characters (
        id,
        taxonomy_version,
        evidence_model_version,
        calculation_version
    ) ON DELETE CASCADE
);

CREATE TABLE character_development_snapshots (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    game_day INTEGER NOT NULL CHECK (game_day > 0),
    taxonomy_version TEXT NOT NULL REFERENCES development_taxonomies(version),
    evidence_model_version TEXT NOT NULL,
    calculation_version TEXT NOT NULL REFERENCES calculation_versions(version),
    profile_status TEXT NOT NULL CHECK (
        profile_status IN ('insufficient_data', 'provisional', 'stable', 'transition')
    ),
    center_scores JSONB NOT NULL CHECK (jsonb_typeof(center_scores) = 'object'),
    current_center TEXT NULL,
    current_center_confidence NUMERIC NULL,
    emerging_center TEXT NULL,
    emerging_center_confidence NUMERIC NULL,
    daily_evidence JSONB NOT NULL CHECK (jsonb_typeof(daily_evidence) = 'object'),
    algorithm_state JSONB NOT NULL CHECK (jsonb_typeof(algorithm_state) = 'object'),
    evidence_count INTEGER NOT NULL CHECK (evidence_count >= 0),
    last_seq BIGINT NOT NULL CHECK (last_seq >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (evidence_model_version, taxonomy_version)
        REFERENCES evidence_model_versions(version, taxonomy_version),
    UNIQUE (
        character_id,
        game_day,
        taxonomy_version,
        evidence_model_version,
        calculation_version
    )
);

CREATE INDEX development_snapshots_character_day_idx
    ON character_development_snapshots(character_id, game_day);

CREATE OR REPLACE FUNCTION forbid_append_only_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION '% is append-only', TG_TABLE_NAME
        USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER choice_evidence_append_only
BEFORE UPDATE OR DELETE ON choice_evidence
FOR EACH ROW EXECUTE FUNCTION forbid_append_only_change();

CREATE TRIGGER choice_presentations_append_only
BEFORE UPDATE OR DELETE ON choice_presentations
FOR EACH ROW EXECUTE FUNCTION forbid_append_only_change();

CREATE OR REPLACE FUNCTION preserve_scene_identity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.scene_key IS DISTINCT FROM OLD.scene_key THEN
        RAISE EXCEPTION 'scene_key is immutable'
            USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER game_scenes_identity_immutable
BEFORE UPDATE ON game_scenes
FOR EACH ROW EXECUTE FUNCTION preserve_scene_identity();

CREATE OR REPLACE FUNCTION preserve_choice_identity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.scene_id IS DISTINCT FROM OLD.scene_id
       OR NEW.choice_key IS DISTINCT FROM OLD.choice_key THEN
        RAISE EXCEPTION 'choice identity is immutable'
            USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER game_choices_identity_immutable
BEFORE UPDATE ON game_choices
FOR EACH ROW EXECUTE FUNCTION preserve_choice_identity();

COMMIT;

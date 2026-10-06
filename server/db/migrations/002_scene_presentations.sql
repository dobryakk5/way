BEGIN;

CREATE TABLE scene_presentations (
    id BIGINT PRIMARY KEY,
    scene_id BIGINT NOT NULL REFERENCES game_scenes(id),
    presentation_key TEXT NOT NULL,
    revision INTEGER NOT NULL CHECK (revision > 0),
    text TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (scene_id, presentation_key, revision),
    UNIQUE (scene_id, id)
);

CREATE TRIGGER scene_presentations_append_only
BEFORE UPDATE OR DELETE ON scene_presentations
FOR EACH ROW EXECUTE FUNCTION forbid_append_only_change();

ALTER TABLE scene_instances
    ADD COLUMN scene_presentation_id BIGINT NULL;

ALTER TABLE scene_instances
    ADD CONSTRAINT scene_instances_presentation_fk
    FOREIGN KEY (scene_id, scene_presentation_id)
    REFERENCES scene_presentations(scene_id, id);

COMMIT;

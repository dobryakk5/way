BEGIN;

CREATE OR REPLACE FUNCTION complete_character_day_v1(
    p_user_id UUID,
    p_character_id UUID,
    p_game_day INTEGER,
    p_last_seq BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_taxonomy_version TEXT;
    v_evidence_model_version TEXT;
    v_calculation_version TEXT;
    v_processed_through_day INTEGER;
    v_last_processed_seq BIGINT;
    v_profile_status TEXT;
    v_current_center TEXT;
    v_current_center_confidence NUMERIC;
    v_emerging_center TEXT;
    v_emerging_center_confidence NUMERIC;
    v_algorithm_state JSONB;
    v_existing_snapshot RECORD;
    v_missing_seq BIGINT[];
    v_daily_totals JSONB := '{}'::jsonb;
    v_previous_totals JSONB := '{}'::jsonb;
    v_combined_totals JSONB := '{}'::jsonb;
    v_center_scores JSONB := '{}'::jsonb;
    v_daily_weight NUMERIC := 0;
    v_previous_weight NUMERIC := 0;
    v_total_weight NUMERIC := 0;
    v_daily_evidence_count INTEGER := 0;
    v_existing_evidence_count INTEGER := 0;
    v_key TEXT;
    v_value NUMERIC;
BEGIN
    SELECT
        ds.taxonomy_version,
        ds.evidence_model_version,
        ds.calculation_version,
        ds.processed_through_day,
        ds.last_processed_seq,
        ds.profile_status,
        ds.current_center,
        ds.current_center_confidence,
        ds.emerging_center,
        ds.emerging_center_confidence,
        ds.algorithm_state,
        ds.evidence_count
    INTO
        v_taxonomy_version,
        v_evidence_model_version,
        v_calculation_version,
        v_processed_through_day,
        v_last_processed_seq,
        v_profile_status,
        v_current_center,
        v_current_center_confidence,
        v_emerging_center,
        v_emerging_center_confidence,
        v_algorithm_state,
        v_existing_evidence_count
    FROM character_development_state ds
    JOIN characters c ON c.id = ds.character_id
    WHERE ds.character_id = p_character_id
      AND c.user_id = p_user_id
    FOR UPDATE OF ds;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'CHARACTER_NOT_FOUND' USING ERRCODE = 'P0001';
    END IF;

    IF p_game_day <= v_processed_through_day THEN
        SELECT *
        INTO v_existing_snapshot
        FROM character_development_snapshots
        WHERE character_id = p_character_id
          AND game_day = p_game_day
          AND taxonomy_version = v_taxonomy_version
          AND evidence_model_version = v_evidence_model_version
          AND calculation_version = v_calculation_version;

        IF FOUND AND v_existing_snapshot.last_seq = p_last_seq THEN
            RETURN jsonb_build_object(
                'status', 'alreadyCompleted',
                'gameDay', v_existing_snapshot.game_day,
                'lastSeq', v_existing_snapshot.last_seq,
                'profileStatus', v_existing_snapshot.profile_status,
                'centerScores', v_existing_snapshot.center_scores,
                'currentCenter', v_existing_snapshot.current_center,
                'currentCenterConfidence', v_existing_snapshot.current_center_confidence,
                'emergingCenter', v_existing_snapshot.emerging_center,
                'emergingCenterConfidence', v_existing_snapshot.emerging_center_confidence,
                'dailyEvidence', v_existing_snapshot.daily_evidence,
                'algorithmState', v_existing_snapshot.algorithm_state,
                'evidenceCount', v_existing_snapshot.evidence_count,
                'taxonomyVersion', v_existing_snapshot.taxonomy_version,
                'evidenceModelVersion', v_existing_snapshot.evidence_model_version,
                'calculationVersion', v_existing_snapshot.calculation_version
            );
        END IF;

        IF FOUND THEN
            RAISE EXCEPTION 'DAY_COMPLETE_PAYLOAD_MISMATCH' USING ERRCODE = 'P0001';
        END IF;

        RAISE EXCEPTION 'DAY_ALREADY_CLOSED' USING ERRCODE = 'P0001';
    END IF;

    IF p_game_day <> v_processed_through_day + 1 THEN
        RAISE EXCEPTION 'DAY_NOT_OPEN' USING ERRCODE = 'P0001';
    END IF;

    IF p_last_seq < v_last_processed_seq THEN
        RAISE EXCEPTION 'DAY_COMPLETE_INVALID_LAST_SEQ' USING ERRCODE = 'P0001';
    END IF;

    SELECT array_agg(expected.seq ORDER BY expected.seq)
    INTO v_missing_seq
    FROM generate_series(v_last_processed_seq + 1, p_last_seq) AS expected(seq)
    LEFT JOIN character_events e
      ON e.character_id = p_character_id
     AND e.seq = expected.seq
     AND e.game_day = p_game_day
    WHERE e.seq IS NULL;

    IF v_missing_seq IS NOT NULL AND cardinality(v_missing_seq) > 0 THEN
        RAISE EXCEPTION 'DAY_EVENTS_INCOMPLETE:%', array_to_string(v_missing_seq, ',')
            USING ERRCODE = 'P0001';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM character_events
        WHERE character_id = p_character_id
          AND game_day = p_game_day
          AND seq > p_last_seq
    ) THEN
        RAISE EXCEPTION 'DAY_COMPLETE_LAST_SEQ_TOO_LOW' USING ERRCODE = 'P0001';
    END IF;

    WITH evidence_rows AS (
        SELECT
            ce.evidence,
            COALESCE(NULLIF(ce.evidence->>'developmentWeight', '')::numeric, 1) AS weight
        FROM character_events e
        JOIN choice_evidence ce
          ON ce.choice_id = e.choice_id
         AND ce.evidence_model_version = v_evidence_model_version
         AND ce.taxonomy_version = v_taxonomy_version
        WHERE e.character_id = p_character_id
          AND e.game_day = p_game_day
          AND e.seq > v_last_processed_seq
          AND e.seq <= p_last_seq
          AND jsonb_typeof(ce.evidence->'vector') = 'object'
    ),
    components AS (
        SELECT
            component.key,
            SUM((component.value #>> '{}')::numeric * evidence_rows.weight) AS weighted_value
        FROM evidence_rows
        CROSS JOIN LATERAL jsonb_each(evidence_rows.evidence->'vector') AS component(key, value)
        GROUP BY component.key
    )
    SELECT
        COALESCE(jsonb_object_agg(key, weighted_value), '{}'::jsonb),
        COALESCE((SELECT SUM(weight) FROM evidence_rows), 0),
        COALESCE((SELECT COUNT(*) FROM evidence_rows), 0)
    INTO v_daily_totals, v_daily_weight, v_daily_evidence_count
    FROM components;

    v_previous_totals := COALESCE(v_algorithm_state->'weightedTotals', '{}'::jsonb);
    v_previous_weight := COALESCE(NULLIF(v_algorithm_state->>'totalWeight', '')::numeric, 0);
    v_total_weight := v_previous_weight + v_daily_weight;

    FOR v_key, v_value IN
        SELECT key, SUM(value)
        FROM (
            SELECT key, (value #>> '{}')::numeric AS value
            FROM jsonb_each(v_previous_totals)
            UNION ALL
            SELECT key, (value #>> '{}')::numeric AS value
            FROM jsonb_each(v_daily_totals)
        ) combined
        GROUP BY key
    LOOP
        v_combined_totals := v_combined_totals || jsonb_build_object(v_key, v_value);
        IF v_total_weight > 0 THEN
            v_center_scores := v_center_scores || jsonb_build_object(v_key, v_value / v_total_weight);
        END IF;
    END LOOP;

    v_algorithm_state := jsonb_build_object(
        'weightedTotals', v_combined_totals,
        'totalWeight', v_total_weight
    );

    INSERT INTO character_development_snapshots(
        character_id,
        game_day,
        taxonomy_version,
        evidence_model_version,
        calculation_version,
        profile_status,
        center_scores,
        current_center,
        current_center_confidence,
        emerging_center,
        emerging_center_confidence,
        daily_evidence,
        algorithm_state,
        evidence_count,
        last_seq
    ) VALUES (
        p_character_id,
        p_game_day,
        v_taxonomy_version,
        v_evidence_model_version,
        v_calculation_version,
        v_profile_status,
        v_center_scores,
        v_current_center,
        v_current_center_confidence,
        v_emerging_center,
        v_emerging_center_confidence,
        v_daily_totals,
        v_algorithm_state,
        v_existing_evidence_count + v_daily_evidence_count,
        p_last_seq
    );

    UPDATE character_development_state
    SET center_scores = v_center_scores,
        algorithm_state = v_algorithm_state,
        evidence_count = v_existing_evidence_count + v_daily_evidence_count,
        processed_through_day = p_game_day,
        last_processed_seq = p_last_seq,
        updated_at = now()
    WHERE character_id = p_character_id;

    UPDATE character_game_state
    SET current_game_day = p_game_day + 1,
        last_seq = GREATEST(last_seq, p_last_seq),
        updated_at = now()
    WHERE character_id = p_character_id;

    RETURN jsonb_build_object(
        'status', 'completed',
        'gameDay', p_game_day,
        'lastSeq', p_last_seq,
        'profileStatus', v_profile_status,
        'centerScores', v_center_scores,
        'currentCenter', v_current_center,
        'currentCenterConfidence', v_current_center_confidence,
        'emergingCenter', v_emerging_center,
        'emergingCenterConfidence', v_emerging_center_confidence,
        'dailyEvidence', v_daily_totals,
        'algorithmState', v_algorithm_state,
        'evidenceCount', v_existing_evidence_count + v_daily_evidence_count,
        'taxonomyVersion', v_taxonomy_version,
        'evidenceModelVersion', v_evidence_model_version,
        'calculationVersion', v_calculation_version
    );
END;
$$;

COMMIT;

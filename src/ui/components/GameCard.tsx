import { m, useMotionValue, useTransform, useReducedMotion } from 'framer-motion';
import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { Choice } from '../../engine/types';
import type { DrawResult } from '../../engine/draw';
import { characterName } from '../gameUi';

interface GameCardProps {
  draw: DrawResult;
  onChoose: (choiceId: string) => void;
  onPreviewChoice: (choice?: Choice) => void;
  busy: boolean;
}

type Side = 'left' | 'right';

type SceneArt =
  | 'workshop-dawn'
  | 'workshop-dusk'
  | 'kiln-firing'
  | 'market-fair'
  | 'market-empty'
  | 'country-road'
  | 'river-bridge'
  | 'courtyard'
  | 'kitchen-home'
  | 'storage'
  | 'village-street'
  | 'night-room';

/**
 * Important authored scenes are mapped by stable card id.
 * This is intentionally more specific than keyword matching: the same words
 * can appear in different dramatic contexts, while a card id keeps its visual
 * setting stable across copy edits.
 */
const CARD_SCENE_ART: Partial<Record<string, SceneArt>> = {
  // Chapter 1
  c1_alexey_broken_jug: 'workshop-dawn',
  c1_wounded_road: 'country-road',
  c1_extra_change: 'market-fair',
  c1_marta_firewood: 'courtyard',
  c1_alexey_bad_work: 'kiln-firing',
  c1_liya_letter: 'night-room',
  c1_market_spot: 'market-fair',
  c1_rain_delivery: 'workshop-dusk',
  c1_old_bowl: 'river-bridge',
  c1_customer_hurry: 'courtyard',
  c1_neighbor_noise: 'workshop-dawn',
  c1_last_clay: 'market-fair',
  c1_alexey_after_jug: 'kiln-firing',
  c1_wanderer_returns: 'workshop-dawn',
  c1_wanderer_bridge: 'river-bridge',
  c1_timon_returns: 'market-fair',
  c1_liya_second_letter: 'night-room',

  // Chapter 2
  c2_stones_bag: 'courtyard',
  c2_timon_joint_order: 'market-fair',
  c2_liya_arrives: 'workshop-dawn',
  c2_bridge_repair: 'workshop-dusk',
  c2_old_master_tools: 'storage',
  c2_shadow_attention: 'river-bridge',
  c2_shadow_honesty: 'storage',
  c2_shadow_compassion: 'kitchen-home',
  c2_shadow_letgo: 'workshop-dawn',
  c2_shadow_courage: 'country-road',
  c2_silence_marta_cup: 'kitchen-home',
  c2_silence_alexey_hand: 'workshop-dusk',
  c2_silence_market_pause: 'market-empty',
  c2_gaze_wanderer_bread: 'village-street',
  c2_gaze_marta_window: 'village-street',
  c2_gaze_alexey_silence: 'workshop-dusk',
  c2_ilya_after_forgive: 'courtyard',
  c2_ilya_leaves: 'country-road',
  c2_timon_order_result: 'market-fair',
  c2_alexey_tools_result: 'workshop-dawn',
  c2_marta_window_result: 'night-room',

  // Recurring situations and crisis cards
  r_sweep: 'workshop-dawn',
  r_breakfast: 'kitchen-home',
  r_market_price: 'market-fair',
  r_marta_hello: 'courtyard',
  r_kiln: 'kiln-firing',
  r_coins: 'storage',
  r_river: 'river-bridge',
  r_letter_stack: 'night-room',
  r_customer_wait: 'workshop-dusk',
  r_evening_light: 'courtyard',
  cr_wealth_zero: 'storage',
  cr_wealth_full: 'workshop-dusk',
  cr_strength_zero: 'workshop-dusk',
  cr_peace_zero: 'night-room',
  cr_bonds_zero: 'workshop-dusk',

  // Continuation / development arc
  d11_0_apprentice: 'market-empty',
  d11_3_apprentice: 'market-empty',
  d12_0_pace: 'workshop-dawn',
  d12_3_pace: 'workshop-dawn',
  d13_0_commitments: 'kitchen-home',
  d13_3_commitments: 'kitchen-home',
  d14_0_apprentice: 'workshop-dawn',
  d14_3_apprentice: 'workshop-dawn',
  d15_0_pace: 'kitchen-home',
  d15_3_pace: 'kitchen-home',
  d16_0_commitments: 'courtyard',
  d16_3_commitments: 'courtyard',
  d17_0_apprentice: 'kiln-firing',
  d17_3_apprentice: 'kiln-firing',
  d18_0_pace: 'workshop-dusk',
  d18_3_pace: 'workshop-dawn',
  d19_0_commitments: 'kitchen-home',
  d19_3_commitments: 'kitchen-home',
  d20_0_apprentice: 'workshop-dawn',
  d20_3_apprentice: 'workshop-dawn',
  d21_0_pace: 'kitchen-home',
  d21_3_pace: 'kiln-firing',
  d22_0_apprentice: 'workshop-dawn',
  d22_3_apprentice: 'workshop-dawn',
  d23_0_commitments: 'kitchen-home',
  d23_3_commitments: 'kitchen-home',
  d24_0_pace: 'workshop-dusk',
  d24_3_pace: 'workshop-dawn',
  d25_0_apprentice: 'workshop-dawn',
  d25_3_apprentice: 'workshop-dawn',
  d26_0_commitments: 'storage',
  d26_3_commitments: 'country-road',
  d27_0_pace: 'kitchen-home',
  d27_3_pace: 'kitchen-home',
  d28_0_apprentice: 'workshop-dawn',
  d28_3_apprentice: 'workshop-dawn',
  d29_0_commitments: 'courtyard',
  d29_3_commitments: 'night-room',
  d30_0_pace: 'kitchen-home',
  d30_3_pace: 'market-empty',

  // Diagnostic / neutral situations: fixed to their actual setting
  'neutral.work.01': 'kiln-firing',
  'neutral.work.02': 'kiln-firing',
  'neutral.work.03': 'market-fair',
  'neutral.work.04': 'market-fair',
  'neutral.work.05': 'kiln-firing',
  'neutral.work.06': 'village-street',
  'neutral.work.07': 'workshop-dawn',
  'neutral.work.08': 'kiln-firing',
  'neutral.relationships.01': 'courtyard',
  'neutral.relationships.02': 'kitchen-home',
  'neutral.relationships.03': 'market-fair',
  'neutral.relationships.04': 'kitchen-home',
  'neutral.relationships.05': 'night-room',
  'neutral.relationships.06': 'workshop-dawn',
  'neutral.relationships.07': 'workshop-dusk',
  'neutral.relationships.08': 'courtyard',
  'neutral.body.01': 'courtyard',
  'neutral.body.02': 'workshop-dusk',
  'neutral.body.03': 'river-bridge',
  'neutral.body.04': 'river-bridge',
  'neutral.body.05': 'night-room',
  'neutral.body.06': 'kitchen-home',
  'neutral.body.07': 'night-room',
  'neutral.body.08': 'kitchen-home',
  'neutral.inner.01': 'village-street',
  'neutral.inner.02': 'market-empty',
  'neutral.inner.03': 'night-room',
  'neutral.inner.04': 'courtyard',
  'neutral.inner.05': 'kiln-firing',
  'neutral.inner.06': 'night-room',
  'neutral.inner.07': 'river-bridge',
  'neutral.inner.08': 'night-room',
  'neutral.behavior.work.01': 'market-fair',
  'neutral.behavior.relationships.01': 'night-room',
  'neutral.behavior.body.01': 'workshop-dawn',
  'neutral.behavior.inner.01': 'night-room',

  // Short diagnostic probes
  'probe.od.01': 'kiln-firing',
  'probe.od.02': 'market-fair',
  'probe.od.03': 'country-road',
  'probe.de.01': 'kiln-firing',
  'probe.de.02': 'kiln-firing',
  'probe.de.03': 'country-road',
  'probe.ea.01': 'market-fair',
  'probe.ea.02': 'market-fair',
  'probe.ea.03': 'market-fair',
  'probe.ai.01': 'village-street',
  'probe.ai.02': 'market-fair',
  'probe.ai.03': 'night-room',
  'probe.is.01': 'kitchen-home',
  'probe.is.02': 'workshop-dawn',
  'probe.is.03': 'night-room',
  'probe.sa.01': 'workshop-dawn',
  'probe.sa.02': 'courtyard',
  'probe.sa.03': 'village-street',
  'probe.alir.01': 'courtyard',
  'probe.alir.02': 'kiln-firing',
  'probe.alir.03': 'storage',

  // Development arc cards
  'dev.od.trial.01': 'kiln-firing',
  'dev.od.consequence.01': 'workshop-dawn',
  'dev.od.review.01': 'night-room',
  'dev.od.transfer.01': 'village-street',
  'dev.od.pressure.01': 'market-fair',
  'dev.od.retry.01': 'night-room',
  'dev.od.retry-trial.01': 'workshop-dawn',
  'dev.od.retry-review.01': 'night-room',
  'dev.od.retry-transfer.01': 'courtyard',
  'dev.de.trial.01': 'kiln-firing',
  'dev.de.consequence.01': 'workshop-dawn',
  'dev.de.review.01': 'night-room',
  'dev.de.transfer.01': 'workshop-dusk',
  'dev.de.pressure.01': 'village-street',
  'dev.de.retry.01': 'kitchen-home',
  'dev.de.retry-trial.01': 'storage',
  'dev.de.retry-consequence.01': 'kiln-firing',
  'dev.de.retry-transfer.01': 'storage',
  'dev.ai.trial.01': 'village-street',
  'dev.ai.consequence.01': 'kitchen-home',
  'dev.ai.review.01': 'night-room',
  'dev.ai.transfer.01': 'night-room',
  'dev.ai.pressure.01': 'market-fair',
  'dev.ai.retry.01': 'kitchen-home',
  'dev.ai.retry-trial.01': 'market-fair',
  'dev.ai.retry-transfer.01': 'kitchen-home',
  'dev.is.trial.01': 'courtyard',
  'dev.is.consequence.01': 'courtyard',
  'dev.is.review.01': 'night-room',
  'dev.is.transfer.01': 'storage',
  'dev.is.pressure.01': 'workshop-dusk',
  'dev.is.retry.01': 'night-room',
  'dev.is.retry-trial.01': 'village-street',
  'dev.is.retry-transfer.01': 'night-room',
  'dev.sa.trial.01': 'workshop-dawn',
  'dev.sa.consequence.01': 'village-street',
  'dev.sa.review.01': 'night-room',
  'dev.sa.transfer.01': 'courtyard',
  'dev.sa.pressure.01': 'market-fair',
  'dev.sa.retry.01': 'kitchen-home',
  'dev.sa.retry-trial.01': 'courtyard',
  'dev.sa.retry-transfer.01': 'courtyard',
  'dev.alir.trial.01': 'courtyard',
  'dev.alir.consequence.01': 'courtyard',
  'dev.alir.review.01': 'night-room',
  'dev.alir.transfer.01': 'kiln-firing',
  'dev.alir.pressure.01': 'village-street',
  'dev.alir.retry.01': 'kitchen-home',
  'dev.alir.retry-trial.01': 'market-fair',
  'dev.alir.retry-transfer.01': 'night-room',

  // Development production cards
  dev_retry_1: 'storage',
  dev_retry_1_review: 'night-room',
  dev_retry_2: 'country-road',
  dev_retry_2_review: 'night-room',
  dev_retry_3: 'market-fair',
  dev_retry_3_review: 'night-room',
  dev_achiever_1: 'workshop-dusk',
  dev_achiever_2: 'market-fair',
  dev_achiever_3: 'night-room',
  dev_achiever_4: 'workshop-dawn',

  // Repeated encounter beats
  enc_3_0: 'night-room',
  enc_3_2: 'courtyard',
  enc_3_3: 'workshop-dawn',
  enc_3_5: 'country-road',
  enc_3_6: 'night-room',
  enc_3_8: 'country-road',
  enc_3_11: 'courtyard',
  enc_4_0: 'night-room',
  enc_4_2: 'courtyard',
  enc_4_3: 'workshop-dawn',
  enc_4_5: 'country-road',
  enc_4_6: 'night-room',
  enc_4_8: 'country-road',
  enc_4_11: 'courtyard'
};

function sceneArtForCard(draw: DrawResult): SceneArt {
  const authoredScene = CARD_SCENE_ART[draw.card.id];
  if (authoredScene) return authoredScene;

  const text = [draw.text, ...draw.choices.map((choice) => choice.label)]
    .join(' ')
    .toLocaleLowerCase('ru-RU');

  // More specific places first; generic time-of-day words come last.
  if (/(пуст(ая|ой|о)?\s+(лавк|рын)|после\s+ярмарк|ярмарка\s+(законч|закрыл))/u.test(text)) return 'market-empty';
  if (/(склад|запас|хранил|ящик|мешок|мешк|коробк|топлив|сырь|глин[аыуеой])/u.test(text)) return 'storage';
  if (/(печь|обжиг|горн|жар|угл|раскал|огонь|топить\s+печь)/u.test(text)) return 'kiln-firing';
  if (/(ярмарк|рынок|торг|покупател|прилав|продав|заказчик|выручк|монет|цена)/u.test(text)) return 'market-fair';
  if (/(река|берег|мост|вод[аыуе]|переправ|лодоч)/u.test(text)) return 'river-bridge';
  if (/(дорог|за\s+город|тракт|путник|повозк|телег|отъезд|доставк|ехать|уехать|путь)/u.test(text)) return 'country-road';
  if (/(двор|сосед|крыша|калит|ворот|колодец)/u.test(text)) return 'courtyard';
  if (/(кухн|ужин|обед|завтрак|хлеб|еда|за\s+стол|столом|повар)/u.test(text)) return 'kitchen-home';
  if (/(улиц|город|фонар|у\s+стены|лавк|окно\s+марты)/u.test(text)) return 'village-street';
  if (/(ноч|лун|свеч|письм|дневник|записк|тишин|размышл)/u.test(text)) return 'night-room';
  if (/(вечер|поздн|сумерк|закат)/u.test(text)) return 'workshop-dusk';
  if (/(утро|рассвет)/u.test(text)) return 'workshop-dawn';

  // Facets are only the last fallback, never the primary art direction.
  if (draw.card.facets?.includes('inner')) return 'night-room';
  if (draw.card.facets?.includes('relationships')) return 'courtyard';
  if (draw.card.facets?.includes('body')) return 'workshop-dawn';
  return 'workshop-dawn';
}

function CardArt({ draw }: { draw: DrawResult }) {
  const scene = sceneArtForCard(draw);
  return <div
    className="card-art card-art-scene"
    data-character={draw.card.character ?? 'city'}
    data-scene={scene}
    style={{ backgroundImage: `url(${import.meta.env.BASE_URL}art/backgrounds/${scene}.webp)` }}
    aria-hidden="true"
  >
    <span className="character-monogram">{characterName(draw.card.character).slice(0, 1)}</span>
  </div>;
}

/** Two choices keep the swipe pair; three or four are listed in their authored order (the order carries no meaning). */
export function GameCard(props: GameCardProps) {
  return props.draw.choices.length === 2 ? <SwipeCard {...props} /> : <ListCard {...props} />;
}

function ListCard({ draw, onChoose, onPreviewChoice, busy }: GameCardProps) {
  const [locked, setLocked] = useState(false);
  const committed = useRef(false);
  const commit = (choiceId: string) => {
    if (committed.current || busy) return;
    committed.current = true; setLocked(true); onPreviewChoice(undefined); onChoose(choiceId);
  };
  function handleKeyboard(event: KeyboardEvent<HTMLDivElement>) {
    const index = Number(event.key) - 1;
    const choice = Number.isInteger(index) ? draw.choices[index] : undefined;
    if (choice) { event.preventDefault(); commit(choice.id); }
  }
  return (
    <div className="card-stage card-stage-list" onKeyDown={handleKeyboard}>
      <div className="game-card game-card-list" tabIndex={0} role="group" aria-label={`Ситуация. ${draw.text}`}>
        <CardArt draw={draw} />
        <div className="card-copy">
          <p className="card-character">{characterName(draw.card.character)}</p>
          <p className="card-text">{draw.text}</p>
        </div>
      </div>
      <ol className="choice-list" aria-label="Варианты выбора">
        {draw.choices.map((choice, index) => (
          <li key={choice.id}>
            <button type="button" className="choice-button choice-button-list" disabled={locked || busy}
              onPointerEnter={() => onPreviewChoice(choice)} onPointerLeave={() => onPreviewChoice(undefined)}
              onFocus={() => onPreviewChoice(choice)} onBlur={() => onPreviewChoice(undefined)} onClick={() => commit(choice.id)}>
              <span className="choice-number" aria-hidden="true">{index + 1}</span>
              <span className="choice-text">{choice.label}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

function SwipeCard({ draw, onChoose, onPreviewChoice, busy }: GameCardProps) {
  const reducedMotion = useReducedMotion();
  const x = useMotionValue(0);
  const committed = useRef(false);
  const rotate = useTransform(x, [-220, 0, 220], [-9, 0, 9]);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [previewSide, setPreviewSide] = useState<Side | null>(null);
  const [locked, setLocked] = useState(false);

  const leftChoice = useMemo(
    () => draw.choices.find((choice) => choice.id === draw.leftChoiceId)!,
    [draw]
  );
  const rightChoice = useMemo(
    () => draw.choices.find((choice) => choice.id === draw.rightChoiceId)!,
    [draw]
  );

  function preview(side: Side | null) {
    setPreviewSide(side);
    onPreviewChoice(side === 'left' ? leftChoice : side === 'right' ? rightChoice : undefined);
  }

  function commit(side: Side) {
    if (committed.current || busy) return;
    committed.current = true;
    setLocked(true);
    const choice = side === 'left' ? leftChoice : rightChoice;
    onPreviewChoice(undefined);
    onChoose(choice.id);
  }

  function handleKeyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      commit('left');
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      commit('right');
    }
  }

  return (
    <div className="card-stage">
      <div className={`choice-label choice-label-left ${previewSide === 'left' ? 'visible' : ''}`}>
        {leftChoice.label}
      </div>
      <div className={`choice-label choice-label-right ${previewSide === 'right' ? 'visible' : ''}`}>
        {rightChoice.label}
      </div>

      <m.div
        ref={cardRef}
        className="game-card"
        style={{ x, rotate: reducedMotion ? 0 : rotate }}
        drag={locked || busy ? false : 'x'}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.82}
        whileDrag={{ scale: reducedMotion ? 1 : 1.015 }}
        onDrag={(_event: unknown, info: { offset: { x: number } }) => {
          if (info.offset.x < -24) preview('left');
          else if (info.offset.x > 24) preview('right');
          else preview(null);
        }}
        onDragEnd={(_event: unknown, info: { offset: { x: number } }) => {
          const width = cardRef.current?.getBoundingClientRect().width ?? 320;
          const threshold = width * 0.35;
          if (info.offset.x <= -threshold) commit('left');
          else if (info.offset.x >= threshold) commit('right');
          else preview(null);
        }}
        onKeyDown={handleKeyboard}
        tabIndex={0}
        role="group"
        aria-label={`Ситуация. ${draw.text}`}
      >
        <CardArt draw={draw} />
        <div className="card-copy">
          <p className="card-character">{characterName(draw.card.character)}</p>
          <p className="card-text">{draw.text}</p>
        </div>
      </m.div>

      <div className="choice-buttons" aria-label="Варианты выбора">
        <button
          type="button"
          className="choice-button"
          disabled={locked || busy}
          onPointerEnter={() => preview('left')}
          onPointerLeave={() => preview(null)}
          onFocus={() => preview('left')}
          onBlur={() => preview(null)}
          onClick={() => commit('left')}
        >
          <span aria-hidden="true">←</span> {leftChoice.label}
        </button>
        <button
          type="button"
          className="choice-button"
          disabled={locked || busy}
          onPointerEnter={() => preview('right')}
          onPointerLeave={() => preview(null)}
          onFocus={() => preview('right')}
          onBlur={() => preview(null)}
          onClick={() => commit('right')}
        >
          {rightChoice.label} <span aria-hidden="true">→</span>
        </button>
      </div>
    </div>
  );
}

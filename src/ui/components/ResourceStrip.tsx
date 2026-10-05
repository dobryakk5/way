import type { Choice, GameState, Resource } from '../../engine/types';
import { impactForChoice } from '../gameUi';
import { ResourceBar } from './ResourceBar';

const resources: Resource[] = ['wealth', 'strength', 'peace', 'bonds'];

interface ResourceStripProps {
  game: GameState;
  previewChoice: Choice | undefined;
}

export function ResourceStrip({ game, previewChoice }: ResourceStripProps) {
  const preview = previewChoice ? impactForChoice(previewChoice) : {};

  return (
    <div className="resource-strip" aria-label="Ресурсы героя">
      {resources.map((resource) => (
        <ResourceBar
          key={resource}
          resource={resource}
          value={game.resources[resource]}
          previewDelta={preview[resource]}
        />
      ))}
    </div>
  );
}

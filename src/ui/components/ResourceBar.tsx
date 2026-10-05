import type { Resource } from '../../engine/types';
import { impactDotCount, resourceUi } from '../gameUi';

interface ResourceBarProps {
  resource: Resource;
  value: number;
  previewDelta: number | undefined;
}

export function ResourceBar({ resource, value, previewDelta }: ResourceBarProps) {
  const meta = resourceUi[resource];
  const dotCount = previewDelta ? impactDotCount(previewDelta) : 0;

  return (
    <div className="resource" aria-label={`${meta.label}: ${value} из 100`}>
      <div className="impact-dots" aria-hidden="true">
        {Array.from({ length: dotCount }, (_, index) => (
          <span key={index} />
        ))}
      </div>
      <div className="resource-icon" aria-hidden="true">{meta.symbol}</div>
      <div className="resource-track" aria-hidden="true">
        <span style={{ height: `${value}%` }} />
      </div>
      <span className="resource-label">{meta.label}</span>
    </div>
  );
}

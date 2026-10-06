export type FacetIconId =
  | 'money'
  | 'relationships'
  | 'work'
  | 'health'
  | 'meaning'
  | 'family'
  | 'freedom'
  | 'responsibility';

const positions: Record<FacetIconId, string> = {
  money: '0% 0%',
  relationships: '33.333% 0%',
  work: '66.667% 0%',
  health: '100% 0%',
  meaning: '0% 100%',
  family: '33.333% 100%',
  freedom: '66.667% 100%',
  responsibility: '100% 100%'
};

export function FacetIcon({id,className=''}:{id:FacetIconId;className?:string}) {
  return <span
    className={`facet-icon ${className}`}
    style={{
      backgroundImage: `url(${import.meta.env.BASE_URL}art/facets/facet-icons.webp)`,
      backgroundPosition: positions[id]
    }}
    aria-hidden="true"
  />;
}

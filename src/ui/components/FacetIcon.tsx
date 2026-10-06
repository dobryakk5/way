export type FacetIconId = 'work' | 'relationships' | 'body' | 'inner';

const paths: Record<FacetIconId, JSX.Element> = {
  work: <><path d="M7 10.5h10v8H7z"/><path d="M9.5 10.5V8.2c0-1 .8-1.7 1.8-1.7h1.4c1 0 1.8.7 1.8 1.7v2.3"/><path d="M7 13.5h10"/><circle cx="12" cy="13.5" r=".8"/></>,
  relationships: <><path d="M12 19s-6.5-3.8-6.5-8.2A3.3 3.3 0 0 1 12 9a3.3 3.3 0 0 1 6.5 1.8C18.5 15.2 12 19 12 19z"/><path d="M9.2 10.8c.8.2 1.7.8 2.8 1.8 1.1-1 2-1.6 2.8-1.8"/></>,
  body: <><path d="M12 4.8c-2 2.4-4 4.6-4 7.5a4 4 0 0 0 8 0c0-2.9-2-5.1-4-7.5z"/><path d="M9.8 14c.5.8 1.2 1.2 2.2 1.2"/><path d="M6.5 19h11"/></>,
  inner: <><circle cx="12" cy="12" r="6.2"/><path d="M12 7.2v9.6M7.2 12h9.6"/><path d="M8.7 8.7l6.6 6.6M15.3 8.7l-6.6 6.6"/></>
};

export function FacetIcon({id,className=''}:{id:FacetIconId;className?:string}) {
  return <span className={`facet-icon ${className}`} aria-hidden="true">
    <svg viewBox="0 0 24 24" focusable="false">{paths[id]}</svg>
  </span>;
}

import type { Musician, Band } from '../types/graph';

interface MusicianDetailPanelProps {
  musician: Musician;
  bandsById: Map<string, Band>;
  onSelectBand: (bandId: string) => void;
  onClose: () => void;
}

export default function MusicianDetailPanel({ musician, bandsById, onSelectBand, onClose }: MusicianDetailPanelProps) {
  return (
    <div className="detail-panel">
      <button className="close-btn" onClick={onClose} aria-label="Close">
        &times;
      </button>
      <h2>
        {musician.name}
        {musician.name_native && <span className="alt-name"> ({musician.name_native})</span>}
      </h2>
      <a className="source-link" href={musician.source_url} target="_blank" rel="noopener noreferrer">
        View on vk.gy &#8599;
      </a>
      {musician.stub && <p className="stub-note">Referenced but not fully crawled - limited data available.</p>}
      {musician.bio && <p className="bio">{musician.bio}</p>}
      <h3>Band history</h3>
      <ol className="career-list">
        {musician.career.map((stop) => {
          const band = bandsById.get(stop.band_id);
          return (
            <li key={stop.era_index}>
              <button className="link-button" onClick={() => onSelectBand(stop.band_id)}>
                {band ? band.name : stop.band_id}
              </button>
              {stop.instrument && <span className="instrument"> &mdash; {stop.instrument}</span>}
            </li>
          );
        })}
      </ol>
      {musician.career.length === 1 && (
        <p className="hint">Only one known band on record - no transitions to highlight.</p>
      )}
    </div>
  );
}

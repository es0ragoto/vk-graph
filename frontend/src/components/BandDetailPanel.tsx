import type { Band, Musician } from '../types/graph';
import { INCOMING_EDGE_COLOR, OUTGOING_EDGE_COLOR } from '../lib/edgeColors';

interface BandDetailPanelProps {
  band: Band;
  members: Musician[];
  onSelectMusician: (musicianId: string) => void;
  onClose: () => void;
}

function instrumentsForBand(musician: Musician, bandId: string): string {
  // A musician can have multiple separate stints in the same band (left and rejoined);
  // dedupe so a repeated identical instrument doesn't show up twice.
  const instruments = [
    ...new Set(
      musician.career
        .filter((c) => c.band_id === bandId)
        .map((c) => c.instrument)
        .filter((i): i is string => Boolean(i)),
    ),
  ];
  return instruments.join(', ');
}

export default function BandDetailPanel({ band, members, onSelectMusician, onClose }: BandDetailPanelProps) {
  return (
    <div className="detail-panel">
      <button className="close-btn" onClick={onClose} aria-label="Close">
        &times;
      </button>
      <h2>
        {band.name}
        {band.name_native && <span className="alt-name"> ({band.name_native})</span>}
      </h2>
      <a className="source-link" href={band.source_url} target="_blank" rel="noopener noreferrer">
        View on vk.gy &#8599;
      </a>
      {band.stub && <p className="stub-note">Referenced but not fully crawled - limited data available.</p>}
      <p className="meta-line">
        {band.formed_year ?? '?'}&ndash;{band.disbanded_year ?? 'present'}
      </p>
      <p className="edge-legend">
        <span className="legend-dot" style={{ backgroundColor: INCOMING_EDGE_COLOR }} /> incoming
        <span className="legend-dot" style={{ backgroundColor: OUTGOING_EDGE_COLOR }} /> outgoing
      </p>
      <h3>Members ({members.length})</h3>
      <ul className="member-list">
        {members.map((m) => (
          <li key={m.id}>
            <button className="link-button" onClick={() => onSelectMusician(m.id)}>
              {m.name}
              {m.name_native ? ` (${m.name_native})` : ''}
            </button>
            {instrumentsForBand(m, band.id) && <span className="instrument"> &mdash; {instrumentsForBand(m, band.id)}</span>}
            {m.edge_ids.length === 0 && <span className="hint-tag"> only band</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

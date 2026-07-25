import { useMemo, useState } from 'react';
import type { GraphExport } from '../types/graph';

interface SearchResult {
  type: 'band' | 'musician';
  id: string;
  label: string;
}

interface SearchBoxProps {
  graph: GraphExport;
  onSelectBand: (bandId: string) => void;
  onSelectMusician: (musicianId: string) => void;
}

export default function SearchBox({ graph, onSelectBand, onSelectMusician }: SearchBoxProps) {
  const [query, setQuery] = useState('');

  const results: SearchResult[] = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) return [];
    const q = trimmed.toLowerCase();
    const matches = (name: string, nameNative: string | null) =>
      name.toLowerCase().includes(q) || (nameNative ? nameNative.includes(trimmed) : false);

    const bandResults: SearchResult[] = graph.bands
      .filter((b) => matches(b.name, b.name_native))
      .slice(0, 6)
      .map((b) => ({ type: 'band', id: b.id, label: b.name }));
    const musicianResults: SearchResult[] = graph.musicians
      .filter((m) => matches(m.name, m.name_native))
      .slice(0, 6)
      .map((m) => ({ type: 'musician', id: m.id, label: m.name }));
    return [...bandResults, ...musicianResults].slice(0, 10);
  }, [query, graph]);

  return (
    <div className="search-box">
      <input
        type="text"
        placeholder="Search bands or musicians..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {results.length > 0 && (
        <ul className="search-results">
          {results.map((r) => (
            <li key={`${r.type}-${r.id}`}>
              <button
                className="link-button"
                onClick={() => {
                  if (r.type === 'band') onSelectBand(r.id);
                  else onSelectMusician(r.id);
                  setQuery('');
                }}
              >
                {r.label} <span className="result-type">({r.type})</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import type { GraphExport } from './types/graph';
import { loadGraph } from './lib/loadGraph';
import { buildGraphIndex } from './lib/graphIndex';
import { useSelection } from './lib/useSelection';
import { expandWithBandNeighbors, expandWithMusicianPath, allRealBandIds } from './lib/focus';
import { loadGraphSettings, saveGraphSettings, type GraphSettings } from './lib/graphSettings';
import GraphView from './components/GraphView';
import BandDetailPanel from './components/BandDetailPanel';
import MusicianDetailPanel from './components/MusicianDetailPanel';
import SearchBox from './components/SearchBox';
import DisplaySettingsPanel from './components/DisplaySettingsPanel';
import './App.css';

export default function App() {
  const [graph, setGraph] = useState<GraphExport | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [visibleBandIds, setVisibleBandIds] = useState<Set<string> | null>(null);
  const [settings, setSettings] = useState<GraphSettings>(() => loadGraphSettings());

  const handleSettingsChange = (next: GraphSettings) => {
    setSettings(next);
    saveGraphSettings(next);
  };

  useEffect(() => {
    loadGraph()
      .then(setGraph)
      .catch((err: unknown) => setLoadError(err instanceof Error ? err.message : String(err)));
  }, []);

  const index = useMemo(() => (graph ? buildGraphIndex(graph) : null), [graph]);

  useEffect(() => {
    if (index && visibleBandIds === null) {
      setVisibleBandIds(allRealBandIds(index));
    }
  }, [index, visibleBandIds]);

  const { selection, selectBand, selectMusician, clearSelection, highlights } = useSelection(index);

  if (loadError) {
    return (
      <div className="status-screen">
        <p>Couldn't load graph data: {loadError}</p>
        <p className="hint">Expected a graph.json at /data/graph.json (see frontend/public/data/).</p>
      </div>
    );
  }

  if (!graph || !index || !visibleBandIds) {
    return (
      <div className="status-screen">
        <p>Loading graph...</p>
      </div>
    );
  }

  const handleSelectBand = (bandId: string) => {
    selectBand(bandId);
    setVisibleBandIds((prev) => expandWithBandNeighbors(prev ?? new Set(), bandId, index));
  };

  const handleSelectMusician = (musicianId: string) => {
    selectMusician(musicianId);
    setVisibleBandIds((prev) => expandWithMusicianPath(prev ?? new Set(), musicianId, index));
  };

  const handleSelectEdge = (edgeId: string) => {
    const edge = index.edgesById.get(edgeId);
    if (edge) handleSelectMusician(edge.musician_id);
  };

  const handleShowAll = () => setVisibleBandIds(allRealBandIds(index));

  const selectedBand = selection?.type === 'band' ? index.bandsById.get(selection.id) ?? null : null;
  const selectedMusician = selection?.type === 'musician' ? index.musiciansById.get(selection.id) ?? null : null;

  const realBandCount = graph.bands.filter((b) => !b.stub).length;
  const visibleRealCount = [...visibleBandIds].filter((id) => !index.bandsById.get(id)?.stub).length;
  const visibleStubCount = visibleBandIds.size - visibleRealCount;

  return (
    <div className="app-layout">
      <div className="graph-pane">
        <GraphView
          graph={graph}
          visibleBandIds={visibleBandIds}
          highlightedBandIds={highlights.highlightedBandIds}
          highlightedEdgeIds={highlights.highlightedEdgeIds}
          fadeOthers={highlights.fadeOthers}
          settings={settings}
          onSelectBand={handleSelectBand}
          onSelectEdge={handleSelectEdge}
        />
      </div>
      <aside className="sidebar">
        <h1>Band Graph</h1>
        <SearchBox graph={graph} onSelectBand={handleSelectBand} onSelectMusician={handleSelectMusician} />
        <button className="show-all-btn" onClick={handleShowAll}>
          Show all {realBandCount} crawled bands
        </button>
        <DisplaySettingsPanel settings={settings} onChange={handleSettingsChange} />
        <p className="legend">
          {visibleRealCount} / {realBandCount} crawled bands shown
          {visibleStubCount > 0 && <> (+{visibleStubCount} stub{visibleStubCount === 1 ? '' : 's'} on visible paths)</>}
          <br />
          dashed border = stub: referenced by a career path but outside the crawled set
        </p>
        <div className="panel-slot">
          {selectedBand && (
            <BandDetailPanel
              band={selectedBand}
              members={selectedBand.member_ids.map((id) => index.musiciansById.get(id)).filter((m): m is NonNullable<typeof m> => Boolean(m))}
              onSelectMusician={handleSelectMusician}
              onClose={clearSelection}
            />
          )}
          {selectedMusician && (
            <MusicianDetailPanel
              musician={selectedMusician}
              bandsById={index.bandsById}
              onSelectBand={handleSelectBand}
              onClose={clearSelection}
            />
          )}
          {!selectedBand && !selectedMusician && <p className="hint">Click a band to see its members, or a line to see a musician's path.</p>}
        </div>
      </aside>
    </div>
  );
}

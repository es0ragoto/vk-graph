import { useEffect, useMemo, useRef, useState } from 'react';
import type { GraphExport } from './types/graph';
import { loadGraph } from './lib/loadGraph';
import { buildGraphIndex } from './lib/graphIndex';
import { useSelection } from './lib/useSelection';
import { expandWithBandNeighbors, expandWithMusicianPath, allRealBandIds, allBandIds } from './lib/focus';
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
  // "Show stub bands" swaps the baseline from just the crawled set to literally everything -
  // otherwise stubs stay ephemeral (see below).
  const baseBandIds = useMemo(
    () => (index ? (settings.showStubs ? allBandIds(index) : allRealBandIds(index)) : null),
    [index, settings.showStubs],
  );

  const { selection, selectBand, selectMusician, clearSelection, goBack, canGoBack, highlights, resetToken } =
    useSelection(index);

  // Stubs are ephemeral: visible bands are always the base set (every real band, or every
  // band at all if "show stub bands" is on) plus whatever a stub neighbor/path the *current*
  // selection pulls in - switching to a different selection (or clearing it) drops any stubs
  // that aren't relevant anymore, rather than accumulating.
  // The stableRef keeps the same Set reference when content is unchanged (e.g. selecting a
  // band with no stub neighbors), so GraphView's memoized layout doesn't do pointless work.
  const stableVisibleBandIdsRef = useRef<Set<string> | null>(null);
  const visibleBandIds = useMemo(() => {
    if (!index || !baseBandIds) return null;
    let next = baseBandIds;
    if (selection?.type === 'band') next = expandWithBandNeighbors(baseBandIds, selection.id, index);
    else if (selection?.type === 'musician') next = expandWithMusicianPath(baseBandIds, selection.id, index);

    const prev = stableVisibleBandIdsRef.current;
    if (prev && prev.size === next.size && [...next].every((id) => prev.has(id))) {
      return prev;
    }
    stableVisibleBandIdsRef.current = next;
    return next;
  }, [index, baseBandIds, selection]);

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

  const realBandCount = graph.bands.filter((b) => !b.stub).length;
  const visibleRealCount = [...visibleBandIds].filter((id) => !index.bandsById.get(id)?.stub).length;
  const visibleStubCount = visibleBandIds.size - visibleRealCount;

  const selectedBand = selection?.type === 'band' ? index.bandsById.get(selection.id) ?? null : null;
  const selectedMusician = selection?.type === 'musician' ? index.musiciansById.get(selection.id) ?? null : null;

  const handleSelectEdge = (edgeId: string) => {
    const edge = index.edgesById.get(edgeId);
    if (edge) selectMusician(edge.musician_id);
  };

  return (
    <div className="app-layout">
      <div className="graph-pane">
        <GraphView
          graph={graph}
          visibleBandIds={visibleBandIds}
          highlightedBandIds={highlights.highlightedBandIds}
          connectedBandIds={highlights.connectedBandIds}
          highlightedEdgeIds={highlights.highlightedEdgeIds}
          incomingEdgeIds={highlights.incomingEdgeIds}
          outgoingEdgeIds={highlights.outgoingEdgeIds}
          fadeOthers={highlights.fadeOthers}
          resetToken={resetToken}
          settings={settings}
          onSelectBand={selectBand}
          onSelectEdge={handleSelectEdge}
        />
      </div>
      <aside className="sidebar">
        <h1>Band Graph</h1>
        <SearchBox graph={graph} onSelectBand={selectBand} onSelectMusician={selectMusician} />
        <div className="toolbar">
          <button className="back-btn" onClick={goBack} disabled={!canGoBack}>
            ← Back
          </button>
          <button className="show-all-btn" onClick={clearSelection}>
            Show all {realBandCount} crawled bands
          </button>
        </div>
        <DisplaySettingsPanel settings={settings} onChange={handleSettingsChange} />
        <p className="legend">
          {visibleRealCount} / {realBandCount} crawled bands shown
          {visibleStubCount > 0 && (
            <>
              {' '}
              (+{visibleStubCount} stub{visibleStubCount === 1 ? '' : 's'}
              {settings.showStubs ? '' : ' on the current selection'})
            </>
          )}
          <br />
          dashed border = stub: referenced by a career path but outside the crawled set
        </p>
        <div className="panel-slot">
          {selectedBand && (
            <BandDetailPanel
              band={selectedBand}
              members={selectedBand.member_ids.map((id) => index.musiciansById.get(id)).filter((m): m is NonNullable<typeof m> => Boolean(m))}
              onSelectMusician={selectMusician}
              onClose={clearSelection}
            />
          )}
          {selectedMusician && (
            <MusicianDetailPanel
              musician={selectedMusician}
              bandsById={index.bandsById}
              onSelectBand={selectBand}
              onClose={clearSelection}
            />
          )}
          {!selectedBand && !selectedMusician && <p className="hint">Click a band to see its members, or a line to see a musician's path.</p>}
        </div>
      </aside>
    </div>
  );
}

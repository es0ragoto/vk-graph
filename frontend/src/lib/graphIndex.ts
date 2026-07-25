import type { GraphExport, Band, Musician, GraphEdge } from '../types/graph';

export interface GraphIndex {
  bandsById: Map<string, Band>;
  musiciansById: Map<string, Musician>;
  edgesById: Map<string, GraphEdge>;
  /** bandId -> set of band ids reachable by a single transition edge */
  neighborBandIds: Map<string, Set<string>>;
  /** bandId -> set of edge ids incident to that band */
  edgeIdsByBand: Map<string, Set<string>>;
}

export function buildGraphIndex(graph: GraphExport): GraphIndex {
  const bandsById = new Map(graph.bands.map((b) => [b.id, b]));
  const musiciansById = new Map(graph.musicians.map((m) => [m.id, m]));
  const edgesById = new Map(graph.edges.map((e) => [e.id, e]));

  const neighborBandIds = new Map<string, Set<string>>();
  const edgeIdsByBand = new Map<string, Set<string>>();
  for (const b of graph.bands) {
    neighborBandIds.set(b.id, new Set());
    edgeIdsByBand.set(b.id, new Set());
  }
  for (const e of graph.edges) {
    neighborBandIds.get(e.source)?.add(e.target);
    neighborBandIds.get(e.target)?.add(e.source);
    edgeIdsByBand.get(e.source)?.add(e.id);
    edgeIdsByBand.get(e.target)?.add(e.id);
  }

  return { bandsById, musiciansById, edgesById, neighborBandIds, edgeIdsByBand };
}

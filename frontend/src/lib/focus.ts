import type { GraphIndex } from './graphIndex';

/** Returns the *same* Set reference when nothing new would be added, so callers relying on
 * referential equality (React state, useMemo/useEffect deps) can skip pointless downstream
 * recomputation - e.g. re-clicking an already-fully-visible band shouldn't retrigger layout. */
function withAdded(visible: Set<string>, idsToAdd: Iterable<string>): Set<string> {
  let next: Set<string> | null = null;
  for (const id of idsToAdd) {
    if (!visible.has(id)) {
      if (!next) next = new Set(visible);
      next.add(id);
    }
  }
  return next ?? visible;
}

export function expandWithBandNeighbors(visible: Set<string>, bandId: string, index: GraphIndex): Set<string> {
  return withAdded(visible, [bandId, ...(index.neighborBandIds.get(bandId) ?? [])]);
}

export function expandWithMusicianPath(visible: Set<string>, musicianId: string, index: GraphIndex): Set<string> {
  const musician = index.musiciansById.get(musicianId);
  if (!musician) return visible;
  return withAdded(visible, musician.career.map((c) => c.band_id));
}

/** "Entire graph" means the real, fully-crawled bands - not every stub pulled in as a
 * career-path endpoint for some musician (which can vastly outnumber the real set).
 * Stubs still surface contextually via expandWithMusicianPath when a path leads to one,
 * or all at once when the "show stub bands" display setting is on (see allBandIds). */
export function allRealBandIds(index: GraphIndex): Set<string> {
  const result = new Set<string>();
  for (const [id, band] of index.bandsById) {
    if (!band.stub) result.add(id);
  }
  return result;
}

/** Every band, crawled or stub - the opt-in "show stub bands" view, for getting a sense of
 * how the crawled set connects to the wider scene beyond it. */
export function allBandIds(index: GraphIndex): Set<string> {
  return new Set(index.bandsById.keys());
}

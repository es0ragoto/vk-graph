import type { GraphIndex } from './graphIndex';

/** Seeds the initial view with the highest-degree band plus its direct neighbors, so the first paint isn't an isolated dot. */
export function initialVisibleBandIds(index: GraphIndex): Set<string> {
  let seed: string | null = null;
  let bestDegree = -1;
  for (const [bandId, neighbors] of index.neighborBandIds) {
    if (neighbors.size > bestDegree) {
      bestDegree = neighbors.size;
      seed = bandId;
    }
  }

  const result = new Set<string>();
  if (seed) {
    result.add(seed);
    for (const n of index.neighborBandIds.get(seed) ?? []) result.add(n);
  } else {
    const first = index.bandsById.keys().next();
    if (!first.done) result.add(first.value);
  }
  return result;
}

export function expandWithBandNeighbors(visible: Set<string>, bandId: string, index: GraphIndex): Set<string> {
  const next = new Set(visible);
  next.add(bandId);
  for (const n of index.neighborBandIds.get(bandId) ?? []) next.add(n);
  return next;
}

export function expandWithMusicianPath(visible: Set<string>, musicianId: string, index: GraphIndex): Set<string> {
  const next = new Set(visible);
  const musician = index.musiciansById.get(musicianId);
  if (musician) {
    for (const stop of musician.career) next.add(stop.band_id);
  }
  return next;
}

export function allBandIds(index: GraphIndex): Set<string> {
  return new Set(index.bandsById.keys());
}

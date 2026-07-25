import { useState, useMemo, useCallback } from 'react';
import type { GraphIndex } from './graphIndex';

export type Selection = { type: 'band'; id: string } | { type: 'musician'; id: string } | null;

export interface HighlightSets {
  highlightedBandIds: Set<string>;
  highlightedEdgeIds: Set<string>;
  fadeOthers: boolean;
}

const EMPTY_HIGHLIGHTS: HighlightSets = {
  highlightedBandIds: new Set(),
  highlightedEdgeIds: new Set(),
  fadeOthers: false,
};

/** Bands highlight themselves plus every incoming/outgoing edge, in place (no fade, no
 * camera movement - see GraphView, which only re-fits the camera when fadeOthers is set).
 * Musicians highlight (and fade around, and re-center on) their whole career path. */
export function computeHighlights(selection: Selection, index: GraphIndex): HighlightSets {
  if (!selection) return EMPTY_HIGHLIGHTS;

  if (selection.type === 'band') {
    const edgeIds = index.edgeIdsByBand.get(selection.id) ?? new Set<string>();
    return { highlightedBandIds: new Set([selection.id]), highlightedEdgeIds: new Set(edgeIds), fadeOthers: false };
  }

  const musician = index.musiciansById.get(selection.id);
  if (!musician) return EMPTY_HIGHLIGHTS;
  return {
    highlightedBandIds: new Set(musician.career.map((c) => c.band_id)),
    highlightedEdgeIds: new Set(musician.edge_ids),
    fadeOthers: true,
  };
}

export function useSelection(index: GraphIndex | null) {
  const [selection, setSelection] = useState<Selection>(null);

  const selectBand = useCallback((bandId: string) => setSelection({ type: 'band', id: bandId }), []);
  const selectMusician = useCallback((musicianId: string) => setSelection({ type: 'musician', id: musicianId }), []);
  const clearSelection = useCallback(() => setSelection(null), []);

  const highlights = useMemo(
    () => (index ? computeHighlights(selection, index) : EMPTY_HIGHLIGHTS),
    [selection, index],
  );

  return { selection, selectBand, selectMusician, clearSelection, highlights };
}

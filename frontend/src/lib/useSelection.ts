import { useState, useMemo, useCallback } from 'react';
import type { GraphIndex } from './graphIndex';

export type Selection = { type: 'band'; id: string } | { type: 'musician'; id: string } | null;
type NonNullSelection = Exclude<Selection, null>;

function sameSelection(a: Selection, b: NonNullSelection): boolean {
  return a?.type === b.type && a.id === b.id;
}

export interface HighlightSets {
  highlightedBandIds: Set<string>;
  /** Band selection only: its direct neighbors (the other end of an incoming/outgoing edge) -
   * exempt from fading like highlightedBandIds, but without that set's "this is the one you
   * clicked" styling. Always empty for a musician selection (its whole path is already in
   * highlightedBandIds). */
  connectedBandIds: Set<string>;
  /** Musician-path edges (single color) - band selection never sets this. */
  highlightedEdgeIds: Set<string>;
  /** Band selection only: edges arriving at the selected band (target === id). */
  incomingEdgeIds: Set<string>;
  /** Band selection only: edges leaving the selected band (source === id). */
  outgoingEdgeIds: Set<string>;
  fadeOthers: boolean;
}

const EMPTY_HIGHLIGHTS: HighlightSets = {
  highlightedBandIds: new Set(),
  connectedBandIds: new Set(),
  highlightedEdgeIds: new Set(),
  incomingEdgeIds: new Set(),
  outgoingEdgeIds: new Set(),
  fadeOthers: false,
};

/** Bands highlight themselves plus every incident edge and neighbor, split into
 * incoming/outgoing by direction, and fade everything else - with a large graph on screen,
 * an unfaded neighborhood is the only way the selection reads clearly. Musicians highlight
 * (and fade around, and re-center on) their whole career path as a single color - direction
 * there is already shown by the path's own arrows, not by an in/out split relative to one
 * node. Camera movement is handled separately in GraphView, which only re-fits when
 * fadeOthers is set. */
export function computeHighlights(selection: Selection, index: GraphIndex): HighlightSets {
  if (!selection) return EMPTY_HIGHLIGHTS;

  if (selection.type === 'band') {
    const incoming = new Set<string>();
    const outgoing = new Set<string>();
    const neighbors = new Set<string>();
    for (const edgeId of index.edgeIdsByBand.get(selection.id) ?? []) {
      const edge = index.edgesById.get(edgeId);
      if (!edge) continue;
      if (edge.target === selection.id) {
        incoming.add(edgeId);
        neighbors.add(edge.source);
      }
      if (edge.source === selection.id) {
        outgoing.add(edgeId);
        neighbors.add(edge.target);
      }
    }
    neighbors.delete(selection.id); // a self-loop shouldn't un-fade "itself" twice over
    return {
      highlightedBandIds: new Set([selection.id]),
      connectedBandIds: neighbors,
      highlightedEdgeIds: new Set(),
      incomingEdgeIds: incoming,
      outgoingEdgeIds: outgoing,
      fadeOthers: true,
    };
  }

  const musician = index.musiciansById.get(selection.id);
  if (!musician) return EMPTY_HIGHLIGHTS;
  return {
    highlightedBandIds: new Set(musician.career.map((c) => c.band_id)),
    connectedBandIds: new Set(),
    highlightedEdgeIds: new Set(musician.edge_ids),
    incomingEdgeIds: new Set(),
    outgoingEdgeIds: new Set(),
    fadeOthers: true,
  };
}

export function useSelection(index: GraphIndex | null) {
  const [selection, setSelection] = useState<Selection>(null);
  // Selections only, never "nothing" - closing a panel or hitting "Show all" isn't a step
  // worth going back to, so clearSelection() deliberately doesn't touch this.
  const [history, setHistory] = useState<NonNullSelection[]>([]);
  // React bails out of a re-render when setSelection(null) is called while selection is
  // already null (e.g. "Show all" clicked twice in a row, or after a panel's own close
  // button already cleared it) - so nothing downstream would re-run to re-fit the camera.
  // This ticks on every clearSelection() call regardless, giving GraphView an unconditional
  // signal that "frame the whole graph" was requested, even when selection didn't change.
  const [resetToken, setResetToken] = useState(0);

  const select = useCallback(
    (next: NonNullSelection) => {
      if (selection && sameSelection(selection, next)) return; // already there - not a new step
      setHistory((h) => (selection ? [...h, selection] : h));
      setSelection(next);
    },
    [selection],
  );

  const selectBand = useCallback((bandId: string) => select({ type: 'band', id: bandId }), [select]);
  const selectMusician = useCallback((musicianId: string) => select({ type: 'musician', id: musicianId }), [select]);
  const clearSelection = useCallback(() => {
    setSelection(null);
    setResetToken((t) => t + 1);
  }, []);

  const goBack = useCallback(() => {
    if (history.length === 0) return;
    setSelection(history[history.length - 1]);
    setHistory(history.slice(0, -1));
  }, [history]);

  const highlights = useMemo(
    () => (index ? computeHighlights(selection, index) : EMPTY_HIGHLIGHTS),
    [selection, index],
  );

  return {
    selection,
    selectBand,
    selectMusician,
    clearSelection,
    goBack,
    canGoBack: history.length > 0,
    highlights,
    resetToken,
  };
}

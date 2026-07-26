import { useEffect, useMemo, useRef, useState } from 'react';
import CytoscapeComponent from 'react-cytoscapejs';
import cytoscape from 'cytoscape';
import type { GraphExport } from '../types/graph';
import type { GraphSettings } from '../lib/graphSettings';
import { INCOMING_EDGE_COLOR, OUTGOING_EDGE_COLOR } from '../lib/edgeColors';

interface GraphViewProps {
  graph: GraphExport;
  visibleBandIds: Set<string>;
  highlightedBandIds: Set<string>;
  connectedBandIds: Set<string>;
  highlightedEdgeIds: Set<string>;
  incomingEdgeIds: Set<string>;
  outgoingEdgeIds: Set<string>;
  fadeOthers: boolean;
  // Ticks on every "clear selection" action (Show all, closing a panel), even when the
  // selection was already null and thus wouldn't otherwise produce a new prop value below -
  // see useSelection.ts. Only consumed to force the fit effect to re-run; the value itself
  // is meaningless.
  resetToken: number;
  settings: GraphSettings;
  onSelectBand: (bandId: string) => void;
  onSelectEdge: (edgeId: string) => void;
}

function buildStylesheet(settings: GraphSettings): cytoscape.StylesheetJsonBlock[] {
  return [
    {
      selector: 'node',
      style: {
        'background-color': '#5b8dab',
        label: 'data(label)',
        color: '#e8e8e8',
        'text-outline-color': '#161616',
        'text-outline-width': 2,
        'font-size': settings.fontSize,
        'text-valign': 'bottom',
        'text-margin-y': 6,
        width: settings.nodeSize,
        height: settings.nodeSize,
        'border-width': 0,
        // Cytoscape's default z-index-compare ('auto') always draws every node above every
        // edge, no matter what z-index says - it only breaks ties within the same element
        // type. 'manual' makes actual z-index values apply across nodes and edges alike, so
        // a highlighted edge (z-index 10 below) can render above a dimmed node in its way.
        'z-index-compare': 'manual',
        'z-index': 1,
      },
    },
    {
      selector: 'node[?stub]',
      style: {
        'background-color': '#b8b8b8',
        'border-style': 'dashed',
        'border-width': 2,
        'border-color': '#888888',
      },
    },
    { selector: 'node.highlighted', style: { 'border-width': 4, 'border-color': '#e63946', 'border-style': 'solid' } },
    { selector: 'node.faded', style: { opacity: 0.15 } },
    {
      // Band histories are directed - source is the earlier band, target the later one -
      // so an arrowhead at the target end shows which way a musician's career moved.
      selector: 'edge',
      style: {
        width: settings.edgeWidth,
        'curve-style': 'bezier',
        'line-color': '#999999',
        'target-arrow-shape': 'triangle',
        'target-arrow-color': '#999999',
        'arrow-scale': 0.8,
        opacity: 0.85,
        'z-index-compare': 'manual',
        'z-index': 0,
      },
    },
    {
      selector: 'edge.highlighted',
      style: {
        width: settings.edgeWidth * 2,
        'line-color': '#e63946',
        'target-arrow-color': '#e63946',
        opacity: 1,
        'z-index': 10,
      },
    },
    {
      // Band-click neighborhood: incoming (arriving here) vs outgoing (leaving here) get
      // distinct colors so the two directions are easy to tell apart at a glance.
      selector: 'edge.highlighted-incoming',
      style: {
        width: settings.edgeWidth * 2,
        'line-color': INCOMING_EDGE_COLOR,
        'target-arrow-color': INCOMING_EDGE_COLOR,
        opacity: 1,
        'z-index': 10,
      },
    },
    {
      selector: 'edge.highlighted-outgoing',
      style: {
        width: settings.edgeWidth * 2,
        'line-color': OUTGOING_EDGE_COLOR,
        'target-arrow-color': OUTGOING_EDGE_COLOR,
        opacity: 1,
        'z-index': 10,
      },
    },
    { selector: 'edge.faded', style: { opacity: 0.06 } },
  ];
}

function buildLayoutOptions(spacing: number, fit: boolean): cytoscape.LayoutOptions {
  return {
    name: 'cose',
    animate: false,
    fit,
    padding: 48,
    nodeRepulsion: 400_000 * spacing,
    idealEdgeLength: 32 * spacing,
  } as cytoscape.LayoutOptions;
}

// Slider drags fire many rapid updates; only re-run the (relatively expensive) force
// layout once things settle, rather than on every intermediate value.
const LAYOUT_DEBOUNCE_MS = 250;

export default function GraphView({
  graph,
  visibleBandIds,
  highlightedBandIds,
  connectedBandIds,
  highlightedEdgeIds,
  incomingEdgeIds,
  outgoingEdgeIds,
  fadeOthers,
  resetToken,
  settings,
  onSelectBand,
  onSelectEdge,
}: GraphViewProps) {
  const cyRef = useRef<cytoscape.Core | null>(null);
  const onSelectBandRef = useRef(onSelectBand);
  const onSelectEdgeRef = useRef(onSelectEdge);
  onSelectBandRef.current = onSelectBand;
  onSelectEdgeRef.current = onSelectEdge;
  // Only the very first layout (initial load) should frame the camera automatically.
  // Every later re-layout (revealing a node via a click, or a spacing-slider change) must
  // leave pan/zoom exactly where the user left it.
  const hasFittedOnceRef = useRef(false);
  // Tracks which node ids were already on screen, so a click that reveals a new one can
  // drop just that node in place instead of re-running the whole force simulation (which
  // would nudge everything else too, even with the camera itself held still).
  const previousNodeIdsRef = useRef<Set<string>>(new Set());
  // Tracks the spacing setting so a pure shrink (a selection change that only removes
  // stubs, adding none) can be told apart from an actual spacing-slider change - both
  // reach the "no new ids" branch, but only the latter should trigger a re-layout.
  const previousSpacingRef = useRef(settings.layoutSpacing);
  // Toggling "show stub bands" can add or remove well over a thousand nodes at once - too
  // big for the small per-click fan-out treatment below, so it gets its own full-relayout
  // path (with a fit, since the visible extent just changed drastically either way).
  const previousShowStubsRef = useRef(settings.showStubs);

  // scripts/precompute-layout.mjs bakes a cose-computed position into every band (real and
  // stub alike) offline, once, so the browser never has to run its own force simulation -
  // that's what let a ~2000-node "show stub bands" toggle freeze the tab. Falls back to the
  // legacy in-browser cose path below only if graph.json predates that script.
  const originalPositionById = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    for (const b of graph.bands) {
      if (b.position) map.set(b.id, b.position);
    }
    return map;
  }, [graph]);
  const hasPrecomputedPositions = graph.bands.length > 0 && originalPositionById.size === graph.bands.length;
  // "Layout spacing" becomes a cheap uniform scale of the baked positions around their
  // centroid, rather than a from-scratch re-simulation - spreads/compacts the same
  // arrangement instantly, at any node count.
  const positionCentroid = useMemo(() => {
    if (originalPositionById.size === 0) return { x: 0, y: 0 };
    let sx = 0;
    let sy = 0;
    for (const p of originalPositionById.values()) {
      sx += p.x;
      sy += p.y;
    }
    return { x: sx / originalPositionById.size, y: sy / originalPositionById.size };
  }, [originalPositionById]);

  const elements = useMemo<cytoscape.ElementDefinition[]>(() => {
    const nodeEls: cytoscape.ElementDefinition[] = graph.bands
      .filter((b) => visibleBandIds.has(b.id))
      .map((b) => ({
        data: { id: b.id, label: b.name, stub: b.stub },
        // Unscaled baked position - the layout effect below applies the current spacing
        // scale on top of this right after (re)placing nodes.
        ...(b.position ? { position: { x: b.position.x, y: b.position.y } } : {}),
      }));
    const edgeEls: cytoscape.ElementDefinition[] = graph.edges
      .filter((e) => visibleBandIds.has(e.source) && visibleBandIds.has(e.target))
      .map((e) => ({ data: { id: e.id, source: e.source, target: e.target } }));
    return [...nodeEls, ...edgeEls];
  }, [graph, visibleBandIds]);

  // For the edge-hover tooltip - matches the "Romaji (Japanese)" display convention used
  // throughout the detail panels.
  const musicianNameByEdgeId = useMemo(() => {
    const musicianById = new Map(graph.musicians.map((m) => [m.id, m]));
    const map = new Map<string, string>();
    for (const e of graph.edges) {
      const m = musicianById.get(e.musician_id);
      if (m) map.set(e.id, m.name_native ? `${m.name} (${m.name_native})` : m.name);
    }
    return map;
  }, [graph]);
  // Read inside the cy callback below via a ref, same reason as onSelectBandRef/
  // onSelectEdgeRef - that callback only runs once per cy instance and would otherwise
  // close over a stale map.
  const musicianNameByEdgeIdRef = useRef(musicianNameByEdgeId);
  musicianNameByEdgeIdRef.current = musicianNameByEdgeId;
  const [edgeTooltip, setEdgeTooltip] = useState<{ text: string; x: number; y: number } | null>(null);

  const stylesheet = useMemo(() => buildStylesheet(settings), [settings]);

  // Cosmetic-only properties (size/font/width/arrows) - cheap, apply on every change.
  useEffect(() => {
    cyRef.current?.style(stylesheet);
  }, [stylesheet]);

  // Structural: re-running the force layout is comparatively expensive, so debounce it.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const handle = setTimeout(() => {
      const currentIds = new Set(cy.nodes().map((n) => n.id()));
      const spacingChanged = previousSpacingRef.current !== settings.layoutSpacing;
      previousSpacingRef.current = settings.layoutSpacing;
      const showStubsChanged = previousShowStubsRef.current !== settings.showStubs;
      previousShowStubsRef.current = settings.showStubs;

      if (hasPrecomputedPositions) {
        // Every node already has a baked-in position (scripts/precompute-layout.mjs) -
        // "laying out" is just scaling those positions around their centroid by the current
        // spacing value, an O(n) position update instead of a from-scratch force simulation.
        // That's instant at any graph size, so it replaces cose entirely here: no per-click
        // fan-out, no full re-simulation on the stub toggle (that's what previously took a
        // measured 100+ seconds in-browser for this graph's ~2000 nodes and froze the tab).
        cy.resize();
        cy.batch(() => {
          cy.nodes().forEach((n) => {
            const orig = originalPositionById.get(n.id());
            if (!orig) return;
            n.position({
              x: positionCentroid.x + (orig.x - positionCentroid.x) * settings.layoutSpacing,
              y: positionCentroid.y + (orig.y - positionCentroid.y) * settings.layoutSpacing,
            });
          });
        });
        if (!hasFittedOnceRef.current || showStubsChanged) {
          // Instant on first load, briefly animated when stubs are toggled mid-session so
          // the sudden change in extent doesn't feel like a jump-cut.
          cy.animate({ fit: { eles: cy.elements(), padding: 48 } }, { duration: hasFittedOnceRef.current ? 300 : 0 });
          hasFittedOnceRef.current = true;
        }
        previousNodeIdsRef.current = currentIds;
        return;
      }

      // --- Legacy path below: only reached if graph.json predates precompute-layout.mjs ---

      if (!hasFittedOnceRef.current) {
        // Initial load: arrange everything and frame the camera once.
        cy.resize();
        cy.layout(buildLayoutOptions(settings.layoutSpacing, true)).run();
        hasFittedOnceRef.current = true;
        previousNodeIdsRef.current = currentIds;
        return;
      }

      const newIds = [...currentIds].filter((id) => !previousNodeIdsRef.current.has(id));

      if (showStubsChanged) {
        // Toggling stub bands on/off can add or remove well over a thousand nodes in one
        // go - the per-click fan-out below is meant for a handful of revealed stubs, not a
        // graph-reshaping change like this, so treat it like a full re-layout instead
        // (with a fit, since "how much graph there is" just changed drastically).
        cy.resize();
        cy.layout(buildLayoutOptions(settings.layoutSpacing, true)).run();
      } else if (newIds.length > 0) {
        // A click revealed new node(s). Don't re-run the simulation at all - it would
        // shift already-visible nodes even without touching the camera. Instead, drop
        // each new node next to an already-positioned neighbor (falling back to the
        // current viewport center if it has none yet). Siblings that share the same
        // anchor are fanned out evenly around it on a circle, rather than each landing at
        // an independently-random offset, which is what made them bunch up and overlap.
        const viewCenter = cy.extent();
        const fallback = { x: (viewCenter.x1 + viewCenter.x2) / 2, y: (viewCenter.y1 + viewCenter.y2) / 2 };

        const groups = new Map<string, { pos: { x: number; y: number }; ids: string[] }>();
        for (const id of newIds) {
          const node = cy.getElementById(id);
          // cytoscape's own .d.ts types .filter() as always returning the generic
          // CollectionReturnValue (EdgeSingular | NodeSingular after .first()), even when
          // called on an already-node-only NodeCollection - .nodes() right before it
          // guarantees this is actually a node at runtime, so the cast is safe.
          const anchor = node
            .neighborhood()
            .nodes()
            .filter((n) => !newIds.includes(n.id()))
            .first() as cytoscape.NodeSingular;
          const anchorKey = anchor.nonempty() ? anchor.id() : '__fallback__';
          const anchorPos = anchor.nonempty() ? anchor.position() : fallback;
          if (!groups.has(anchorKey)) groups.set(anchorKey, { pos: anchorPos, ids: [] });
          groups.get(anchorKey)!.ids.push(id);
        }

        cy.batch(() => {
          for (const { pos, ids } of groups.values()) {
            const count = ids.length;
            const radius = Math.max(90, settings.nodeSize * 1.5 + count * 10);
            const startAngle = Math.random() * 2 * Math.PI;
            ids.forEach((id, i) => {
              const angle = startAngle + (2 * Math.PI * i) / count;
              cy.getElementById(id).position({
                x: pos.x + radius * Math.cos(angle),
                y: pos.y + radius * Math.sin(angle),
              });
            });
          }
        });
      } else if (spacingChanged) {
        // No new nodes, but the spacing slider itself moved - that's the one legitimate
        // reason to resettle everyone at their new spacing, still without touching the camera.
        cy.layout(buildLayoutOptions(settings.layoutSpacing, false)).run();
      }
      // Else: a pure shrink (a selection change removed stubs without adding any) or some
      // other no-op - leave every remaining node exactly where it already is.
      previousNodeIdsRef.current = currentIds;
    }, LAYOUT_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [elements, settings.layoutSpacing, settings.showStubs, hasPrecomputedPositions, originalPositionById, positionCentroid]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.minZoom(settings.minZoom);
    cy.maxZoom(settings.maxZoom);
  }, [settings.minZoom, settings.maxZoom]);

  // Apply highlight/fade classes immediately (instant feedback), then fit the camera to
  // whatever got highlighted - a band click frames the clicked band plus its incident
  // edges/neighbors, a musician click frames the whole path, same as each other. The fit
  // itself is delayed to match the layout effect's debounce, so any newly-revealed stub
  // nodes have already settled into their fanned-out positions before we frame them -
  // fitting immediately would frame their pre-placement position and jump again shortly
  // after once they're actually placed. This never moves a node's own position, only the
  // viewport, so it doesn't reintroduce the "graph shifts under me" problem from before.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.batch(() => {
      cy.elements().removeClass('highlighted faded highlighted-incoming highlighted-outgoing');
      if (fadeOthers) cy.elements().addClass('faded');
      cy.nodes().forEach((n) => {
        if (highlightedBandIds.has(n.id())) n.removeClass('faded').addClass('highlighted');
        else if (connectedBandIds.has(n.id())) n.removeClass('faded');
      });
      cy.edges().forEach((e) => {
        if (highlightedEdgeIds.has(e.id())) e.removeClass('faded').addClass('highlighted');
        if (incomingEdgeIds.has(e.id())) e.removeClass('faded').addClass('highlighted-incoming');
        if (outgoingEdgeIds.has(e.id())) e.removeClass('faded').addClass('highlighted-outgoing');
      });
    });

    const handle = setTimeout(() => {
      // Fit to more than just the highlighted elements themselves: for a band click, only
      // the clicked band gets `.highlighted` - its neighbors are only reachable via the
      // incoming/outgoing edges. An edge's own bounding box reaches only to the neighbor's
      // center-ish point, not its full circle plus label below it, so fitting to edges
      // alone left neighbor nodes and names clipped at the frame edge. Explicitly pulling
      // in connectedNodes() ensures every neighbor's full rendered extent (node + label) is
      // accounted for. For a musician path this is a no-op beyond what's already
      // highlighted, since a path edge's endpoints are themselves already path bands.
      const relevantEdges = cy.edges('.highlighted, .highlighted-incoming, .highlighted-outgoing');
      const toFit = relevantEdges.union(relevantEdges.connectedNodes()).union(cy.nodes('.highlighted'));
      // Nothing selected (e.g. "Show all" was just clicked, or a panel got closed) - frame
      // the whole current graph instead of leaving the camera wherever it was left over
      // from a previous selection.
      const fitTarget = toFit.length > 0 ? toFit : cy.elements();
      if (fitTarget.length > 0) {
        // cy.animate({fit}) computes its target zoom/pan from a container size that only
        // gets refreshed on an explicit resize() - without this, fitting shortly after the
        // pane was resized (e.g. the browser window) uses the pre-resize size and leaves
        // part of the graph outside the actual viewport.
        cy.resize();
        cy.animate({ fit: { eles: fitTarget, padding: 80 } }, { duration: 300 });
      }
    }, LAYOUT_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [highlightedBandIds, connectedBandIds, highlightedEdgeIds, incomingEdgeIds, outgoingEdgeIds, fadeOthers, elements, resetToken]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <CytoscapeComponent
        elements={elements}
        stylesheet={stylesheet}
        style={{ width: '100%', height: '100%' }}
        minZoom={settings.minZoom}
        maxZoom={settings.maxZoom}
        // Rendering-performance hints for the ~2000-node "show stub bands" case - all are
        // init-only (read once when the underlying Cytoscape instance is constructed, not
        // reactive to later prop changes), which is fine since they're meant to always be on
        // rather than toggled at runtime:
        //  - textureOnViewport: render a cached raster snapshot during camera pan/zoom instead
        //    of redrawing every element live, then redraw crisply once that settles.
        //  - motionBlur: reuses a blurred previous frame during interaction instead of a full
        //    redraw, the officially recommended setting for large graphs.
        //  - pixelRatio 1: renders at CSS pixel density instead of the display's native device
        //    pixel ratio, so a 2x/3x retina screen isn't pushing 4-9x the actual pixel count
        //    through the canvas every frame. Trade-off: slightly softer edges/text.
        // Deliberately NOT using hideEdgesOnViewport: per cytoscape's own renderer source, its
        // hide condition also fires while dragging a *node* (not just panning/zooming the
        // camera), which made every edge vanish for the duration of any node drag.
        textureOnViewport
        motionBlur
        // react-cytoscapejs's PropTypes for this are declared as oneOfType([string, object])
        // (a bug in that library - cytoscape's own API accepts 'auto' or a number) - passing
        // the numeral as a string satisfies its check and still reaches cytoscape correctly,
        // since the value is forwarded to the constructor as-is and JS coerces it numerically.
        pixelRatio="1"
        cy={(cy) => {
          if (cyRef.current === cy) return;
          cyRef.current = cy;
          cy.on('tap', 'node', (evt) => onSelectBandRef.current(evt.target.id()));
          cy.on('tap', 'edge', (evt) => onSelectEdgeRef.current(evt.target.id()));
          cy.on('mouseover', 'edge', (evt) => {
            const text = musicianNameByEdgeIdRef.current.get(evt.target.id());
            if (!text) return;
            const pos = evt.renderedPosition ?? evt.target.renderedMidpoint();
            setEdgeTooltip({ text, x: pos.x, y: pos.y });
          });
          cy.on('mousemove', 'edge', (evt) => {
            const pos = evt.renderedPosition ?? evt.target.renderedMidpoint();
            setEdgeTooltip((t) => (t ? { ...t, x: pos.x, y: pos.y } : t));
          });
          cy.on('mouseout', 'edge', () => setEdgeTooltip(null));
          // Cytoscape caches its container's dimensions and only re-measures them on an
          // explicit cy.resize() call - without this, fit()/animate({fit}) after the browser
          // window (or this pane) has been resized computes zoom/pan against the old size,
          // leaving part of the graph outside the actual viewport.
          const container = cy.container();
          if (container) {
            const observer = new ResizeObserver(() => cy.resize());
            observer.observe(container);
          }
        }}
      />
      {edgeTooltip && (
        <div className="edge-tooltip" style={{ left: edgeTooltip.x + 14, top: edgeTooltip.y + 14 }}>
          {edgeTooltip.text}
        </div>
      )}
    </div>
  );
}

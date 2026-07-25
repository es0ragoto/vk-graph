import { useEffect, useMemo, useRef } from 'react';
import CytoscapeComponent from 'react-cytoscapejs';
import cytoscape from 'cytoscape';
import type { GraphExport } from '../types/graph';
import type { GraphSettings } from '../lib/graphSettings';
import { bandDisplayName } from '../lib/displayName';

interface GraphViewProps {
  graph: GraphExport;
  visibleBandIds: Set<string>;
  highlightedBandIds: Set<string>;
  highlightedEdgeIds: Set<string>;
  fadeOthers: boolean;
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
  highlightedEdgeIds,
  fadeOthers,
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

  const elements = useMemo<cytoscape.ElementDefinition[]>(() => {
    const nodeEls: cytoscape.ElementDefinition[] = graph.bands
      .filter((b) => visibleBandIds.has(b.id))
      .map((b) => ({ data: { id: b.id, label: bandDisplayName(b), stub: b.stub } }));
    const edgeEls: cytoscape.ElementDefinition[] = graph.edges
      .filter((e) => visibleBandIds.has(e.source) && visibleBandIds.has(e.target))
      .map((e) => ({ data: { id: e.id, source: e.source, target: e.target } }));
    return [...nodeEls, ...edgeEls];
  }, [graph, visibleBandIds]);

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

      if (!hasFittedOnceRef.current) {
        // Initial load: arrange everything and frame the camera once.
        cy.layout(buildLayoutOptions(settings.layoutSpacing, true)).run();
        hasFittedOnceRef.current = true;
        previousNodeIdsRef.current = currentIds;
        return;
      }

      const newIds = [...currentIds].filter((id) => !previousNodeIdsRef.current.has(id));
      if (newIds.length === 0) {
        // Nothing structurally new (e.g. only the spacing slider changed, or bands were
        // hidden again) - resettle with the new spacing, still without moving the camera.
        cy.layout(buildLayoutOptions(settings.layoutSpacing, false)).run();
      } else {
        // A click revealed new node(s). Don't re-run the simulation at all - it would
        // shift already-visible nodes even without touching the camera. Instead, drop
        // each new node next to an already-positioned neighbor (falling back to the
        // current viewport center if it has none yet), so nothing already on screen
        // moves even slightly.
        const viewCenter = cy.extent();
        const fallback = { x: (viewCenter.x1 + viewCenter.x2) / 2, y: (viewCenter.y1 + viewCenter.y2) / 2 };
        cy.batch(() => {
          for (const id of newIds) {
            const node = cy.getElementById(id);
            const anchor = node
              .neighborhood('node')
              .filter((n) => !newIds.includes(n.id()))
              .first();
            const base = anchor.nonempty() ? anchor.position() : fallback;
            node.position({
              x: base.x + (Math.random() - 0.5) * 80,
              y: base.y + (Math.random() - 0.5) * 80,
            });
          }
        });
      }
      previousNodeIdsRef.current = currentIds;
    }, LAYOUT_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [elements, settings.layoutSpacing]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.minZoom(settings.minZoom);
    cy.maxZoom(settings.maxZoom);
  }, [settings.minZoom, settings.maxZoom]);

  // Apply highlight/fade classes. Only re-fit the camera for a musician path (fadeOthers)
  // selection, since a path can span far-apart bands worth reorienting to see - a plain
  // band click highlights its incident edges in place and must NOT move the camera.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.batch(() => {
      cy.elements().removeClass('highlighted faded');
      if (fadeOthers) cy.elements().addClass('faded');
      cy.nodes().forEach((n) => {
        if (highlightedBandIds.has(n.id())) n.removeClass('faded').addClass('highlighted');
      });
      cy.edges().forEach((e) => {
        if (highlightedEdgeIds.has(e.id())) e.removeClass('faded').addClass('highlighted');
      });
    });
    if (fadeOthers) {
      const highlighted = cy.nodes('.highlighted');
      if (highlighted.length > 0) {
        cy.animate({ fit: { eles: highlighted, padding: 80 } }, { duration: 300 });
      }
    }
  }, [highlightedBandIds, highlightedEdgeIds, fadeOthers, elements]);

  return (
    <CytoscapeComponent
      elements={elements}
      stylesheet={stylesheet}
      style={{ width: '100%', height: '100%' }}
      minZoom={settings.minZoom}
      maxZoom={settings.maxZoom}
      cy={(cy) => {
        if (cyRef.current === cy) return;
        cyRef.current = cy;
        cy.on('tap', 'node', (evt) => onSelectBandRef.current(evt.target.id()));
        cy.on('tap', 'edge', (evt) => onSelectEdgeRef.current(evt.target.id()));
      }}
    />
  );
}

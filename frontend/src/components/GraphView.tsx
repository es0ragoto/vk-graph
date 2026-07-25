import { useEffect, useMemo, useRef } from 'react';
import CytoscapeComponent from 'react-cytoscapejs';
import cytoscape from 'cytoscape';
import type { GraphExport } from '../types/graph';

interface GraphViewProps {
  graph: GraphExport;
  visibleBandIds: Set<string>;
  highlightedBandIds: Set<string>;
  highlightedEdgeIds: Set<string>;
  fadeOthers: boolean;
  onSelectBand: (bandId: string) => void;
  onSelectEdge: (edgeId: string) => void;
}

const stylesheet: cytoscape.StylesheetJsonBlock[] = [
  {
    selector: 'node',
    style: {
      'background-color': '#5b8dab',
      label: 'data(label)',
      color: '#e8e8e8',
      'text-outline-color': '#161616',
      'text-outline-width': 2,
      'font-size': 10,
      'text-valign': 'bottom',
      'text-margin-y': 6,
      width: 26,
      height: 26,
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
    selector: 'edge',
    style: {
      width: 2,
      'curve-style': 'bezier',
      'line-color': '#999999',
      'target-arrow-shape': 'none',
      opacity: 0.85,
    },
  },
  {
    selector: 'edge.highlighted',
    style: { width: 4, 'line-color': '#e63946', opacity: 1, 'z-index': 10 },
  },
  { selector: 'edge.faded', style: { opacity: 0.06 } },
];

const LAYOUT_OPTIONS = { name: 'cose', animate: false, fit: true, padding: 48 } as cytoscape.LayoutOptions;

export default function GraphView({
  graph,
  visibleBandIds,
  highlightedBandIds,
  highlightedEdgeIds,
  fadeOthers,
  onSelectBand,
  onSelectEdge,
}: GraphViewProps) {
  const cyRef = useRef<cytoscape.Core | null>(null);
  const onSelectBandRef = useRef(onSelectBand);
  const onSelectEdgeRef = useRef(onSelectEdge);
  onSelectBandRef.current = onSelectBand;
  onSelectEdgeRef.current = onSelectEdge;

  const elements = useMemo<cytoscape.ElementDefinition[]>(() => {
    const nodeEls: cytoscape.ElementDefinition[] = graph.bands
      .filter((b) => visibleBandIds.has(b.id))
      .map((b) => ({ data: { id: b.id, label: b.name, stub: b.stub } }));
    const edgeEls: cytoscape.ElementDefinition[] = graph.edges
      .filter((e) => visibleBandIds.has(e.source) && visibleBandIds.has(e.target))
      .map((e) => ({ data: { id: e.id, source: e.source, target: e.target } }));
    return [...nodeEls, ...edgeEls];
  }, [graph, visibleBandIds]);

  // Re-run layout whenever the visible element set changes.
  useEffect(() => {
    cyRef.current?.layout(LAYOUT_OPTIONS).run();
  }, [elements]);

  // Apply highlight/fade classes without touching layout, then pan/zoom to whatever got
  // highlighted - covers both "just revealed a new band" and "re-selected something already
  // on screen" (e.g. a search hit that didn't need to expand visibility).
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
    const highlighted = cy.nodes('.highlighted');
    if (highlighted.length > 0) {
      cy.animate({ fit: { eles: highlighted, padding: 80 } }, { duration: 300 });
    }
  }, [highlightedBandIds, highlightedEdgeIds, fadeOthers, elements]);

  return (
    <CytoscapeComponent
      elements={elements}
      stylesheet={stylesheet}
      style={{ width: '100%', height: '100%' }}
      cy={(cy) => {
        if (cyRef.current === cy) return;
        cyRef.current = cy;
        cy.on('tap', 'node', (evt) => onSelectBandRef.current(evt.target.id()));
        cy.on('tap', 'edge', (evt) => onSelectEdgeRef.current(evt.target.id()));
      }}
    />
  );
}

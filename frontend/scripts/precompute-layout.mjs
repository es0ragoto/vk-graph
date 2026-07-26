// Bakes an `x`/`y` position into every band in graph.json, once, offline, so the browser
// never has to run its own layout (see GraphView.tsx, which just places nodes at these
// coordinates and treats the "layout spacing" slider as a cheap uniform scale).
//
// Two-phase placement, not one big cose run over everything:
//   1. cose over the real (crawled) bands ONLY, using just edges between two real bands.
//      Small (~200 nodes) and fast, and free of distortion from stub tendrils - this is
//      what makes the default "Show all crawled bands" view fit in a normal zoom range.
//   2. Every stub band is then anchored near the real/stub neighbors it actually connects
//      to, propagating outward in rings (BFS) from the real cluster for stub-to-stub
//      chains, with siblings sharing an anchor fanned out on a small circle so they don't
//      overlap. This is deliberately not a force simulation - it's O(bands + edges), and
//      the result reads as "periphery nodes cluster near what they connect to" instead of
//      the tangled hairball a monolithic real+stub cose run produces at this node count.
//
// Re-run this after any re-scrape (`python -m scraper ...`) that changes graph.json:
//   node scripts/precompute-layout.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import cytoscape from 'cytoscape';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GRAPH_PATH = path.join(__dirname, '..', 'public', 'data', 'graph.json');

const graph = JSON.parse(readFileSync(GRAPH_PATH, 'utf-8'));
const realBandIds = new Set(graph.bands.filter((b) => !b.stub).map((b) => b.id));

// --- Phase 1: cose over the real-band subgraph only ---
console.log(`Phase 1: laying out ${realBandIds.size} real bands...`);
const realEdges = graph.edges.filter((e) => realBandIds.has(e.source) && realBandIds.has(e.target));
const cy = cytoscape({
  headless: true,
  styleEnabled: false,
  elements: [
    ...[...realBandIds].map((id) => ({ data: { id } })),
    ...realEdges.map((e) => ({ data: { id: e.id, source: e.source, target: e.target } })),
  ],
});
const t0 = Date.now();
cy.layout({
  name: 'cose',
  animate: false,
  fit: false,
  padding: 48,
  // Same coefficients as GraphView.tsx's buildLayoutOptions() at spacing=1 - keeps the
  // baked-in default consistent with what the interactive spacing slider produces.
  nodeRepulsion: 400_000,
  idealEdgeLength: 32,
}).run();
console.log(`  done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

const positionById = new Map(cy.nodes().map((n) => [n.id(), n.position()]));

// --- Phase 2: anchor-propagate every stub band from the real cluster outward ---
const adjacency = new Map();
for (const e of graph.edges) {
  if (!adjacency.has(e.source)) adjacency.set(e.source, new Set());
  if (!adjacency.has(e.target)) adjacency.set(e.target, new Set());
  adjacency.get(e.source).add(e.target);
  adjacency.get(e.target).add(e.source);
}

const unresolved = new Set(graph.bands.filter((b) => b.stub).map((b) => b.id));
console.log(`Phase 2: anchoring ${unresolved.size} stub bands...`);
let ring = 0;
while (unresolved.size > 0) {
  const resolvable = [...unresolved].filter((id) => [...(adjacency.get(id) ?? [])].some((nb) => positionById.has(nb)));
  if (resolvable.length === 0) break; // remaining stubs never connect back to a real band at all

  // Group by a rounded anchor point so siblings that share (approximately) the same
  // neighbor(s) fan out around it together instead of landing on top of each other.
  const anchorGroups = new Map();
  for (const id of resolvable) {
    const neighborPositions = [...(adjacency.get(id) ?? [])].map((nb) => positionById.get(nb)).filter(Boolean);
    const ax = neighborPositions.reduce((s, p) => s + p.x, 0) / neighborPositions.length;
    const ay = neighborPositions.reduce((s, p) => s + p.y, 0) / neighborPositions.length;
    const key = `${Math.round(ax / 8)},${Math.round(ay / 8)}`;
    if (!anchorGroups.has(key)) anchorGroups.set(key, { pos: { x: ax, y: ay }, ids: [] });
    anchorGroups.get(key).ids.push(id);
  }
  for (const { pos, ids } of anchorGroups.values()) {
    const count = ids.length;
    const radius = 50 + ring * 40 + Math.min(count * 3, 120);
    const startAngle = Math.random() * 2 * Math.PI;
    ids.forEach((id, i) => {
      const angle = startAngle + (2 * Math.PI * i) / count;
      positionById.set(id, { x: pos.x + radius * Math.cos(angle), y: pos.y + radius * Math.sin(angle) });
      unresolved.delete(id);
    });
  }
  ring++;
}

// Leftovers: stub-only chains that never trace back to any real band (e.g. a musician's
// whole tracked career sits outside what's crawled). Rare, but give them a clearly
// separate holding area below the main graph instead of overlapping it.
if (unresolved.size > 0) {
  console.log(`  ${unresolved.size} stub bands never connect back to a real band - placing separately below the graph`);
  const allPositioned = [...positionById.values()];
  const maxY = Math.max(...allPositioned.map((p) => p.y));
  const minX = Math.min(...allPositioned.map((p) => p.x));
  let i = 0;
  for (const id of unresolved) {
    positionById.set(id, { x: minX + (i % 30) * 60, y: maxY + 200 + Math.floor(i / 30) * 60 });
    i++;
  }
}
console.log(`  done, ${ring} ring(s) of propagation`);

for (const band of graph.bands) {
  const pos = positionById.get(band.id);
  band.position = pos ? { x: pos.x, y: pos.y } : null;
}

writeFileSync(GRAPH_PATH, JSON.stringify(graph, null, 2) + '\n', 'utf-8');
console.log(`Wrote positions for ${positionById.size} bands to ${GRAPH_PATH}`);

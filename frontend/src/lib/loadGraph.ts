import type { GraphExport } from '../types/graph';

export async function loadGraph(url = '/data/graph.json'): Promise<GraphExport> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load graph data: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  if (!data || !Array.isArray(data.bands) || !Array.isArray(data.musicians) || !Array.isArray(data.edges)) {
    throw new Error('Graph data is missing expected bands/musicians/edges arrays');
  }
  return data as GraphExport;
}

export interface CareerStop {
  era_index: number;
  band_id: string;
  instrument: string | null;
  start_year: number | null;
  end_year: number | null;
}

export interface Band {
  id: string;
  name: string;
  name_native: string | null;
  source_url: string;
  formed_year: number | null;
  disbanded_year: number | null;
  stub: boolean;
  member_ids: string[];
  // Baked in offline by scripts/precompute-layout.mjs (a one-time cose run over the whole
  // graph, real bands and stubs alike) so the browser never has to lay out the graph itself.
  // Optional/nullable so the app still works against an older graph.json that predates this.
  position?: { x: number; y: number } | null;
}

export interface Musician {
  id: string;
  name: string;
  name_native: string | null;
  source_url: string;
  bio: string | null;
  stub: boolean;
  career: CareerStop[];
  edge_ids: string[];
}

export interface GraphEdge {
  id: string;
  musician_id: string;
  source: string;
  target: string;
  sequence_index: number;
  from_year: number | null;
  concurrent: boolean;
}

export interface GraphMeta {
  schema_version: number;
  generated_at: string;
  source_base_url?: string;
  band_count: number;
  musician_count: number;
  edge_count: number;
}

export interface GraphExport {
  meta: GraphMeta;
  bands: Band[];
  musicians: Musician[];
  edges: GraphEdge[];
}

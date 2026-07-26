export interface GraphSettings {
  nodeSize: number;
  fontSize: number;
  edgeWidth: number;
  layoutSpacing: number;
  minZoom: number;
  maxZoom: number;
  // Stubs (bands referenced by a career path but never fully crawled) vastly outnumber
  // real bands, so they're off by default and only surfaced contextually unless this is on.
  showStubs: boolean;
}

export const DEFAULT_GRAPH_SETTINGS: GraphSettings = {
  nodeSize: 26,
  fontSize: 10,
  edgeWidth: 2,
  layoutSpacing: 1,
  minZoom: 0.05,
  maxZoom: 4,
  showStubs: false,
};

const STORAGE_KEY = 'vk-graph-2:display-settings';

export function loadGraphSettings(): GraphSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_GRAPH_SETTINGS;
    // showStubs deliberately never persists across a reload: turning it on can trigger a
    // very large (~2000-node) synchronous relayout that's slow on some machines, and a
    // reload is exactly what someone reaches for when a page feels stuck - reopening
    // straight back into that same expensive state would trap them instead of helping.
    return { ...DEFAULT_GRAPH_SETTINGS, ...JSON.parse(raw), showStubs: false };
  } catch {
    return DEFAULT_GRAPH_SETTINGS;
  }
}

export function saveGraphSettings(settings: GraphSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Non-essential - fine to silently skip persistence (e.g. private browsing).
  }
}

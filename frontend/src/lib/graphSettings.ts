export interface GraphSettings {
  nodeSize: number;
  fontSize: number;
  edgeWidth: number;
  layoutSpacing: number;
  minZoom: number;
  maxZoom: number;
}

export const DEFAULT_GRAPH_SETTINGS: GraphSettings = {
  nodeSize: 26,
  fontSize: 10,
  edgeWidth: 2,
  layoutSpacing: 1,
  minZoom: 0.05,
  maxZoom: 4,
};

const STORAGE_KEY = 'vk-graph-2:display-settings';

export function loadGraphSettings(): GraphSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_GRAPH_SETTINGS;
    return { ...DEFAULT_GRAPH_SETTINGS, ...JSON.parse(raw) };
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

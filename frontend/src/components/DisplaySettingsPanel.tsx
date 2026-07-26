import type { ChangeEvent } from 'react';
import { DEFAULT_GRAPH_SETTINGS, type GraphSettings } from '../lib/graphSettings';

interface DisplaySettingsPanelProps {
  settings: GraphSettings;
  onChange: (next: GraphSettings) => void;
}

// Restricted to GraphSettings' number-valued keys, so a boolean field (like showStubs)
// can't end up here by mistake - it belongs on its own control, not a range slider.
type NumericSettingKey = { [K in keyof GraphSettings]: GraphSettings[K] extends number ? K : never }[keyof GraphSettings];

interface SliderSpec {
  key: NumericSettingKey;
  label: string;
  min: number;
  max: number;
  step: number;
}

const SLIDERS: SliderSpec[] = [
  { key: 'nodeSize', label: 'Node size', min: 8, max: 60, step: 1 },
  { key: 'fontSize', label: 'Font size', min: 6, max: 24, step: 1 },
  { key: 'edgeWidth', label: 'Edge width', min: 1, max: 8, step: 0.5 },
  { key: 'layoutSpacing', label: 'Layout spacing', min: 0.3, max: 3, step: 0.1 },
  { key: 'minZoom', label: 'Min zoom', min: 0.01, max: 1, step: 0.01 },
  { key: 'maxZoom', label: 'Max zoom', min: 1, max: 10, step: 0.5 },
];

export default function DisplaySettingsPanel({ settings, onChange }: DisplaySettingsPanelProps) {
  const handleChange = (key: NumericSettingKey) => (e: ChangeEvent<HTMLInputElement>) => {
    onChange({ ...settings, [key]: Number(e.target.value) });
  };

  return (
    <details className="settings-panel">
      <summary>Display settings</summary>
      <div className="settings-body">
        {SLIDERS.map((s) => (
          <label key={s.key} className="settings-row">
            <span className="settings-label">
              {s.label} <span className="settings-value">{settings[s.key]}</span>
            </span>
            <input
              type="range"
              min={s.min}
              max={s.max}
              step={s.step}
              value={settings[s.key]}
              onChange={handleChange(s.key)}
            />
          </label>
        ))}
        <label className="settings-checkbox-row">
          <input
            type="checkbox"
            checked={settings.showStubs}
            onChange={(e) => onChange({ ...settings, showStubs: e.target.checked })}
          />
          Show stub bands (referenced but not fully crawled)
        </label>
        <button className="settings-reset" onClick={() => onChange(DEFAULT_GRAPH_SETTINGS)}>
          Reset to defaults
        </button>
      </div>
    </details>
  );
}

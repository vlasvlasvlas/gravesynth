export const STATE = {
  darkMode: false,
  activeTool: 'select',
  selectedObjectId: null,
  bpm: 120,

  portals: [],  // { id, x, y, note, scale, mode, rpm, size, synthPreset, yamlConfig, parsedSynthDef, _arpIndex }
  vacuums: [],  // { id, x, y, power, radius }
  lines: [],    // { id, bodyIds[], startX, startY, endX, endY, style, gapRatio, platformSpeed, platformLength, fx, fxAmount }

  SCALES: {
    major:      [0, 2, 4, 5, 7, 9, 11],
    minor:      [0, 2, 3, 5, 7, 8, 10],
    pentatonic: [0, 2, 4, 7, 9],
    dorian:     [0, 2, 3, 5, 7, 9, 10]
  },

  NOTES: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
};

export function getSelectedObject() {
  if (!STATE.selectedObjectId) return null;
  const portal = STATE.portals.find(p => p.id === STATE.selectedObjectId);
  if (portal) return { type: 'portal', data: portal };
  const vacuum = STATE.vacuums.find(v => v.id === STATE.selectedObjectId);
  if (vacuum) return { type: 'vacuum', data: vacuum };
  const line = STATE.lines.find(l => l.id === STATE.selectedObjectId);
  if (line) return { type: 'line', data: line };
  return null;
}

export function updateObjectData(id, newProps) {
  let obj = STATE.portals.find(p => p.id === id);
  if (obj) { Object.assign(obj, newProps); return; }
  obj = STATE.vacuums.find(v => v.id === id);
  if (obj) { Object.assign(obj, newProps); return; }
  obj = STATE.lines.find(l => l.id === id);
  if (obj) { Object.assign(obj, newProps); }
}

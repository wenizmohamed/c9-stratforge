/**
 * C9 StratForge — VALORANT Tactical Map Geometry & Callout Registry
 * Normalized coordinate space: 0..1000 (X = West->East, Y = North/Defender->South/Attacker)
 */

export const MAPS = {
  Ascent: {
    id: 'Ascent',
    displayName: 'Ascent',
    sites: ['A', 'B'],
    worldBounds: { minX: -4800, maxX: 6200, minY: -5600, maxY: 5400 },
    viewBox: '0 0 1000 1000',
    zones: [
      { id: 'def-spawn', name: 'Defender Spawn', role: 'spawn', x: 500, y: 115, r: 95, site: 'Mid' },
      { id: 'a-heaven', name: 'A Heaven', role: 'anchor', x: 715, y: 235, r: 65, site: 'A' },
      { id: 'a-site', name: 'A Site', role: 'site', x: 775, y: 345, r: 90, site: 'A' },
      { id: 'a-tree', name: 'A Tree / Garden', role: 'choke', x: 635, y: 405, r: 68, site: 'A' },
      { id: 'a-main', name: 'A Main', role: 'choke', x: 815, y: 585, r: 85, site: 'A' },
      { id: 'a-lobby', name: 'A Lobby', role: 'staging', x: 790, y: 745, r: 85, site: 'A' },
      { id: 'mid-cat', name: 'Mid Catwalk', role: 'roam', x: 565, y: 475, r: 72, site: 'Mid' },
      { id: 'mid-market', name: 'Mid Market', role: 'choke', x: 385, y: 390, r: 70, site: 'Mid' },
      { id: 'mid-top', name: 'Mid Courtyard', role: 'roam', x: 475, y: 590, r: 85, site: 'Mid' },
      { id: 'mid-tiles', name: 'Mid Tiles', role: 'staging', x: 355, y: 650, r: 70, site: 'Mid' },
      { id: 'b-boathouse', name: 'B Boathouse', role: 'anchor', x: 185, y: 215, r: 68, site: 'B' },
      { id: 'b-site', name: 'B Site', role: 'site', x: 235, y: 340, r: 92, site: 'B' },
      { id: 'b-main', name: 'B Main', role: 'choke', x: 220, y: 560, r: 82, site: 'B' },
      { id: 'b-lobby', name: 'B Lobby', role: 'staging', x: 255, y: 740, r: 82, site: 'B' },
      { id: 'atk-spawn', name: 'Attacker Spawn', role: 'spawn', x: 500, y: 880, r: 95, site: 'Mid' }
    ],
    // Playable architectural floor regions (rendered over dark obsidian void)
    floors: [
      // Defender Spawn corridor
      { type: 'rect', x: 330, y: 75, w: 340, h: 95, rx: 10 },
      // B Site & Boathouse complex
      { type: 'rect', x: 115, y: 155, w: 225, h: 270, rx: 12 },
      // B Connector to Def Spawn
      { type: 'rect', x: 300, y: 135, w: 75, h: 115, rx: 6 },
      // Market & Pizza
      { type: 'rect', x: 315, y: 325, w: 125, h: 140, rx: 8 },
      // B Main lane
      { type: 'rect', x: 155, y: 425, w: 115, h: 220, rx: 8 },
      // B Lobby
      { type: 'rect', x: 175, y: 645, w: 175, h: 165, rx: 10 },
      // Mid Courtyard + Catwalk + Tiles
      { type: 'rect', x: 340, y: 455, w: 265, h: 230, rx: 10 },
      { type: 'rect', x: 525, y: 375, w: 155, h: 110, rx: 8 },
      // A Site + Heaven + Gen
      { type: 'rect', x: 660, y: 180, w: 225, h: 275, rx: 12 },
      // A Heaven to Def Spawn connector
      { type: 'rect', x: 610, y: 135, w: 95, h: 95, rx: 6 },
      // A Main + Wine
      { type: 'rect', x: 745, y: 455, w: 125, h: 210, rx: 8 },
      // A Lobby
      { type: 'rect', x: 695, y: 665, w: 185, h: 145, rx: 10 },
      // Attacker Spawn bridge
      { type: 'rect', x: 315, y: 785, w: 390, h: 135, rx: 12 },
      // Mid link from Atk Spawn
      { type: 'rect', x: 435, y: 675, w: 130, h: 125, rx: 6 }
    ],
    // Cover boxes, generators, switch walls
    obstacles: [
      { x: 745, y: 315, w: 46, h: 52, label: 'GEN' },
      { x: 810, y: 260, w: 34, h: 34, label: 'DICE' },
      { x: 220, y: 300, w: 50, h: 40, label: 'SHED' },
      { x: 455, y: 550, w: 55, h: 36, label: 'BOX' },
      { x: 622, y: 350, w: 38, h: 22, label: 'DOOR' },
      { x: 332, y: 378, w: 16, h: 42, label: 'SW' }
    ],
    siteBoxes: [
      { site: 'A', x: 695, y: 245, w: 168, h: 192, labelX: 778, labelY: 345 },
      { site: 'B', x: 135, y: 245, w: 182, h: 165, labelX: 226, labelY: 340 }
    ]
  },

  Haven: {
    id: 'Haven',
    displayName: 'Haven',
    sites: ['A', 'B', 'C'],
    worldBounds: { minX: -5200, maxX: 6800, minY: -5400, maxY: 5800 },
    viewBox: '0 0 1000 1000',
    zones: [
      { id: 'def-spawn', name: 'Defender Spawn', role: 'spawn', x: 500, y: 115, r: 95, site: 'B' },
      { id: 'c-site', name: 'C Site', role: 'site', x: 185, y: 325, r: 88, site: 'C' },
      { id: 'c-long', name: 'C Long', role: 'choke', x: 155, y: 590, r: 85, site: 'C' },
      { id: 'garage', name: 'C Garage', role: 'choke', x: 330, y: 455, r: 75, site: 'C' },
      { id: 'b-site', name: 'B Site', role: 'site', x: 500, y: 345, r: 85, site: 'B' },
      { id: 'mid-window', name: 'Mid Window', role: 'roam', x: 465, y: 540, r: 72, site: 'B' },
      { id: 'mid-courtyard', name: 'Mid Courtyard', role: 'staging', x: 425, y: 665, r: 78, site: 'B' },
      { id: 'a-heaven', name: 'A Heaven', role: 'anchor', x: 760, y: 230, r: 65, site: 'A' },
      { id: 'a-site', name: 'A Site', role: 'site', x: 815, y: 345, r: 88, site: 'A' },
      { id: 'a-short', name: 'A Short / Sewers', role: 'choke', x: 675, y: 525, r: 76, site: 'A' },
      { id: 'a-long', name: 'A Long', role: 'choke', x: 855, y: 580, r: 85, site: 'A' },
      { id: 'a-lobby', name: 'A Lobby', role: 'staging', x: 760, y: 745, r: 82, site: 'A' },
      { id: 'c-lobby', name: 'C Lobby', role: 'staging', x: 225, y: 745, r: 82, site: 'C' },
      { id: 'atk-spawn', name: 'Attacker Spawn', role: 'spawn', x: 500, y: 885, r: 95, site: 'B' }
    ],
    floors: [
      { type: 'rect', x: 260, y: 75, w: 480, h: 95, rx: 10 },
      // C Site + C Link
      { type: 'rect', x: 95, y: 205, w: 195, h: 230, rx: 12 },
      { type: 'rect', x: 230, y: 150, w: 95, h: 90, rx: 6 },
      // C Long
      { type: 'rect', x: 110, y: 435, w: 95, h: 270, rx: 8 },
      // Garage + Double Doors
      { type: 'rect', x: 265, y: 380, w: 125, h: 165, rx: 8 },
      // B Site + Mid Window
      { type: 'rect', x: 405, y: 240, w: 190, h: 215, rx: 12 },
      { type: 'rect', x: 465, y: 155, w: 75, h: 95, rx: 6 },
      { type: 'rect', x: 350, y: 480, w: 230, h: 220, rx: 10 },
      // A Site + Heaven + Link
      { type: 'rect', x: 710, y: 190, w: 205, h: 255, rx: 12 },
      { type: 'rect', x: 660, y: 145, w: 95, h: 85, rx: 6 },
      // A Short & A Long
      { type: 'rect', x: 620, y: 430, w: 110, h: 245, rx: 8 },
      { type: 'rect', x: 805, y: 440, w: 95, h: 265, rx: 8 },
      // Lobbies & Attacker Spawn
      { type: 'rect', x: 135, y: 695, w: 225, h: 115, rx: 10 },
      { type: 'rect', x: 635, y: 685, w: 255, h: 120, rx: 10 },
      { type: 'rect', x: 295, y: 790, w: 410, h: 130, rx: 12 }
    ],
    obstacles: [
      { x: 165, y: 295, w: 46, h: 48, label: 'PLAT' },
      { x: 478, y: 315, w: 44, h: 52, label: 'PILLAR' },
      { x: 790, y: 325, w: 48, h: 46, label: 'BOX' },
      { x: 312, y: 445, w: 32, h: 26, label: 'DD' },
      { x: 838, y: 550, w: 28, h: 32, label: 'SAND' }
    ],
    siteBoxes: [
      { site: 'C', x: 112, y: 230, w: 160, h: 185, labelX: 188, labelY: 325 },
      { site: 'B', x: 422, y: 265, w: 156, h: 165, labelX: 500, labelY: 348 },
      { site: 'A', x: 728, y: 245, w: 168, h: 185, labelX: 814, labelY: 345 }
    ]
  },

  Split: {
    id: 'Split',
    displayName: 'Split',
    sites: ['A', 'B'],
    worldBounds: { minX: -4600, maxX: 5900, minY: -5100, maxY: 5600 },
    viewBox: '0 0 1000 1000',
    zones: [
      { id: 'def-spawn', name: 'Defender Spawn', role: 'spawn', x: 500, y: 110, r: 95, site: 'Mid' },
      { id: 'b-heaven', name: 'B Heaven', role: 'anchor', x: 325, y: 255, r: 68, site: 'B' },
      { id: 'b-site', name: 'B Site', role: 'site', x: 205, y: 350, r: 90, site: 'B' },
      { id: 'b-main', name: 'B Main / Garage', role: 'choke', x: 200, y: 585, r: 84, site: 'B' },
      { id: 'mid-mail', name: 'Mid Mail', role: 'roam', x: 410, y: 385, r: 72, site: 'Mid' },
      { id: 'mid-vent', name: 'Mid Vents', role: 'roam', x: 590, y: 390, r: 72, site: 'Mid' },
      { id: 'mid-bottom', name: 'Mid Bottom', role: 'staging', x: 495, y: 585, r: 85, site: 'Mid' },
      { id: 'a-heaven', name: 'A Heaven / Rafters', role: 'anchor', x: 680, y: 250, r: 68, site: 'A' },
      { id: 'a-site', name: 'A Site', role: 'site', x: 800, y: 345, r: 90, site: 'A' },
      { id: 'a-ramp', name: 'A Ramp', role: 'choke', x: 705, y: 495, r: 74, site: 'A' },
      { id: 'a-main', name: 'A Main', role: 'choke', x: 830, y: 585, r: 84, site: 'A' },
      { id: 'sewers', name: 'Sewers', role: 'staging', x: 645, y: 685, r: 70, site: 'A' },
      { id: 'atk-spawn', name: 'Attacker Spawn', role: 'spawn', x: 500, y: 880, r: 95, site: 'Mid' }
    ],
    floors: [
      { type: 'rect', x: 300, y: 70, w: 400, h: 95, rx: 10 },
      // B Site + Heaven
      { type: 'rect', x: 110, y: 215, w: 265, h: 245, rx: 12 },
      { type: 'rect', x: 280, y: 145, w: 90, h: 95, rx: 6 },
      // B Main / Garage
      { type: 'rect', x: 140, y: 460, w: 120, h: 250, rx: 8 },
      // Mid Mail, Vents, Bottom
      { type: 'rect', x: 360, y: 320, w: 280, h: 140, rx: 8 },
      { type: 'rect', x: 415, y: 460, w: 170, h: 225, rx: 10 },
      // A Site + Heaven + Ramp
      { type: 'rect', x: 635, y: 205, w: 265, h: 250, rx: 12 },
      { type: 'rect', x: 635, y: 145, w: 95, h: 85, rx: 6 },
      { type: 'rect', x: 650, y: 455, w: 110, h: 155, rx: 8 },
      { type: 'rect', x: 775, y: 455, w: 115, h: 245, rx: 8 },
      // Sewers + Spawn
      { type: 'rect', x: 565, y: 630, w: 195, h: 110, rx: 8 },
      { type: 'rect', x: 220, y: 710, w: 580, h: 100, rx: 10 },
      { type: 'rect', x: 335, y: 800, w: 330, h: 120, rx: 12 }
    ],
    obstacles: [
      { x: 185, y: 320, w: 52, h: 52, label: 'PILLAR' },
      { x: 765, y: 315, w: 50, h: 44, label: 'SCREEN' },
      { x: 472, y: 535, w: 56, h: 30, label: 'ROPE' },
      { x: 382, y: 372, w: 34, h: 24, label: 'MAIL' },
      { x: 588, y: 372, w: 34, h: 24, label: 'VENT' }
    ],
    siteBoxes: [
      { site: 'B', x: 126, y: 250, w: 170, h: 190, labelX: 205, labelY: 350 },
      { site: 'A', x: 705, y: 245, w: 175, h: 190, labelX: 795, labelY: 345 }
    ]
  }
};

export function getMapSpec(mapName) {
  if (!mapName) return MAPS.Ascent;
  const key = Object.keys(MAPS).find(
    (k) => k.toLowerCase() === String(mapName).trim().toLowerCase()
  );
  return key ? MAPS[key] : MAPS.Ascent;
}

/**
 * Normalize either already-normalized (0..1000) coordinates or raw VALORANT/GRID world coordinates
 * into canonical 0..1000 map space.
 */
export function normalizeCoordinate(mapName, coord) {
  const spec = getMapSpec(mapName);
  const rawX = Number(coord?.x ?? 500);
  const rawY = Number(coord?.y ?? 500);
  if (!Number.isFinite(rawX) || !Number.isFinite(rawY)) {
    return { x: 500, y: 500 };
  }
  if (rawX >= 0 && rawX <= 1000 && rawY >= 0 && rawY <= 1000) {
    return { x: Math.round(rawX), y: Math.round(rawY) };
  }
  const { minX, maxX, minY, maxY } = spec.worldBounds;
  const normX = ((rawX - minX) / (maxX - minX)) * 1000;
  const normY = ((rawY - minY) / (maxY - minY)) * 1000;
  return {
    x: Math.max(25, Math.min(975, Math.round(normX))),
    y: Math.max(25, Math.min(975, Math.round(normY)))
  };
}

/**
 * Resolve nearest tactical callout zone for any (x, y) map coordinate.
 */
export function resolveCallout(mapName, x, y) {
  const spec = getMapSpec(mapName);
  let best = spec.zones[0];
  let bestDist = Infinity;
  for (const z of spec.zones) {
    const d = Math.hypot(x - z.x, y - z.y);
    if (d < bestDist) {
      bestDist = d;
      best = z;
    }
  }
  return {
    id: best.id,
    name: best.name,
    role: best.role,
    site: best.site,
    distance: Math.round(bestDist)
  };
}

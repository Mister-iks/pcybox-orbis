// Lucide SVG paths (viewBox 0 0 24 24, stroke-based)
// Used for rendering icons inside D3-managed SVG nodes.

const PATHS = {
  laptop: [
    'M20 16V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9',
    'M2 16h20',
    'M6 21h12',
    'M12 16v5',
  ],
  wifi: [
    'M5 12.55a11 11 0 0 1 14.08 0',
    'M1.42 9a16 16 0 0 1 21.16 0',
    'M8.53 16.11a6 6 0 0 1 6.95 0',
    'M12 20h.01',
  ],
  smartphone: [
    'M17 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z',
    'M12 18h.01',
  ],
  monitor: [
    'M2 3h20v14H2z',
    'M8 21h8',
    'M12 17v4',
  ],
  tv: [
    'M2 7h20v13H2z',
    'M2 7V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v2',
  ],
  home: [
    'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
    'M9 22V12h6v10',
  ],
  shield_check: [
    'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
    'M9 12l2 2 4-4',
  ],
  radio: [
    'M4.9 19.1C1 15.2 1 8.8 4.9 4.9',
    'M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5',
    'M12 12h.01',
    'M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5',
    'M19.1 4.9C23 8.8 23 15.1 19.1 19',
  ],
  zap: [
    'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
  ],
  globe: [
    'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z',
    'M2 12h20',
    'M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z',
  ],
  terminal: [
    'M4 17l6-6-6-6',
    'M12 19h8',
  ],
  help_circle: [
    'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z',
    'M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3',
    'M12 17h.01',
  ],
}

const _cache = {}

function makeURI(type, color = '#ffffff') {
  const key = `${type}:${color}`
  if (_cache[key]) return _cache[key]
  const paths = PATHS[type] || PATHS.help_circle
  const elems = paths.map(d =>
    `<path d="${d}" stroke="${color}" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
  ).join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${elems}</svg>`
  _cache[key] = 'data:image/svg+xml,' + encodeURIComponent(svg)
  return _cache[key]
}

const CATEGORY_TO_ICON = {
  local:      'laptop',
  safe:       'shield_check',
  tracking:   'radio',
  cdn:        'zap',
  dns:        'globe',
  admin:      'terminal',
  unknown:    'help_circle',
}

const DEVICE_TYPE_TO_ICON = {
  router:  'wifi',
  phone:   'smartphone',
  pc:      'monitor',
  tv:      'tv',
  iot:     'home',
  unknown: 'help_circle',
}

export function nodeIconURI(d) {
  const iconType = d.category === 'lan_device'
    ? (DEVICE_TYPE_TO_ICON[d.device_type] || 'help_circle')
    : (CATEGORY_TO_ICON[d.category] || 'help_circle')
  return makeURI(iconType, '#ffffff')
}

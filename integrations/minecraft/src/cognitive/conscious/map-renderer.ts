import type { Bot } from 'mineflayer'

import { Vec3 } from 'vec3'

// ─── Types ───────────────────────────────────────────────────────────

export interface MapOptions {
  /** Radius in blocks from center (default: 16, max: 32) */
  radius?: number
  /** Whether to show elevation numbers (default: true) */
  showElevation?: boolean
  /** Whether to show entities on the map (default: true) */
  showEntities?: boolean
  /** View type (default: 'top-down') */
  view?: MapViewType
  /** Y level for cross-section view (default: bot's Y) */
  yLevel?: number
}

export interface MapResult {
  /** Center position of the map */
  center: { x: number, y: number, z: number }
  /** Legend explaining the symbols used */
  legend: string
  /** The rendered ASCII map string */
  map: string
  /** Radius used */
  radius: number
  /** View type used */
  view: MapViewType
}

export type MapViewType = 'cross-section' | 'top-down'

// ─── Block Category Classification ──────────────────────────────────
//
// We collapse hundreds of block names into a small set of semantic
// categories. Each category gets a single ASCII symbol. The goal is
// maximum information density with minimum noise.

type BlockCategory
  = | 'air'
    | 'crop'
    | 'danger'
    | 'glass'
    | 'ground'
    | 'ice'
    | 'interactive'
    | 'lava'
    | 'leaves'
    | 'log'
    | 'ore'
    | 'path'
    | 'sand'
    | 'snow'
    | 'stone'
    | 'stone_structure'
    | 'unknown'
    | 'water'
    | 'wood_structure'

// NOTICE: Symbol choices are intentionally single-character ASCII that
// are visually distinct in monospace fonts and semantically suggestive.
const CATEGORY_SYMBOLS: Record<BlockCategory, string> = {
  air: ' ',
  crop: ';',
  danger: 'X',
  glass: 'o',
  ground: '.',
  ice: '-',
  interactive: '!',
  lava: '%',
  leaves: '*',
  log: 'T',
  ore: '$',
  path: '_',
  sand: ':',
  snow: '\'',
  stone: '#',
  stone_structure: 'B',
  unknown: '?',
  water: '~',
  wood_structure: '=',
}

const CATEGORY_LEGEND: Record<BlockCategory, string> = {
  air: 'air/void',
  crop: 'crops/farmland',
  danger: 'danger (cactus/fire/magma)',
  glass: 'glass',
  ground: 'grass/dirt',
  ice: 'ice',
  interactive: 'chest/furnace/table',
  lava: 'lava',
  leaves: 'leaves',
  log: 'tree trunk',
  ore: 'ore',
  path: 'path/road',
  sand: 'sand/gravel',
  snow: 'snow',
  stone: 'stone/rock',
  stone_structure: 'stone building',
  unknown: 'unknown',
  water: 'water',
  wood_structure: 'wood building',
}

// Entity symbols placed on top of terrain
const ENTITY_SYMBOLS = {
  hostile: 'M',
  item: 'i',
  neutral: 'N',
  passive: 'A',
  player: 'P',
  self: '@',
} as const

// ─── Block Name → Category Mapping ──────────────────────────────────

const BLOCK_PATTERNS: Array<[RegExp | string[], BlockCategory]> = [
  // Interactive (highest priority — these are actionable)
  [['crafting_table', 'furnace', 'blast_furnace', 'smoker', 'chest', 'trapped_chest', 'ender_chest', 'barrel', 'anvil', 'enchanting_table', 'brewing_stand', 'grindstone', 'stonecutter', 'loom', 'cartography_table', 'smithing_table', 'composter', 'lectern', 'bed'], 'interactive'],

  // Danger
  [['lava', 'flowing_lava'], 'lava'],
  [['cactus', 'fire', 'soul_fire', 'magma_block', 'sweet_berry_bush', 'wither_rose', 'pointed_dripstone'], 'danger'],

  // Water
  [['water', 'flowing_water', 'bubble_column', 'kelp', 'kelp_plant', 'seagrass', 'tall_seagrass'], 'water'],

  // Ores
  [/_(ore|_ore)$/, 'ore'],
  [['ancient_debris', 'raw_iron_block', 'raw_gold_block', 'raw_copper_block'], 'ore'],

  // Trees
  [/_log$/, 'log'],
  [['mushroom_stem'], 'log'],
  [/_leaves$/, 'leaves'],
  [['mangrove_roots', 'muddy_mangrove_roots'], 'log'],

  // Crops / farming
  [['farmland', 'wheat', 'carrots', 'potatoes', 'beetroots', 'melon', 'pumpkin', 'melon_stem', 'pumpkin_stem', 'sugar_cane', 'bamboo', 'cocoa', 'nether_wart', 'sweet_berries', 'cave_vines', 'cave_vines_plant'], 'crop'],

  // Paths
  [['dirt_path', 'grass_path'], 'path'],
  [/_slab$/, 'path'],

  // Wood structures (planks, fences, doors, stairs)
  [/_planks$/, 'wood_structure'],
  [/_fence$/, 'wood_structure'],
  [/_door$/, 'wood_structure'],
  [/_stairs$/, 'wood_structure'],
  [/_trapdoor$/, 'wood_structure'],
  [/_wall$/, 'stone_structure'],

  // Stone structures
  [/_bricks?$/, 'stone_structure'],
  [['cobblestone', 'mossy_cobblestone', 'smooth_stone', 'polished_andesite', 'polished_diorite', 'polished_granite', 'cut_sandstone', 'smooth_sandstone'], 'stone_structure'],

  // Ice / snow
  [['snow', 'snow_block', 'powder_snow'], 'snow'],
  [['ice', 'packed_ice', 'blue_ice', 'frosted_ice'], 'ice'],

  // Glass
  [/glass/, 'glass'],

  // Sand / gravel
  [['sand', 'red_sand', 'gravel', 'soul_sand', 'soul_soil', 'clay'], 'sand'],

  // Stone (natural)
  [['stone', 'deepslate', 'andesite', 'diorite', 'granite', 'tuff', 'calcite', 'dripstone_block', 'basalt', 'smooth_basalt', 'blackstone', 'netherrack', 'end_stone', 'obsidian', 'crying_obsidian', 'bedrock', 'terracotta'], 'stone'],
  [/_terracotta$/, 'stone'],

  // Ground (dirt, grass, etc.)
  [['grass_block', 'dirt', 'coarse_dirt', 'rooted_dirt', 'podzol', 'mycelium', 'mud', 'packed_mud', 'moss_block', 'muddy_mangrove_roots'], 'ground'],
]

function classifyBlock(blockName: string): BlockCategory {
  if (blockName === 'air' || blockName === 'cave_air' || blockName === 'void_air')
    return 'air'

  for (const [pattern, category] of BLOCK_PATTERNS) {
    if (pattern instanceof RegExp) {
      if (pattern.test(blockName))
        return category
    }
    else if (pattern.includes(blockName)) {
      return category
    }
  }

  return 'unknown'
}

// ─── Entity Classification ──────────────────────────────────────────

const HOSTILE_MOBS = new Set([
  'blaze',
  'breeze',
  'cave_spider',
  'creeper',
  'drowned',
  'elder_guardian',
  'enderman',
  'evoker',
  'ghast',
  'guardian',
  'hoglin',
  'husk',
  'magma_cube',
  'phantom',
  'piglin_brute',
  'pillager',
  'ravager',
  'skeleton',
  'slime',
  'spider',
  'stray',
  'vex',
  'vindicator',
  'warden',
  'witch',
  'wither_skeleton',
  'zombie',
])

const PASSIVE_MOBS = new Set([
  'allay',
  'armadillo',
  'axolotl',
  'bat',
  'camel',
  'cat',
  'chicken',
  'cod',
  'cow',
  'donkey',
  'fox',
  'frog',
  'glow_squid',
  'horse',
  'mooshroom',
  'mule',
  'ocelot',
  'parrot',
  'pig',
  'pufferfish',
  'rabbit',
  'salmon',
  'sheep',
  'sniffer',
  'squid',
  'strider',
  'tadpole',
  'tropical_fish',
  'turtle',
  'villager',
  'wandering_trader',
])

function classifyEntity(entityName: string): keyof typeof ENTITY_SYMBOLS {
  if (HOSTILE_MOBS.has(entityName))
    return 'hostile'
  if (PASSIVE_MOBS.has(entityName))
    return 'passive'
  return 'neutral'
}

// ─── Surface Finding ────────────────────────────────────────────────

/**
 * Find the topmost non-air block at (x, z) by scanning downward from
 * a reasonable height. Returns the block name and Y level, or null if
 * the column is entirely air (unloaded chunk).
 */
function findSurfaceBlock(
  bot: Bot,
  x: number,
  z: number,
  startY: number,
): null | { name: string, y: number } {
  // Scan from startY + 16 down to startY - 32 to handle hills and valleys
  const top = Math.min(startY + 16, 319)
  const bottom = Math.max(startY - 48, -64)

  for (let y = top; y >= bottom; y--) {
    const block = bot.blockAt(new Vec3(x, y, z))
    if (block && block.name !== 'air' && block.name !== 'cave_air' && block.name !== 'void_air') {
      return { name: block.name, y }
    }
  }

  return null
}

// ─── Renderers ──────────────────────────────────────────────────────

function renderCrossSection(bot: Bot, options: Required<MapOptions>): MapResult {
  const center = bot.entity.position
  const cx = Math.floor(center.x)
  const cy = options.yLevel
  const cz = Math.floor(center.z)
  const r = options.radius

  // Cross-section: X horizontal, Y vertical, at fixed Z = cz
  const width = r * 2 + 1
  const height = r * 2 + 1
  const yTop = cy + r
  const yBottom = cy - r

  const grid: string[][] = Array.from({ length: height }).fill(Array.from({ length: width }).fill(' '))
  const usedCategories = new Set<BlockCategory>()

  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const wx = cx + dx
      const wy = cy - dy // Flip Y so top of grid = higher Y
      const gx = dx + r
      const gy = dy + r

      const block = bot.blockAt(new Vec3(wx, wy, cz))
      if (!block) {
        grid[gy][gx] = ' '
        continue
      }

      const category = classifyBlock(block.name)
      usedCategories.add(category)
      grid[gy][gx] = CATEGORY_SYMBOLS[category]
    }
  }

  // Mark bot position if visible
  const botDx = 0
  const botDy = cy - Math.floor(center.y)
  if (Math.abs(botDx) <= r && Math.abs(botDy) <= r) {
    grid[botDy + r][botDx + r] = ENTITY_SYMBOLS.self
  }

  const lines: string[] = []
  lines.push(`  Cross-section at Z=${cz} centered at (${cx}, ${cy}) | radius: ${r}`)
  lines.push(`  Y=${yTop}`)

  for (let gy = 0; gy < height; gy++) {
    const row = grid[gy].join('')
    const worldY = yTop - gy
    if (gy % 4 === 0) {
      lines.push(`${String(worldY).padStart(4)}|${row}|`)
    }
    else {
      lines.push(`    |${row}|`)
    }
  }

  lines.push(`  Y=${yBottom}`)
  lines.push(`  [X: ${cx - r}..${cx + r}]`)

  // Legend
  const legendParts: string[] = []
  for (const cat of usedCategories) {
    if (cat === 'air')
      continue
    legendParts.push(`${CATEGORY_SYMBOLS[cat]}=${CATEGORY_LEGEND[cat]}`)
  }
  legendParts.push(`${ENTITY_SYMBOLS.self}=you`)

  return {
    center: { x: cx, y: cy, z: cz },
    legend: legendParts.join('  '),
    map: lines.join('\n'),
    radius: r,
    view: 'cross-section',
  }
}

function renderTopDown(bot: Bot, options: Required<MapOptions>): MapResult {
  const center = bot.entity.position
  const cx = Math.floor(center.x)
  const cy = Math.floor(center.y)
  const cz = Math.floor(center.z)
  const r = options.radius

  // Build the grid: each cell is [symbol, elevation_delta]
  const size = r * 2 + 1
  const grid: string[][] = Array.from({ length: size }).fill(Array.from({ length: size }).fill(' '))
  const elevations: (null | number)[][] = Array.from({ length: size }).fill(Array.from({ length: size }).fill(null))
  const usedCategories = new Set<BlockCategory>()

  for (let dz = -r; dz <= r; dz++) {
    for (let dx = -r; dx <= r; dx++) {
      const wx = cx + dx
      const wz = cz + dz
      const gx = dx + r
      const gz = dz + r

      const surface = findSurfaceBlock(bot, wx, wz, cy)
      if (!surface) {
        grid[gz][gx] = ' '
        continue
      }

      const category = classifyBlock(surface.name)
      usedCategories.add(category)
      grid[gz][gx] = CATEGORY_SYMBOLS[category]
      elevations[gz][gx] = surface.y - cy
    }
  }

  // Overlay entities
  const entityOverlays: Array<{ gx: number, gz: number, label: string, symbol: string }> = []

  if (options.showEntities) {
    // Bot itself
    grid[r][r] = ENTITY_SYMBOLS.self
    entityOverlays.push({ gx: r, gz: r, label: 'You', symbol: ENTITY_SYMBOLS.self })

    // Other entities
    for (const entity of Object.values(bot.entities)) {
      if (entity === bot.entity)
        continue

      const ex = Math.floor(entity.position.x) - cx
      const ez = Math.floor(entity.position.z) - cz

      if (Math.abs(ex) > r || Math.abs(ez) > r)
        continue

      const gx = ex + r
      const gz = ez + r

      if (entity.type === 'player') {
        grid[gz][gx] = ENTITY_SYMBOLS.player
        entityOverlays.push({ gx, gz, label: entity.username ?? 'player', symbol: ENTITY_SYMBOLS.player })
      }
      else if (entity.type === 'mob') {
        const kind = classifyEntity(entity.name ?? '')
        grid[gz][gx] = ENTITY_SYMBOLS[kind]
        entityOverlays.push({ gx, gz, label: entity.name ?? 'mob', symbol: ENTITY_SYMBOLS[kind] })
      }
      else if (entity.type === 'object' && entity.name === 'item') {
        grid[gz][gx] = ENTITY_SYMBOLS.item
      }
    }
  }

  // Build the map string
  const lines: string[] = []

  // Header with compass and coordinates
  lines.push(`  Top-down view centered at (${cx}, ${cy}, ${cz}) | radius: ${r}`)
  lines.push(`  N(-Z)`)
  lines.push(`  |`)

  // Column header (X axis markers at edges)
  const xLeft = cx - r
  const xRight = cx + r
  lines.push(`W(-X)${'─'.repeat(size + 2)}E(+X)  [${xLeft}..${xRight}]`)

  for (let gz = 0; gz < size; gz++) {
    const row = grid[gz].join('')
    // Add elevation markers on the right side for every 4th row
    if (options.showElevation && gz % 4 === 0) {
      const elevSamples = elevations[gz]
        .filter((e): e is number => e !== null)
      if (elevSamples.length > 0) {
        const minE = Math.min(...elevSamples)
        const maxE = Math.max(...elevSamples)
        lines.push(`  |${row}| dy:${minE > 0 ? '+' : ''}${minE}..${maxE > 0 ? '+' : ''}${maxE}`)
      }
      else {
        lines.push(`  |${row}|`)
      }
    }
    else {
      lines.push(`  |${row}|`)
    }
  }

  lines.push(`  ${'─'.repeat(size + 2)}`)
  lines.push(`  |`)
  lines.push(`  S(+Z)  [Z: ${cz - r}..${cz + r}]`)

  // Entity list
  if (entityOverlays.length > 1) {
    lines.push('')
    lines.push('Entities:')
    for (const e of entityOverlays) {
      if (e.symbol === ENTITY_SYMBOLS.self)
        continue
      const dx = e.gx - r
      const dz = e.gz - r
      lines.push(`  ${e.symbol} ${e.label} (${dx > 0 ? '+' : ''}${dx}, ${dz > 0 ? '+' : ''}${dz})`)
    }
  }

  // Legend (only show categories that appear on this map)
  const legendParts: string[] = []
  for (const cat of usedCategories) {
    if (cat === 'air')
      continue
    legendParts.push(`${CATEGORY_SYMBOLS[cat]}=${CATEGORY_LEGEND[cat]}`)
  }
  // Always include entity symbols if entities are shown
  if (options.showEntities) {
    legendParts.push(`${ENTITY_SYMBOLS.self}=you`)
    legendParts.push(`${ENTITY_SYMBOLS.player}=player`)
    legendParts.push(`${ENTITY_SYMBOLS.hostile}=hostile mob`)
    legendParts.push(`${ENTITY_SYMBOLS.passive}=animal`)
  }

  const legend = legendParts.join('  ')

  return {
    center: { x: cx, y: cy, z: cz },
    legend,
    map: lines.join('\n'),
    radius: r,
    view: 'top-down',
  }
}

// ─── Public API ─────────────────────────────────────────────────────

const DEFAULT_RADIUS = 16
const MAX_RADIUS = 32

export function renderMap(bot: Bot, options: MapOptions = {}): MapResult {
  const resolved: Required<MapOptions> = {
    radius: Math.min(Math.max(options.radius ?? DEFAULT_RADIUS, 1), MAX_RADIUS),
    showElevation: options.showElevation ?? true,
    showEntities: options.showEntities ?? true,
    view: options.view ?? 'top-down',
    yLevel: options.yLevel ?? Math.floor(bot.entity.position.y),
  }

  switch (resolved.view) {
    case 'cross-section':
      return renderCrossSection(bot, resolved)
    case 'top-down':
    default:
      return renderTopDown(bot, resolved)
  }
}

const BLOCK_ALIAS_GROUPS: string[][] = [
  ['torch', 'wall_torch'],
]

const aliasLookup = new Map<string, Set<string>>()

for (const group of BLOCK_ALIAS_GROUPS) {
  const normalizedGroup = [...new Set(group.map(item => item.toLowerCase()))]
  const groupSet = new Set(normalizedGroup)
  for (const name of normalizedGroup)
    aliasLookup.set(name, groupSet)
}

const ORE_BASE_TYPES = new Set([
  'coal',
  'diamond',
  'emerald',
  'iron',
  'gold',
  'lapis_lazuli',
  'redstone',
  'copper',
])

function normalize(name: string): string {
  return name.trim().toLowerCase()
}

function expandStrictBlockAliases(name: string): string[] {
  if (typeof name !== 'string')
    return []

  const normalized = normalize(name)
  if (!normalized)
    return []

  const result = new Set<string>()

  const aliases = aliasLookup.get(normalized)
  if (aliases) {
    for (const a of aliases)
      result.add(a)
  }
  else {
    result.add(normalized)
  }

  return [...result]
}

export function expandCollectibleBlockAliases(name: string): string[] {
  const strictAliases = expandStrictBlockAliases(name)
  if (strictAliases.length === 0)
    return []

  const normalized = normalize(name)
  const result = new Set(strictAliases)

  if (ORE_BASE_TYPES.has(normalized)) {
    result.add(`${normalized}_ore`)
    result.add(`deepslate_${normalized}_ore`)
  }

  if (normalized.endsWith('_ore') && !normalized.startsWith('deepslate_')) {
    result.add(`deepslate_${normalized}`)
  }

  if (normalized === 'dirt') {
    result.add('grass_block')
  }

  return [...result]
}

export function matchesBlockAlias(expected: string, actual: string): boolean {
  const expectedAliases = expandStrictBlockAliases(expected)
  if (expectedAliases.length === 0)
    return false

  const actualNormalized = normalize(actual)
  return expectedAliases.includes(actualNormalized)
}

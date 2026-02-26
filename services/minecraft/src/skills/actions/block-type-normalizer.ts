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

function normalize(name: string): string {
  return name.trim().toLowerCase()
}

export function expandBlockAliases(name: string): string[] {
  if (typeof name !== 'string')
    return []

  const normalized = normalize(name)
  if (!normalized)
    return []

  const aliases = aliasLookup.get(normalized)
  if (!aliases)
    return [normalized]

  return [...aliases]
}

export function matchesBlockAlias(expected: string, actual: string): boolean {
  const expectedAliases = expandBlockAliases(expected)
  if (expectedAliases.length === 0)
    return false

  const actualNormalized = normalize(actual)
  return expectedAliases.includes(actualNormalized)
}

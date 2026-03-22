export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export function tokenize(text: string): string[] {
  const normalized = normalizeText(text)
  const matches = normalized.match(/[\p{L}\p{N}_-]+/gu)
  if (!matches) {
    return []
  }

  return matches.filter(token => token.length > 1)
}

export function fingerprintText(text: string): string {
  return tokenize(text).join('|')
}

export function uniqueStrings(values: Array<string | undefined | null>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value)).map(value => value.trim()).filter(Boolean)))
}

export function summarizeText(text: string, maxLength = 180): string {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxLength) {
    return normalized
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`
}

export function hashToken(token: string, modulo: number): number {
  let hash = 2166136261

  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return Math.abs(hash) % modulo
}

export function normalizeVector(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0))
  if (!Number.isFinite(magnitude) || magnitude === 0) {
    return vector.map(() => 0)
  }

  return vector.map(value => value / magnitude)
}

export function cosineSimilarity(left: number[] | undefined, right: number[] | undefined): number {
  if (!left || !right || left.length === 0 || right.length === 0 || left.length !== right.length) {
    return 0
  }

  let sum = 0
  for (let index = 0; index < left.length; index += 1) {
    sum += left[index]! * right[index]!
  }
  if (!Number.isFinite(sum)) {
    return 0
  }

  return Math.max(0, Math.min(1, sum))
}

export function lexicalSimilarity(leftText: string, rightText: string): number {
  const leftTokens = new Set(tokenize(leftText))
  const rightTokens = new Set(tokenize(rightText))

  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0
  }

  let overlap = 0
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      overlap += 1
    }
  }

  return overlap / Math.max(leftTokens.size, rightTokens.size)
}

export function stableKey(text: string): string {
  let hash = 2166136261

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return (hash >>> 0).toString(36)
}

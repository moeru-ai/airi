export interface FindResultItem {
  uri: string
  score?: number
  category?: string
  abstract?: string
  overview?: string
  level?: number
}

export interface RecallQueryProfile {
  tokens: string[]
  wantsPreference: boolean
  wantsTemporal: boolean
}

const LEAF_BOOST = 0.12
const EVENT_BOOST = 0.10
const PREFERENCE_BOOST = 0.08
const OVERLAP_BOOST_MAX = 0.20
const OVERLAP_TOKEN_MAX = 8
const OVERLAP_DENOM_CAP = 4

const PREFERENCE_QUERY_RE = /prefer|favorite|favourite|like|偏好|喜欢|爱好|更倾向/i
const TEMPORAL_QUERY_RE = /when|what time|date|day|month|year|yesterday|today|tomorrow|last|next|什么时候|何时|哪天|几月|几年|昨天|今天|明天|上周|下周|上个月|下个月|去年|明年/i

const TOKEN_REGEX = /[a-z0-9]{2,}/gi
const STOPWORDS = new Set([
  'what',
  'when',
  'where',
  'which',
  'who',
  'whom',
  'whose',
  'why',
  'how',
  'did',
  'does',
  'is',
  'are',
  'was',
  'were',
  'the',
  'and',
  'for',
  'with',
  'from',
  'that',
  'this',
  'your',
  'you',
])

function clampScore(value: number | undefined): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0
  }
  return Math.max(0, Math.min(1, value))
}

function isLeafLikeMemory(item: FindResultItem): boolean {
  return item.level === 2
}

function isEventMemory(item: FindResultItem): boolean {
  const category = (item.category ?? '').toLowerCase()
  return category === 'events' || item.uri.includes('/events/')
}

function isPreferencesMemory(item: FindResultItem): boolean {
  return (
    item.category === 'preferences'
    || item.uri.includes('/preferences/')
    || item.uri.endsWith('/preferences')
  )
}

function lexicalOverlapBoost(tokens: string[], text: string): number {
  if (tokens.length === 0 || !text) {
    return 0
  }
  const haystack = ` ${text.toLowerCase()} `
  let matched = 0
  for (const token of tokens.slice(0, OVERLAP_TOKEN_MAX)) {
    if (haystack.includes(` ${token} `) || haystack.includes(token)) {
      matched += 1
    }
  }
  return Math.min(OVERLAP_BOOST_MAX, (matched / Math.min(tokens.length, OVERLAP_DENOM_CAP)) * OVERLAP_BOOST_MAX)
}

export function buildRecallQueryProfile(query: string): RecallQueryProfile {
  const lower = query.toLowerCase()
  const tokens: string[] = []
  const rawTokens = lower.match(TOKEN_REGEX) ?? []
  for (const token of rawTokens) {
    if (!STOPWORDS.has(token)) {
      tokens.push(token)
    }
  }
  return {
    tokens,
    wantsPreference: PREFERENCE_QUERY_RE.test(query),
    wantsTemporal: TEMPORAL_QUERY_RE.test(query),
  }
}

export function rankForInjection(item: FindResultItem, profile: RecallQueryProfile): number {
  const baseScore = clampScore(item.score)
  const leafBoost = isLeafLikeMemory(item) ? LEAF_BOOST : 0
  const eventBoost = profile.wantsTemporal && isEventMemory(item) ? EVENT_BOOST : 0
  const preferenceBoost = profile.wantsPreference && isPreferencesMemory(item) ? PREFERENCE_BOOST : 0
  const abstract = item.abstract ?? item.overview ?? ''
  const textForOverlap = `${item.uri} ${abstract}`
  const overlapBoost = lexicalOverlapBoost(profile.tokens, textForOverlap)
  return baseScore + leafBoost + eventBoost + preferenceBoost + overlapBoost
}

export function pickMemoriesForInjection(
  items: FindResultItem[],
  limit: number,
  queryText: string,
  scoreThreshold = 0,
): FindResultItem[] {
  if (items.length === 0 || limit <= 0) {
    return []
  }
  const profile = buildRecallQueryProfile(queryText)
  const scored: { item: FindResultItem, score: number }[] = []
  for (const item of items) {
    scored.push({ item, score: rankForInjection(item, profile) })
  }
  scored.sort((a, b) => b.score - a.score)
  const seen = new Set<string>()
  const deduped: FindResultItem[] = []
  for (const { item } of scored) {
    const abstractKey = (item.abstract ?? item.overview ?? '').trim().toLowerCase()
    const key = abstractKey || item.uri
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    deduped.push(item)
  }
  const leaves: FindResultItem[] = []
  const nonLeaves: FindResultItem[] = []
  for (const item of deduped) {
    if (isLeafLikeMemory(item)) {
      leaves.push(item)
    }
    else {
      nonLeaves.push(item)
    }
  }
  if (leaves.length >= limit) {
    return leaves.slice(0, limit)
  }
  const result = [...leaves]
  for (const item of nonLeaves) {
    if (result.length >= limit) {
      break
    }
    if (clampScore(item.score) >= scoreThreshold) {
      result.push(item)
    }
  }
  return result
}

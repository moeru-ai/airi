import type {
  MemoryConsolidateRequestEvent,
  MemoryRecord,
  MemoryScope,
  MemoryUpsertInput,
} from '@proj-airi/server-sdk'

import type { MemoryModuleConfig } from './types.js'

import { matchesFilters } from './scoring.js'
import { stableKey, summarizeText, uniqueStrings } from './text.js'
import { toMemoryScopeKey } from './types.js'

interface ScopeConsolidationPlan {
  scope: MemoryScope
  sourceItems: MemoryRecord[]
  inputs: MemoryUpsertInput[]
  archivedIds: string[]
  summary: string
}

interface ConsolidationPlan {
  analyzed: number
  touchedScopes: number
  inputs: MemoryUpsertInput[]
  archivedIds: string[]
  summaries: string[]
}

function dedupeRecords(items: MemoryRecord[], limit: number): MemoryRecord[] {
  const seen = new Set<string>()
  const picked: MemoryRecord[] = []

  for (const item of items) {
    const key = `${item.kind}:${item.summary || item.content}`.toLowerCase()
    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    picked.push(item)

    if (picked.length >= limit) {
      break
    }
  }

  return picked
}

function createSection(title: string, items: MemoryRecord[], limit: number): string[] {
  const picked = dedupeRecords(items, limit)
  if (picked.length === 0) {
    return []
  }

  return [
    title,
    ...picked.map(item => `- ${item.summary || summarizeText(item.content, 140)}`),
  ]
}

function createWorkingInput(scope: MemoryScope, sourceItems: MemoryRecord[]): MemoryUpsertInput | null {
  const priorities = sourceItems.filter(item => item.kind === 'goal' || item.kind === 'task')
  const anchors = sourceItems.filter(item => item.kind === 'preference' || item.kind === 'relationship' || item.kind === 'fact')
  const recentEpisodes = sourceItems.filter(item => item.kind === 'episodic')

  const contentLines = [
    'Current working memory snapshot.',
    ...createSection('Open priorities:', priorities, 4),
    ...createSection('Stable anchors:', anchors, 3),
    ...createSection('Recent relevant episodes:', recentEpisodes, 2),
  ]

  if (contentLines.length <= 1) {
    return null
  }

  const strongestImportance = Math.max(...sourceItems.map(item => item.importance), 6)

  return {
    id: `working:${stableKey(toMemoryScopeKey(scope))}`,
    scope,
    kind: 'working',
    content: contentLines.join('\n'),
    summary: summarizeText([
      'Working memory:',
      ...dedupeRecords([...priorities, ...anchors, ...recentEpisodes], 4).map(item => item.summary || item.content),
    ].join(' '), 180),
    importance: Math.min(9, Math.max(6, strongestImportance)),
    confidence: 0.8,
    emotionalIntensity: 0,
    tags: uniqueStrings([
      'working-memory',
      'consolidated',
      ...sourceItems.flatMap(item => item.tags).slice(0, 12),
    ]),
    metadata: {
      consolidatedAt: Date.now(),
      sourceMemoryIds: sourceItems.map(item => item.id),
      sourceKinds: uniqueStrings(sourceItems.map(item => item.kind)),
      itemCount: sourceItems.length,
    },
    source: {
      kind: 'system',
      actor: 'system',
      module: scope.module,
    },
  }
}

function createReflectionInput(
  scope: MemoryScope,
  sourceItems: MemoryRecord[],
  config: MemoryModuleConfig,
): MemoryUpsertInput | null {
  const stableItems = sourceItems.filter(item =>
    item.kind === 'preference'
    || item.kind === 'relationship'
    || item.kind === 'fact'
    || item.kind === 'semantic',
  )
  const priorities = sourceItems.filter(item => item.kind === 'goal' || item.kind === 'task')
  const episodes = sourceItems.filter(item => item.kind === 'episodic')

  const importantEnough = sourceItems.some(item => item.importance >= config.consolidation.reflectionMinImportance)
  if (!importantEnough && sourceItems.length < 3) {
    return null
  }

  const contentLines = [
    'Reflection over recent memory fragments.',
    ...createSection('Stable facts and preferences:', stableItems, 5),
    ...createSection('Active goals and tasks:', priorities, 4),
    ...createSection('Recent episodes worth retaining:', episodes, 3),
  ]

  if (contentLines.length <= 1) {
    return null
  }

  return {
    id: `reflection:${stableKey(toMemoryScopeKey(scope))}`,
    scope,
    kind: 'reflection',
    content: contentLines.join('\n'),
    summary: summarizeText([
      'Reflection:',
      ...dedupeRecords([...stableItems, ...priorities, ...episodes], 5).map(item => item.summary || item.content),
    ].join(' '), 180),
    importance: Math.min(10, Math.max(7, Math.round(sourceItems.reduce((sum, item) => sum + item.importance, 0) / sourceItems.length))),
    confidence: 0.78,
    emotionalIntensity: 0,
    tags: uniqueStrings([
      'reflection',
      'consolidated',
      ...sourceItems.flatMap(item => item.tags).slice(0, 16),
    ]),
    metadata: {
      consolidatedAt: Date.now(),
      sourceMemoryIds: sourceItems.map(item => item.id),
      sourceKinds: uniqueStrings(sourceItems.map(item => item.kind)),
      itemCount: sourceItems.length,
    },
    source: {
      kind: 'reflection',
      actor: 'system',
      module: scope.module,
    },
  }
}

function createScopePlan(
  scope: MemoryScope,
  items: MemoryRecord[],
  request: MemoryConsolidateRequestEvent,
  config: MemoryModuleConfig,
): ScopeConsolidationPlan | null {
  const sourceItems = items
    .filter(item => item.kind !== 'working' && item.kind !== 'reflection')
    .sort((left, right) => {
      if (right.importance !== left.importance) {
        return right.importance - left.importance
      }

      return right.updatedAt - left.updatedAt
    })
    .slice(0, request.maxSourceItems ?? config.consolidation.maxSourceItems)

  if (sourceItems.length === 0) {
    return null
  }

  const inputs = [
    createWorkingInput(scope, sourceItems),
    createReflectionInput(scope, sourceItems, config),
  ].filter((value): value is MemoryUpsertInput => Boolean(value))

  if (inputs.length === 0) {
    return null
  }

  const archivedIds = request.archiveEpisodic ?? config.consolidation.archiveSourceEpisodic
    ? items
        .filter(item => item.kind === 'episodic' && !item.archived)
        .sort((left, right) => right.updatedAt - left.updatedAt)
        .slice(config.consolidation.maxEpisodicPerScope)
        .map(item => item.id)
    : []

  return {
    scope,
    sourceItems,
    inputs,
    archivedIds,
    summary: [
      `scope=${scope.namespace || scope.module || 'default'}`,
      `source=${sourceItems.length}`,
      `outputs=${inputs.map(item => item.kind).join(',')}`,
      `archivedEpisodic=${archivedIds.length}`,
    ].join(' '),
  }
}

export function buildConsolidationPlan(
  items: MemoryRecord[],
  request: MemoryConsolidateRequestEvent,
  config: MemoryModuleConfig,
): ConsolidationPlan {
  if (!config.consolidation.enabled) {
    return {
      analyzed: 0,
      touchedScopes: 0,
      inputs: [],
      archivedIds: [],
      summaries: [],
    }
  }

  const filtered = items
    .filter(item => !item.archived)
    .filter(item => matchesFilters(item, {
      ...request.filters,
      archived: false,
    }))

  const byScope = new Map<string, MemoryRecord[]>()
  for (const item of filtered) {
    const key = toMemoryScopeKey(item.scope)
    const existing = byScope.get(key)
    if (existing) {
      existing.push(item)
    }
    else {
      byScope.set(key, [item])
    }
  }

  const plans = Array.from(byScope.values())
    .map(scopeItems => createScopePlan(scopeItems[0]!.scope, scopeItems, request, config))
    .filter((value): value is ScopeConsolidationPlan => Boolean(value))

  return {
    analyzed: filtered.length,
    touchedScopes: plans.length,
    inputs: plans.flatMap(plan => plan.inputs),
    archivedIds: uniqueStrings(plans.flatMap(plan => plan.archivedIds)),
    summaries: plans.map(plan => plan.summary),
  }
}

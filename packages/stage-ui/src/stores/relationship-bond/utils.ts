export interface RelationshipBondEvent {
  id: string
  kind: 'user-message'
  summary: string
  emotion: string
  deltaXp: number
  createdAt: number
  sessionId: string
}

export interface RelationshipBondProgress {
  level: number
  stage: RelationshipBondStage
  currentLevelXp: number
  nextLevelXp: number
  progress: number
}

export interface RelationshipBondState {
  characterId: string
  xp: number
  level: number
  stage: RelationshipBondStage
  eventHistory: RelationshipBondEvent[]
  updatedAt: number
}

export interface RelationshipBondPromptSummary {
  characterId: string
  xp: number
  level: number
  stage: RelationshipBondStage
  progressPercent: number
  recentEvents: Array<Pick<RelationshipBondEvent, 'summary' | 'emotion' | 'deltaXp' | 'createdAt'>>
}

export const RELATIONSHIP_BOND_MAX_XP = 100000
export const RELATIONSHIP_BOND_MAX_EVENT_HISTORY = 12

export const RELATIONSHIP_BOND_STAGES = [
  { minimumLevel: 1, name: 'stranger' },
  { minimumLevel: 3, name: 'familiar' },
  { minimumLevel: 5, name: 'trusted' },
  { minimumLevel: 8, name: 'cherished' },
] as const

export type RelationshipBondStage = typeof RELATIONSHIP_BOND_STAGES[number]['name']

export const RELATIONSHIP_BOND_LEVEL_THRESHOLDS = [
  0,
  20,
  60,
  120,
  200,
  320,
  480,
  700,
  1000,
] as const

export function clampRelationshipBondXp(xp: number): number {
  if (!Number.isFinite(xp))
    return 0

  return Math.min(RELATIONSHIP_BOND_MAX_XP, Math.max(0, Math.trunc(xp)))
}

export function getRelationshipBondLevel(xp: number): number {
  const clampedXp = clampRelationshipBondXp(xp)

  for (let index = RELATIONSHIP_BOND_LEVEL_THRESHOLDS.length - 1; index >= 0; index -= 1) {
    if (clampedXp >= RELATIONSHIP_BOND_LEVEL_THRESHOLDS[index])
      return index + 1
  }

  return 1
}

export function getRelationshipBondStage(level: number): RelationshipBondStage {
  for (let index = RELATIONSHIP_BOND_STAGES.length - 1; index >= 0; index -= 1) {
    const stage = RELATIONSHIP_BOND_STAGES[index]
    if (level >= stage.minimumLevel)
      return stage.name
  }

  return 'stranger'
}

export function getRelationshipBondProgress(xp: number): RelationshipBondProgress {
  const clampedXp = clampRelationshipBondXp(xp)
  const level = getRelationshipBondLevel(clampedXp)
  const levelIndex = level - 1
  const currentLevelFloor = RELATIONSHIP_BOND_LEVEL_THRESHOLDS[levelIndex] ?? 0
  const nextLevelFloor = RELATIONSHIP_BOND_LEVEL_THRESHOLDS[levelIndex + 1]

  if (nextLevelFloor === undefined) {
    return {
      level,
      stage: getRelationshipBondStage(level),
      currentLevelXp: clampedXp - currentLevelFloor,
      nextLevelXp: 0,
      progress: 1,
    }
  }

  const nextLevelXp = nextLevelFloor - currentLevelFloor
  const currentLevelXp = clampedXp - currentLevelFloor

  return {
    level,
    stage: getRelationshipBondStage(level),
    currentLevelXp,
    nextLevelXp,
    progress: nextLevelXp === 0 ? 1 : currentLevelXp / nextLevelXp,
  }
}

export function capRelationshipBondEvents(events: RelationshipBondEvent[]): RelationshipBondEvent[] {
  if (events.length <= RELATIONSHIP_BOND_MAX_EVENT_HISTORY)
    return events

  return events.slice(events.length - RELATIONSHIP_BOND_MAX_EVENT_HISTORY)
}

export function createRelationshipBondState(characterId: string): RelationshipBondState {
  return {
    characterId,
    xp: 0,
    level: 1,
    stage: 'stranger',
    eventHistory: [],
    updatedAt: Date.now(),
  }
}

export function createRelationshipBondPromptSummary(state: RelationshipBondState): RelationshipBondPromptSummary {
  const progress = getRelationshipBondProgress(state.xp)

  return {
    characterId: state.characterId,
    xp: state.xp,
    level: progress.level,
    stage: progress.stage,
    progressPercent: Math.round(progress.progress * 100),
    recentEvents: state.eventHistory.slice(-3).map(event => ({
      summary: event.summary,
      emotion: event.emotion,
      deltaXp: event.deltaXp,
      createdAt: event.createdAt,
    })),
  }
}

export function formatRelationshipBondPromptSummary(summary: RelationshipBondPromptSummary): string {
  const recentEventsText = summary.recentEvents.length > 0
    ? summary.recentEvents
        .map(event => `- ${event.summary} [emotion=${event.emotion}, xp=+${event.deltaXp}]`)
        .join('\n')
    : '- No significant recent bond events recorded.'

  return ''
    + 'Relationship bond status with the current user:\n'
    + `- Character ID: ${summary.characterId}\n`
    + `- Stage: ${summary.stage}\n`
    + `- Level: ${summary.level}\n`
    + `- XP: ${summary.xp}\n`
    + `- Progress to next level: ${summary.progressPercent}%\n`
    + '- Recent significant interactions:\n'
    + `${recentEventsText}`
}

export function getRelationshipBondXpDelta(sentimentScore: number): number {
  if (sentimentScore >= 15)
    return 12
  if (sentimentScore >= 5)
    return 8
  if (sentimentScore <= -10)
    return 2
  if (sentimentScore < 0)
    return 4
  return 5
}

export function applyRelationshipBondXp(state: RelationshipBondState, deltaXp: number, createdAt: number, event?: RelationshipBondEvent): RelationshipBondState {
  const nextXp = clampRelationshipBondXp(state.xp + deltaXp)
  const progress = getRelationshipBondProgress(nextXp)

  return {
    characterId: state.characterId,
    xp: nextXp,
    level: progress.level,
    stage: progress.stage,
    updatedAt: Math.max(state.updatedAt, createdAt),
    eventHistory: event ? capRelationshipBondEvents([...state.eventHistory, event]) : [...state.eventHistory],
  }
}

export function applyRelationshipBondEvent(state: RelationshipBondState, event: RelationshipBondEvent): RelationshipBondState {
  return applyRelationshipBondXp(state, event.deltaXp, event.createdAt, event)
}

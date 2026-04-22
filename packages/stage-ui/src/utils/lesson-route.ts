export interface LessonRouteLike {
  name?: unknown
  path?: string
  matched?: Array<{
    name?: unknown
    path?: string
  }>
}

export const lessonRouteName = 'LessonScenePage'
const lessonPathPattern = /^\/lesson(?:$|[/?#])/

export function isLessonPath(path?: string) {
  return typeof path === 'string' && lessonPathPattern.test(path)
}

export function isLessonRouteLike(route: LessonRouteLike | null | undefined) {
  if (!route) {
    return false
  }

  if (route.name === lessonRouteName || isLessonPath(route.path)) {
    return true
  }

  return Array.isArray(route.matched) && route.matched.some(record =>
    record.name === lessonRouteName || isLessonPath(record.path),
  )
}

export function resolveLessonPageUid(
  rawPageUid: string | null | undefined,
  knownPageUids: Iterable<string>,
  fallbackPageUid?: string | null,
) {
  const normalizedPageUid = rawPageUid?.trim() || ''
  const knownPageUidList = [...knownPageUids]
  const knownPageUidSet = new Set(knownPageUidList)

  if (normalizedPageUid && knownPageUidSet.has(normalizedPageUid)) {
    return normalizedPageUid
  }

  const normalizedFallbackPageUid = fallbackPageUid?.trim() || ''
  if (normalizedFallbackPageUid && knownPageUidSet.has(normalizedFallbackPageUid)) {
    return normalizedFallbackPageUid
  }

  return knownPageUidList[0] || ''
}

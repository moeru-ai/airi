import type { LessonRouteLike } from '@proj-airi/stage-ui/utils'

import { isLessonRouteLike } from '@proj-airi/stage-ui/utils'

export type OnboardingRouteLike = LessonRouteLike

export function shouldSuppressOnboardingForRoute(route: OnboardingRouteLike | null | undefined) {
  return isLessonRouteLike(route)
}

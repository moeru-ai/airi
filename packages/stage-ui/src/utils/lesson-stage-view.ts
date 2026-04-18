export const lessonStageDesktopView = {
  xOffset: '-10%',
  yOffset: '0%',
  scale: 1,
} as const

export const lessonStageMobileView = {
  xOffset: '0%',
  yOffset: '0%',
  scale: 1,
} as const

export function resolveLessonStageView(isMobile: boolean) {
  return isMobile ? lessonStageMobileView : lessonStageDesktopView
}

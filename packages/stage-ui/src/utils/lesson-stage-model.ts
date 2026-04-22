export const lessonStageDefaultModelId = 'preset-live2d-1'

export function resolveLessonStageModelSelection(modelId?: string | null) {
  const normalizedModelId = typeof modelId === 'string' ? modelId.trim() : ''
  return normalizedModelId || lessonStageDefaultModelId
}

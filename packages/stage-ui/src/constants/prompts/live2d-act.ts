import type {
  Live2DExpressionControl,
  Live2DMotionControl,
} from '@proj-airi/stage-ui-live2d/controls/manifest'

/**
 * Builds the ACT instructions for the enabled controls of one Live2D model.
 *
 * The returned prompt contains only exact runtime identifiers. It is empty
 * when the current model does not expose an enabled expression or motion.
 */
export function formatLive2DActPrompt(
  expressions: readonly Live2DExpressionControl[],
  motions: readonly Live2DMotionControl[],
): string {
  if (expressions.length === 0 && motions.length === 0)
    return ''

  const parts = [
    'Live2D controls for the current model:',
    'Use only the exact expression and motion values from these lists.',
  ]

  if (expressions.length > 0) {
    const exampleExpression = JSON.stringify(expressions[0].name)
    parts.push(
      `Set a timed expression with this format: <|ACT {"expression":{"name":${exampleExpression},"duration":3}}|>`,
      'The expression duration uses seconds. Omit duration to keep the expression active until another expression replaces it.',
      'Restore the model expression with this format: <|ACT {"expression":null}|>',
      'Available expressions:',
      expressions.map(expression => `- ${JSON.stringify(expression.name)}`).join('\n'),
    )
  }

  if (motions.length > 0) {
    const exampleMotion = JSON.stringify(motions[0].fileName)
    parts.push(
      `Play a motion with this format: <|ACT {"motion":${exampleMotion}}|>`,
      'Available motions:',
      motions.map(motion => `- ${JSON.stringify(motion.fileName)}`).join('\n'),
    )
  }

  return parts.join('\n\n')
}

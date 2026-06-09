export function hasMouseMovedSinceExpand({
  currentX,
  currentY,
  initialX,
  initialY,
}: {
  currentX: number
  currentY: number
  initialX: number
  initialY: number
}) {
  return currentX !== initialX || currentY !== initialY
}

export function shouldCollapseControlsIsland({
  expanded,
  isBlocked,
  isOutside,
  autoCollapseArmed,
}: {
  expanded: boolean
  isBlocked: boolean
  isOutside: boolean
  autoCollapseArmed: boolean
}) {
  return expanded && autoCollapseArmed && isOutside && !isBlocked
}

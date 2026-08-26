import type { CSSProperties } from 'vue'

export type WindowAnchor = 'bottom-left' | 'bottom-right' | 'center' | 'top-left' | 'top-right'

type RectLike = RectPosition & RectSize
type RectPosition = Pick<DOMRect, 'left' | 'top'>
type RectSize = Pick<DOMRect, 'height' | 'width'>
type RelativeRect = RectLike

export function computeElementAnchorStyle(options: {
  anchor: WindowAnchor
  anchorRect: RectLike
  platformRect: RectPosition
  windowRect: RectSize
}): CSSProperties {
  const relativeAnchorRect = toRelativeRect(options.anchorRect, options.platformRect)
  const anchorPoint = resolveAnchorPoint(relativeAnchorRect, options.anchor)
  // We place the window by subtracting its own anchor point from the target's
  // anchor point. That keeps "bottom-right to bottom-right" and similar cases
  // aligned without requiring separate formulas per anchor variant.
  const windowPoint = resolveAnchorPoint({
    height: options.windowRect.height,
    left: 0,
    top: 0,
    width: options.windowRect.width,
  }, options.anchor)

  return {
    left: `${anchorPoint.x - windowPoint.x}px`,
    top: `${anchorPoint.y - windowPoint.y}px`,
  }
}

export function createContainerAnchorStyle(
  anchor: WindowAnchor,
  boundsRect?: RelativeRect,
  platformSize?: RectSize,
): CSSProperties {
  // `boundsRect` describes the usable anchoring area inside the platform. When
  // it is omitted we anchor against the full platform origin, matching the
  // original behavior before dock-aware work areas existed.
  const left = boundsRect?.left ?? 0
  const top = boundsRect?.top ?? 0
  const right = boundsRect && platformSize
    ? platformSize.width - (boundsRect.left + boundsRect.width)
    : 0
  const bottom = boundsRect && platformSize
    ? platformSize.height - (boundsRect.top + boundsRect.height)
    : 0

  switch (anchor) {
    case 'bottom-left':
      return {
        bottom: `${bottom}px`,
        left: `${left}px`,
      }
    case 'bottom-right':
      return {
        bottom: `${bottom}px`,
        right: `${right}px`,
      }
    case 'center':
      return {
        left: boundsRect && platformSize ? `${left + boundsRect.width / 2}px` : '50%',
        top: boundsRect && platformSize ? `${top + boundsRect.height / 2}px` : '50%',
        transform: 'translate(-50%, -50%)',
      }
    case 'top-left':
      return {
        left: `${left}px`,
        top: `${top}px`,
      }
    case 'top-right':
      return {
        right: `${right}px`,
        top: `${top}px`,
      }
  }
}

export function createWorkAreaRect(options: {
  dockRect?: null | RectLike
  platformRect: RectLike
}): RelativeRect {
  if (!options.dockRect) {
    return {
      height: options.platformRect.height,
      left: 0,
      top: 0,
      width: options.platformRect.width,
    }
  }

  const dockRect = toRelativeRect(options.dockRect, options.platformRect)
  // A tall dock behaves like a left/right sidebar; a wide dock behaves like a
  // top/bottom shelf. We trim the usable work area from the nearest edge so
  // bottom/right anchors can stay clear of the dock without hard-coded offsets.
  const isVerticalDock = dockRect.height >= dockRect.width
  const distances = {
    bottom: options.platformRect.height - (dockRect.top + dockRect.height),
    left: dockRect.left,
    right: options.platformRect.width - (dockRect.left + dockRect.width),
    top: dockRect.top,
  }

  const workArea = {
    height: options.platformRect.height,
    left: 0,
    top: 0,
    width: options.platformRect.width,
  }

  if (isVerticalDock) {
    if (distances.left <= distances.right) {
      const inset = dockRect.left + dockRect.width
      workArea.left = inset
      workArea.width = options.platformRect.width - inset
    }
    else {
      workArea.width = dockRect.left
    }
  }
  else if (distances.top <= distances.bottom) {
    const inset = dockRect.top + dockRect.height
    workArea.top = inset
    workArea.height = options.platformRect.height - inset
  }
  else {
    workArea.height = dockRect.top
  }

  return workArea
}

export function normalizeRectForScale<T extends RectLike>(rect: T, uiScale: number): T {
  if (uiScale <= 0 || uiScale === 1) {
    return rect
  }

  return {
    ...rect,
    height: rect.height / uiScale,
    left: rect.left / uiScale,
    top: rect.top / uiScale,
    width: rect.width / uiScale,
  }
}

function resolveAnchorPoint(rect: RectLike, anchor: WindowAnchor) {
  switch (anchor) {
    case 'bottom-left':
      return { x: rect.left, y: rect.top + rect.height }
    case 'bottom-right':
      return { x: rect.left + rect.width, y: rect.top + rect.height }
    case 'center':
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    case 'top-left':
      return { x: rect.left, y: rect.top }
    case 'top-right':
      return { x: rect.left + rect.width, y: rect.top }
  }
}

function toRelativeRect(rect: RectLike, platformRect: RectPosition): RelativeRect {
  // All anchor math is done in the platform's own coordinate system so callers
  // can mix measured DOM rects with the logical scene layout consistently.
  return {
    height: rect.height,
    left: rect.left - platformRect.left,
    top: rect.top - platformRect.top,
    width: rect.width,
  }
}

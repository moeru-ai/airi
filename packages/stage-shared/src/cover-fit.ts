export interface Size {
  width: number
  height: number
}

export interface CoverRect extends Size {
  x: number
  y: number
}

/**
 * Places content over a box the way `background-size: cover` does: scaled by the larger
 * ratio so nothing is left uncovered, and centred so the overflow is trimmed evenly.
 *
 * Every surface that paints a scene behind a model needs this, and each one draws it
 * through a different graphics API, so the geometry is what they share.
 *
 * @example
 * coverRect({ width: 400, height: 300 }, { width: 1000, height: 1000 })
 * // => { x: 0, y: -50, width: 400, height: 400 }
 */
export function coverRect(box: Size, content: Size): CoverRect {
  if (!content.width || !content.height)
    return { x: 0, y: 0, width: box.width, height: box.height }

  const scale = Math.max(box.width / content.width, box.height / content.height)
  const width = content.width * scale
  const height = content.height * scale

  return { x: (box.width - width) / 2, y: (box.height - height) / 2, width, height }
}

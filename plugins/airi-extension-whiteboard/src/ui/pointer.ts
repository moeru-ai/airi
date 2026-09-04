import type { WhiteboardPoint } from '../model'

interface PointerCoordinates {
  clientX: number
  clientY: number
}

interface SvgCoordinateSpace {
  getScreenCTM: () => {
    inverse: () => Pick<DOMMatrixReadOnly, 'a' | 'b' | 'c' | 'd' | 'e' | 'f'>
  } | null
}

/** Maps a pointer event into the active whiteboard canvas coordinates. */
export function pointFromPointerEvent(
  event: PointerCoordinates,
  svg: SvgCoordinateSpace,
): WhiteboardPoint | undefined {
  const matrix = svg.getScreenCTM()
  if (!matrix) {
    return undefined
  }
  const inverse = matrix.inverse()
  return {
    x: inverse.a * event.clientX + inverse.c * event.clientY + inverse.e,
    y: inverse.b * event.clientX + inverse.d * event.clientY + inverse.f,
  }
}

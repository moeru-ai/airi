import type { WhiteboardCanvas } from './model'

function escapeXml(value: string) {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    '\'': '&apos;',
  })[character]!)
}

/**
 * Creates an SVG document for one canvas.
 *
 * @example
 * createCanvasSvg({ id: 'canvas', name: 'Canvas', width: 10, height: 10, background: '#fff', paths: [], texts: [], createdAt: 0, updatedAt: 0 })
 * // => '<svg ...>'
 */
export function createCanvasSvg(canvas: WhiteboardCanvas) {
  const paths = canvas.paths.map(path => `<polyline fill="none" stroke="${escapeXml(path.color)}" stroke-linecap="round" stroke-linejoin="round" stroke-width="${path.width}" points="${path.points.map(point => `${point.x},${point.y}`).join(' ')}" />`).join('')
  const texts = canvas.texts.map(text => `<text fill="${escapeXml(text.color)}" font-size="${text.fontSize}" x="${text.x}" y="${text.y}">${escapeXml(text.value)}</text>`).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${canvas.width} ${canvas.height}" width="${canvas.width}" height="${canvas.height}"><rect width="100%" height="100%" fill="${escapeXml(canvas.background)}" />${paths}${texts}</svg>`
}

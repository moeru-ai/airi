/**
 * Multi-display enumeration and orchestration for macOS.
 *
 * Uses NSScreen via Swift to enumerate all connected displays,
 * their geometry, scale factors, and calculate the combined bounding rect.
 */

import type { ComputerUseConfig } from '../types'
import type { DisplayDescriptor, MultiDisplaySnapshot } from './types'

import { platform } from 'node:process'

import { runSwiftScript } from '../utils/swift'

/**
 * Swift source that enumerates all connected displays via NSScreen
 * and CGDisplay APIs, returning their geometry and properties.
 */
function enumerateDisplaysScript(): string {
  return String.raw`
import AppKit
import CoreGraphics
import Foundation

struct DisplayJSON: Encodable {
  let displayId: UInt32
  let isMain: Bool
  let isBuiltIn: Bool
  let bounds: BoundsJSON
  let visibleBounds: BoundsJSON
  let scaleFactor: Double
  let pixelWidth: Int
  let pixelHeight: Int
}

struct BoundsJSON: Encodable {
  let x: Int
  let y: Int
  let width: Int
  let height: Int
}

func toBounds(_ rect: NSRect) -> BoundsJSON {
  return BoundsJSON(
    x: Int(rect.origin.x.rounded()),
    y: Int(rect.origin.y.rounded()),
    width: Int(rect.size.width.rounded()),
    height: Int(rect.size.height.rounded())
  )
}

var displays: [DisplayJSON] = []

for screen in NSScreen.screens {
  let deviceDesc = screen.deviceDescription
  let displayId = (deviceDesc[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber)?.uint32Value ?? 0

  // NSScreen coordinates have origin at bottom-left. Convert to top-left
  // by using the main screen's height as reference.
  let mainHeight = NSScreen.screens.first?.frame.height ?? screen.frame.height

  let frame = screen.frame
  let visibleFrame = screen.visibleFrame
  let scale = screen.backingScaleFactor

  // Convert from bottom-left origin to top-left origin
  let topLeftY = mainHeight - frame.origin.y - frame.height
  let visibleTopLeftY = mainHeight - visibleFrame.origin.y - visibleFrame.height

  let bounds = BoundsJSON(
    x: Int(frame.origin.x.rounded()),
    y: Int(topLeftY.rounded()),
    width: Int(frame.width.rounded()),
    height: Int(frame.height.rounded())
  )

  let visibleBounds = BoundsJSON(
    x: Int(visibleFrame.origin.x.rounded()),
    y: Int(visibleTopLeftY.rounded()),
    width: Int(visibleFrame.width.rounded()),
    height: Int(visibleFrame.height.rounded())
  )

  let isMain = CGDisplayIsMain(displayId) != 0
  let isBuiltIn = CGDisplayIsBuiltin(displayId) != 0
  let pixelWidth = Int(frame.width * scale)
  let pixelHeight = Int(frame.height * scale)

  displays.append(DisplayJSON(
    displayId: displayId,
    isMain: isMain,
    isBuiltIn: isBuiltIn,
    bounds: bounds,
    visibleBounds: visibleBounds,
    scaleFactor: scale,
    pixelWidth: pixelWidth,
    pixelHeight: pixelHeight
  ))
}

let encoder = JSONEncoder()
let data = try encoder.encode(displays)
print(String(data: data, encoding: .utf8)!)
`
}

interface RawDisplay {
  displayId: number
  isMain: boolean
  isBuiltIn: boolean
  bounds: { x: number, y: number, width: number, height: number }
  visibleBounds: { x: number, y: number, width: number, height: number }
  scaleFactor: number
  pixelWidth: number
  pixelHeight: number
}

function computeCombinedBounds(displays: DisplayDescriptor[]) {
  if (displays.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 }
  }

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const d of displays) {
    minX = Math.min(minX, d.bounds.x)
    minY = Math.min(minY, d.bounds.y)
    maxX = Math.max(maxX, d.bounds.x + d.bounds.width)
    maxY = Math.max(maxY, d.bounds.y + d.bounds.height)
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  }
}

/**
 * Enumerate all connected displays on macOS.
 */
export async function enumerateDisplays(config: ComputerUseConfig): Promise<MultiDisplaySnapshot> {
  if (platform !== 'darwin') {
    throw new Error('multi-display enumeration is only supported on macOS')
  }

  const { stdout } = await runSwiftScript({
    swiftBinary: config.binaries.swift,
    timeoutMs: config.timeoutMs,
    source: enumerateDisplaysScript(),
  })

  const raw = JSON.parse(stdout.trim()) as RawDisplay[]
  const displays: DisplayDescriptor[] = raw.map(d => ({
    displayId: d.displayId,
    isMain: d.isMain,
    isBuiltIn: d.isBuiltIn,
    bounds: d.bounds,
    visibleBounds: d.visibleBounds,
    scaleFactor: d.scaleFactor,
    pixelWidth: d.pixelWidth,
    pixelHeight: d.pixelHeight,
  }))

  return {
    displays,
    combinedBounds: computeCombinedBounds(displays),
    capturedAt: new Date().toISOString(),
  }
}

/**
 * Format the multi-display snapshot as a human/LLM-readable summary.
 */
export function formatDisplaySummary(snapshot: MultiDisplaySnapshot): string {
  const lines: string[] = []
  lines.push(`[Displays] ${snapshot.displays.length} connected`)

  for (const d of snapshot.displays) {
    const flags: string[] = []
    if (d.isMain)
      flags.push('main')
    if (d.isBuiltIn)
      flags.push('built-in')
    if (d.scaleFactor > 1)
      flags.push(`${d.scaleFactor}x`)

    const b = d.bounds
    lines.push(
      `  #${d.displayId}${flags.length ? ` (${flags.join(', ')})` : ''}: `
      + `${b.width}x${b.height} @ (${b.x},${b.y}), `
      + `pixels ${d.pixelWidth}x${d.pixelHeight}`,
    )
  }

  const cb = snapshot.combinedBounds
  lines.push(`  Combined: ${cb.width}x${cb.height} @ (${cb.x},${cb.y})`)

  return lines.join('\n')
}

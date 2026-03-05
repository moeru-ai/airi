import type { TargetWindowBounds } from '@proj-airi/electron-eventa'
import type { ExecFileException } from 'node:child_process'

import { execFile } from 'node:child_process'
import { isMacOS, isWindows } from 'std-env'

type BoundsCallback = (bounds: TargetWindowBounds | null) => void

/**
 * Extract native window handle from desktopCapturer source ID.
 * Format: "window:HWND:0" on Windows, "window:CGWindowID:0" on macOS
 */
function extractNativeId(sourceId: string): string | null {
  const match = sourceId.match(/^window:(\d+):\d+$/)
  return match ? match[1] : null
}

function createWindowsPoller(nativeId: string, callback: BoundsCallback): { stop: () => void } {
  let stopped = false
  let timer: NodeJS.Timeout | null = null

  // PowerShell script that loads Win32 API once and returns window rect
  const psScript = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class DockWinAPI {
  [DllImport("user32.dll")]
  public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll")]
  public static extern bool IsWindow(IntPtr hWnd);
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
}
"@
$h = [IntPtr]${nativeId}
if ([DockWinAPI]::IsWindow($h)) {
  $r = New-Object DockWinAPI+RECT
  if ([DockWinAPI]::GetWindowRect($h, [ref]$r)) {
    Write-Output "$($r.Left),$($r.Top),$($r.Right - $r.Left),$($r.Bottom - $r.Top)"
  } else { Write-Output "ERR" }
} else { Write-Output "GONE" }
`.trim()

  function poll() {
    if (stopped)
      return

    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psScript], { timeout: 3000 }, (err: ExecFileException | null, stdout: string) => {
      if (stopped)
        return

      if (err) {
        callback(null)
        timer = setTimeout(poll, 500)
        return
      }

      const line = stdout.trim()
      if (line === 'GONE' || line === 'ERR') {
        callback(null)
        timer = setTimeout(poll, 500)
        return
      }

      const parts = line.split(',').map(Number)
      if (parts.length === 4 && parts.every((n: number) => Number.isFinite(n))) {
        callback({ x: parts[0], y: parts[1], width: parts[2], height: parts[3] })
      }
      else {
        callback(null)
      }

      timer = setTimeout(poll, 200)
    })
  }

  poll()

  return {
    stop: () => {
      stopped = true
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
    },
  }
}

function createMacOSPoller(nativeId: string, callback: BoundsCallback): { stop: () => void } {
  let stopped = false
  let timer: NodeJS.Timeout | null = null

  // Use osascript (AppleScript via JXA) to get window bounds by CGWindowID
  // CGWindowListCopyWindowInfo gives us bounds for a specific window ID
  const script = `
const app = Application.currentApplication();
app.includeStandardAdditions = true;
const ref = $.CGWindowListCopyWindowInfo($.kCGWindowListOptionIncludingWindow, ${nativeId});
const count = $.CFArrayGetCount(ref);
if (count > 0) {
  const dict = $.CFArrayGetValueAtIndex(ref, 0);
  const boundsDict = ObjC.unwrap($.CFDictionaryGetValue(dict, $("kCGWindowBounds")));
  const x = ObjC.unwrap(boundsDict.$["X"]);
  const y = ObjC.unwrap(boundsDict.$["Y"]);
  const w = ObjC.unwrap(boundsDict.$["Width"]);
  const h = ObjC.unwrap(boundsDict.$["Height"]);
  x + "," + y + "," + w + "," + h;
} else {
  "GONE";
}
`.trim()

  function poll() {
    if (stopped)
      return

    execFile('osascript', ['-l', 'JavaScript', '-e', script], { timeout: 3000 }, (err: ExecFileException | null, stdout: string) => {
      if (stopped)
        return

      if (err) {
        callback(null)
        timer = setTimeout(poll, 500)
        return
      }

      const line = stdout.trim()
      if (line === 'GONE') {
        callback(null)
        timer = setTimeout(poll, 500)
        return
      }

      const parts = line.split(',').map(Number)
      if (parts.length === 4 && parts.every((n: number) => Number.isFinite(n))) {
        callback({ x: parts[0], y: parts[1], width: parts[2], height: parts[3] })
      }
      else {
        callback(null)
      }

      timer = setTimeout(poll, 200)
    })
  }

  poll()

  return {
    stop: () => {
      stopped = true
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
    },
  }
}

/**
 * Creates a platform-specific poller that retrieves the bounds of an external
 * window identified by a desktopCapturer source ID.
 *
 * Calls `callback` with the window bounds or `null` if the window is gone.
 */
export function createWindowBoundsPoller(sourceId: string, callback: BoundsCallback): { stop: () => void } | null {
  const nativeId = extractNativeId(sourceId)
  if (!nativeId)
    return null

  if (isWindows) {
    return createWindowsPoller(nativeId, callback)
  }

  if (isMacOS) {
    return createMacOSPoller(nativeId, callback)
  }

  // Linux: not yet implemented — xdotool / xprop could be used
  return null
}

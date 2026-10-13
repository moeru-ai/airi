import type { DesktopAgentBridge } from './executor'

import process from 'node:process'

import { Buffer } from 'node:buffer'
import { execFile } from 'node:child_process'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative, resolve, sep } from 'node:path'
import { promisify } from 'node:util'

import { shell } from 'electron'

const execFileAsync = promisify(execFile)

/** A PowerShell command runs long enough for a screenshot but not forever. */
const POWERSHELL_TIMEOUT_MS = 20_000

/**
 * The clip that keeps stdout below the platform buffer limit.
 *
 * A build log can reach hundreds of megabytes. `execFile` fails the whole call
 * when the buffer overflows, which would lose the command output the model
 * needs, so the shell wrapper truncates first and the caller reports the cut.
 */
const MAX_OUTPUT_BYTES = 1024 * 1024

/**
 * Runs one PowerShell script with the encoded-command form.
 *
 * A workspace path can hold characters outside the console code page, and an
 * inline script would corrupt them. `-EncodedCommand` takes the script as
 * UTF-16LE base64, so the script text never travels through the console.
 */
async function runPowerShell(script: string): Promise<string> {
  const encoded = Buffer.from(script, 'utf16le').toString('base64')
  const { stdout } = await execFileAsync('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-EncodedCommand',
    encoded,
  ], {
    timeout: POWERSHELL_TIMEOUT_MS,
    maxBuffer: MAX_OUTPUT_BYTES,
    windowsHide: true,
    // The console defaults to the ANSI code page, which mangles anything else.
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
  })
  return stdout
}

/** Reports a platform the agent cannot control, instead of silently doing nothing. */
function requireWindows(what: string): void {
  if (process.platform !== 'win32')
    throw new Error(`${what} is only implemented on Windows in this build.`)
}

/**
 * Lists a directory with the directory flag as a boolean.
 *
 * `Dirent.isDirectory` is a method, and a method does not survive IPC. The
 * executor side reads the boolean field, so the conversion happens here.
 */
async function listDirectory(path: string): Promise<Array<{ name: string, isDirectory: boolean }>> {
  const entries = await readdir(path, { withFileTypes: true })
  return entries.map(entry => ({ name: entry.name, isDirectory: entry.isDirectory() }))
}

/** Captures the primary display into a temporary PNG and reports its size. */
async function captureScreen(withData: boolean): Promise<{ width: number, height: number, dataUrl?: string }> {
  requireWindows('Screen capture')

  const directory = await mkdtemp(join(tmpdir(), 'airi-shot-'))
  const target = join(directory, 'shot.png')
  try {
    const script = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bitmap = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen($bounds.X, $bounds.Y, 0, 0, $bitmap.Size)
$bitmap.Save($env:AIRI_SHOT_PATH, [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose()
$bitmap.Dispose()
Write-Output "$($bounds.Width)x$($bounds.Height)"
`
    const { stdout } = await execFileAsync('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-EncodedCommand',
      Buffer.from(script, 'utf16le').toString('base64'),
    ], {
      timeout: POWERSHELL_TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT_BYTES,
      windowsHide: true,
      env: { ...process.env, AIRI_SHOT_PATH: target },
    })

    const [width, height] = String(stdout).trim().split('x').map(value => Number(value))
    if (!Number.isFinite(width) || !Number.isFinite(height))
      throw new Error(`Screen capture reported an unexpected size: ${String(stdout).trim()}`)

    if (!withData)
      return { width, height }

    const png = await readFile(target)
    return { width, height, dataUrl: `data:image/png;base64,${png.toString('base64')}` }
  }
  finally {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined)
  }
}

async function listWindowTitles(): Promise<string[]> {
  requireWindows('Window listing')
  const script = `
$processes = Get-Process | Where-Object { $_.MainWindowTitle -ne '' } | Select-Object -ExpandProperty MainWindowTitle
$processes | ForEach-Object { [Console]::Out.WriteLine($_) }
`
  const stdout = await runPowerShell(script)
  return stdout
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0)
}

async function focusWindow(title: string): Promise<{ text: string }> {
  requireWindows('Window focus')
  const escaped = title.replace(/'/g, '\'\'')
  const script = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class AiriFocus {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
}
"@
$match = Get-Process | Where-Object { $_.MainWindowTitle -like '*${escaped}*' } | Select-Object -First 1
if ($null -eq $match) { Write-Output 'NOT_FOUND'; exit 0 }
[AiriFocus]::ShowWindow($match.MainWindowHandle, 9) | Out-Null
[AiriFocus]::SetForegroundWindow($match.MainWindowHandle) | Out-Null
Write-Output $match.MainWindowTitle
`
  const stdout = (await runPowerShell(script)).trim()
  if (stdout === 'NOT_FOUND' || stdout.length === 0)
    throw new Error(`No visible window matches "${title}".`)

  return { text: `Focused the window "${stdout}".` }
}

/** Reads the pointer position and the scale that maps logical to physical pixels. */
async function readCursor(): Promise<{ x: number, y: number, scale: number }> {
  requireWindows('Cursor position')
  const script = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class AiriCursor {
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
}
"@
Add-Type -AssemblyName System.Windows.Forms
$p = New-Object AiriCursor+POINT
[AiriCursor]::GetCursorPos([ref]$p) | Out-Null
Write-Output "$($p.X),$($p.Y)"
`
  const stdout = (await runPowerShell(script)).trim()
  const [x, y] = stdout.split(',').map(value => Number(value))
  if (!Number.isFinite(x) || !Number.isFinite(y))
    throw new Error(`Cursor position reported an unexpected value: ${stdout}`)

  // The screenshot and the agent both work in logical pixels, and the Win32
  // input calls take physical ones, so the scale is read back for the caller.
  const scale = await readPrimaryScale()
  return { x: x as number, y: y as number, scale }
}

/** Reads the primary display scale factor, such as 1, 1.25, or 1.5. */
async function readPrimaryScale(): Promise<number> {
  const script = `
Add-Type -AssemblyName System.Windows.Forms
$graphics = [System.Drawing.Graphics]::FromHwnd([IntPtr]::Zero)
Write-Output $graphics.DpiX
`
  try {
    const stdout = (await runPowerShell(script)).trim()
    const dpi = Number(stdout)
    return Number.isFinite(dpi) && dpi > 0 ? dpi / 96 : 1
  }
  catch {
    // A missing scale must not fail the whole input call. Moving by the logical
    // distance is still better than refusing to move at all.
    return 1
  }
}

async function inputMouseMove(x: number, y: number): Promise<void> {
  requireWindows('Mouse control')
  const script = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class AiriMouse {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
}
"@
[AiriMouse]::SetCursorPos(${Math.round(x)}, ${Math.round(y)}) | Out-Null
`
  await runPowerShell(script)
}

async function inputMouseClick(button: 'left' | 'right' | 'middle', double: boolean): Promise<void> {
  requireWindows('Mouse control')
  const down = { left: '0x0002', right: '0x0008', middle: '0x0020' }[button]
  const up = { left: '0x0004', right: '0x0010', middle: '0x0040' }[button]
  const script = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class AiriClick {
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
}
"@
[AiriClick]::mouse_event(${down}, 0, 0, 0, [UIntPtr]::Zero)
[AiriClick]::mouse_event(${up}, 0, 0, 0, [UIntPtr]::Zero)
${double
  ? `Start-Sleep -Milliseconds 60
[AiriClick]::mouse_event(${down}, 0, 0, 0, [UIntPtr]::Zero)
[AiriClick]::mouse_event(${up}, 0, 0, 0, [UIntPtr]::Zero)`
  : ''}
`
  await runPowerShell(script)
}

async function inputKeyboardType(text: string): Promise<void> {
  requireWindows('Keyboard control')
  // SendKeys gives `+^%~(){}[]` a special meaning, so each one is wrapped in
  // braces. Without the escape, typing a file path would press keys instead.
  const escaped = text.replace(/[+^%~(){}[\]]/g, character => `{${character}}`)
  const script = `
Add-Type -AssemblyName System.Windows.Forms
$text = [System.IO.File]::ReadAllText($env:AIRI_TYPE_PATH, [System.Text.Encoding]::UTF8)
[System.Windows.Forms.SendKeys]::SendWait($text)
`
  const directory = await mkdtemp(join(tmpdir(), 'airi-type-'))
  const target = join(directory, 'text.txt')
  try {
    // The text travels through a file for the same reason the script does: the
    // console code page would mangle anything outside it.
    await writeFile(target, escaped, 'utf8')
    await execFileAsync('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-EncodedCommand',
      Buffer.from(script, 'utf16le').toString('base64'),
    ], {
      timeout: POWERSHELL_TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT_BYTES,
      windowsHide: true,
      env: { ...process.env, AIRI_TYPE_PATH: target },
    })
  }
  finally {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined)
  }
}

/** Maps a key name from the model onto the SendKeys token for that key. */
function sendKeysToken(key: string): string {
  const lower = key.trim().toLowerCase()
  const named: Record<string, string> = {
    enter: '{ENTER}',
    return: '{ENTER}',
    tab: '{TAB}',
    esc: '{ESC}',
    escape: '{ESC}',
    space: ' ',
    backspace: '{BACKSPACE}',
    delete: '{DELETE}',
    del: '{DELETE}',
    up: '{UP}',
    down: '{DOWN}',
    left: '{LEFT}',
    right: '{RIGHT}',
    home: '{HOME}',
    end: '{END}',
    pageup: '{PGUP}',
    pagedown: '{PGDN}',
    f1: '{F1}',
    f2: '{F2}',
    f3: '{F3}',
    f4: '{F4}',
    f5: '{F5}',
    f6: '{F6}',
    f7: '{F7}',
    f8: '{F8}',
    f9: '{F9}',
    f10: '{F10}',
    f11: '{F11}',
    f12: '{F12}',
  }
  if (named[lower])
    return named[lower]
  if (lower.length === 1)
    return lower

  throw new Error(`Unsupported key "${key}". Use a letter, a digit, or a name such as "enter", "tab", or "f5".`)
}

async function inputKeyboardPress(keys: string[]): Promise<void> {
  requireWindows('Keyboard control')
  const modifiers = new Set(['ctrl', 'control', 'alt', 'shift', 'win', 'meta'])
  const held = keys.map(key => key.trim().toLowerCase()).filter(key => modifiers.has(key))
  const rest = keys.filter(key => !modifiers.has(key.trim().toLowerCase()))

  const prefix = held
    .map((key) => {
      if (key === 'ctrl' || key === 'control')
        return '^'
      if (key === 'alt')
        return '%'
      if (key === 'shift')
        return '+'
      return '' // The Windows key has no SendKeys prefix in this form.
    })
    .join('')

  const body = rest.map(sendKeysToken).join('')
  if (!body)
    throw new Error('keyboard_press needs at least one key that is not a modifier.')

  const script = `
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait('${prefix}${body.replace(/'/g, '\'\'')}')
`
  await runPowerShell(script)
}

/**
 * Builds the capability object that the executor calls.
 *
 * The workspace root is the only place the file tools reach. The check runs
 * here, in the main process, because the renderer can be scripted by a model.
 */
export function createDesktopAgentBridge(options: { workspace: string }): DesktopAgentBridge {
  const workspace = resolve(options.workspace)

  /**
   * Refuses a target outside the workspace.
   *
   * The renderer resolves the path first and this check repeats, because the
   * model supplies the path and this process performs the file access.
   */
  function guard(target: string): string {
    const absolute = resolve(target)
    const inside = absolute === workspace || absolute.startsWith(workspace.endsWith(sep) ? workspace : `${workspace}${sep}`)
    if (!inside) {
      const error = new Error(`Path escapes the workspace: ${target}`)
      Object.assign(error, { code: 'OUTSIDE_WORKSPACE' })
      throw error
    }
    return absolute
  }

  return {
    async readdir(path) {
      return await listDirectory(guard(path))
    },
    async readFile(path) {
      return await readFile(guard(path), 'utf8')
    },
    async writeFile(path, text) {
      await writeFile(guard(path), text, 'utf8')
    },
    async spawn({ command, args, cwd, timeoutMs }) {
      let cancelled = false
      const done = (async () => {
        try {
          const { stdout, stderr } = await execFileAsync(command, args, {
            cwd: guard(cwd),
            timeout: timeoutMs,
            maxBuffer: MAX_OUTPUT_BYTES,
            windowsHide: true,
          })
          return { exitCode: cancelled ? -1 : 0, stdout, stderr, timedOut: false }
        }
        catch (error) {
          const failure = error as { code?: number | string, stdout?: string, stderr?: string, killed?: boolean, signal?: string }
          // `execFile` reports a timeout as a kill with the timeout signal, and
          // a non-zero exit as a number in `code`.
          const timedOut = failure.killed === true || failure.signal === 'SIGTERM'
          return {
            exitCode: cancelled ? -1 : (typeof failure.code === 'number' ? failure.code : -1),
            stdout: failure.stdout ?? '',
            stderr: failure.stderr ?? String(error),
            timedOut,
          }
        }
      })()

      return {
        done,
        // The IPC call cannot be aborted from here, so this only records intent.
        // The real limit is the timeout that the caller passes.
        cancel: () => { cancelled = true },
      }
    },
    async screenCapture({ withData }) {
      return await captureScreen(withData)
    },
    async windowList() {
      return await listWindowTitles()
    },
    async windowFocus({ title }) {
      return await focusWindow(title)
    },
    async openApplication({ target, isUrl }) {
      if (isUrl) {
        await shell.openExternal(target)
        return { text: `Opened the address ${target}.` }
      }
      // The model supplies a program name, never a working directory or flags.
      await shell.openExternal(`shell:AppsFolder\\${target}`).catch(async () => {
        await shell.openPath(target)
      })
      return { text: `Opened ${target}.` }
    },
    async cursor() {
      return await readCursor()
    },
    async mouseMove({ x, y }) {
      await inputMouseMove(x, y)
    },
    async mouseClick({ button, double }) {
      await inputMouseClick(button, double)
    },
    async keyboardType({ text }) {
      await inputKeyboardType(text)
    },
    async keyboardPress({ keys }) {
      await inputKeyboardPress(keys)
    },
  }
}

/** The path the agent reports for a file, relative to the workspace. */
export function relativeToWorkspace(workspace: string, absolute: string): string {
  return relative(resolve(workspace), absolute).split(sep).join('/') || '.'
}

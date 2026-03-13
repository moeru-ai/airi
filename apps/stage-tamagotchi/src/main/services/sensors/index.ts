import type { WindowInfo } from '@proj-airi/stage-shared'

import { exec } from 'node:child_process'
import { promisify } from 'node:util'

import { useLogg } from '@guiiai/logg'
import { defineInvokeHandler } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/main'
import { sensorsGetActiveWindow, sensorsGetIdleTime, sensorsGetLocalTime } from '@proj-airi/stage-shared'
import { ipcMain, powerMonitor } from 'electron'

const execAsync = promisify(exec)
const log = useLogg('main/sensors').useGlobalConfig()

export function setupSensorsService() {
  const { context } = createContext(ipcMain)

  defineInvokeHandler(
    context,
    sensorsGetIdleTime,
    async () => {
      const idleTime = powerMonitor.getSystemIdleTime() * 1000 // Convert to ms
      // eslint-disable-next-line no-console
      console.log(`[Sensors Service] get-idle-time requested. Result: ${idleTime}ms`)
      return idleTime
    },
  )

  defineInvokeHandler(
    context,
    sensorsGetActiveWindow,
    async () => {
      if (process.platform !== 'win32') {
        console.warn('[Sensors Service] get-active-window requested but OS is not Windows. Returning null.')
        return null
      }

      try {
        const psScript = `
          Add-Type @"
            using System;
            using System.Runtime.InteropServices;
            using System.Text;
            public class ActiveWindow {
              [DllImport("user32.dll")]
              static extern IntPtr GetForegroundWindow();
              [DllImport("user32.dll")]
              static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
              [DllImport("user32.dll")]
              static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
              public static string Get() {
                IntPtr handle = GetForegroundWindow();
                if (handle == IntPtr.Zero) return "null";
                StringBuilder sb = new StringBuilder(256);
                if (GetWindowText(handle, sb, 256) > 0) {
                  uint pid;
                  GetWindowThreadProcessId(handle, out pid);
                  try {
                    var proc = System.Diagnostics.Process.GetProcessById((int)pid);
                    return "{\\"title\\":\\"" + sb.ToString().Replace("\\"", "\\\\\\"").Replace("\\n", "").Replace("\\r", "") + "\\",\\"processName\\":\\"" + proc.ProcessName.Replace("\\"", "\\\\\\"") + "\\"}";
                  } catch { return "null"; }
                }
                return "null";
              }
            }
"@
          [ActiveWindow]::Get()
        `
        const encodedCommand = Buffer.from(psScript, 'utf16le').toString('base64')
        const { stdout } = await execAsync(`powershell -NoProfile -NonInteractive -EncodedCommand ${encodedCommand}`)

        const result = stdout.trim()
        if (result && result !== 'null') {
          const parsedResult = JSON.parse(result) as WindowInfo
          // eslint-disable-next-line no-console
          console.log(`[Sensors Service] get-active-window retrieved: ${parsedResult.title} (${parsedResult.processName})`)
          return parsedResult
        }
      }
      catch (err) {
        log.withError(err).warn('Failed to get active window via PowerShell')
      }

      return null
    },
  )

  defineInvokeHandler(
    context,
    sensorsGetLocalTime,
    async () => {
      const now = new Date()
      const localTime = now.toLocaleString()
      // eslint-disable-next-line no-console
      console.log(`[Sensors Service] get-local-time requested. Result: ${localTime}`)
      return localTime
    },
  )

  return context
}

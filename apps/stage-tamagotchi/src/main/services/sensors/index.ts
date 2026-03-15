import type { ActiveWindowEntry, WindowInfo } from '@proj-airi/stage-shared'

import os from 'node:os'
import process from 'node:process'

import { Buffer } from 'node:buffer'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'

import { useLogg } from '@guiiai/logg'
import { defineInvokeHandler } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/main'
import {
  sensorsGetActiveWindow,
  sensorsGetActiveWindowHistory,
  sensorsGetIdleTime,
  sensorsGetLocalTime,
  sensorsGetSystemLoad,
} from '@proj-airi/stage-shared'
import { ipcMain, powerMonitor } from 'electron'

const execAsync = promisify(exec)
const log = useLogg('main/sensors').useGlobalConfig()

export function setupSensorsService() {
  const { context } = createContext(ipcMain)
  const activeWindowHistory: ActiveWindowEntry[] = []
  const MAX_HISTORY = 5

  async function getActiveWindowInfo(): Promise<WindowInfo | null> {
    if (process.platform !== 'win32')
      return null

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
                  // Simplified: Just return a delimited string. No JSON complexity.
                  return sb.ToString() + "|||" + proc.ProcessName;
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
        const parts = result.split('|||')
        const title = parts[0] || 'Unknown'
        const processName = parts[1] || 'Unknown'
        return { title, processName }
      }
    }
    catch (err) {
      log.withError(err).warn('Failed to get active window via PowerShell')
    }

    return null
  }

  setInterval(async () => {
    const current = await getActiveWindowInfo()
    if (!current)
      return

    const now = Date.now()
    const lastEntry = activeWindowHistory.at(-1)
    if (lastEntry && lastEntry.window.title === current.title && lastEntry.window.processName === current.processName) {
      lastEntry.endTime = now
      lastEntry.durationMs = lastEntry.endTime - lastEntry.startTime
    }
    else {
      activeWindowHistory.push({
        window: current,
        startTime: now,
        endTime: now,
        durationMs: 0,
      })

      if (activeWindowHistory.length > MAX_HISTORY)
        activeWindowHistory.shift()
    }
  }, 10000)

  defineInvokeHandler(
    context,
    sensorsGetIdleTime,
    async () => {
      return powerMonitor.getSystemIdleTime() * 1000
    },
  )

  defineInvokeHandler(
    context,
    sensorsGetActiveWindow,
    async () => {
      return getActiveWindowInfo()
    },
  )

  defineInvokeHandler(
    context,
    sensorsGetActiveWindowHistory,
    async () => {
      return activeWindowHistory
    },
  )

  async function getSystemLoad() {
    if (process.platform === 'win32') {
      let cpuLoads: [number, number, number] = [0, 0, 0]
      let gpuLoad = 0

      try {
        const { stdout } = await execAsync('wsl uptime')
        const match = stdout.match(/load average:\s*([0-9.]+),\s*([0-9.]+),\s*([0-9.]+)/)
        if (match) {
          cpuLoads = [
            Number.parseFloat(match[1]),
            Number.parseFloat(match[2]),
            Number.parseFloat(match[3]),
          ]
        }
      }
      catch {
        try {
          const cpuScript = '(Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average'
          const { stdout } = await execAsync(`powershell -NoProfile -NonInteractive -Command "${cpuScript}"`)
          const val = Number.parseFloat(stdout.trim()) / 100
          cpuLoads = [val, val, val]
        }
        catch {
          // Keep zeros if both WSL and PowerShell fallbacks fail.
        }
      }

      try {
        const gpuScript = '(Get-Counter "\\GPU Engine(*)\\% Utilization").CounterSamples | Where-Object { $_.Path -like "*3D*" } | Measure-Object -Property CookedValue -Sum | Select-Object -ExpandProperty Sum'
        const { stdout } = await execAsync(`powershell -NoProfile -NonInteractive -Command "${gpuScript}"`)
        const val = Number.parseFloat(stdout.trim())
        if (!Number.isNaN(val))
          gpuLoad = val
      }
      catch {
        // Keep zero if the GPU counter is unavailable.
      }

      return {
        cpu: cpuLoads,
        gpuAvg: gpuLoad,
      }
    }

    const cpu = os.loadavg() as [number, number, number]
    return {
      cpu,
      gpuAvg: 0,
    }
  }

  defineInvokeHandler(
    context,
    sensorsGetSystemLoad,
    async () => {
      return getSystemLoad()
    },
  )

  defineInvokeHandler(
    context,
    sensorsGetLocalTime,
    async () => {
      return new Date().toLocaleString()
    },
  )

  return context
}

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
  sensorsGetVolumeLevel,
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

  async function getVolumeLevel(): Promise<number> {
    if (process.platform !== 'win32')
      return 0

    try {
      // Accessing CoreAudio via PowerShell to get master volume and mute status
      const psScript = `
        Add-Type -TypeDefinition @"
        using System;
        using System.Runtime.InteropServices;
        [Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IAudioEndpointVolume {
            int Unused1(); int Unused2(); int Unused3(); int Unused4(); int Unused5();
            int SetMasterVolumeLevelScalar(float fLevel, Guid pguidEventContext);
            int GetMasterVolumeLevelScalar(out float fLevel);
            int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, Guid pguidEventContext);
            int GetMute(out bool bMute);
        }
        [Guid("D6660639-8444-4E4C-AD9A-03B0699BD2C8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IMMDevice { int Activate(ref Guid id, int clsCtx, IntPtr activationParams, out IAudioEndpointVolume volume); }
        [Guid("A95664D1-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IMMDeviceEnumerator { int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice device); }
        [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorComObject { }
        public class AudioVolume {
            public static float GetVolume() {
                var enumerator = (IMMDeviceEnumerator)new MMDeviceEnumeratorComObject();
                IMMDevice device;
                enumerator.GetDefaultAudioEndpoint(0, 1, out device);
                IAudioEndpointVolume volume;
                var guid = new Guid("5CDF2C82-841E-4546-9722-0CF74078229A");
                device.Activate(ref guid, 23, IntPtr.Zero, out volume);
                bool mute;
                volume.GetMute(out mute);
                if (mute) return 0.0f;
                float level;
                volume.GetMasterVolumeLevelScalar(out level);
                return level * 100;
            }
        }
"@
        [AudioVolume]::GetVolume()
      `
      const encodedCommand = Buffer.from(psScript, 'utf16le').toString('base64')
      const { stdout } = await execAsync(`powershell -NoProfile -NonInteractive -EncodedCommand ${encodedCommand}`)
      const volume = Number.parseFloat(stdout.trim())
      return Number.isNaN(volume) ? 0 : Math.round(volume)
    }
    catch (err) {
      log.withError(err).warn('Failed to get system volume via PowerShell')
    }

    return 0
  }

  defineInvokeHandler(
    context,
    sensorsGetVolumeLevel,
    async () => {
      return getVolumeLevel()
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

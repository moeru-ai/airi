import os from 'node:os'

import { exec } from 'node:child_process'
import { promisify } from 'node:util'

const execAsync = promisify(exec)

/**
 * Standalone test harness for verifying PowerShell sensor output.
 * Run this directly with node (e.g., node apps/stage-tamagotchi/src/main/services/sensors/test-harness.ts)
 */
async function runTest() {
  const psScript = `
      $code = @"
      using System;
      using System.Runtime.InteropServices;
      using System.Text;
      using System.Diagnostics;

      public class ActiveWindow {
        [DllImport("user32.dll")]
        private static extern IntPtr GetForegroundWindow();

        [DllImport("user32.dll")]
        private static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

        [DllImport("user32.dll")]
        private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

        public static string Get() {
          IntPtr handle = GetForegroundWindow();
          StringBuilder sb = new StringBuilder(256);
          if (GetWindowText(handle, sb, 256) > 0) {
            uint pid;
            GetWindowThreadProcessId(handle, out pid);
            try {
              var proc = System.Diagnostics.Process.GetProcessById((int)pid);
              return sb.ToString() + "|||" + proc.ProcessName;
            } catch { return "null"; }
          }
          return "null";
        }
      }
"@
      if (-not ([System.Management.Automation.PSTypeName]"ActiveWindow").Type) {
        Add-Type -TypeDefinition $code
      }
      [ActiveWindow]::Get()
    `

  const logFile = 'apps/stage-tamagotchi/src/main/services/sensors/results.txt'
  const logLines: string[] = []
  const print = (msg: string) => {
    console.log(msg)
    logLines.push(msg)
  }

  print('--- AIRI SENSOR TEST HARNESS ---')
  print(`Platform: ${process.platform}`)
  print(`Node os.loadavg(): ${JSON.stringify(os.loadavg())}`)

  if (process.platform !== 'win32') {
    print('This harness only supports Windows.')
    return
  }

  try {
    // Try using Get-Counter which is often faster and more direct for % Time
    const loadScript = `$ProgressPreference = 'SilentlyContinue'; (Get-Counter "\\Processor(_Total)\\% Processor Time" -ErrorAction SilentlyContinue).CounterSamples.CookedValue`
    print('Testing CPU load via PowerShell Get-Counter...')
    try {
      const { stdout: loadStdout } = await execAsync(`powershell -NoProfile -NonInteractive -Command "${loadScript}"`)
      const loadVal = Number.parseFloat(loadStdout.trim())
      print(`PowerShell Load Percentage: ${isNaN(loadVal) ? 'FAILED' : loadVal.toFixed(2)}%`)
    }
    catch (e: any) {
      print(`Load Check Failed: ${e.message}`)
    }

    const encodedCommand = Buffer.from(psScript, 'utf16le').toString('base64')
    print('\nExecuting Active Window PowerShell...')
    try {
      const { stdout, stderr } = await execAsync(`powershell -NoProfile -NonInteractive -EncodedCommand ${encodedCommand}`)
      if (stderr)
        print(`PowerShell Stderr: ${stderr}`)
      const result = stdout.trim()
      print(`Raw output: ${result}`)

      if (result && result !== 'null') {
        const parts = result.split('|||')
        print('Success! Parsed metadata:')
        print(`  - Title: ${parts[0] || 'Unknown'}`)
        print(`  - Process: ${parts[1] || 'Unknown'}`)
      }
      else {
        print('Sensor returned null or no active window found.')
      }
    }
    catch (e: any) {
      print(`Active Window Check Failed: ${e.message}`)
    }
  }
  catch (err: any) {
    print(`Global Execution failed: ${err.message}`)
  }
  print('--------------------------------')

  try {
    const { writeFileSync } = require('node:fs')
    const path = require('node:path')
    const absolutePath = path.resolve(logFile)
    writeFileSync(absolutePath, logLines.join('\n'))
    console.log(`Results written to ${absolutePath}`)
  }
  catch (e: any) {
    console.error('Failed to write log file:', e.message)
  }
}

runTest()

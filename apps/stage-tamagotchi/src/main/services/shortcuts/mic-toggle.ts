import type { BrowserWindow } from 'electron'

import { spawn } from 'node:child_process'

import { ipcMain } from 'electron'

let powershellProcess: ReturnType<typeof spawn> | null = null
let currentMicState = false
let currentLEDState = false

export function setupMicToggleShortcut(mainWindow: BrowserWindow) {
  // 1. Start PowerShell script to monitor Scroll Lock LED state
  const psScript = `
    Add-Type -AssemblyName System.Windows.Forms
    $state = [System.Windows.Forms.Control]::IsKeyLocked('Scroll')
    Write-Host "SCROLLLOCK_STATE:$state"
    while ($true) {
      Start-Sleep -Milliseconds 100
      $newState = [System.Windows.Forms.Control]::IsKeyLocked('Scroll')
      if ($newState -ne $state) {
        $state = $newState
        Write-Host "SCROLLLOCK_STATE:$state"
      }
    }
  `

  powershellProcess = spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', psScript], {
    windowsHide: true,
  })

  powershellProcess.stdout?.on('data', (data) => {
    const output = data.toString()
    if (output.includes('SCROLLLOCK_STATE:True')) {
      currentLEDState = true
      // If the user hit the key, the LED is now True. If the mic is off, turn it on.
      if (!currentMicState) {
        mainWindow.webContents.send('toggle-mic-from-shortcut')
      }
    }
    else if (output.includes('SCROLLLOCK_STATE:False')) {
      currentLEDState = false
      // If the user hit the key, the LED is now False. If the mic is on, turn it off.
      if (currentMicState) {
        mainWindow.webContents.send('toggle-mic-from-shortcut')
      }
    }
  })

  // 2. Listen to renderer state changes for the mic
  // If the user clicks the UI button, we need to sync the LED to match the new mic state.
  ipcMain.on('mic-state-changed', (_event, micEnabled: boolean, deviceName?: string) => {
    console.log(`[Mic Toggle] State changed: ${micEnabled ? 'ENABLED' : 'DISABLED'} | Device: ${deviceName || 'Unknown'}`)
    currentMicState = micEnabled
    if (micEnabled !== currentLEDState) {
      // Toggle the Scroll Lock LED via SendKeys
      // This will trigger the PS script to see a state change, which emits SCROLLLOCK_STATE
      // but since micEnabled will match currentLEDState after, it won't trigger another toggle.
      const syncScript = `
        $wsh = New-Object -ComObject WScript.Shell
        $wsh.SendKeys('{SCROLLLOCK}')
      `
      spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', syncScript], {
        windowsHide: true,
      })
    }
  })
}

export function cleanupMicToggleShortcut() {
  if (powershellProcess) {
    powershellProcess.kill()
    powershellProcess = null
  }
}

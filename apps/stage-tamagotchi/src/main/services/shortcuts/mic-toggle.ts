import type { BrowserWindow } from 'electron'

import type { MicToggleHotkey } from '../../../shared/eventa'

import { spawn } from 'node:child_process'

import { ipcMain } from 'electron'

let powershellProcess: ReturnType<typeof spawn> | null = null
let currentMicState = false
let currentLEDState = false
let currentHotkey: MicToggleHotkey = 'Scroll'
let currentWindow: BrowserWindow | null = null
let currentSessionId = 0

/**
 * Stop any existing PowerShell monitoring process and clean up listeners
 */
export function cleanupMicToggleShortcut() {
  if (powershellProcess) {
    try {
      powershellProcess.kill('SIGKILL')
    }
    catch (e) {
      console.warn(`[Mic Toggle] Error killing old PowerShell process: ${e}`)
    }
    powershellProcess = null
  }
  ipcMain.removeAllListeners('mic-state-changed')
  currentSessionId++
}

/**
 * Setup global microphone toggle shortcut using keyboard lock LEDs (Scroll/Caps/Num)
 */
export function setupMicToggleShortcut(mainWindow: BrowserWindow, hotkey: MicToggleHotkey = 'Scroll') {
  currentWindow = mainWindow
  currentHotkey = hotkey

  // Cleanup before starting a new one
  cleanupMicToggleShortcut()
  const mySessionId = currentSessionId

  // Map our internal hotkey names to PowerShell/SendKeys names
  const keyMap = {
    Scroll: { ps: 'Scroll', send: 'SCROLLLOCK' },
    Caps: { ps: 'CapsLock', send: 'CAPSLOCK' },
    Num: { ps: 'NumLock', send: 'NUMLOCK' },
  }

  const { ps: psKey, send: sendKey } = keyMap[currentHotkey]
  const psLabel = `${currentHotkey.toUpperCase()}LOCK_STATE`

  console.log(`[Mic Toggle] [Session ${mySessionId}] Setting up shortcut with hotkey: ${currentHotkey} (${psKey})`)

  // 1. Start PowerShell script to monitor LED state
  const psScript = `
    $ErrorActionPreference = 'SilentlyContinue'
    Add-Type -AssemblyName System.Windows.Forms
    $state = [System.Windows.Forms.Control]::IsKeyLocked('${psKey}')
    Write-Host "${psLabel}:$state"
    while ($true) {
      try {
        Start-Sleep -Milliseconds 100
        $newState = [System.Windows.Forms.Control]::IsKeyLocked('${psKey}')
        if ($newState -ne $state) {
          $state = $newState
          Write-Host "${psLabel}:$state"
        }
      } catch {
        # Ignore errors in the loop
      }
    }
  `

  powershellProcess = spawn('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', psScript], {
    windowsHide: true,
  })

  powershellProcess.stdout?.on('data', (data) => {
    if (mySessionId !== currentSessionId)
      return

    const output = data.toString()
    if (output.includes(`${psLabel}:True`)) {
      currentLEDState = true
      console.log(`[Mic Toggle] [Session ${mySessionId}] LED True detected`)
      // If the user hit the key, the LED is now True. If the mic is off, turn it on.
      if (!currentMicState && currentWindow) {
        currentWindow.webContents.send('toggle-mic-from-shortcut')
      }
    }
    else if (output.includes(`${psLabel}:False`)) {
      currentLEDState = false
      console.log(`[Mic Toggle] [Session ${mySessionId}] LED False detected`)
      // If the user hit the key, the LED is now False. If the mic is on, turn it off.
      if (currentMicState && currentWindow) {
        currentWindow.webContents.send('toggle-mic-from-shortcut')
      }
    }
  })

  powershellProcess.stderr?.on('data', (data) => {
    if (mySessionId === currentSessionId) {
      console.error(`[Mic Toggle] [Session ${mySessionId}] PowerShell Error: ${data.toString()}`)
    }
  })

  // 2. Listen to renderer state changes for the mic
  // If the user clicks the UI button, we need to sync the LED to match the new mic state.
  ipcMain.on('mic-state-changed', (_event, micEnabled: boolean, deviceName?: string) => {
    if (mySessionId !== currentSessionId)
      return

    console.log(`[Mic Toggle] [Session ${mySessionId}] State Syncing: ${micEnabled ? 'ENABLED' : 'DISABLED'} | Device: ${deviceName || 'Unknown'}`)
    currentMicState = micEnabled
    if (micEnabled !== currentLEDState) {
      // Toggle the Lock LED via SendKeys
      const syncScript = `
        Add-Type -AssemblyName System.Windows.Forms
        $wsh = New-Object -ComObject WScript.Shell
        $wsh.SendKeys('{${sendKey}}')
      `
      spawn('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', syncScript], {
        windowsHide: true,
      })
    }
  })
}

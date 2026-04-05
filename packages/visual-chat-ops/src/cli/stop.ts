import process from 'node:process'

import { execFileSync, execSync } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { platform } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { getVisualChatDir } from '@proj-airi/visual-chat-shared'

const DEFAULT_PUBLIC_ENDPOINTS_FILE = process.env.AIRI_VISUAL_CHAT_PUBLIC_ENDPOINTS_FILE?.trim()
  || join(getVisualChatDir('config'), 'public-endpoints.json')

function removePublicEndpointsFile() {
  if (existsSync(DEFAULT_PUBLIC_ENDPOINTS_FILE))
    rmSync(DEFAULT_PUBLIC_ENDPOINTS_FILE, { force: true })
}

export async function stop() {
  console.info('=== Stopping AIRI Visual Chat Services ===\n')

  const os = platform()
  let stopped = false

  try {
    if (os === 'win32') {
      try {
        execFileSync('powershell.exe', [
          '-NoProfile',
          '-Command',
          'Get-CimInstance Win32_Process -ErrorAction SilentlyContinue'
          + ' | Where-Object {'
          + ' ($_.CommandLine -match \'visual-chat-gateway\')'
          + ' -or ($_.CommandLine -match \'visual-chat-worker-minicpmo\')'
          + ' -or ($_.CommandLine -match \'visual-chat-ops.+(share\\\\.ts|dev-tamagotchi\\\\.ts|setup-tunnel\\\\.ts)\')'
          + ' -or ($_.Name -match \'cloudflared\')'
          + ' }'
          + ' | Select-Object -ExpandProperty ProcessId -Unique'
          + ' | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }',
        ], { stdio: 'ignore' })
        stopped = true
      }
      catch { /* no matching process */ }
    }
    else {
      try {
        execSync('pkill -f "visual-chat-gateway|visual-chat-worker-minicpmo|visual-chat-ops/.+(share.ts|dev-tamagotchi.ts|setup-tunnel.ts)|cloudflared tunnel"', { stdio: 'ignore' })
        stopped = true
      }
      catch { /* no matching process */ }
    }

    removePublicEndpointsFile()

    if (stopped)
      console.info('Services stopped.')
    else
      console.info('No running services found.')
  }
  catch {
    console.info('Failed to stop services.')
  }
}

function isDirectExecution(): boolean {
  const entryPath = process.argv[1]
  return !!entryPath && pathToFileURL(entryPath).href === import.meta.url
}

if (isDirectExecution())
  void stop()

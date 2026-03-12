import process from 'node:process'

import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

interface McpServerConfig {
  command: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
  enabled?: boolean
}

interface McpConfigFile {
  mcpServers: Record<string, McpServerConfig>
}

function mergeCsvList(existing: string | undefined, additions: string[]) {
  const merged = new Set(
    (existing || '')
      .split(',')
      .map(item => item.trim())
      .filter(Boolean),
  )

  for (const item of additions) {
    merged.add(item)
  }

  return Array.from(merged).join(',')
}

function resolveDefaultConfigPaths() {
  if (process.platform !== 'darwin') {
    throw new Error('This demo helper currently supports macOS only.')
  }

  return [
    join(homedir(), 'Library', 'Application Support', 'AIRI', 'mcp.json'),
    join(homedir(), 'Library', 'Application Support', '@proj-airi', 'stage-tamagotchi', 'mcp.json'),
  ]
}

function normalizeConfigFile(value: unknown): McpConfigFile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { mcpServers: {} }
  }

  const candidate = value as { mcpServers?: unknown }
  if (!candidate.mcpServers || typeof candidate.mcpServers !== 'object' || Array.isArray(candidate.mcpServers)) {
    return { mcpServers: {} }
  }

  return {
    mcpServers: { ...(candidate.mcpServers as Record<string, McpServerConfig>) },
  }
}

async function main() {
  const workspaceDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
  const configPaths = process.env.AIRI_MCP_CONFIG_PATH
    ? [resolve(process.env.AIRI_MCP_CONFIG_PATH)]
    : resolveDefaultConfigPaths()
  const browserUrl = process.env.AIRI_SELF_DEVTOOLS_BROWSER_URL || 'http://localhost:9222'
  const browserDomBridgeHost = process.env.AIRI_BROWSER_DOM_BRIDGE_HOST || '127.0.0.1'
  const browserDomBridgePort = process.env.AIRI_BROWSER_DOM_BRIDGE_PORT || '8765'
  const browserDomBridgeTimeout = process.env.AIRI_BROWSER_DOM_BRIDGE_TIMEOUT_MS || '10000'
  const mcpServerName = process.env.AIRI_SELF_DEVTOOLS_SERVER_NAME || 'airi_self_devtools'
  const computerUseServerName = process.env.AIRI_COMPUTER_USE_SERVER_NAME || 'computer_use'
  const mcpDir = resolve(process.env.AIRI_SELF_DEVTOOLS_MCP_DIR || join(homedir(), 'computer_use', 'chrome-devtools-mcp'))
  const entryPoint = join(mcpDir, 'build', 'src', 'index.js')

  if (!existsSync(entryPoint)) {
    throw new Error(`Chrome DevTools MCP entrypoint not found: ${entryPoint}`)
  }

  for (const configPath of configPaths) {
    await mkdir(dirname(configPath), { recursive: true })

    let currentConfig: McpConfigFile = { mcpServers: {} }
    try {
      const raw = await readFile(configPath, 'utf-8')
      currentConfig = normalizeConfigFile(JSON.parse(raw))
    }
    catch {
      currentConfig = { mcpServers: {} }
    }

    currentConfig.mcpServers[mcpServerName] = {
      command: process.execPath,
      args: [
        entryPoint,
        `--browserUrl=${browserUrl}`,
        '--no-usage-statistics',
      ],
      env: {
        CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: 'true',
      },
      cwd: mcpDir,
      enabled: true,
    }

    const existingComputerUse = currentConfig.mcpServers[computerUseServerName]
    currentConfig.mcpServers[computerUseServerName] = {
      command: existingComputerUse?.command || 'pnpm',
      args: existingComputerUse?.args || [
        '-F',
        '@proj-airi/computer-use-mcp',
        'start',
      ],
      cwd: existingComputerUse?.cwd || workspaceDir,
      enabled: existingComputerUse?.enabled ?? true,
      env: {
        COMPUTER_USE_EXECUTOR: 'macos-local',
        COMPUTER_USE_APPROVAL_MODE: 'never',
        COMPUTER_USE_SESSION_TAG: 'airi-macos-ghmodels-e2e',
        COMPUTER_USE_ENABLE_TEST_TOOLS: 'true',
        COMPUTER_USE_SESSION_ROOT: '/tmp/airi-computer-use-macos-e2e',
        ...existingComputerUse?.env,
        COMPUTER_USE_BROWSER_DOM_BRIDGE_ENABLED: 'true',
        COMPUTER_USE_BROWSER_DOM_BRIDGE_HOST: browserDomBridgeHost,
        COMPUTER_USE_BROWSER_DOM_BRIDGE_PORT: browserDomBridgePort,
        COMPUTER_USE_BROWSER_DOM_BRIDGE_TIMEOUT_MS: browserDomBridgeTimeout,
        COMPUTER_USE_OPENABLE_APPS: mergeCsvList(existingComputerUse?.env?.COMPUTER_USE_OPENABLE_APPS, [
          'Finder',
          'Terminal',
          'Cursor',
          'Visual Studio Code',
          'Google Chrome',
          'Discord',
        ]),
      },
    }

    await writeFile(configPath, `${JSON.stringify(currentConfig, null, 2)}\n`, 'utf-8')
    console.info(`Seeded AIRI MCP config: ${configPath}`)
  }

  console.info(`Server name: ${mcpServerName}`)
  console.info(`Chrome DevTools MCP dir: ${mcpDir}`)
  console.info(`Browser URL: ${browserUrl}`)
  console.info(`Browser DOM bridge: ws://${browserDomBridgeHost}:${browserDomBridgePort}`)
  console.info('')
  console.info('Next steps:')
  console.info('1. Start AIRI with remote debugging enabled:')
  console.info('   pnpm -F @proj-airi/stage-tamagotchi dev:remote-debug')
  console.info('2. In AIRI Settings -> MCP Server, click "Apply and Restart" if the server is not already running.')
  console.info('3. Make sure the Chrome extension bridge is connected to ws://127.0.0.1:8765.')
  console.info('4. Prompt AIRI normally. It can stay on desktop/Electron tools and switch to browser_dom_* only when the task actually moves into a browser page.')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})

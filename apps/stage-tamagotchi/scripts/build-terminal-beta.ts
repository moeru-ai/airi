import { execFileSync } from 'node:child_process'
import { env, execPath, platform } from 'node:process'

/**
 * Builds an isolated internal Windows ZIP with the existing Desktop pipeline.
 *
 * Call stack:
 * build-terminal-beta -> MCP build -> electron-vite -> electron-builder
 */
function main() {
  if (platform !== 'win32' || !env.npm_execpath)
    throw new Error('Run this Windows build with pnpm run build:terminal-beta.')
  const buildEnv = {
    ...env,
    AIRI_DISTRIBUTION: 'terminal-beta',
    VITE_DISTRIBUTION: 'terminal-beta',
    VITE_AIRI_WS_URL: 'ws://localhost:6131/ws',
    ERGOSPHERE_IT_VERSION: env.ERGOSPHERE_IT_VERSION || '0.14.1-beta.1',
  }
  for (const args of [
    ['-F', '@proj-airi/computer-use-mcp', 'run', 'build'],
    ['exec', 'electron-vite', 'build'],
    ['exec', 'electron-builder', '--win', 'zip', '--x64', '--publish', 'never'],
  ]) {
    execFileSync(execPath, [env.npm_execpath, ...args], { env: buildEnv, stdio: 'inherit' })
  }
}

main()

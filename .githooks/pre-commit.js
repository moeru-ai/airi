#!/usr/bin/env node
// Cross-platform pre-commit hook wrapper that ensures PATH contains
// project `node_modules/.bin` so pnpm / oxlint can be found when git
// runs hooks in different environments (Git Bash, PowerShell, etc.).

const { spawnSync } = require('node:child_process')
const path = require('node:path')
const fs = require('node:fs')

try {
  const projectRoot = path.resolve(__dirname, '..')
  // include repo node_modules/.bin first
  const nodeModulesBin = path.join(projectRoot, 'node_modules', '.bin')
  const env = Object.assign({}, process.env)

  // Prepend node_modules/.bin to PATH
  const delim = process.platform === 'win32' ? ';' : ':'
  env.PATH = [nodeModulesBin, env.PATH].filter(Boolean).join(delim)

  // Prefer pnpm.cmd on Windows
  const pnpmCmd = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'

  // Run lint-staged through pnpm to keep same behaviour as package.json
  const res = spawnSync(pnpmCmd, ['lint-staged'], { stdio: 'inherit', env })

  process.exit(res.status === null ? 1 : res.status)
}
 catch (err) {
  console.error('[pre-commit] hook failed:', err)
  process.exit(1)
}
